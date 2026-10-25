#!/bin/bash
set -euo pipefail
[ "$(uname -s)" = Linux ] || { echo 'Run this command inside Linux.' >&2; exit 1; }
repo_root=$(cd "$(dirname "$0")/.." && pwd)
dev_root="${XDG_DATA_HOME:-$HOME/.local/share}/padswitcher-unix-dev"
if [ -f "$dev_root/env.sh" ]; then . "$dev_root/env.sh"; fi
command -v node >/dev/null && command -v go >/dev/null || { echo 'Run bash scripts/setup-linux.sh first.' >&2; exit 1; }
cd "$repo_root"
[ -d node_modules ] || { echo 'Run bash scripts/setup-linux.sh first.' >&2; exit 1; }
exec npm start
