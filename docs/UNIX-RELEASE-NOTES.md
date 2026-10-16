## Linux / macOS — {{VERSION}} · Pre-release

**Tiếng Việt:** Bản Unix công khai đầu tiên: quản lý tài khoản Codex/Kaggle,
quota, kết nối CLI/VS Code/JetBrains và shell Bash/Zsh. Chọn bộ cài theo bảng
bên dưới. Không cần tải Source code hay cài Node.js/Go để mở ứng dụng.

**English:** First public Unix preview: Codex/Kaggle account management, quota,
CLI/VS Code/JetBrains connections and Bash/Zsh integration. Choose an installer
below. No source build, Node.js or Go is needed to run the application.

| Hệ điều hành / Platform | Tải về / Download |
| --- | --- |
| Ubuntu/Debian · Intel/AMD x64 | [deb (khuyên dùng / recommended)](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-amd64.deb) · [AppImage](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-x86_64.AppImage) |
| Ubuntu/Debian · ARM64 | [deb (khuyên dùng / recommended)](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-arm64.deb) · [AppImage](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-arm64.AppImage) |
| macOS · Apple Silicon (M1/M2/M3/M4…) | [DMG](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-macOS-arm64.dmg) · [ZIP](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-macOS-arm64.zip) |
| macOS · Intel | [DMG](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-macOS-x64.dmg) · [ZIP](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-macOS-x64.zip) |

**Hướng dẫn / Installation:**
[Tiếng Việt](https://github.com/padduwcs/PADSwitcher/blob/{{TAG}}/docs/UNIX-INSTALL.md)
· [English](https://github.com/padduwcs/PADSwitcher/blob/{{TAG}}/docs/UNIX-INSTALL.en.md).
Các file `INSTALL-Unix-vi.md` và `INSTALL-Unix-en.md` cũng có trong Assets.
Every installer has a matching `.sha256`; `SHA256SUMS.txt` lists all installers
and both installation guides.

### Cài và mở / Install and open

- **Ubuntu:** tải deb đúng kiến trúc, chạy `sudo apt install ./<filename>.deb`,
  mở **PADSwitcher Unix** từ menu ứng dụng. Linux cần desktop có Secret Service
  đã mở khóa (ví dụ GNOME Keyring). Prefer the deb on Ubuntu; AppImage requires
  FUSE 2 and working unprivileged user namespaces for the Chromium sandbox.
- **Mac:** mở DMG, kéo app vào **Applications**, eject DMG rồi mở app.
  This preview is **ad-hoc signed, without Apple Developer ID notarization**.
  Lần đầu có thể cần **System Settings → Privacy & Security → Open Anyway**;
  xem [hướng dẫn Apple / Apple's instructions](https://support.apple.com/en-us/102445).
- **Codex:** cần CLI native tương thích hoặc binary từ extension Codex;
  protocol tested with `0.160.0`. **Kaggle (optional):** Python 3.11+; use the
  in-app setup to install its SDKs into an isolated Python environment.

### Phạm vi bản thử nghiệm / Preview scope

Build/tests target **Ubuntu 24.04 x64/ARM64** and **macOS 15 Intel/Apple Silicon**.
Native helpers, keyrings, shells, offline Codex protocol, source/packaged UI and
installed deb/DMG startup are checked automatically. Real-account browser login,
actual IDE workflows, Terminal automation prompts and other desktop distributions
still need practical acceptance feedback. See the
[validation record](https://github.com/padduwcs/PADSwitcher/blob/{{TAG}}/docs/UNIX-VALIDATION.md).

Ứng dụng dùng định danh, dữ liệu, Codex home và kênh phát hành Unix riêng.
Không chép kho tài khoản Windows sang Unix; đăng nhập/thêm tài khoản lại.
The stable Windows release and its **Latest** label remain unchanged.
Unix updates are manual: quit the app and replace it with a newer Unix build.

**Báo lỗi / Feedback:** [GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues).
Include **Unix**, version, OS, architecture and installer type. Remove credentials
and personal data from reports. Never attach account vaults, auth.json or API tokens.
