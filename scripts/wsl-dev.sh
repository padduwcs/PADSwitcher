#!/bin/bash
set -euo pipefail
source_root=$1
task=${2:-start}
dev_root="$HOME/.local/share/padswitcher-unix-dev"
node_arch=x64
if [ "$(uname -m)" = aarch64 ]; then node_arch=arm64; fi
export PATH="$dev_root/toolchains/go1.27.3/bin:$dev_root/toolchains/node-v24.18.1-linux-$node_arch/bin:$dev_root/toolchains/go/bin:$PATH"
if ! command -v node >/dev/null || [ "$(node -p process.platform)" != linux ] || ! command -v go >/dev/null; then
  echo 'Install Linux Node.js 24 and Go 1.27.3+ in WSL. See docs/UNIX.md.' >&2
  exit 1
fi
source_id=$(printf '%s' "$source_root" | sha256sum | cut -c1-12)
workspace="$dev_root/workspaces/$source_id"
mkdir -p "$workspace"
exec 9>"$workspace/.dev.lock"
flock -n 9 || { echo 'This WSL workspace is already running.' >&2; exit 1; }
python3 "$source_root/scripts/wsl-sync.py" "$source_root" "$workspace"
cd "$workspace"
lock_hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat .npm-lock-hash 2>/dev/null || true)" != "$lock_hash" ]; then
  npm ci
  printf '%s' "$lock_hash" > .npm-lock-hash
fi
if [ "$task" = verify ]; then
  npm run check
  npm test
  npm run test:helper
  npm run test:kaggle
  npm run smoke:protocol
  npm run smoke:say-hi
  dbus-run-session -- sh scripts/linux-test-session.sh sh -c 'npm run smoke && npm run smoke:ui'
  npm run dist
  dbus-run-session -- sh scripts/linux-test-session.sh npm run smoke:packaged
  node scripts/checksums.cjs
elif [ "$task" = test ]; then
  npm test
elif [ "$task" = smoke ] || [ "$task" = smoke:ui ] || [ "$task" = smoke:packaged ]; then
  npm run helper
  dbus-run-session -- sh scripts/linux-test-session.sh npm run "$task"
else
  npm run "$task"
fi
if [ "$task" = verify ] || [ "$task" = dist ]; then
  node scripts/checksums.cjs
  mkdir -p "$source_root/dist-unix"
  for artifact in dist-unix/*.AppImage dist-unix/*.deb dist-unix/*.sha256; do
    [ ! -f "$artifact" ] || cp "$artifact" "$source_root/dist-unix/"
  done
fi
