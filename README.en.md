<p align="center">
  <img src="src/assets/padswitcher-emblem.png" alt="PADSwitcher emblem" width="220">
</p>

<h1 align="center">PADSwitcher</h1>

<p align="center">
  <strong>Profile Account Directory Switcher</strong><br>
  <strong>One place to manage Codex and Kaggle accounts.</strong><br>
  Track quotas, switch accounts safely, and keep working in your IDE or terminal.<br>
  Stable on Windows · preview for Linux and macOS.
</p>

<p align="center">
  <a href="https://github.com/padduwcs/PADSwitcher/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/padduwcs/PADSwitcher?style=for-the-badge&color=147de5"></a>
  <a href="https://github.com/padduwcs/PADSwitcher/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/padduwcs/PADSwitcher/ci.yml?branch=main&style=for-the-badge&label=checks"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/padduwcs/PADSwitcher?style=for-the-badge&color=338f85"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge&logo=windows11">
  <a href="#linux-and-macos-preview"><img alt="Linux and macOS preview" src="https://img.shields.io/badge/Linux%20%7C%20macOS-preview-E95420?style=for-the-badge&logo=linux&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/padduwcs/PADSwitcher/releases/latest"><strong>⬇️ Download for Windows</strong></a>
  &nbsp;·&nbsp; <a href="#linux-and-macos-preview"><strong>🐧 Linux / 🍎 macOS (preview)</strong></a>
  &nbsp;·&nbsp; <a href="README.md">Tiếng Việt</a>
  &nbsp;·&nbsp; <a href="https://github.com/padduwcs/PADSwitcher/issues/new/choose">Report a bug</a>
</p>

> [!IMPORTANT]
> The Windows edition is a portable app and is currently **unsigned**. The Linux/macOS edition is a **Pre-release**; its Mac build is ad-hoc signed and not notarized. Download only from the official Releases page and verify the accompanying `.sha256` file.

<p align="center">
  <img src="docs/images/light.png" alt="PADSwitcher Codex accounts in the light theme" width="49%">
  <img src="docs/images/dark.png" alt="PADSwitcher Codex accounts in the dark theme" width="49%">
</p>

## Highlights

- 🔄 **Keep Codex moving:** switch manually or retry on a backup account when a confirmed quota error occurs before response output.
- 🧩 **Works where you do:** connect Codex in VS Code, the terminal CLI, and JetBrains AI Assistant.
- 📊 **Clear quota visibility:** see remaining allowances, reset times, switch history, and model activity in one app.
- 🚀 **Parallel Kaggle workflows:** select a different account per terminal and monitor GPU/TPU quotas, pinned notebooks, and recent runs.
- 🔐 **Local-first security:** Codex sessions and Kaggle tokens are encrypted with Windows DPAPI, or with a key in Keychain/Secret Service on macOS/Linux.
- 🌗 **Polished UI:** light/dark themes, Vietnamese/English, responsive layouts, and adjustable panes.

<p align="center">
  <img src="docs/images/services.png" alt="Codex and Kaggle service selector" width="49%">
  <img src="docs/images/kaggle.png" alt="Multiple Kaggle accounts in PADSwitcher" width="49%">
</p>

## Get started on Windows

### Requirements

- Windows 10/11 x64 and .NET Framework 4.8.
- For Codex: the Windows Codex CLI or VS Code Codex extension. Verified with Codex `0.160.0`.
- For Kaggle: Python 3.11+ and the Kaggle tools described in the app.
- The portable build does not require Node.js.

### Install

