# Unix development

This guide is for **Linux/macOS** on `feature/cross-platform`.
For Windows use [the Windows guide](https://github.com/padduwcs/PADSwitcher/blob/main/docs/DEVELOPMENT.md).
To use the app without building, follow [installation](UNIX-INSTALL.en.md).

## Linux

Use Ubuntu Desktop 24.04/26.04 with Git, Python 3.11+, an unlocked Secret Service
(for example GNOME Keyring) and a terminal. On a minimal installation:

```bash
sudo apt update
sudo apt install git python3 python3-venv gnome-keyring
```

Clone the Unix branch and prepare the source checkout:

```bash
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
bash scripts/setup-linux.sh
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
bash scripts/start-linux.sh
```

Setup downloads checksum-verified Node.js 24.18.1 and Go 1.27.3 into
`~/.local/share/padswitcher-unix-dev` (or `$XDG_DATA_HOME`), installs dependencies
and builds the native helper. It preserves system toolchains and shell profiles.
The two sudo commands configure the source Electron sandbox; repeat them after
`npm ci` replaces `node_modules`. Keep the sandbox enabled. Installed deb users
follow the installation guide instead of these source-only commands.

For later npm/Go commands, load the prepared tools:

```bash
. ~/.local/share/padswitcher-unix-dev/env.sh
```

## macOS

Install Git, Node.js 24+ and Go 1.27.3+, and use your unlocked login Keychain.
Then:

```bash
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

The Linux setup/sandbox commands do not apply to macOS. For the downloaded Mac
preview, first-launch permissions are covered in [installation](UNIX-INSTALL.en.md).
WSL development is covered separately in [UNIX.md](UNIX.md).

## One folder and two branches

One checkout is enough. Stop source-running apps, commit or stash unfinished
work and select the edition:

```bash
git status
git switch main
```

The command above selects Windows. To return to Unix:

```bash
git switch feature/cross-platform
```

Switching changes tracked source, without merging editions or changing installed
apps/account data. Prepare the selected branch's dependencies again. On Linux,
rerun setup and the source sandbox permission commands when returning to Unix.
Generated `dist-unix/` and `src/assets/PADCodex` may remain when viewing `main`;
if Git lists them there, exclude those paths locally in `.git/info/exclude`.
A second worktree is optional for simultaneous development.

## Checks

```bash
npm run check
npm run check:docs
npm test
npm run test:helper
npm run test:kaggle
npm run smoke:protocol
npm run smoke:faults
npm run smoke:continuity
npm run smoke:say-hi
npm run smoke:desktop
```

These checks use synthetic accounts, loopback model replies and disposable data;
they do not use real inference quota or reset credits. `smoke:continuity` exercises
both desktop and extension routes, repeated quota fallback, mid-turn steering,
real disposable tool writes and concurrent clients.

Linux keyring/UI checks need the isolated desktop test session described in
[UNIX.md](UNIX.md#kiểm-thử-và-đóng-gói). On macOS run `npm run smoke` and
`npm run smoke:ui` in the desktop session. Existing native Codex discovery is
required by the protocol checks; CI uses `0.160.0`. Additional local validation
covers the engines documented in [UNIX-VALIDATION.md](UNIX-VALIDATION.md).

## Build and package

```bash
npm run build
npm run dist
node scripts/checksums.cjs
npm run smoke:packaged
```

`build` creates an unpacked Unix app. `dist` creates deb/AppImage on Linux or
DMG/ZIP on macOS, under ignored `dist-unix/`. Use `smoke:installed` after installing
on a disposable test machine; keep account data isolated. The release workflow
performs the target-specific sandbox, installation and signing checks.
See [RELEASING.md](RELEASING.md).

## Source layout

| Folder | Purpose |
| --- | --- |
| `src/core/` | Vaults, Codex gateway/router, desktop integration and Kaggle |
| `src/helper/unix/` | Go bridge, terminal supervision and keyring access |
| `src/renderer/` | UI and Vietnamese/English strings |
| `src/assets/` | Fonts, icons and generated helper output |
| `scripts/` | Source setup, build, docs checks and isolated smoke checks |
| `test/` | Unit/integration tests and fixtures |
| `docs/architecture/` | Current routing design and boundaries |
| `docs/archive/` | Historical validation, separate from setup instructions |

Keep regression tests and Windows adapters used by shared-core checks. Disabled
Windows live scripts were removed from this branch; their maintained originals
remain on `main`. For repository/branch policy and generated-file cleanup, use
[MAINTENANCE.md](MAINTENANCE.md).
