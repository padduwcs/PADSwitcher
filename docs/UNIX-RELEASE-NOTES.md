## Linux / macOS — {{VERSION}} · Pre-release

**Tiếng Việt:** Bản Unix thử nghiệm: quản lý tài khoản Codex/Kaggle, quota,
kết nối CLI/VS Code/JetBrains/desktop và shell Bash/Zsh. Chọn bộ cài theo bảng bên dưới.
Không cần tải Source code hay cài Node.js/Go để mở ứng dụng.

**English:** Unix preview: Codex/Kaggle account management, quota,
CLI/VS Code/JetBrains/desktop connections and Bash/Zsh integration. Choose an installer
below. No source build, Node.js or Go is needed to run the application.

### Có gì mới / What's new

- Kết nối Codex cục bộ trong ChatGPT/Codex desktop qua tài khoản chung, giữ
  cùng kho hội thoại và dự án; đổi thủ công chờ lượt đang chạy hoàn tất.
  Local desktop Codex can use the shared account while keeping conversation
  history; manual switches wait for active turns to finish.
- Giữ công cụ MCP của phiên desktop, xác minh tài khoản native và giữ nguyên
  tệp đăng nhập ban đầu. Có hướng dẫn kết nối/gỡ kết nối Việt/Anh trong app
  và hướng dẫn cài đặt. Desktop MCP tools and native account verification are
  covered; the original sign-in file is preserved.
- Kiểm thử offline dùng Codex native cho đổi quota trong cùng chat, tool chỉ
  chạy một lần và mở lại chat cũ. Bắt tay app Linux `26.1016.61520` đã kiểm tra
  bằng phiên thử riêng; luồng tài khoản thật và desktop macOS chưa được xác nhận.
  Offline native protocol and isolated installed Linux handshake checked;
  full real-account workflows and the macOS desktop app are not yet verified.
- Electron **44.9.3**, helper Go **1.27.3** và các dependency đã vá;
  `npm audit` không còn cảnh báo tại thời điểm kiểm tra.
  Patched Electron/native toolchain and dependency refresh; no npm audit
  advisories at validation time.
- Mở mã nguồn từ terminal VS Code Snap không còn nạp nhầm GTK/schema của Snap.
  Source launches from VS Code Snap restore the host's desktop environment.
- Clone repo rồi chạy `bash scripts/setup-linux.sh` và `bash scripts/start-linux.sh`;
  Node/Go được tải từ nguồn chính thức, kiểm tra SHA-256 và giữ trong thư mục người dùng.
  Source setup verifies official toolchain downloads without changing system Node/Go.
- Hướng dẫn Việt/Anh rõ hơn cho Ubuntu, Codex, Kaggle/Python venv, cập nhật và gỡ cài đặt.
  Clearer bilingual Ubuntu, first-use, isolated Kaggle Python, update and removal guides.
- Kiểm thử Wayland/Ptyxis, terminal, lưu thiết lập và khởi động lại trên Ubuntu 26.04 x64.
  Local Ubuntu 26.04 x64 checks cover Wayland/Ptyxis, terminals and saved-settings restarts.

| Hệ điều hành / Platform | Tải về / Download |
| --- | --- |
| Ubuntu/Debian · Intel/AMD x64 | [deb](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-amd64.deb) |
| Ubuntu/Debian · ARM64 | [deb](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-arm64.deb) |
| Linux khác / Other Linux · x64 (không dùng cho Ubuntu 24.04+ / not for Ubuntu 24.04+) | [AppImage](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-x86_64.AppImage) |
| Linux khác / Other Linux · ARM64 (không dùng cho Ubuntu 24.04+ / not for Ubuntu 24.04+) | [AppImage](https://github.com/padduwcs/PADSwitcher/releases/download/{{TAG}}/PADSwitcher-{{VERSION}}-Linux-arm64.AppImage) |
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
  đã mở khóa (ví dụ GNOME Keyring) và một ứng dụng terminal. On Ubuntu use the
  deb: Ubuntu 24.04+ blocks the unprivileged user namespaces that the AppImage's
  Chromium sandbox needs. AppImage also requires FUSE 2.
- **Mac:** mở DMG, kéo app vào **Applications**, eject DMG rồi mở app.
  This preview is **ad-hoc signed, without Apple Developer ID notarization**.
  Lần đầu có thể cần **System Settings → Privacy & Security → Open Anyway**;
  xem [hướng dẫn Apple / Apple's instructions](https://support.apple.com/en-us/102445).
  Lần đầu mở CLI, chọn **Allow** khi macOS hỏi quyền điều khiển Terminal.
  Allow Terminal control when asked the first time you open a CLI.
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

Desktop integration is experimental and applies to local Codex with personal
Free/Plus/Pro accounts. It does not transfer regular ChatGPT history or change
the desktop's regular ChatGPT sign-in. Cloud/remote and realtime/background
sessions are outside this connection. Fully quit desktop once, open it through
PADSwitcher, then reopen the existing Codex chat. Keep PADSwitcher running.

Ứng dụng dùng định danh, dữ liệu, Codex home và kênh phát hành Unix riêng.
Không chép kho tài khoản Windows sang Unix; đăng nhập/thêm tài khoản lại.
The stable Windows release and its **Latest** label remain unchanged.
Unix updates are manual: quit the app and replace it with a newer Unix build.

**Báo lỗi / Feedback:** [GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues).
Include **Unix**, version, OS, architecture and installer type. Remove credentials
and personal data from reports. Never attach account vaults, auth.json or API tokens.