1. Download `PADSwitcher-<version>-Windows.exe` and its `.sha256` file from [Releases](https://github.com/padduwcs/PADSwitcher/releases/latest).
2. Verify the download:

   ```powershell
   Get-FileHash .\PADSwitcher-*-Windows.exe -Algorithm SHA256
   ```

3. Open the app → **Services** → choose **Codex** or **Kaggle**.
4. Follow the in-app three-step guide to add an account and connect your tool.

PADSwitcher is portable: put the `.exe` wherever you prefer and run it directly. To update, quit the old version from the system tray and open the new one; data under `%APPDATA%\PADSwitcher\data` is retained.

## Linux and macOS (preview)

**PADSwitcher Unix** offers the same Codex and Kaggle features and runs independently of the Windows edition, with its own accounts, data, and release channel. It is a **Pre-release**, automatically tested on Ubuntu 24.04 and macOS 15 (Intel and Apple Silicon).

👉 [**Download for Linux/macOS**](https://github.com/padduwcs/PADSwitcher/releases?q=unix&expanded=true): open the newest release named **PADSwitcher Unix** and download a file under **Assets**. You do not need Source code, Node.js, or Go.

### 1. Choose your file

| Your computer | Download |
| --- | --- |
| Ubuntu/Debian, Intel/AMD 64-bit | `PADSwitcher-<version>-Linux-amd64.deb` |
| Ubuntu/Debian, ARM64 | `PADSwitcher-<version>-Linux-arm64.deb` |
| Apple Silicon Mac (M1/M2/M3/M4…) | `PADSwitcher-<version>-macOS-arm64.dmg` |
| Intel Mac | `PADSwitcher-<version>-macOS-x64.dmg` |
| Other Linux desktops (not Ubuntu 24.04+) | `PADSwitcher-<version>-Linux-x86_64.AppImage` or `Linux-arm64.AppImage` |

Not sure which chip you have? On Linux, run `uname -m` (`x86_64` means Intel/AMD, `aarch64` means ARM64). On a Mac, open the Apple menu → **About This Mac**: **Chip** means Apple Silicon, an Intel **Processor** means Intel.

### 2. Install

**Ubuntu/Debian:** open a terminal in the download folder and run:

```bash
sha256sum -c PADSwitcher-<version>-Linux-amd64.deb.sha256   # must report OK
sudo apt install ./PADSwitcher-<version>-Linux-amd64.deb
```

Then open **PADSwitcher Unix** from the application menu (or run `padswitcher-unix`).

**macOS:**

1. Open the `.dmg`, drag **PADSwitcher Unix** into **Applications**, then eject the DMG.
2. Open the app from Applications. If macOS blocks it because the developer is unverified, go to **System Settings → Privacy & Security → Open Anyway** ([Apple's instructions](https://support.apple.com/en-us/102445)).
3. The first time you open a CLI or Kaggle terminal, choose **Allow** when macOS asks to let the app control **Terminal**.

**Other Linux (AppImage):** run `chmod +x PADSwitcher-<version>-Linux-x86_64.AppImage`, then launch the file. The AppImage needs FUSE 2 and a system that permits the Chromium sandbox; on Ubuntu 24.04+ use the `.deb`.

### 3. System requirements

- **Linux:** a desktop session with an unlocked Secret Service keyring (for example GNOME Keyring, usually unlocked at login) and a terminal app (GNOME Terminal, Ptyxis, Konsole, Xfce Terminal, kitty, Alacritty, WezTerm, xterm…).
- **macOS:** your existing login Keychain and the Terminal app.
- **Codex:** a native Codex CLI for Linux/macOS ([OpenAI's instructions](https://github.com/openai/codex#installing-and-running-codex-cli)) or the Codex VS Code extension. The app searches PATH, Homebrew, `~/.local/bin`, npm/nvm, and the VS Code/Cursor/Windsurf extension.
- **Kaggle (optional):** Python 3.11+ (plus `python3-venv` on Ubuntu); the app guides SDK installation into its own Python environment.

### 4. First use

1. Open the app → **Services** → **Codex** → **Add account**, and sign in in your browser.
2. In **Codex settings → Workspace**, choose the project folder for CLI sessions.
3. Open **Connections** to set up VS Code, the CLI (Bash/Zsh), or JetBrains.
4. For Kaggle: **Services → Kaggle → Setup**, install the tools, add an API token, and enable `padkaggle` to select accounts directly in your terminal.

The Unix edition does not read the Windows account vault; add your accounts again. There is no automatic update yet: when a new version is out, quit the app and install the new `.deb`/`.app` over the old one.

📘 Complete guide (troubleshooting, data, removal): [**English**](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md) · [Tiếng Việt](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.md)

## Connect Codex

- **VS Code:** choose **Connections → Set up VS Code**, then run `Developer: Reload Window` once.
- **Terminal / VS Code terminal:** copy the command from **Connections** and paste it into PowerShell (Windows) or Bash/Zsh (Linux/macOS). The regular `codex` command continues to use its own session.
- **JetBrains/Android Studio:** install AI Assistant and the Codex agent, then select **Codex · PADSwitcher** in AI Chat.

All three client types share one account by default. You can also assign a separate account and auto-switch policy to each client type. See the [complete Codex guide](docs/CODEX.md#english).

## Use Kaggle

1. Open **Services → Kaggle → Setup**, install the suggested tools, then **Save & check**.
2. Create an API token in [Kaggle Settings](https://www.kaggle.com/settings), then choose **Add account**.
3. Select an account → **Copy command** or **Open new terminal**.
4. Submit notebooks with the Kaggle CLI and monitor quotas/runs in PADSwitcher.

Each terminal (PowerShell, Bash, or Zsh) keeps its own account selection, so multiple terminals can use different accounts in parallel within Kaggle's limits. See the [complete Kaggle guide](docs/KAGGLE.en.md).

## Security and boundaries

- PADSwitcher does not run an Internet-hosted proxy. Its gateway listens on loopback only and uses a fresh capability on each start.
- The app does not write prompts or credentials to its own logs. Do not share the app-data directory, connection files, or unredacted screenshots.
- Automatic switching supports personal Codex Free/Plus/Pro accounts and confirmed quota errors before response output.
- Organization accounts, SSH/containers, Codex cloud, auto-start with the OS, and automatic updates are not currently supported. The Windows edition does not run inside WSL; use the Unix edition for Linux or WSL.
- The Linux/macOS edition is a Pre-release: the Mac build is not notarized, and Linux distributions other than Ubuntu 24.04 are not yet certified.
- Codex sandboxing and tool-approval prompts remain in place.

Read more: [Security](SECURITY.md) · [Routing boundaries](ROUTING.en.md) · [Validation scope](VALIDATION.md)

## Development

```powershell
git clone https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

Development requires Node.js 24 LTS and Git. Main checks:

```powershell
npm run check
npm test
npm run smoke:ui
npm run dist
```

The native helper is built automatically. See the [development guide](docs/DEVELOPMENT.md), [contributing guide](CONTRIBUTING.md), and [changelog](CHANGELOG.md). The Linux/macOS source lives on the [`feature/cross-platform`](https://github.com/padduwcs/PADSwitcher/tree/feature/cross-platform) branch ([Unix/WSL development guide](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX.md)).

## Community

If something breaks, [open an issue](https://github.com/padduwcs/PADSwitcher/issues/new/choose) with the app version, operating system, and reproduction steps. Redact account information. Report vulnerabilities through the [security policy](SECURITY.md).

---

<p align="center">
  Released under the <a href="LICENSE">MIT License</a> ·
  <a href="THIRD_PARTY_NOTICES.md">Third-party notices</a><br>
  Independent project; not an official OpenAI, Kaggle, or JetBrains product.
</p>
