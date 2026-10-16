package main

import (
	"github.com/zalando/go-keyring"
	"os"
	"testing"
)

func TestLiveSystemKeyring(t *testing.T) {
	if os.Getenv("PADSWITCHER_TEST_SYSTEM_KEYRING") != "1" {
		t.Skip("requires an isolated system keyring session")
	}
	const service = "personal.pad.padswitcher.unix.selftest"
	const account = "fixture-only"
	defer keyring.Delete(service, account)
	if err := keyring.Set(service, account, "fixture-only-secret"); err != nil {
		t.Fatalf("system keyring write: %v", err)
	}
	got, err := keyring.Get(service, account)
	if err != nil || got != "fixture-only-secret" {
		t.Fatalf("system keyring read: %v", err)
	}
	if err = selftest(); err != nil {
		t.Fatalf("standalone selftest: %v", err)
	}
}
