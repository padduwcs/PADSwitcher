package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
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
func TestRestorePathKeepsLaterAdditions(t *testing.T) {
	if got := restorePath("/tools:/usr/bin:/custom", "/usr/bin", "/tools"); got != "/usr/bin:/custom" {
		t.Fatal(got)
	}
	if got := restorePath("/tools:/usr/bin:/custom", "/usr/bin:/tools", "/tools"); got != "/usr/bin:/tools:/custom" {
		t.Fatal(got)
	}
}
