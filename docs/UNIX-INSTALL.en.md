# Install PADSwitcher Unix

[Tiếng Việt](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.md)
· [Download Unix 1.19.1-unix.3](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.3)
· [Report a problem](https://github.com/padduwcs/PADSwitcher/issues)

PADSwitcher Unix manages Codex/Kaggle accounts on Linux and macOS. This is a
**public Pre-release**. The stable Windows release remains separate in the same
repository and retains the Latest label. Download an installer under **Assets**;
you do not need Source code, Git, Node.js or Go to run the application.
Electron and the native helper are included.

## 1. Choose a download

| Computer | Download |
| --- | --- |
| Ubuntu/Debian, Intel or AMD 64-bit | `PADSwitcher-1.19.1-unix.3-Linux-amd64.deb` (recommended) |
| Ubuntu/Debian, ARM64 | `PADSwitcher-1.19.1-unix.3-Linux-arm64.deb` (recommended) |
| Other Linux desktops, Intel/AMD (not Ubuntu 24.04+) | `PADSwitcher-1.19.1-unix.3-Linux-x86_64.AppImage` |
| Other Linux desktops, ARM64 (not Ubuntu 24.04+) | `PADSwitcher-1.19.1-unix.3-Linux-arm64.AppImage` |
| Apple Silicon Mac (M1/M2/M3/M4…) | `PADSwitcher-1.19.1-unix.3-macOS-arm64.dmg` |
| Intel Mac | `PADSwitcher-1.19.1-unix.3-macOS-x64.dmg` |

Mac `.zip` files are alternatives to the DMG for the same architecture.
On Linux, `uname -m` shows `x86_64` (Intel/AMD) or `aarch64` (ARM64).
On a Mac, Apple menu → About This Mac shows **Chip** for Apple Silicon or
an Intel **Processor**.

Automated checks target Ubuntu 24.04 x64/ARM64 and macOS 15 Intel/Apple Silicon.
Ubuntu 26.04 x64 was also checked locally. Other environments are not certified. Linux requires a desktop session providing
an unlocked Secret Service, such as GNOME Keyring, and a terminal app for CLI and
Kaggle sessions: GNOME Terminal, Ptyxis, GNOME Console, Konsole, Xfce Terminal,
MATE Terminal, Terminator, kitty, Alacritty, WezTerm, foot or xterm. To prefer
another terminal, set the `TERMINAL` variable to its command name (it must
accept `-e <program>`). For testing from Windows,
see the [WSL development guide](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX.md).

## 2. Install

### Ubuntu/Debian: deb package

Open a terminal in the download folder. For Intel/AMD:

```bash
# Download the installer and matching .sha256 into this folder.
sha256sum -c PADSwitcher-1.19.1-unix.3-Linux-amd64.deb.sha256
# Continue only when the checksum reports OK.
sudo apt install ./PADSwitcher-1.19.1-unix.3-Linux-amd64.deb
```

On ARM64, use the `Linux-arm64.deb` filename instead. Launch **PADSwitcher Unix**
from the application menu, or run `padswitcher-unix` as your normal user.

On Ubuntu/GNOME the login keyring is usually unlocked by the desktop login.
If needed, install `gnome-keyring`, then sign out and back in. Kaggle additionally
needs Python 3.11+ and `python3-venv`; the app guides SDK installation into its
own Python environment.

### Prepare Codex and Kaggle

On Ubuntu Desktop, install any missing prerequisites:

```bash
sudo apt update
sudo apt install gnome-keyring python3 python3-venv
```

If no terminal is installed, add `gnome-terminal`; some Ubuntu versions already
include Ptyxis. Keep your existing terminal if you have one. After installing
GNOME Keyring for the first time, sign out and back in before adding accounts.

**Codex only?** Python and the Kaggle SDKs are optional. Install the native Codex
CLI/extension, open the app and follow section 3 to add an account.

**Using Kaggle?** Open **Services → Kaggle → Setup → Copy install command**, paste
it into your terminal, wait for installation, then choose **Save & check**.
Leave Python discovery automatic to use the app's isolated venv. If creating the
venv fails with missing `ensurepip`, install `python3-venv` as shown above.
Do not use `sudo pip` or `--break-system-packages`.

### Linux: AppImage

```bash
chmod +x PADSwitcher-1.19.1-unix.3-Linux-x86_64.AppImage
./PADSwitcher-1.19.1-unix.3-Linux-x86_64.AppImage
```

On ARM64, use the `Linux-arm64.AppImage` filename. Data is stored in your user
profile, not beside the AppImage. This build uses FUSE 2; on Ubuntu 24.04 install
`libfuse2t64` if it reports missing `libfuse.so.2`
([AppImage documentation](https://docs.appimage.org/user-guide/troubleshooting/fuse.html)).

The AppImage requires unprivileged user namespaces for Chromium sandboxing.
**Ubuntu 24.04 and newer block this by default, so the AppImage does not start
there: use the `.deb`**, whose installation configures the sandbox/AppArmor
integration. On other distributions, ask your administrator
to check the desktop policy. Do not run the app with `sudo`, add `--no-sandbox`,
or disable AppArmor system-wide. See the
[AppImage sandbox explanation](https://docs.appimage.org/user-guide/troubleshooting/electron-sandboxing.html).

### macOS: DMG

1. Open the `.dmg` and drag its `.app` into **Applications**.
2. Eject the DMG, then launch the installed app from Applications.
3. This build is ad-hoc signed and **does not have Apple Developer ID
   notarization**. If macOS blocks it because the developer is unverified and you
   have checked the download source, open **System Settings → Privacy & Security
   → Open Anyway** after the blocked launch. Follow
   [Apple's instructions](https://support.apple.com/en-us/102445).
   Organization-managed Macs may prevent this exception.
4. The account-encryption key is stored in your login Keychain. If the Keychain
   is locked, macOS asks you to unlock it. Like other desktop apps, this protects
   data at the level of your macOS user account: programs running as you can use
   the same Keychain item, so only run software you trust.
5. The first time you open a CLI or Kaggle terminal, macOS asks whether
   PADSwitcher Unix may control **Terminal**. Choose **Allow** within two minutes.
   If you chose Don't Allow, enable it in **System Settings → Privacy & Security →
   Automation**, then try again.

For `.zip`, extract it and move the `.app` into Applications before launching.
Keep the bundle intact. You do not need to disable Gatekeeper system-wide.

## 3. First launch

1. Open PADSwitcher Unix. Vietnamese/English and light/dark themes are available.
2. **Codex:** install a compatible native Codex CLI using
   [OpenAI's instructions](https://github.com/openai/codex#installing-and-running-codex-cli)
   for Linux/macOS or the Codex
   VS Code extension. CI protocol checks use Codex `0.160.0`; `0.163.0` also passed local Linux checks. The app looks in
   PATH, Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), `~/.local/bin`, npm
   global folders including nvm, and the VS Code/Cursor/Windsurf extension.
   If discovery fails,
   open **Codex settings → Advanced Codex settings → Codex CLI → Browse** and
   select the native executable `codex`. A JavaScript wrapper or Windows `.exe`
   is not a compatible selection.
3. Select **Add account**, finish browser sign-in, then select the account to use.
   The application does not ask for your OpenAI password inside its own window.
4. Open **Connections** and follow the CLI/IDE instructions. IDE/shell settings
   are changed only when you explicitly configure that connection. The IDE must
   run in the same Linux/macOS environment as PADSwitcher.
5. **Kaggle (optional):** open Kaggle settings, select Python 3.11+, install the
   SDKs using the in-app setup, and add your Kaggle API token. The managed Python
   environment is stored in the Unix application's own data folder.
   Enabling `padkaggle` adds one line only to the startup files your shells read
   (`~/.bashrc`, `~/.zshrc`, and `~/.bash_profile` on a Mac when it exists).
   Profiles managed as dotfile links are never replaced; the dialog shows the line
   to add yourself.
6. **CLI folder:** CLI sessions start in your home folder. Change it in
   **Codex settings → Workspace** to the project you want Codex to work in.

Keep PADSwitcher running while using its Codex connections. Closing the window
may minimize it to the tray; use **Quit PADSwitcher** in the tray menu to exit.
If the desktop does not display a tray icon, launch the app again to reopen it.

## 4. Verify a download

Download the installer's matching `.sha256` file into the same folder:

```bash
# Linux
sha256sum -c PADSwitcher-1.19.1-unix.3-Linux-amd64.deb.sha256

# macOS
shasum -a 256 -c PADSwitcher-1.19.1-unix.3-macOS-arm64.dmg.sha256
```

Continue only if it reports `OK`. A combined `SHA256SUMS.txt` is also provided.
Checksums detect incomplete or corrupt downloads; they do not replace notarization.

## 5. Updates, data and removal

There is no built-in updater or APT repository. Quit the app and download the
newest **Unix** release, then install the new deb, replace the Mac app, or replace
the AppImage. Use the same OS user and retain their Keychain/Secret Service.
Data is stored at:

| OS | Data folder |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/PADSwitcher-Unix/data`, default `~/.config/PADSwitcher-Unix/data` |
| macOS | `~/Library/Application Support/PADSwitcher-Unix/data` |

The encrypted account vault depends on a key in your OS keyring. Copying only
the data folder to another computer is not a supported account migration.
Sign in/add accounts again on the destination. Do not copy Windows DPAPI vaults
into this edition. The default Codex home is also isolated inside Unix data.

Before uninstalling, use the app's removal controls for IDE/shell connections
you configured, close Codex sessions using PADSwitcher, then quit the app.
Remove the deb with `sudo apt remove padswitcher-unix`, remove the Mac app from
Applications, or delete the AppImage. Uninstalling does not automatically delete
saved accounts or keyring keys.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Keyring cannot be opened | Unlock the login Keychain/GNOME Keyring and use your own desktop session. KDE needs a compatible Secret Service. |
| Codex not found | Install the correct native architecture. If it is in an unusual folder, select its binary in Codex settings (`command -v codex` in a terminal shows where it is). |
| CLI/Kaggle terminal does not open | Install one of the terminals listed in section 1, or set `TERMINAL`, then reopen PADSwitcher. On a Mac, allow Terminal control under Privacy & Security → Automation. |
| VS Code/JetBrains disconnected | Configure it from Connections; save work and reload the IDE as instructed. |
| Kaggle Python/SDK missing | Install Python 3.11+ and venv, run the in-app SDK setup, then check again. |
| AppImage sandbox/FUSE error | On Ubuntu use the deb; elsewhere see the AppImage instructions above. |
| First Mac launch blocked | Verify the source and follow the Open Anyway instructions above. |

[Report a problem in GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues),
including **Unix**, app version, OS, architecture, installer type and reproduction
steps. Redact screenshots/errors. Never attach auth.json, API tokens, application
data folders or keyring contents.

Automated checks cover the native helper, system keyring, shells, Codex protocol,
Electron UI and installers. Browser sign-in with real accounts, actual IDE use
and desktop variants still need practical acceptance feedback. See the
[validation record](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-VALIDATION.md).
