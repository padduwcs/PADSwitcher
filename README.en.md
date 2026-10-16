# PADSwitcher Unix

**Profile Account Directory Switcher — an isolated Linux and macOS edition.**
Manage Codex/Kaggle accounts, inspect quota and connect local developer tools.

This is the `feature/cross-platform` branch. The stable Windows edition remains
on [`main`](https://github.com/padduwcs/PADSwitcher/tree/main). The Unix worktree,
app identity, data, default Codex home, build output and release channel are separate.

**[Download Linux/macOS](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.1)**
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

For development, install Node.js 24, Go 1.27.2+ and Git on Linux/macOS:

```bash
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

On the current Windows machine, use the separate worktree:

```powershell
cd D:\Current_Projects\PADSwitcher-Unix
.\scripts\wsl-dev.ps1 -Task verify
.\scripts\wsl-dev.ps1 -Task start
```

The WSL helper mirrors source into a private Linux build workspace and keeps
Linux dependencies separate from Windows. Verification uses disposable data,
synthetic credentials and an isolated test keyring. Normal app startup requires
an unlocked persistent system keyring before accounts can be stored.

Windows DPAPI vaults cannot be imported by copying files. Add/sign in to accounts
again in the Unix edition. Bash 3.2+ and Zsh support per-terminal Kaggle selection.
See the guide for setup, supported connections and validation limits.

Licensed under [MIT](LICENSE). Independent of OpenAI, Kaggle and JetBrains.
