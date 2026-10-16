<p align="center">
  <img src="src/assets/padswitcher-emblem.png" alt="Biểu trưng PADSwitcher" width="220">
</p>

<h1 align="center">PADSwitcher</h1>

<p align="center">
  <strong>Profile Account Directory Switcher</strong><br>
  <strong>Một nơi để quản lý tài khoản Codex và Kaggle.</strong><br>
  Theo dõi quota, đổi tài khoản an toàn và tiếp tục làm việc trong IDE hoặc terminal.<br>
  Bản ổn định cho Windows · bản thử nghiệm cho Linux và macOS.
</p>

<p align="center">
  <a href="https://github.com/padduwcs/PADSwitcher/releases/latest"><img alt="Phiên bản mới nhất" src="https://img.shields.io/github/v/release/padduwcs/PADSwitcher?style=for-the-badge&color=147de5"></a>
  <a href="https://github.com/padduwcs/PADSwitcher/actions/workflows/ci.yml"><img alt="Trạng thái kiểm thử" src="https://img.shields.io/github/actions/workflow/status/padduwcs/PADSwitcher/ci.yml?branch=main&style=for-the-badge&label=checks"></a>
  <a href="LICENSE"><img alt="Giấy phép MIT" src="https://img.shields.io/github/license/padduwcs/PADSwitcher?style=for-the-badge&color=338f85"></a>
  <img alt="Windows 10 và 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge&logo=windows11">
  <a href="#linux-và-macos-bản-thử-nghiệm"><img alt="Linux và macOS bản thử nghiệm" src="https://img.shields.io/badge/Linux%20%7C%20macOS-th%E1%BB%AD%20nghi%E1%BB%87m-E95420?style=for-the-badge&logo=linux&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/padduwcs/PADSwitcher/releases/latest"><strong>⬇️ Tải bản Windows</strong></a>
  &nbsp;·&nbsp; <a href="#linux-và-macos-bản-thử-nghiệm"><strong>🐧 Linux / 🍎 macOS (thử nghiệm)</strong></a>
  &nbsp;·&nbsp; <a href="README.en.md">English</a>
  &nbsp;·&nbsp; <a href="https://github.com/padduwcs/PADSwitcher/issues/new/choose">Báo lỗi</a>
</p>

> [!IMPORTANT]
> Bản Windows là ứng dụng portable, hiện **chưa ký số**. Bản Linux/macOS là **Pre-release**; bản Mac ký ad-hoc, chưa notarize. Chỉ tải từ trang Releases chính thức và đối chiếu file `.sha256` đi kèm.

<p align="center">
  <img src="docs/images/light.png" alt="PADSwitcher quản lý tài khoản Codex ở giao diện sáng" width="49%">
  <img src="docs/images/dark.png" alt="PADSwitcher quản lý tài khoản Codex ở giao diện tối" width="49%">
</p>

## Điểm nổi bật

- 🔄 **Codex không gián đoạn:** đổi tài khoản thủ công hoặc tự thử tài khoản dự phòng khi gặp lỗi quota trước khi câu trả lời bắt đầu.
- 🧩 **Dùng ở nơi bạn làm việc:** hỗ trợ Codex trong VS Code, CLI trong terminal và JetBrains AI Assistant.
- 📊 **Quota rõ ràng:** xem phần còn lại, thời gian đặt lại, lịch sử đổi và hoạt động model ngay trong ứng dụng.
- 🚀 **Kaggle song song:** mỗi terminal dùng một tài khoản riêng; theo dõi GPU/TPU, notebook đã ghim và các lượt chạy gần đây.
- 🔐 **Dữ liệu nằm trên máy:** phiên Codex và token Kaggle được mã hóa bằng Windows DPAPI, hoặc khóa trong Keychain/Secret Service trên macOS/Linux.
- 🌗 **Giao diện chỉn chu:** sáng/tối, tiếng Việt/English, bố cục responsive và có thể điều chỉnh.

<p align="center">
  <img src="docs/images/services.png" alt="Màn hình chọn dịch vụ Codex hoặc Kaggle" width="49%">
  <img src="docs/images/kaggle.png" alt="Màn hình quản lý nhiều tài khoản Kaggle" width="49%">
</p>

## Bắt đầu trên Windows

### Yêu cầu

- Windows 10/11 x64 và .NET Framework 4.8.
- Với Codex: Codex CLI hoặc extension Codex cho VS Code bản Windows. Đã kiểm chứng với Codex `0.160.0`.
- Với Kaggle: Python 3.11+ và công cụ Kaggle theo hướng dẫn trong ứng dụng.
- Bản portable không cần cài Node.js.

### Cài đặt

