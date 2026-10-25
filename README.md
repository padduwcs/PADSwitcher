<p align="center"><img src="src/assets/padswitcher-emblem.png" width="220" alt="PADSwitcher"></p>

# PADSwitcher Unix

**Profile Account Directory Switcher — bản Linux và macOS độc lập.**
Quản lý tài khoản Codex/Kaggle, theo dõi quota và kết nối công cụ trên máy.

Nhánh này là `feature/cross-platform`. Bản Windows ổn định tiếp tục ở
[`main`](https://github.com/padduwcs/PADSwitcher/tree/main), với mã nguồn, dữ liệu
và quy trình phát hành riêng. Worktree Unix không thay đổi thư mục Windows đang dùng.

[Tải Linux/macOS](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.3) ·
[Cài đặt và dùng lần đầu](docs/UNIX-INSTALL.md) · [English](README.en.md) ·
[Hướng dẫn Unix/WSL](docs/UNIX.md) ·
[Phạm vi kiểm chứng](docs/UNIX-VALIDATION.md) ·
[Build trên GitHub Actions](https://github.com/padduwcs/PADSwitcher/actions/workflows/unix-ci.yml?query=branch%3Afeature%2Fcross-platform)

## Tải và cài đặt

Mở [Unix Release](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.3),
chọn `.deb` cho Ubuntu/Debian, `.AppImage` cho Linux tương thích hoặc `.dmg` cho Mac.
Có đủ Linux x64/ARM64 và Mac Intel/Apple Silicon. Bảng chọn file, hướng dẫn
Keychain/GNOME Keyring, cập nhật và xử lý lỗi nằm trong
[hướng dẫn cài đặt tiếng Việt](docs/UNIX-INSTALL.md) và [English](docs/UNIX-INSTALL.en.md).
Đây là **Pre-release** công khai; xem phạm vi kiểm chứng trước khi sử dụng.

Linux cần desktop có Secret Service/GNOME Keyring đã mở khóa; macOS dùng Keychain.
Codex CLI native tương thích được cài riêng. Kaggle cần Python 3.11+ và các SDK
theo thiết lập trong app. Các gói đã build không cần Node.js hoặc Go.

Release có bộ cài, hướng dẫn Việt/Anh và SHA-256. Các build phát triển vẫn có
trong Actions. Bản Unix dùng tag `unix-v…`, được phát hành dưới
dạng **Pre-release** và không thay thế bản Windows ở đường dẫn tải Latest.
Bản Mac preview ký ad-hoc, chưa có Developer ID/notarization.

## Clone và chạy trên Linux

Cách này dành cho người muốn chạy mã nguồn; người chỉ muốn dùng app hãy tải `.deb` ở trên.
Dùng Ubuntu Desktop 24.04/26.04 với một terminal và kho khóa đã mở:

```bash
sudo apt update
sudo apt install git python3 python3-venv gnome-keyring
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
bash scripts/setup-linux.sh
# Ubuntu 24.04/26.04: sandbox cho bản chạy từ mã nguồn.
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
bash scripts/start-linux.sh
```

Hai lệnh `sudo` chỉ đặt quyền cho helper sandbox Electron đã tải về. Chạy lại
sau mỗi lần `npm ci` thay `node_modules`. Không dùng `--no-sandbox`. Gói `.deb`
cấu hình sandbox lúc cài nên người tải bộ cài không cần làm bước này.

`setup-linux.sh` tải Node.js 24.18.1 và Go 1.27.3 từ nguồn chính thức, kiểm tra
SHA-256, cài dependency và build helper. Công cụ nằm trong thư mục người dùng;
script không sửa Node/Go hệ thống hay profile shell. Chạy lại được nếu lần tải
trước bị gián đoạn. `start-linux.sh` dùng đúng môi trường đã chuẩn bị.
Có sẵn Node.js 24+ và Go 1.27.3+? Dùng `npm ci` rồi `npm start` như thường.

Trên macOS, cài Node.js 24 và Go 1.27.3+, clone đúng nhánh rồi chạy
`npm ci` và `npm start`. Với Windows/WSL, xem [hướng dẫn Unix/WSL](docs/UNIX.md).

Tài liệu [UNIX.md](docs/UNIX.md) mô tả đầy đủ dependency, thư mục dữ liệu,
Bash/Zsh, giới hạn WSL, kiểm thử và phát hành. Không sao chép kho DPAPI Windows
sang bản Unix; thêm/đăng nhập tài khoản lại trong môi trường Unix.

Phát hành theo [MIT](LICENSE). Dự án độc lập với OpenAI, Kaggle và JetBrains.
