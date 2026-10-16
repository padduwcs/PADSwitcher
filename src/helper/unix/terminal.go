package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type terminalSpec struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Cwd     string            `json:"cwd"`
	Env     map[string]string `json:"env"`
	Socket  string            `json:"socket"`
}

const terminalAcceptTimeout = 2 * time.Minute

var terminalEnv = map[string]bool{"PATH": true, "CODEX_HOME": true, "PADSWITCHER_CONNECTION_FILE": true, "PADSWITCHER_VAULT_ROOT": true, "PADSWITCHER_PRIVATE_SESSION": true, "PADSWITCHER_SESSION_IDENTITY": true, "PADSWITCHER_KAGGLE_ROOT": true, "PADSWITCHER_KAGGLE_START": true, "PADSWITCHER_KAGGLE_HELPER": true}

func validateSpec(s terminalSpec) error {
	if !filepath.IsAbs(s.Command) || !filepath.IsAbs(s.Cwd) || len(s.Args) > 128 {
		return errPrivate
	}
	for key, value := range s.Env {
		if !terminalEnv[key] || strings.ContainsRune(value, 0) {
			return errPrivate
		}
	}
	return nil
}
func terminalTempDir() (string, error) { return os.MkdirTemp("/tmp", "padswitcher-terminal-") }
func shellQuote(value string) string   { return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'" }

// Each entry passes the program and its arguments as separate argv items; none
// of these launchers joins them into a shell string.
var linuxTerminals = []struct {
	name string
	args []string
}{
	{"x-terminal-emulator", []string{"-e"}}, {"ptyxis", []string{"--new-window", "--"}}, {"gnome-terminal", []string{"--"}}, {"kgx", []string{"--"}},
	{"konsole", []string{"-e"}}, {"xfce4-terminal", []string{"--disable-server", "-x"}}, {"mate-terminal", []string{"-x"}}, {"terminator", []string{"-x"}},
	{"kitty", nil}, {"alacritty", []string{"-e"}}, {"wezterm", []string{"start", "--"}}, {"foot", nil}, {"xterm", []string{"-e"}},
}

// A preferred terminal from $TERMINAL is used first. Known launchers keep their
// documented syntax; any other terminal is called with the common "-e".
func linuxTerminal() (string, []string, error) {
	if preferred := os.Getenv("TERMINAL"); preferred != "" && !strings.ContainsAny(preferred, " \t") {
		if binary, err := exec.LookPath(preferred); err == nil {
			for _, candidate := range linuxTerminals {
				if filepath.Base(binary) == candidate.name {
					return binary, candidate.args, nil
				}
			}
			return binary, []string{"-e"}, nil
		}
	}
	for _, candidate := range linuxTerminals {
		if binary, err := exec.LookPath(candidate.name); err == nil {
			return binary, candidate.args, nil
		}
	}
	return "", nil, errPrivate
}
func terminalCommand(helper, descriptor string) (string, []string, error) {
	if runtime.GOOS == "darwin" {
		// argv carries the shell command as data; paths never enter AppleScript code.
		return "/usr/bin/osascript", []string{"-e", "on run argv\ntell application \"Terminal\"\nactivate\ndo script (item 1 of argv)\nend tell\nend run", shellQuote(helper) + " --terminal-child " + shellQuote(descriptor)}, nil
	}
	binary, args, err := linuxTerminal()
	if err != nil {
		return "", nil, err
	}
	return binary, append(append([]string(nil), args...), helper, "--terminal-child", descriptor), nil
}

// terminalCheck lets the manager report a missing terminal before it decrypts
// a session or starts a background launcher.
func terminalCheck() error {
	if runtime.GOOS == "darwin" {
		_, err := os.Stat("/usr/bin/osascript")
		return err
	}
	_, _, err := linuxTerminal()
	return err
}
func launchTerminal() error {
	data, err := input(1024 * 1024)
	if err != nil {
		return err
	}
	var spec terminalSpec
	if err = json.Unmarshal(data, &spec); err != nil {
		return err
	}
	if err = validateSpec(spec); err != nil {
		return err
	}
	// macOS TMPDIR commonly exceeds the Unix socket path limit once a socket
	// filename is appended. A private directory under /tmp stays short on both OSes.
	dir, err := terminalTempDir()
	if err != nil {
		return err
	}
	descriptor := filepath.Join(dir, "launch.json")
	socket := filepath.Join(dir, "session.sock")
	defer func() { os.Remove(descriptor); os.Remove(socket); os.Remove(dir) }()
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: socket, Net: "unix"})
	if err != nil {
		return err
	}
	defer listener.Close()
	// The first macOS launch waits for the user to approve Terminal automation.
	listener.SetDeadline(time.Now().Add(terminalAcceptTimeout))
	spec.Socket = socket
	data, err = json.Marshal(spec)
	if err != nil {
		return err
	}
	if err = atomicPrivate(descriptor, data); err != nil {
		return err
	}
	helper, err := os.Executable()
	if err != nil {
		return err
	}
	binary, args, err := terminalCommand(helper, descriptor)
	if err != nil {
		return err
	}
	cmd := exec.Command(binary, args...)
	cmd.Env = cleanCodexEnv(os.Environ())
	if err = cmd.Start(); err != nil {
		return err
	}
	go cmd.Wait()
	conn, err := listener.AcceptUnix()
	if err != nil {
		return err
	}
	defer conn.Close()
	// This connection stays open for the actual interactive process, even when a
	// terminal launcher detaches or the manager has already exited.
	var result struct {
		Code int `json:"code"`
	}
	if err = json.NewDecoder(conn).Decode(&result); err != nil {
		return err
	}
	if result.Code != 0 {
		return errPrivate
	}
	return nil
}
func terminalChild(file string) error {
	if !filepath.IsAbs(file) || filepath.Base(file) != "launch.json" || !strings.HasPrefix(filepath.Base(filepath.Dir(file)), "padswitcher-terminal-") {
		return errPrivate
	}
	if err := privateDir(filepath.Dir(file)); err != nil {
		return err
	}
	data, err := readPrivate(file, 1024*1024)
	if err != nil {
		return err
	}
	var spec terminalSpec
	if err = json.Unmarshal(data, &spec); err != nil {
		return err
	}
	if err = validateSpec(spec); err != nil {
		return err
	}
	if spec.Socket != filepath.Join(filepath.Dir(file), "session.sock") {
		return errPrivate
	}
	conn, err := net.DialTimeout("unix", spec.Socket, 10*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	if err = os.Remove(file); err != nil {
		return err
	}
	cmd := exec.Command(spec.Command, spec.Args...)
	cmd.Dir = spec.Cwd
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	env := cleanCodexEnv(os.Environ())
	if spec.Env["PADSWITCHER_KAGGLE_ROOT"] != "" {
		var filtered []string
		for _, value := range env {
			name := strings.SplitN(value, "=", 2)[0]
			if strings.HasPrefix(name, "KAGGLE_") || name == "PYTHONPATH" || name == "PYTHONHOME" || name == "PYTHONSTARTUP" {
				continue
			}
			filtered = append(filtered, value)
		}
		env = filtered
	}
	for key, value := range spec.Env {
		env = replaceEnv(env, key, value)
	}
	cmd.Env = env
	err = interactive(cmd)
	json.NewEncoder(conn).Encode(map[string]int{"code": exitCode(err)})
	if err != nil {
		fmt.Fprintln(os.Stderr, "PADSwitcher: terminal command ended unsuccessfully.")
	}
	return err
}
