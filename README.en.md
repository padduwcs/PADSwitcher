<p align="center"><img src="src/assets/padswitcher-emblem.png" width="220" alt="PADSwitcher"></p>

# PADSwitcher Unix

**Profile Account Directory Switcher — an isolated Linux and macOS edition.**
Manage Codex/Kaggle accounts, inspect quota and connect local developer tools.

This is the `feature/cross-platform` branch. The stable Windows edition remains
on [`main`](https://github.com/padduwcs/PADSwitcher/tree/main). The Unix app identity,
data, default Codex home, build output and release channel are separate. You can
keep one source folder and switch branches to work on either edition.

**[Download Linux/macOS](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.3)**
· [Install and first launch](docs/UNIX-INSTALL.en.md) · [Tiếng Việt](README.md).

Download a deb (recommended on Ubuntu/Debian), AppImage (compatible Linux desktops)
or DMG (macOS). Linux x64/ARM64 and Mac Intel/Apple Silicon are available.
The release includes bilingual installation guides and SHA-256 checksums.
This is a public **Pre-release**; check its validation scope before use.

For development, see [the Unix/WSL guide](docs/UNIX.md), [validation record](docs/UNIX-VALIDATION.md)
and [GitHub builds](https://github.com/padduwcs/PADSwitcher/actions/workflows/unix-ci.yml?query=branch%3Afeature%2Fcross-platform).

Linux requires an unlocked Secret Service such as GNOME Keyring; macOS uses the
user's Keychain. A compatible native Codex CLI is installed separately. Kaggle
requires Python 3.11+ and the SDK versions shown in the app.

Build artifacts are AppImage/deb on Linux and dmg/zip on macOS, with SHA-256 files.
Unix releases use `unix-v…` tags and are prereleases with `latest=false`.
The macOS preview is ad-hoc signed and does not yet have Developer ID notarization.
Downloaded builds do not require Node.js or Go.

## Clone and run on Linux

For a source checkout on Ubuntu Desktop 24.04/26.04:

```bash
sudo apt update
sudo apt install git python3 python3-venv gnome-keyring
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
bash scripts/setup-linux.sh
# Ubuntu 24.04/26.04: configure the source-build sandbox.
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
bash scripts/start-linux.sh
```

The two sudo commands configure the downloaded Electron sandbox helper. Repeat
them after `npm ci` replaces `node_modules`. Keep sandboxing enabled; do not use
`--no-sandbox`. The deb installer configures sandboxing for downloaded builds.

The setup script downloads Node.js 24.18.1 and Go 1.27.3 from their official
hosts, verifies SHA-256 hashes, installs npm dependencies and builds the helper.
Toolchains live in your user data directory; system Node/Go and shell profiles
are unchanged. You can rerun setup after an interrupted download. The start
script loads the prepared environment. An unlocked desktop keyring and a terminal
app are needed for account/CLI use. Minimal headless servers are not supported.

Already have Node.js 24+ and Go 1.27.3+? Run `npm ci` and `npm start` directly.
On macOS, install those toolchains, clone this branch and use the same npm commands.
For Windows/WSL, follow [the Unix/WSL guide](docs/UNIX.md).

Windows DPAPI vaults cannot be imported by copying files. Add/sign in to accounts
again in the Unix edition. Bash 3.2+ and Zsh support per-terminal Kaggle selection.
See the guide for setup, supported connections and validation limits.

## One folder and two branches

A single `PADSwitcher` folder is enough. Git replaces its tracked source files
with the selected branch when you switch:

```bash
cd PADSwitcher
git status
git switch main                    # Windows source
git switch feature/cross-platform  # Linux/macOS source
```

The two `git switch` commands are alternatives; choose the edition you need.
Commit or stash unfinished changes before switching. Stop any app running from
source first. An app installed from a release installer runs independently.

Prepare dependencies using the selected branch's instructions after switching.
When returning to Linux, rerun `bash scripts/setup-linux.sh` and the two sandbox
commands above before starting from source. Switching branches does not merge
their code. A second worktree is optional when both branches need to be open at
once. See [the development guide](docs/DEVELOPMENT.md#one-folder-and-two-branches).

Licensed under [MIT](LICENSE). Independent of OpenAI, Kaggle and JetBrains.
