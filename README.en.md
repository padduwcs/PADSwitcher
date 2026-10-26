<p align="center"><img src="src/assets/padswitcher-emblem.png" width="180" alt="PADSwitcher"></p>

# PADSwitcher

Manage **Codex and Kaggle accounts**, inspect quota and automatically switch to
an available backup Codex account when the current account reaches its limit.

[Tiếng Việt](README.md) · [Documentation](docs/README.md) · [Report a bug](https://github.com/padduwcs/PADSwitcher/issues/new/choose)

<a id="downloads"></a>
## Download and install

**To use the app, choose an installer below.** Cloning the source, Node.js and
Go are unnecessary for downloaded installers. Windows runs **PADSwitcher**;
Linux/macOS run **PADSwitcher Unix**, with separate accounts and data.

| Operating system | Release | Installer | Guide |
| --- | --- | --- | --- |
| Windows 10/11 x64 | [Stable](https://github.com/padduwcs/PADSwitcher/releases/latest) | Portable `Windows.exe` | [English](https://github.com/padduwcs/PADSwitcher/blob/main/docs/WINDOWS-INSTALL.en.md) |
| Ubuntu/Debian x64 or ARM64 | [Unix.7 · preview](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.7) | `.deb` | [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md) |
| Other compatible Linux desktops | [Unix.7 · preview](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.7) | `.AppImage` | [Linux requirements](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md) |
| macOS Intel or Apple Silicon | [Unix.7 · preview](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.7) | `.dmg` or `.zip` | [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md) |

Open **Assets** on the release page and choose your operating system and CPU
architecture. A `.sha256` file verifies an installer; **Source code** is for
source checkouts. On Ubuntu 24.04/26.04, use the deb rather than AppImage.

Windows portable builds are unsigned. The Mac preview is ad-hoc signed without
notarization; the installation guide explains the first launch. Unix previews
keep the stable Windows release's **Latest** download unchanged.

## First use

1. Install/open the app, choose **Services → Codex**, and add an account through
   your browser.
2. Open **Connections** and set up **VS Code**, **CLI** or **JetBrains**.
   Unix also offers **Open desktop through PADSwitcher** for local Codex.
3. For account fallback, add at least two accounts, open the auto-switch setup,
   select backup accounts and save. Keep PADSwitcher running while connected.

Unix desktop Codex uses the **Shared** fallback policy. Extensions in Shared
mode use the same policy; separate-account connections have their own lists.
[Step-by-step auto-switch setup](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md#enable-account-fallback-for-desktop-and-the-extension).

Fallback supports personal Codex Free/Plus/Pro accounts and explicit quota
rejections before output. Regular ChatGPT history does not move between accounts;
cloud/remote jobs are outside this local Codex connection.

**Kaggle:** open **Services → Kaggle → Setup**, install the tools shown, add your
API token and open a terminal for the account you want. Each terminal keeps its
own account selection. [Kaggle guide](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/KAGGLE.en.md).

<p align="center"><img src="docs/images/light.png" width="49%" alt="Light theme"><img src="docs/images/dark.png" width="49%" alt="Dark theme"></p>

## Clone and develop

The repository maintains two branches. **Choose the branch when cloning**:

| Edition | Branch | Setup and run |
| --- | --- | --- |
| Windows | `main` | [Windows development](https://github.com/padduwcs/PADSwitcher/blob/main/docs/DEVELOPMENT.md) |
| Linux/macOS | `feature/cross-platform` | [Unix development](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/DEVELOPMENT.md) |

Linux/macOS:

```bash
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
```

On Linux, follow the Unix guide's **Linux** section to prepare tools and the
sandbox. On Mac, follow **macOS**. For Windows, clone with `--branch main`.
A clone without `--branch` defaults to Windows source.

One checkout is enough; save your changes before switching branches. Installed
applications run independently of source checkouts. See [Contributing](CONTRIBUTING.md)
and [using one folder](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/DEVELOPMENT.md#one-folder-and-two-branches).

## Documentation and support

- [Documentation index](docs/README.md) · [Support](SUPPORT.md) · [Security](SECURITY.md)
- [Windows changelog](https://github.com/padduwcs/PADSwitcher/blob/main/CHANGELOG.md) · [Unix changelog](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/CHANGELOG.md)
- [Unix validation and limits](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-VALIDATION.md)

Released under [MIT](LICENSE). Independent of OpenAI, Kaggle and JetBrains.
