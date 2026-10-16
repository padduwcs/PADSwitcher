package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zalando/go-keyring"
)

func privateTemp(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.Chmod(root, 0700); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestVaultAuthenticatesCiphertext(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)
	plain := []byte("fixture-only-token")
	encrypted, err := cryptVault(key, plain, false)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encrypted, plain) {
		t.Fatal("plaintext persisted")
	}
	other, _ := cryptVault(key, plain, false)
	if bytes.Equal(encrypted, other) {
		t.Fatal("nonce reused")
	}
	decrypted, err := cryptVault(key, encrypted, true)
	if err != nil || !bytes.Equal(decrypted, plain) {
		t.Fatal("round trip failed")
	}
	for _, offset := range []int{0, len(vaultMagic), len(encrypted) - 1} {
		bad := append([]byte(nil), encrypted...)
		bad[offset] ^= 1
		if _, err = cryptVault(key, bad, true); err == nil {
			t.Fatal("tampering accepted")
		}
	}
	key[0] ^= 1
	if _, err = cryptVault(key, encrypted, true); err == nil {
		t.Fatal("wrong key accepted")
	}
	if _, err = cryptVault(key, encrypted[:len(vaultMagic)], true); err == nil {
		t.Fatal("truncated vault accepted")
	}
}
func TestPrivateFilesRejectLinksAndBroadPermissions(t *testing.T) {
	root := privateTemp(t)
	file := filepath.Join(root, "secret")
	if err := atomicPrivate(file, []byte("fixture")); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(file, link); err != nil {
		t.Fatal(err)
	}
	if _, err := readPrivate(link, 100); err == nil {
		t.Fatal("symlink read")
	}
	if err := os.Link(file, filepath.Join(root, "hardlink")); err != nil {
		t.Fatal(err)
	}
	if _, err := readPrivate(file, 100); err == nil {
		t.Fatal("hardlink read")
	}
	os.Remove(filepath.Join(root, "hardlink"))
	os.Chmod(file, 0644)
	if _, err := readPrivate(file, 100); err == nil {
		t.Fatal("world-readable secret accepted")
	}
	os.Chmod(file, 0600)
	if _, err := readPrivate(file, 2); err == nil {
		t.Fatal("oversized secret accepted")
	}
}
func fixtureAuth(subject, account string) []byte {
	jwt := func(v any) string {
		b, _ := json.Marshal(v)
		return "e30." + base64.RawURLEncoding.EncodeToString(b) + ".fixture"
	}
	b, _ := json.Marshal(map[string]any{"tokens": map[string]string{"id_token": jwt(map[string]string{"sub": subject}), "access_token": jwt(map[string]string{"sub": subject}), "refresh_token": "fixture-only-refresh", "account_id": account}})
	return b
}
func TestGuardianPersistsOnlyMatchingSession(t *testing.T) {
	keyring.MockInit()
	root := privateTemp(t)
	home := filepath.Join(root, "profiles", "12345678-1234-4234-8234-123456789abc")
	os.MkdirAll(home, 0700)
	t.Setenv("PADSWITCHER_VAULT_ROOT", root)
	t.Setenv("CODEX_HOME", home)
	t.Setenv("PADSWITCHER_PRIVATE_SESSION", "1")
	auth := fixtureAuth("fixture-user", "fixture-account")
	identity, _ := authIdentity(auth)
	t.Setenv("PADSWITCHER_SESSION_IDENTITY", identity)
	file := filepath.Join(home, "auth.json")
	atomicPrivate(file, auth)
	if err := sealSession(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("temporary auth not removed")
	}
	encrypted, err := readPrivate(filepath.Join(home, "session.dpapi"), 4096)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := vault(encrypted, true)
	if err != nil || !bytes.Equal(plain, auth) {
		t.Fatal("sealed session cannot be recovered")
	}
	wrong := fixtureAuth("other-user", "other-account")
	atomicPrivate(file, wrong)
	if err = sealSession(); err == nil {
		t.Fatal("changed identity accepted")
	}
	after, _ := readPrivate(filepath.Join(home, "session.dpapi"), 4096)
	if !bytes.Equal(after, encrypted) {
		t.Fatal("valid vault overwritten")
	}
	if _, err = os.Stat(file); err != nil {
		t.Fatal("recovery auth removed")
	}
	// A missing key must never be recreated while decrypting an existing vault.
	t.Setenv("PADSWITCHER_VAULT_ROOT", privateTemp(t))
	if _, err = vault(encrypted, true); err == nil {
		t.Fatal("vault from another root decrypted")
	}
}
func TestTerminalDescriptorCannotPersistTokens(t *testing.T) {
	good := terminalSpec{Command: "/bin/bash", Cwd: "/tmp", Env: map[string]string{"CODEX_HOME": "/tmp/managed"}}
	if err := validateSpec(good); err != nil {
		t.Fatal(err)
	}
	good.Env["KAGGLE_API_TOKEN"] = "fixture-only"
	if err := validateSpec(good); err == nil {
		t.Fatal("token allowed in launch descriptor")
	}
}
func TestLinuxTerminalSelection(t *testing.T) {
	bin := t.TempDir()
	for _, name := range []string{"ptyxis", "xterm", "custom-term"} {
		if err := os.WriteFile(filepath.Join(bin, name), []byte("#!/bin/sh\n"), 0700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", bin)
	t.Setenv("TERMINAL", "")
	binary, args, err := linuxTerminal()
	if err != nil || filepath.Base(binary) != "ptyxis" || strings.Join(args, " ") != "--new-window --" {
		t.Fatal("desktop terminal not preferred over xterm", binary, args, err)
	}
	t.Setenv("TERMINAL", "xterm")
	if binary, args, _ = linuxTerminal(); filepath.Base(binary) != "xterm" || strings.Join(args, " ") != "-e" {
		t.Fatal("TERMINAL preference ignored", binary, args)
	}
	t.Setenv("TERMINAL", "custom-term")
	if binary, args, _ = linuxTerminal(); filepath.Base(binary) != "custom-term" || strings.Join(args, " ") != "-e" {
		t.Fatal("unknown TERMINAL should use -e", binary, args)
	}
	t.Setenv("TERMINAL", "custom-term --unsafe-shell-string")
	if binary, _, _ = linuxTerminal(); filepath.Base(binary) != "ptyxis" {
		t.Fatal("TERMINAL with arguments must not be split", binary)
	}
	t.Setenv("TERMINAL", "")
	t.Setenv("PATH", t.TempDir())
	if _, _, err = linuxTerminal(); err == nil {
		t.Fatal("missing terminal accepted")
	}
}
func TestRestorePathKeepsLaterAdditions(t *testing.T) {
	if got := restorePath("/tools:/usr/bin:/custom", "/usr/bin", "/tools"); got != "/usr/bin:/custom" {
		t.Fatal(got)
	}
	if got := restorePath("/tools:/usr/bin:/custom", "/usr/bin:/tools", "/tools"); got != "/usr/bin:/tools:/custom" {
		t.Fatal(got)
	}
}
func TestTerminalSocketWorksWithLongSystemTempPath(t *testing.T) {
	t.Setenv("TMPDIR", filepath.Join(t.TempDir(), strings.Repeat("long-system-temp-", 8)))
	dir, err := terminalTempDir()
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(dir)
	socket := filepath.Join(dir, "session.sock")
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: socket, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	listener.Close()
	os.Remove(socket)
}
