#!/bin/sh
# Run with: dbus-run-session -- sh scripts/linux-test-session.sh <command> [args...]
# The password and keyring below belong only to an ephemeral test environment.
set -eu
session_dir=$(mktemp -d /tmp/padswitcher-keyring-XXXXXX)
cleanup() {
  case "$session_dir" in /tmp/padswitcher-keyring-*) rm -rf -- "$session_dir" ;; esac
}
trap cleanup EXIT HUP INT TERM
export XDG_CONFIG_HOME="$session_dir/config" XDG_DATA_HOME="$session_dir/data" XDG_CACHE_HOME="$session_dir/cache"
unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
mkdir -m 700 "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$session_dir/runtime"
# Wayland and Ptyxis need the real desktop runtime. The new D-Bus session,
# temporary data folders and explicit keyring control directory isolate secrets.
# Headless runners without a desktop runtime still get a private fallback.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-$session_dir/runtime}"
printf '%s' 'PADSwitcher ephemeral test keyring' | gnome-keyring-daemon --unlock --components=secrets --control-directory="$session_dir/runtime/keyring" >/dev/null
"$@"