1. Tải `PADSwitcher-<version>-Windows.exe` và file `.sha256` từ [Releases](https://github.com/padduwcs/PADSwitcher/releases/latest).
2. Kiểm tra file tải về:

   ```powershell
   Get-FileHash .\PADSwitcher-*-Windows.exe -Algorithm SHA256
   ```

3. Mở ứng dụng → **Dịch vụ** → chọn **Codex** hoặc **Kaggle**.
4. Làm theo hướng dẫn 3 bước ngay trong ứng dụng để thêm tài khoản và kết nối công cụ.

PADSwitcher là portable: đặt file `.exe` ở thư mục bạn muốn và chạy trực tiếp. Khi nâng cấp, thoát bản cũ từ khay hệ thống rồi mở bản mới; dữ liệu trong `%APPDATA%\PADSwitcher\data` được giữ nguyên.

## Linux và macOS (bản thử nghiệm)

**PADSwitcher Unix** có cùng chức năng Codex/Kaggle, chạy độc lập với bản Windows: tài khoản, dữ liệu và kênh phát hành riêng. Đây là bản **Pre-release**, đã kiểm thử tự động trên Ubuntu 24.04 và macOS 15 (Intel và Apple Silicon).

👉 [**Tải bản Linux/macOS**](https://github.com/padduwcs/PADSwitcher/releases?q=unix&expanded=true): mở release mới nhất có tên **PADSwitcher Unix**, tải file trong mục **Assets**. Không cần tải Source code, Node.js hay Go.

### 1. Chọn đúng file

| Máy của bạn | File cần tải |
| --- | --- |
| Ubuntu/Debian, Intel/AMD 64-bit | `PADSwitcher-<version>-Linux-amd64.deb` |
| Ubuntu/Debian, ARM64 | `PADSwitcher-<version>-Linux-arm64.deb` |
| Mac Apple Silicon (M1/M2/M3/M4…) | `PADSwitcher-<version>-macOS-arm64.dmg` |
| Mac Intel | `PADSwitcher-<version>-macOS-x64.dmg` |
| Linux khác (không dùng cho Ubuntu 24.04+) | `PADSwitcher-<version>-Linux-x86_64.AppImage` hoặc `Linux-arm64.AppImage` |

Không chắc máy dùng chip gì? Trên Linux chạy `uname -m` (`x86_64` là Intel/AMD, `aarch64` là ARM64). Trên Mac mở menu Apple → **About This Mac**: dòng **Chip** là Apple Silicon, **Processor Intel** là Intel.

### 2. Cài đặt

**Ubuntu/Debian:** mở terminal ở thư mục chứa file tải về rồi chạy:

```bash
sha256sum -c PADSwitcher-<version>-Linux-amd64.deb.sha256   # phải báo OK
sudo apt install ./PADSwitcher-<version>-Linux-amd64.deb
```

Sau đó mở **PADSwitcher Unix** từ menu ứng dụng (hoặc gõ `padswitcher-unix`).

**macOS:**

1. Mở file `.dmg`, kéo **PADSwitcher Unix** vào **Applications**, rồi eject DMG.
2. Mở app từ Applications. Nếu macOS chặn vì chưa xác minh nhà phát triển, vào **System Settings → Privacy & Security → Open Anyway** ([hướng dẫn của Apple](https://support.apple.com/en-us/102445)).
3. Lần đầu mở CLI hoặc terminal Kaggle, chọn **Allow** khi macOS hỏi quyền điều khiển **Terminal**.

**Linux khác (AppImage):** `chmod +x PADSwitcher-<version>-Linux-x86_64.AppImage` rồi chạy file. AppImage cần FUSE 2 và hệ thống cho phép Chromium sandbox; trên Ubuntu 24.04+ hãy dùng `.deb`.

### 3. Yêu cầu trên máy

- **Linux:** phiên desktop có kho khóa Secret Service đã mở khóa (ví dụ GNOME Keyring, thường tự mở khi đăng nhập) và một ứng dụng terminal (GNOME Terminal, Ptyxis, Konsole, Xfce Terminal, kitty, Alacritty, WezTerm, xterm…).
- **macOS:** dùng login Keychain sẵn có và ứng dụng Terminal.
- **Codex:** Codex CLI native cho Linux/macOS ([hướng dẫn của OpenAI](https://github.com/openai/codex#installing-and-running-codex-cli)) hoặc extension Codex trong VS Code. App tự tìm trong PATH, Homebrew, `~/.local/bin`, npm/nvm và extension VS Code/Cursor/Windsurf.
- **Kaggle (tùy chọn):** Python 3.11+ (trên Ubuntu thêm `python3-venv`); app hướng dẫn cài SDK vào môi trường Python riêng.

### 4. Dùng lần đầu

1. Mở app → **Dịch vụ** → **Codex** → **Thêm tài khoản** và đăng nhập trong trình duyệt.
2. Vào **Cài đặt Codex → Không gian làm việc**, chọn thư mục dự án để mở CLI.
3. Vào **Kết nối** để thiết lập VS Code, CLI (Bash/Zsh) hoặc JetBrains.
4. Với Kaggle: **Dịch vụ → Kaggle → Thiết lập**, cài công cụ, thêm API token, rồi bật lệnh `padkaggle` nếu muốn chọn tài khoản ngay trong terminal.

Bản Unix không đọc kho tài khoản của bản Windows; hãy thêm lại tài khoản. Chưa có tự cập nhật: khi có bản mới, thoát app rồi cài đè file `.deb`/`.app` mới.

📘 Hướng dẫn đầy đủ (xử lý lỗi, dữ liệu, gỡ cài đặt): [**Tiếng Việt**](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.md) · [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md)

## Kết nối Codex

- **VS Code:** **Kết nối → Thiết lập VS Code**, sau đó chạy `Developer: Reload Window` một lần.
- **Terminal / terminal VS Code:** sao chép lệnh tại trang **Kết nối** rồi dán vào PowerShell (Windows) hoặc Bash/Zsh (Linux/macOS). Lệnh `codex` thông thường vẫn dùng phiên riêng.
- **JetBrains/Android Studio:** cài AI Assistant và Codex agent, sau đó chọn **Codex · PADSwitcher** trong AI Chat.

Mặc định ba loại kết nối dùng chung một tài khoản. Bạn cũng có thể gán tài khoản và chính sách tự đổi riêng cho từng loại kết nối. Xem [hướng dẫn Codex đầy đủ](docs/CODEX.md).

## Dùng Kaggle

1. Mở **Dịch vụ → Kaggle → Thiết lập**, cài các công cụ được đề xuất rồi **Lưu & kiểm tra**.
2. Tạo API token tại [Kaggle Settings](https://www.kaggle.com/settings), sau đó **Thêm tài khoản**.
3. Chọn tài khoản → **Sao chép lệnh** hoặc **Mở terminal mới**.
4. Gửi notebook bằng Kaggle CLI và theo dõi quota/lượt chạy trong PADSwitcher.

Mỗi terminal (PowerShell, Bash hoặc Zsh) giữ lựa chọn riêng, nên nhiều terminal có thể dùng nhiều tài khoản song song trong giới hạn của Kaggle. Xem [hướng dẫn Kaggle đầy đủ](docs/KAGGLE.md).

## An toàn và giới hạn

- PADSwitcher không vận hành proxy trên Internet; gateway chỉ lắng nghe loopback và dùng capability mới ở mỗi lần chạy.
- Ứng dụng không ghi prompt hoặc credential vào log riêng. Không chia sẻ thư mục dữ liệu, file kết nối hay ảnh chụp có thông tin cá nhân.
- Tự đổi chỉ hỗ trợ tài khoản Codex cá nhân Free/Plus/Pro và lỗi quota đã xác định trước khi có nội dung trả về.
- Chưa hỗ trợ tài khoản tổ chức, SSH/container, Codex cloud, tự khởi động cùng hệ điều hành hoặc tự cập nhật. Bản Windows không chạy trong WSL; muốn dùng trong Linux/WSL, hãy dùng bản Unix.
- Bản Linux/macOS là Pre-release: bản Mac chưa notarize, các bản Linux ngoài Ubuntu 24.04 chưa được chứng nhận.
- Ứng dụng không bỏ qua sandbox hay bước duyệt công cụ của Codex.

Đọc thêm: [Bảo mật](SECURITY.md) · [Ranh giới định tuyến](ROUTING.md) · [Phạm vi kiểm chứng](VALIDATION.md)

## Phát triển

```powershell
git clone https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

Cần Node.js 24 LTS và Git. Các lệnh chính:

```powershell
npm run check
npm test
npm run smoke:ui
npm run dist
```

Helper native được build tự động. Xem [hướng dẫn phát triển](docs/DEVELOPMENT.md), [quy trình đóng góp](CONTRIBUTING.md) và [lịch sử phiên bản](CHANGELOG.md). Mã nguồn bản Linux/macOS nằm ở nhánh [`feature/cross-platform`](https://github.com/padduwcs/PADSwitcher/tree/feature/cross-platform) ([hướng dẫn phát triển Unix/WSL](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX.md)).

## Cộng đồng

Nếu gặp lỗi, hãy [mở issue](https://github.com/padduwcs/PADSwitcher/issues/new/choose) với phiên bản ứng dụng, hệ điều hành và các bước tái hiện; nhớ che thông tin tài khoản. Báo cáo lỗ hổng theo [chính sách bảo mật](SECURITY.md).

---

<p align="center">
  Phát hành theo <a href="LICENSE">giấy phép MIT</a> ·
  <a href="THIRD_PARTY_NOTICES.md">Thành phần bên thứ ba</a><br>
  Dự án độc lập, không phải sản phẩm chính thức của OpenAI, Kaggle hoặc JetBrains.
</p>
