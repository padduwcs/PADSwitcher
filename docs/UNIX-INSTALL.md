# Cài đặt PADSwitcher Unix

[English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md)
· [Tải bản Unix 1.19.1-unix.3](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.3)
· [Báo lỗi](https://github.com/padduwcs/PADSwitcher/issues)

PADSwitcher Unix quản lý tài khoản Codex/Kaggle trên Linux và macOS.
Đây là **bản thử nghiệm công khai (Pre-release)**. Bản Windows ổn định tiếp tục
được phát hành riêng trong cùng repository và giữ nhãn Latest.
Bạn cài ứng dụng từ mục **Assets** của release; không cần tải Source code,
clone repo hoặc tự build. Ứng dụng đã chứa Electron và helper native;
không cần Node.js hoặc Go để mở app.

## 1. Chọn đúng file

| Máy của bạn | File tải về |
| --- | --- |
| Ubuntu/Debian 64-bit Intel hoặc AMD | `PADSwitcher-1.19.1-unix.3-Linux-amd64.deb` (ưu tiên) |
| Ubuntu/Debian ARM64 | `PADSwitcher-1.19.1-unix.3-Linux-arm64.deb` (ưu tiên) |
| Linux khác, Intel/AMD (không dùng cho Ubuntu 24.04+) | `PADSwitcher-1.19.1-unix.3-Linux-x86_64.AppImage` |
| Linux khác, ARM64 (không dùng cho Ubuntu 24.04+) | `PADSwitcher-1.19.1-unix.3-Linux-arm64.AppImage` |
| Mac Apple Silicon (M1/M2/M3/M4…) | `PADSwitcher-1.19.1-unix.3-macOS-arm64.dmg` |
| Mac Intel | `PADSwitcher-1.19.1-unix.3-macOS-x64.dmg` |

File `.zip` cho Mac là lựa chọn thay thế cho `.dmg`, cùng kiến trúc.
Trên Linux, `uname -m` cho biết `x86_64` (Intel/AMD) hoặc `aarch64` (ARM64).
Trên Mac, xem Apple menu → About This Mac: **Chip** là Apple Silicon,
**Processor Intel** là Intel.

Các môi trường đã được tự động kiểm tra là Ubuntu 24.04 x64/ARM64 và
macOS 15 Intel/Apple Silicon. Ubuntu 26.04 x64 cũng đã được kiểm tra trực tiếp. Các môi trường khác chưa được chứng nhận.
Linux cần phiên desktop có Secret Service, chẳng hạn GNOME Keyring đã mở khóa,
và một ứng dụng terminal để mở CLI/Kaggle: GNOME Terminal, Ptyxis, GNOME Console,
Konsole, Xfce Terminal, MATE Terminal, Terminator, kitty, Alacritty, WezTerm, foot
hoặc xterm. Muốn ưu tiên terminal khác, đặt biến `TERMINAL` bằng tên lệnh của nó
(terminal đó phải hỗ trợ `-e <chương trình>`).
WSL là môi trường thử từ Windows, xem [hướng dẫn WSL](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX.md).

## 2. Cài ứng dụng

### Ubuntu/Debian: dùng gói deb

Mở terminal tại thư mục chứa file tải về. Ví dụ cho Intel/AMD:

```bash
# Tải bộ cài và file .sha256 cùng tên vào cùng thư mục.
sha256sum -c PADSwitcher-1.19.1-unix.3-Linux-amd64.deb.sha256
# Chỉ cài khi checksum báo OK.
sudo apt install ./PADSwitcher-1.19.1-unix.3-Linux-amd64.deb
```

Với ARM64, thay bằng tên file `Linux-arm64.deb`.
Sau khi cài, tìm **PADSwitcher Unix** trong menu ứng dụng, hoặc chạy
`padswitcher-unix` từ terminal bằng tài khoản người dùng bình thường.

Trên Ubuntu/GNOME, kho khóa thường được mở khi đăng nhập desktop.
Nếu máy chưa cài GNOME Keyring, cài `gnome-keyring`, đăng xuất và đăng nhập lại.
Kaggle cần thêm `python3` phiên bản 3.11+ và `python3-venv`.
Ứng dụng sẽ hướng dẫn cài các SDK trong môi trường Python riêng khi thiết lập Kaggle.

### Chuẩn bị Codex và Kaggle

Trên Ubuntu Desktop, cài những thành phần còn thiếu:

```bash
sudo apt update
sudo apt install gnome-keyring python3 python3-venv
```

Nếu máy chưa có terminal, cài thêm `gnome-terminal` (Ptyxis có sẵn trên một số
bản Ubuntu). Không cần cài lại terminal đang dùng. Nếu vừa cài GNOME Keyring,
đăng xuất và đăng nhập lại trước khi thêm tài khoản.

**Chỉ dùng Codex?** Không cần cài Python hoặc SDK Kaggle. Cài Codex CLI/extension
native, mở app và thêm tài khoản theo mục 3 bên dưới.

**Dùng Kaggle?** Mở **Dịch vụ → Kaggle → Thiết lập → Sao chép lệnh cài**, dán
vào terminal, chờ cài xong rồi bấm **Lưu & kiểm tra**. Giữ lựa chọn tự tìm Python:
SDK được cài vào venv riêng, không sửa Python hệ thống. Nếu báo thiếu `ensurepip`
hoặc không tạo được venv, chạy lại lệnh cài `python3-venv` ở trên. Không dùng
`sudo pip` hay `--break-system-packages`.

### Linux: AppImage

```bash
chmod +x PADSwitcher-1.19.1-unix.3-Linux-x86_64.AppImage
./PADSwitcher-1.19.1-unix.3-Linux-x86_64.AppImage
```

Với ARM64, thay bằng tên file `Linux-arm64.AppImage`.
AppImage vẫn lưu dữ liệu trong thư mục người dùng, không phải bên cạnh file tải về.
Gói này dùng FUSE 2; Ubuntu 24.04 dùng package `libfuse2t64` nếu báo thiếu
`libfuse.so.2` ([tài liệu AppImage](https://docs.appimage.org/user-guide/troubleshooting/fuse.html)).

AppImage cần hệ thống cho phép unprivileged user namespaces để chạy Chromium
sandbox. **Ubuntu 24.04 trở lên chặn tính năng này theo mặc định nên AppImage
không mở được; hãy dùng gói `.deb`**, gói này có bước cấu hình sandbox/AppArmor
lúc cài đặt. Trên bản phân phối khác,
nhờ quản trị viên kiểm tra chính sách của desktop. Không chạy ứng dụng bằng
`sudo`, không thêm `--no-sandbox` và không tắt AppArmor toàn hệ thống.
Xem [giải thích của AppImage](https://docs.appimage.org/user-guide/troubleshooting/electron-sandboxing.html).

### macOS: dùng DMG

1. Mở file `.dmg`, kéo ứng dụng `.app` vào **Applications**.
2. Eject ổ đĩa DMG, mở ứng dụng vừa cài từ Applications.
3. Bản này ký ad-hoc, **chưa có Developer ID/notarization của Apple**.
   Nếu macOS chặn vì nhà phát triển chưa được xác minh, và bạn đã kiểm tra
   nguồn tải, vào **System Settings → Privacy & Security → Open Anyway** sau
   lần mở bị chặn. Làm theo [hướng dẫn chính thức của Apple](https://support.apple.com/en-us/102445).
   Máy do tổ chức quản lý có thể không cho phép bước này.
4. Khóa mã hóa tài khoản được lưu trong login Keychain. Nếu Keychain đang khóa,
   macOS sẽ hỏi mở khóa. Giống các ứng dụng desktop khác, lớp bảo vệ này ở mức
   tài khoản người dùng macOS: chương trình chạy dưới tài khoản của bạn có thể
   dùng cùng mục Keychain, vì vậy chỉ chạy phần mềm bạn tin tưởng.
5. Lần đầu mở CLI hoặc terminal Kaggle, macOS hỏi PADSwitcher Unix có được điều
   khiển **Terminal** không. Chọn **Allow** trong vòng hai phút. Nếu đã chọn
   Don't Allow, bật lại trong **System Settings → Privacy & Security →
   Automation** rồi thử lại.

Với `.zip`, giải nén rồi chuyển ứng dụng `.app` vào Applications trước khi mở.
Giữ nguyên tên và nội dung của bundle. Không cần tắt Gatekeeper toàn hệ thống.

## 3. Thiết lập lần đầu

1. Mở PADSwitcher Unix; có thể chọn tiếng Việt/English và giao diện sáng/tối.
2. **Codex:** cài Codex CLI native tương thích theo
   [hướng dẫn từ OpenAI](https://github.com/openai/codex#installing-and-running-codex-cli)
   cho Linux/macOS hoặc extension
   Codex trong VS Code. Giao thức CI dùng Codex `0.160.0`; bản `0.163.0` cũng đã qua kiểm tra cục bộ trên Linux.
   App tự tìm trong PATH, Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`),
   `~/.local/bin`, thư mục npm global (kể cả nvm) và extension
   VS Code/Cursor/Windsurf. Nếu app chưa tự tìm thấy, vào **Cài đặt Codex → Cấu hình Codex nâng cao →
   Codex CLI → Chọn**, chọn binary native `codex` có quyền thực thi.
   File wrapper JavaScript hoặc executable Windows `.exe` không phù hợp.
3. Chọn **Thêm tài khoản**, hoàn tất đăng nhập trong trình duyệt, sau đó chọn
   tài khoản muốn dùng. App không yêu cầu bạn nhập mật khẩu OpenAI vào app.
4. Vào **Kết nối**, làm theo hướng dẫn cho CLI hoặc IDE. Chỉ khi bạn chọn
   thiết lập VS Code/JetBrains/shell, app mới sửa cấu hình kết nối tương ứng.
   Các IDE phải chạy trong cùng môi trường Linux/macOS với app.
5. **Kaggle (tùy nhu cầu):** mở phần Kaggle, thiết lập Python 3.11+ và cài SDK
   theo nút hướng dẫn trong app, sau đó thêm API token Kaggle của bạn.
   Môi trường Python do app quản lý nằm riêng trong dữ liệu Unix.
   Bật `padkaggle` chỉ thêm một dòng vào tệp khởi động mà shell của bạn thực sự
   đọc (`~/.bashrc`, `~/.zshrc`, và `~/.bash_profile` trên Mac nếu đã có).
   Profile do công cụ dotfiles quản lý dạng liên kết sẽ không bị thay thế; hộp
   thoại hiển thị dòng để bạn tự thêm.
6. **Thư mục mở CLI:** phiên CLI mở ở thư mục người dùng (home). Đổi trong
   **Cài đặt Codex → Không gian làm việc** sang dự án bạn muốn Codex làm việc.

Giữ PADSwitcher mở khi dùng kết nối Codex. Nút đóng cửa sổ có thể thu app xuống
khay; dùng **Quit/Thoát PADSwitcher** trong menu khay để thoát hẳn.
Nếu desktop không hiện khay hệ thống, có thể mở lại cửa sổ bằng cách chạy app lần nữa.

## 4. Kiểm tra file tải về

Tải file `.sha256` có cùng tên với bộ cài và đặt cạnh bộ cài. Ví dụ:

```bash
# Linux
sha256sum -c PADSwitcher-1.19.1-unix.3-Linux-amd64.deb.sha256

# macOS
shasum -a 256 -c PADSwitcher-1.19.1-unix.3-macOS-arm64.dmg.sha256
```

Chỉ tiếp tục khi kết quả là `OK`. Release cũng có `SHA256SUMS.txt` tổng hợp.
Checksum giúp phát hiện file tải thiếu hoặc hỏng; không thay thế notarization.

## 5. Cập nhật, dữ liệu và gỡ cài đặt

Chưa có tự cập nhật trong app hoặc kho APT. Để cập nhật, thoát app, tải bản
**Unix** mới nhất từ Releases rồi cài đè `.deb`/`.app` hoặc thay file AppImage.
Giữ nguyên tài khoản hệ điều hành và Keychain/Secret Service; dữ liệu nằm ở:

| Hệ điều hành | Thư mục dữ liệu |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/PADSwitcher-Unix/data`, mặc định `~/.config/PADSwitcher-Unix/data` |
| macOS | `~/Library/Application Support/PADSwitcher-Unix/data` |

Kho tài khoản mã hóa gắn với khóa trong keyring của người dùng. Chép riêng thư
mục dữ liệu sang máy khác không phải cách chuyển tài khoản được hỗ trợ.
Đăng nhập/thêm lại tài khoản trên máy mới. Không chép kho DPAPI từ Windows.
Thư mục Codex mặc định cũng nằm riêng bên trong dữ liệu Unix.

Trước khi gỡ, dùng nút gỡ kết nối trong app cho những IDE/shell bạn đã thiết lập,
đóng phiên Codex đang dùng qua PADSwitcher rồi thoát app.
Gỡ `.deb` bằng `sudo apt remove padswitcher-unix`; với Mac chuyển app khỏi
Applications; với AppImage xóa file chương trình. Thao tác gỡ không tự xóa
dữ liệu tài khoản hoặc khóa trong keyring.

## Khi gặp lỗi

| Triệu chứng | Cách xử lý |
| --- | --- |
| Không mở được kho khóa | Mở khóa login Keychain/GNOME Keyring; chạy app trong phiên desktop của chính bạn. KDE cần có Secret Service tương thích. |
| Không tìm thấy Codex | Cài bản native đúng kiến trúc. Nếu Codex ở thư mục khác thường, chọn binary trong Cài đặt Codex (chạy `command -v codex` trong terminal để xem vị trí). |
| Không mở được terminal CLI/Kaggle | Cài một terminal trong danh sách ở mục 1 hoặc đặt biến `TERMINAL`, rồi mở lại PADSwitcher. Trên Mac, cho phép điều khiển Terminal trong Privacy & Security → Automation. |
| VS Code/JetBrains chưa kết nối | Thực hiện thiết lập trong trang Kết nối; lưu công việc và reload IDE theo hướng dẫn. |
| Python/SDK Kaggle chưa sẵn sàng | Cài Python 3.11+ và venv; chạy bước cài SDK trong app rồi kiểm tra lại. |
| AppImage báo lỗi sandbox/FUSE | Trên Ubuntu dùng `.deb`; distro khác xem hướng dẫn AppImage ở trên. |
| Mac chặn lần mở đầu | Kiểm tra đúng nguồn tải, làm theo hướng dẫn Open Anyway ở trên. |

[Báo lỗi tại GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues):
ghi rõ **Unix**, phiên bản app, hệ điều hành, kiến trúc, loại bộ cài và các bước
tái hiện. Chỉ gửi lỗi/ảnh đã che thông tin riêng; không đính kèm auth.json,
API token, thư mục dữ liệu hoặc kho keyring.

Kiểm thử tự động bao gồm helper native, kho khóa hệ thống, shell, giao thức
Codex, giao diện Electron và bộ cài. Đăng nhập trình duyệt bằng tài khoản thật,
IDE thực tế và các biến thể desktop vẫn cần phản hồi kiểm thử thực tế.
Xem [phạm vi kiểm chứng](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-VALIDATION.md).
