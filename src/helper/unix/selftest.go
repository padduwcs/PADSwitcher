package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"
)

// This check creates and deletes its own temporary keyring item. It never
// reads an account, a user-selected vault, or a normal Codex home.
func selftest() error {
	root, err := os.MkdirTemp("", "padswitcher-keyring-check-")
	if err != nil {
		return err
	}
	defer func() { os.Remove(filepath.Join(root, ".vault-key.lock")); os.Remove(root) }()
	digest := sha256.Sum256([]byte(filepath.Clean(root)))
	account := "vault-v1-" + hex.EncodeToString(digest[:])
	defer keyring.Delete("personal.pad.padswitcher.unix", account)
	key, err := masterKey(root, true)
	if err != nil {
		return err
	}
	defer clear(key)
	plain := []byte("PADSwitcher fixture only, no credential")
	encrypted, err := cryptVault(key, plain, false)
	if err != nil || bytes.Contains(encrypted, plain) {
		return errPrivate
	}
	again, err := masterKey(root, false)
	if err != nil || !bytes.Equal(again, key) {
		return errPrivate
	}
	defer clear(again)
	decoded, err := cryptVault(again, encrypted, true)
	if err != nil || !bytes.Equal(decoded, plain) {
		return errPrivate
	}
	clear(decoded)
	encrypted[len(encrypted)-1] ^= 1
	if _, err = cryptVault(key, encrypted, true); err == nil {
		return errPrivate
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]bool{"keyring": true, "encryption": true, "tamperRejected": true})
}
