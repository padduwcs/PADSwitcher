package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var kaggleToken = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)

type kaggleAccount struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Label     string `json:"label"`
	Workspace string `json:"workspace"`
}
type kaggleStore struct {
	Version  int             `json:"version"`
	Accounts []kaggleAccount `json:"accounts"`
}

func loadKaggle(root string) (kaggleStore, error) {
	var store kaggleStore
	if err := privateDir(root); err != nil {
		return store, err
	}
	data, err := readPrivate(filepath.Join(root, "accounts.json"), 1024*1024)
	if err != nil {
		return store, err
	}
	if err = json.Unmarshal(data, &store); err != nil || store.Version != 1 || len(store.Accounts) > 100 {
		return store, errPrivate
	}
	for _, account := range store.Accounts {
		if !uuidPattern.MatchString(account.ID) || !accountPattern.MatchString(account.Username) {
			return store, errPrivate
		}
	}
	return store, nil
}
func emitEnv(values map[string]string) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, key := range keys {
		fmt.Fprintf(&b, "export %s=%s\n", key, shellQuote(values[key]))
	}
	return b.String()
}
func currentKaggle() map[string]string {
	out := map[string]string{}
	for _, item := range os.Environ() {
		key, value, _ := strings.Cut(item, "=")
		if strings.HasPrefix(key, "KAGGLE_") && regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`).MatchString(key) {
			out[key] = value
		}
	}
	return out
}
func clearKaggle() string {
	keys := make([]string, 0)
	for key := range currentKaggle() {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, key := range keys {
		fmt.Fprintf(&b, "unset %s\n", key)
	}
	return b.String()
}
func restorePath(current, original, tools string) string {
	base := strings.Split(original, string(os.PathListSeparator))
	seen := map[string]bool{}
	for _, p := range base {
		seen[p] = true
	}
	for _, p := range strings.Split(current, string(os.PathListSeparator)) {
		if p != "" && p != tools && !seen[p] {
			base = append(base, p)
			seen[p] = true
		}
	}
	return strings.Join(base, string(os.PathListSeparator))
}
func kaggle(args []string) error {
	if len(args) == 0 {
		return errPrivate
	}
	switch args[0] {
	case "--kaggle-restore":
		if len(args) != 1 {
			return errPrivate
		}
		fmt.Print(emitEnv(currentKaggle()))
		return nil
	case "--kaggle-clear":
		if len(args) != 1 {
			return errPrivate
		}
		fmt.Print(clearKaggle())
		original, ok := os.LookupEnv("PADSWITCHER_KAGGLE_ORIGINAL_PATH")
		if ok {
			fmt.Print(emitEnv(map[string]string{"PATH": restorePath(os.Getenv("PATH"), original, os.Getenv("PADSWITCHER_KAGGLE_TOOLS"))}))
		}
		fmt.Println("unset PADSWITCHER_KAGGLE_ORIGINAL_PATH PADSWITCHER_KAGGLE_TOOLS")
		return nil
	}
	if len(args) < 2 {
		return errPrivate
	}
	root := args[1]
	store, err := loadKaggle(root)
	if err != nil {
		return err
	}
	if args[0] == "--kaggle-list" {
		if len(args) != 2 {
			return errPrivate
		}
		for _, account := range store.Accounts {
			fmt.Println(account.Username)
		}
		return nil
	}
	if args[0] != "--kaggle-env" || len(args) != 3 {
		return errPrivate
	}
	var selected *kaggleAccount
	for i, account := range store.Accounts {
		if strings.EqualFold(account.Username, args[2]) || strings.EqualFold(account.Label, args[2]) {
			if selected != nil {
				return errPrivate
			}
			selected = &store.Accounts[i]
		}
	}
	if selected == nil {
		return errPrivate
	}
	var tools struct {
		Python  string `json:"python"`
		Scripts string `json:"scriptsPath"`
	}
	toolBytes, err := readPrivate(filepath.Join(root, "terminal", "tools.json"), 16384)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(toolBytes, &tools); err != nil || !filepath.IsAbs(tools.Python) || !filepath.IsAbs(tools.Scripts) {
		return errPrivate
	}
	// Probe the selected interpreter with all inherited Kaggle/Python hooks removed.
	reader := filepath.Join(root, "terminal", "kaggle-reader.py")
	if _, err = readPrivate(reader, 1024*1024); err != nil {
		return err
	}
	cmd := exec.Command(tools.Python, "-E", "-P", reader)
	env := []string{}
	for _, item := range os.Environ() {
		key := strings.SplitN(item, "=", 2)[0]
		if strings.HasPrefix(key, "KAGGLE_") || strings.HasPrefix(key, "PADSWITCHER_KAGGLE_") || key == "PYTHONPATH" || key == "PYTHONHOME" || key == "PYTHONSTARTUP" {
			continue
		}
		env = append(env, item)
	}
	cmd.Env = env
	cmd.Stdin = bytes.NewBufferString(`{"action":"probe"}`)
	output, err := cmd.Output()
	if err != nil || len(output) > 512*1024 {
		return errPrivate
	}
	var probe struct {
		OK         bool   `json:"ok"`
		Supported  bool   `json:"supported"`
		Executable string `json:"executable"`
		Scripts    string `json:"scriptsPath"`
	}
	if json.Unmarshal(output, &probe) != nil || !probe.OK || !probe.Supported || probe.Executable != tools.Python || probe.Scripts != tools.Scripts {
		return errPrivate
	}
	cli := filepath.Join(root, selected.ID, "cli")
	if err = privateDir(cli); err != nil {
		return err
	}
	if _, err = os.Stat(filepath.Join(tools.Scripts, "kaggle")); err != nil {
		return err
	}
	data, err := readPrivate(filepath.Join(root, selected.ID, "token.dpapi"), 32768)
	if err != nil {
		return err
	}
	key, err := masterKey(filepath.Dir(root), false)
	if err != nil {
		return err
	}
	defer clear(key)
	token, err := cryptVault(key, data, true)
	if err != nil {
		return err
	}
	defer clear(token)
	if len(token) < 16 || len(token) > 8192 || !kaggleToken.Match(token) {
		return errPrivate
	}
	currentPath := os.Getenv("PATH")
	oldTools := os.Getenv("PADSWITCHER_KAGGLE_TOOLS")
	paths := []string{tools.Scripts}
	for _, p := range filepath.SplitList(currentPath) {
		if p != tools.Scripts && p != oldTools {
			paths = append(paths, p)
		}
	}
	original, ok := os.LookupEnv("PADSWITCHER_KAGGLE_ORIGINAL_PATH")
	if !ok {
		original = currentPath
	}
	// Build the entire result before printing: a failed selection cannot partially
	// replace the credentials in the caller's current shell.
	result := clearKaggle() + emitEnv(map[string]string{"KAGGLE_API_TOKEN": string(token), "KAGGLE_KEY": "PADSwitcher-token-only-no-legacy-key", "KAGGLE_USERNAME": selected.Username, "KAGGLE_CONFIG_DIR": cli, "PATH": strings.Join(paths, string(os.PathListSeparator)), "PADSWITCHER_KAGGLE_ORIGINAL_PATH": original, "PADSWITCHER_KAGGLE_TOOLS": tools.Scripts})
	fmt.Print(result)
	return nil
}
