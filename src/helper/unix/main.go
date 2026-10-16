// PADCodex is the standalone Linux/macOS transport and private-session guardian.
// It never implements Codex tools or stores credentials in launch descriptors.
package main

import (
	"bufio"
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/zalando/go-keyring"
)

const maxFrame = 32 * 1024 * 1024
const vaultMagic = "PADVAULT1"

var errPrivate = errors.New("private operation failed")
var tokenPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var accountPattern = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_-]{0,79}$`)
var uuidPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

func readPrivate(file string, limit int64) ([]byte, error) {
	// O_NOFOLLOW closes the lstat/open race for credential and capability files.
	fd, err := syscall.Open(file, syscall.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), file)
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	info, ok := st.Sys().(*syscall.Stat_t)
	if !ok || !st.Mode().IsRegular() || info.Uid != uint32(os.Getuid()) || info.Nlink != 1 || st.Mode().Perm()&0077 != 0 || st.Size() > limit {
		return nil, errPrivate
	}
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if int64(len(b)) > limit {
		return nil, errPrivate
	}
	return b, err
}
func privateDir(root string) error {
	if !filepath.IsAbs(root) {
		return errPrivate
	}
	st, err := os.Lstat(root)
	if err != nil {
		return err
	}
	info, ok := st.Sys().(*syscall.Stat_t)
	if !ok || !st.IsDir() || info.Uid != uint32(os.Getuid()) || st.Mode().Perm()&0077 != 0 {
		return errPrivate
	}
	return nil
}
func atomicPrivate(file string, data []byte) error {
	if err := privateDir(filepath.Dir(file)); err != nil {
		return err
	}
	if _, err := os.Lstat(file); err == nil {
		if _, err = readPrivate(file, maxFrame); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(file), ".pad-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(f.Name(), file)
}
func masterKey(root string, create bool) ([]byte, error) {
	if err := privateDir(root); err != nil {
		return nil, err
	}
	fd, err := syscall.Open(filepath.Join(root, ".vault-key.lock"), syscall.O_CREAT|syscall.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), "vault-lock")
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	info, ok := st.Sys().(*syscall.Stat_t)
	if !ok || !st.Mode().IsRegular() || info.Uid != uint32(os.Getuid()) || info.Nlink != 1 || st.Mode().Perm()&0077 != 0 {
		return nil, errPrivate
	}
	if err = syscall.Flock(fd, syscall.LOCK_EX); err != nil {
		return nil, err
	}
	defer syscall.Flock(fd, syscall.LOCK_UN)
	digest := sha256.Sum256([]byte(filepath.Clean(root)))
	account := "vault-v1-" + hex.EncodeToString(digest[:])
	const service = "personal.pad.padswitcher.unix"
	encoded, err := keyring.Get(service, account)
	if errors.Is(err, keyring.ErrNotFound) && create {
		key := make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
		defer clear(key)
		encoded = base64.StdEncoding.EncodeToString(key)
		if err = keyring.Set(service, account, encoded); err != nil {
			return nil, err
		}
		stored, getErr := keyring.Get(service, account)
		if getErr != nil || stored != encoded {
			return nil, errPrivate
		}
	} else if err != nil {
		return nil, err
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, errPrivate
	}
	return key, nil
}
func cryptVault(key, data []byte, decrypt bool) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if decrypt {
		if len(data) < len(vaultMagic)+gcm.NonceSize()+gcm.Overhead() || !bytes.Equal(data[:len(vaultMagic)], []byte(vaultMagic)) {
			return nil, errPrivate
		}
		nonce := data[len(vaultMagic) : len(vaultMagic)+gcm.NonceSize()]
		return gcm.Open(nil, nonce, data[len(vaultMagic)+gcm.NonceSize():], []byte(vaultMagic))
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(append([]byte(vaultMagic), nonce...), nonce, data, []byte(vaultMagic)), nil
}
func vault(data []byte, decrypt bool) ([]byte, error) {
	key, err := masterKey(os.Getenv("PADSWITCHER_VAULT_ROOT"), !decrypt)
	if err != nil {
		return nil, err
	}
	defer clear(key)
	return cryptVault(key, data, decrypt)
}
func input(limit int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(os.Stdin, limit+1))
	if int64(len(b)) > limit {
		return nil, errPrivate
	}
	return b, err
}

type connection struct {
	Version    int    `json:"version"`
	URL        string `json:"url"`
	TokenFile  string `json:"tokenFile"`
	Executable string `json:"executable"`
	Home       string `json:"home"`
}

func loadConnection() (connection, string, error) {
	var c connection
	file := os.Getenv("PADSWITCHER_CONNECTION_FILE")
	if file == "" {
		if executable, err := os.Executable(); err == nil {
			candidate := filepath.Join(filepath.Dir(executable), "connection.json")
			if _, err = os.Lstat(candidate); err == nil {
				file = candidate
			} else if !os.IsNotExist(err) {
				return c, "", err
			}
		}
	}
	if file == "" {
		root, err := os.UserConfigDir()
		if err != nil {
			return c, "", err
		}
		file = filepath.Join(root, "PADSwitcher-Unix", "data", "gateway", "connection.json")
	}
	data, err := readPrivate(file, 16384)
	if err != nil {
		return c, "", err
	}
	if err = json.Unmarshal(data, &c); err != nil {
		return c, "", err
	}
	u, err := url.Parse(c.URL)
	if err != nil {
		return c, "", err
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || c.Version != 1 || u.Scheme != "ws" || u.Hostname() != "127.0.0.1" || port < 1 || port > 65535 || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || !filepath.IsAbs(c.Executable) || !filepath.IsAbs(c.Home) {
		return c, "", errPrivate
	}
	if filepath.Clean(c.TokenFile) != filepath.Join(filepath.Dir(file), "client-capability") {
		return c, "", errPrivate
	}
	token, err := readPrivate(c.TokenFile, 256)
	if err != nil {
		return c, "", err
	}
	t := strings.TrimSpace(string(token))
	if !tokenPattern.MatchString(t) {
		return c, "", errPrivate
	}
	return c, t, nil
}
func bridge(c connection, token string) error {
	dialer := websocket.Dialer{Proxy: nil, HandshakeTimeout: 10 * time.Second, EnableCompression: false}
	ws, resp, err := dialer.Dial(c.URL, http.Header{"Authorization": []string{"Bearer " + token}})
	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}
	if err != nil {
		return err
	}
	defer ws.Close()
	ws.SetReadLimit(maxFrame)
	done := make(chan error, 2)
	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 8192), maxFrame)
		for scanner.Scan() {
			line := append([]byte(nil), scanner.Bytes()...)
			if os.Getenv("PADSWITCHER_CLIENT_KIND") == "jetbrains" {
				var m map[string]any
				if err := json.Unmarshal(line, &m); err != nil {
					done <- err
					return
				}
				if m["method"] == "initialize" {
					p, ok := m["params"].(map[string]any)
					if !ok {
						done <- errPrivate
						return
					}
					p["_padswitcherClient"] = "jetbrains"
					line, _ = json.Marshal(m)
				}
			}
			if err := ws.WriteMessage(websocket.TextMessage, line); err != nil {
				done <- err
				return
			}
		}
		done <- scanner.Err()
	}()
	go func() {
		for {
			kind, b, err := ws.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					err = nil
				}
				done <- err
				return
			}
			if kind != websocket.TextMessage {
				done <- errPrivate
				return
			}
			if _, err = os.Stdout.Write(append(b, '\n')); err != nil {
				done <- err
				return
			}
		}
	}()
	return <-done
}
func cleanCodexEnv(env []string) []string {
	var out []string
	for _, item := range env {
		name := strings.SplitN(item, "=", 2)[0]
		switch name {
		case "CODEX_SQLITE_HOME", "CODEX_ACCESS_TOKEN", "CODEX_API_KEY", "OPENAI_API_KEY", "ACCESS_TOKEN", "OPENAI_IDENTITY_TOKEN_FILE", "OPENAI_WORKSPACE_ID", "OPENAI_FEDERATION_RULE_ID", "OPENAI_BASE_URL", "NODE_OPTIONS", "NODE_PATH":
			continue
		}
		out = append(out, item)
	}
	return out
}
func replaceEnv(env []string, key, value string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env)+1)
	for _, item := range env {
		if !strings.HasPrefix(item, prefix) {
			out = append(out, item)
		}
	}
	return append(out, prefix+value)
}
func remote(args []string) error {
	c, token, err := loadConnection()
	if err != nil {
		return err
	}
	for _, arg := range args {
		if arg == "app-server" {
			return bridge(c, token)
		}
	}
	for _, arg := range args {
		if arg == "--no-daemon" || arg == "--remote" || strings.HasPrefix(arg, "--remote=") || strings.HasPrefix(arg, "--remote-auth-token") {
			return errPrivate
		}
	}
	if len(args) > 0 {
		switch args[0] {
		case "exec", "e", "login", "logout", "daemon", "review", "cloud":
			return errPrivate
		}
	}
	env := replaceEnv(replaceEnv(cleanCodexEnv(os.Environ()), "CODEX_HOME", c.Home), "PADSWITCHER_GATEWAY_TOKEN", token)
	argv := append([]string{c.Executable, "--remote", c.URL, "--remote-auth-token-env", "PADSWITCHER_GATEWAY_TOKEN"}, args...)
	return syscall.Exec(c.Executable, argv, env)
}
func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var e *exec.ExitError
	if errors.As(err, &e) {
		if n := e.ExitCode(); n >= 0 {
			return n
		}
	}
	return 1
}
func supervised(cmd *exec.Cmd, parent int) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	defer syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	signals := make(chan os.Signal, 4)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	defer signal.Stop(signals)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	var forceTimer *time.Timer
	var force <-chan time.Time
	defer func() {
		if forceTimer != nil {
			forceTimer.Stop()
		}
	}()
	for {
		select {
		case err := <-done:
			return err
		case sig := <-signals:
			syscall.Kill(-cmd.Process.Pid, sig.(syscall.Signal))
			if forceTimer == nil {
				forceTimer = time.NewTimer(2 * time.Second)
				force = forceTimer.C
			}
		case <-force:
			syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			force = nil
		case <-ticker.C:
			if parent > 0 && os.Getppid() != parent {
				syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
				return <-done
			}
		}
	}
}
func host(args []string) error {
	if len(args) < 2 {
		return errPrivate
	}
	parent, err := strconv.Atoi(args[0])
	if err != nil || parent < 2 || os.Getppid() != parent || !filepath.IsAbs(args[1]) {
		return errPrivate
	}
	cmd := exec.Command(args[1], args[2:]...)
	cmd.Env = cleanCodexEnv(os.Environ())
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return supervised(cmd, parent)
}
func authIdentity(data []byte) (string, error) {
	var a struct {
		AuthMode string `json:"auth_mode"`
		Tokens   struct {
			ID      string `json:"id_token"`
			Access  string `json:"access_token"`
			Refresh string `json:"refresh_token"`
			Account string `json:"account_id"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(data, &a); err != nil || a.AuthMode == "apikey" || a.Tokens.ID == "" || a.Tokens.Access == "" || a.Tokens.Refresh == "" {
		return "", errPrivate
	}
	claims := func(token string) map[string]any {
		v := map[string]any{}
		parts := strings.Split(token, ".")
		if len(parts) > 1 {
			b, _ := base64.RawURLEncoding.DecodeString(parts[1])
			json.Unmarshal(b, &v)
		}
		return v
	}
	id, access := claims(a.Tokens.ID), claims(a.Tokens.Access)
	auth, _ := id["https://api.openai.com/auth"].(map[string]any)
	if auth == nil {
		auth, _ = access["https://api.openai.com/auth"].(map[string]any)
	}
	str := func(v any) string { s, _ := v.(string); return s }
	subject := str(id["sub"])
	if subject == "" {
		subject = str(access["sub"])
	}
	if subject == "" {
		subject = str(auth["chatgpt_user_id"])
	}
	account := a.Tokens.Account
	if account == "" {
		account = str(auth["chatgpt_account_id"])
	}
	if subject == "" || account == "" {
		return "", errPrivate
	}
	hash := sha256.Sum256([]byte(subject + "\x00" + account))
	return hex.EncodeToString(hash[:]), nil
}
func sealSession() error {
	if os.Getenv("PADSWITCHER_PRIVATE_SESSION") != "1" {
		return nil
	}
	home := os.Getenv("CODEX_HOME")
	root := os.Getenv("PADSWITCHER_VAULT_ROOT")
	relative, err := filepath.Rel(filepath.Join(root, "profiles"), home)
	if err != nil || !uuidPattern.MatchString(relative) || !tokenPattern.MatchString(os.Getenv("PADSWITCHER_SESSION_IDENTITY")) {
		return errPrivate
	}
	data, err := readPrivate(filepath.Join(home, "auth.json"), 4*1024*1024)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer clear(data)
	identity, err := authIdentity(data)
	if err != nil || identity != os.Getenv("PADSWITCHER_SESSION_IDENTITY") {
		return errPrivate
	}
	encrypted, err := vault(data, false)
	if err != nil {
		return err
	}
	defer clear(encrypted)
	if err = atomicPrivate(filepath.Join(home, "session.dpapi"), encrypted); err != nil {
		return err
	}
	// A concurrent replacement is preserved for the manager to inspect at recovery.
	latest, err := readPrivate(filepath.Join(home, "auth.json"), 4*1024*1024)
	if err != nil {
		return err
	}
	defer clear(latest)
	if !bytes.Equal(latest, data) {
		return errPrivate
	}
	return os.Remove(filepath.Join(home, "auth.json"))
}
func session(args []string) error {
	if len(args) < 1 || !filepath.IsAbs(args[0]) {
		return errPrivate
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	argv := append([]string{"--no-daemon", "-C", cwd}, args[1:]...)
	cmd := exec.Command(args[0], argv...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = cleanCodexEnv(os.Environ())
	// Keep catching hangup/interrupts until the session is sealed again: a late
	// signal after Codex exits must not stop the helper before encryption.
	guard := make(chan os.Signal, 1)
	signal.Notify(guard, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	defer signal.Stop(guard)
	// The terminal owns foreground signals. Keep its process group for interactive TUI.
	err = interactive(cmd)
	sealErr := sealSession()
	if sealErr != nil {
		return sealErr
	}
	return err
}
func interactive(cmd *exec.Cmd) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	signals := make(chan os.Signal, 4)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	defer signal.Stop(signals)
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	for {
		select {
		case err := <-done:
			return err
		case sig := <-signals:
			// Ctrl+C already reaches the whole foreground process group, so a
			// forwarded SIGINT would arrive twice. A hangup may reach only the
			// session leader (this helper on Linux), so it is still forwarded.
			if sig != syscall.SIGINT {
				cmd.Process.Signal(sig)
			}
		}
	}
}
func main() {
	syscall.Umask(0077)
	args := os.Args[1:]
	var err error
	if len(args) > 0 {
		switch args[0] {
		case "--selftest":
			if len(args) != 1 {
				err = errPrivate
			} else {
				err = selftest()
			}
		case "--vault":
			if len(args) != 2 || (args[1] != "encrypt" && args[1] != "decrypt") {
				err = errPrivate
				break
			}
			var b, out []byte
			b, err = input(4 * 1024 * 1024)
			if err == nil {
				out, err = vault(b, args[1] == "decrypt")
			}
			clear(b)
			if err == nil {
				_, err = os.Stdout.Write(out)
			}
			clear(out)
		case "--host":
			err = host(args[1:])
		case "--session":
			err = session(args[1:])
		case "--terminal":
			err = launchTerminal()
		case "--terminal-check":
			if len(args) != 1 {
				err = errPrivate
			} else {
				err = terminalCheck()
			}
		case "--terminal-child":
			if len(args) != 2 {
				err = errPrivate
			} else {
				err = terminalChild(args[1])
			}
		case "--kaggle-env", "--kaggle-list", "--kaggle-restore", "--kaggle-clear":
			err = kaggle(args)
		default:
			err = remote(args)
		}
	} else {
		err = remote(args)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "PADSwitcher: operation unavailable. Open the app, unlock the system keyring and check the selected tools.")
		os.Exit(exitCode(err))
	}
}
