#!/bin/bash
# Prepare source development without changing system Node/Go or shell profiles.
set -euo pipefail
[ "$(uname -s)" = Linux ] || { echo 'This setup command is for Linux. See docs/UNIX.md for macOS.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Install Python 3 first: sudo apt install python3' >&2; exit 1; }
repo_root=$(cd "$(dirname "$0")/.." && pwd)
dev_root="${XDG_DATA_HOME:-$HOME/.local/share}/padswitcher-unix-dev"
mkdir -p "$dev_root/toolchains"
python3 - "$dev_root" <<'PY'
import concurrent.futures, hashlib, json, os, pathlib, platform, shlex, tarfile, tempfile, urllib.request
root = pathlib.Path(__import__('sys').argv[1]).resolve()
machine = platform.machine()
if machine not in ('x86_64', 'aarch64', 'arm64'):
    raise SystemExit('Supported Linux architectures: x86_64 and ARM64.')
node_arch, go_arch = ('x64', 'amd64') if machine == 'x86_64' else ('arm64', 'arm64')
node_version, go_version = '24.18.1', '1.27.3'
node_name = f'node-v{node_version}-linux-{node_arch}'
go_name = f'go{go_version}'
def read(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()
def install(kind):
    target = root / 'toolchains' / (node_name if kind == 'node' else go_name)
    binary = target / 'bin' / kind
    if binary.is_file():
        print(f'Using {binary}', flush=True)
        return
    if target.exists():
        raise RuntimeError(f'Incomplete toolchain exists at {target}; move it aside before retrying.')
    if kind == 'node':
        filename = node_name + '.tar.xz'
        base = f'https://nodejs.org/dist/v{node_version}/'
        checks = read(base + 'SHASUMS256.txt').decode()
        expected = next(line.split()[0] for line in checks.splitlines() if line.endswith('  ' + filename))
        url, archive_root = base + filename, node_name
    else:
        filename = f'go{go_version}.linux-{go_arch}.tar.gz'
        versions = json.loads(read('https://go.dev/dl/?mode=json&include=all'))
        expected = next(f['sha256'] for v in versions for f in v['files'] if f['filename'] == filename)
        url, archive_root = 'https://go.dev/dl/' + filename, 'go'
    print(f'Downloading {filename} from the official distribution...', flush=True)
    payload = read(url)
    if hashlib.sha256(payload).hexdigest() != expected:
        raise RuntimeError('SHA-256 verification failed for ' + filename)
    with tempfile.TemporaryDirectory(prefix='.setup-', dir=root / 'toolchains') as folder:
        archive = pathlib.Path(folder) / filename
        archive.write_bytes(payload)
        with tarfile.open(archive) as contents:
            contents.extractall(folder, filter='data')
        os.rename(pathlib.Path(folder) / archive_root, target)
    print(f'Verified and installed {kind}.', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(install, ('node', 'go')))
paths = [str(root / 'toolchains' / node_name / 'bin'), str(root / 'toolchains' / go_name / 'bin')]
(root / 'env.sh').write_text('export PATH=' + shlex.quote(':'.join(paths)) + ':"$PATH"\n')
PY
. "$dev_root/env.sh"
cd "$repo_root"
npm ci
node -e "require('electron')"
npm run helper
sandbox="$repo_root/node_modules/electron/dist/chrome-sandbox"
if [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" = 1 ] && [ ! -u "$sandbox" ]; then
  printf '\nUbuntu source-build sandbox setup (administrator, repeat after npm ci):\n'
  printf 'sudo chown root:root %q\nsudo chmod 4755 %q\n' "$sandbox" "$sandbox"
fi
printf '\nSetup complete. Start the app with: bash scripts/start-linux.sh\n'
printf 'Desktop prerequisites and Kaggle setup: docs/UNIX-INSTALL.md\n'
