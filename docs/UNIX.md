# PADSwitcher Unix: Linux và macOS

Nhánh `feature/cross-platform` là bản Unix độc lập trong cùng repository.
`main` tiếp tục là bản Windows ổn định. Không merge nhánh Unix vào `main`
và không dùng tag `v*` cho bản Unix.

Người dùng tải bộ cài từ [Unix Release](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.5)
và làm theo [hướng dẫn cài đặt](UNIX-INSTALL.md) ([English](UNIX-INSTALL.en.md)).
Các phần bên dưới dành cho phát triển, kiểm thử và vận hành release.

## Ranh giới với bản Windows

| Thành phần | Windows ổn định | Bản Unix |
| --- | --- | --- |
| Nhánh | `main` | `feature/cross-platform` |
| Mã nguồn trong một thư mục | `git switch main` | `git switch feature/cross-platform` |
| Định danh | `personal.pad.padswitcher` | `personal.pad.padswitcher.unix` |
| Dữ liệu | `%APPDATA%\PADSwitcher\data` | Linux: `$XDG_CONFIG_HOME/PADSwitcher-Unix/data`, mặc định `~/.config/PADSwitcher-Unix/data`; macOS: `~/Library/Application Support/PADSwitcher-Unix/data` |
| Phiên Codex mặc định | Theo bản Windows | `codex-home` bên trong dữ liệu Unix |
| Đầu ra build | `dist` | `dist-unix` |
| Tag phát hành | `v<version>` | `unix-v<version>` |

Bản Unix bỏ qua `CODEX_HOME` kế thừa khi chọn thư mục Codex mặc định.
Nó chỉ sửa cấu hình VS Code, JetBrains hoặc shell khi người dùng chọn thao tác
thiết lập tương ứng. File `.dpapi` trên Unix chứa định dạng AES-256-GCM có header
`PADVAULT1`, không tương thích kho DPAPI của Windows. Hãy đăng nhập/thêm tài khoản
lại trong bản Unix; không chép kho token Windows sang.

`npm start` và đóng gói bản Unix bị chặn trên Windows native. Các unit test và
giao diện preview vẫn có thể chạy từ Windows trong worktree Unix.

## Thử từ Windows qua WSL

Chạy trong **worktree Unix**, dùng Ubuntu WSL2 có WSLg. Công cụ phát triển cần
Node.js 24 và Go 1.27.3+ bản Linux; Node/Go của Windows không thay thế được.
Trên máy hiện tại, toolchain riêng được chuẩn bị trong
`~/.local/share/padswitcher-unix-dev/toolchains` của Ubuntu.

```powershell
cd D:\Current_Projects\PADSwitcher-Unix
.\scripts\wsl-dev.ps1 -Task verify
.\scripts\wsl-dev.ps1 -Task start
```

Script tạo bản sao nguồn phục vụ chạy thử trong filesystem Linux tại
`~/.local/share/padswitcher-unix-dev/workspaces/<source-id>`. Đây là thư mục build,
không phải repository mới. Nó không sửa nguồn, nhánh hoặc `node_modules` ở worktree
Windows. Mỗi lần gọi sẽ đồng bộ lại nguồn; `npm ci` chỉ chạy khi lockfile đổi.
Không chỉnh sửa trực tiếp bản sao này.

`verify` dùng một D-Bus session và kho khóa tạm riêng, chỉ dùng dữ liệu giả.
Nó chạy unit test, helper test, mã hóa/guardian/shell/terminal, Electron, build và
kiểm tra executable đã đóng gói. Không đăng nhập, gửi inference hay dùng reset thật.
Các gói được lưu trong `dist-unix` của bản sao Linux và sao chép về `dist-unix`
trong worktree Unix để có thể lấy file ngay từ Windows.

Các dependency kiểm thử trên Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y gnome-keyring dbus-x11 xvfb xterm zsh libfuse2t64 python3-venv
```

`-Task start` dùng kho khóa và dữ liệu Unix bình thường. Để thêm tài khoản, cần
Secret Service đã mở khóa. Với WSL không có phiên đăng nhập desktop, có thể khởi
tạo/mở khóa GNOME Keyring trong một D-Bus session bằng `gnome-keyring-daemon --unlock`
và chạy ứng dụng trong cùng session. Mật khẩu kho khóa nhập cục bộ trên máy.
Không dùng kho khóa tạm của bài kiểm thử để lưu tài khoản thật.

WSLg hữu ích cho phát triển nhưng không thay thế kiểm thử Ubuntu Desktop đầy đủ
về khay hệ thống, kho khóa, terminal, Wayland/X11 và cài đặt gói.
VS Code Windows/JetBrains Windows không tự được kết nối với ứng dụng trong WSL;
các kết nối tự động của bản này nhắm tới công cụ chạy trong Linux/macOS.

## Phát triển trên Linux/macOS

```bash
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
bash scripts/setup-linux.sh
# Ubuntu 24.04+: đặt quyền sandbox sau mỗi lần npm ci.
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
bash scripts/start-linux.sh
```

Hai script trên dành cho Linux. `setup-linux.sh` tải Node 24.18.1 và Go 1.27.3,
kiểm tra checksum chính thức, cài npm dependency và build helper. Không sửa shell
profile hoặc cài công cụ hệ thống; thư mục mặc định là
`~/.local/share/padswitcher-unix-dev`. Nếu đặt `XDG_DATA_HOME`, dùng thư mục đó.
Dùng `source ~/.local/share/padswitcher-unix-dev/env.sh` khi muốn gọi npm/go
trực tiếp. Khi Node.js 24+ và Go 1.27.3+ đã có trong PATH, hoặc trên macOS,
có thể dùng `npm ci` và `npm start` trực tiếp.

Electron được đóng gói kèm ứng dụng; bản tải về không cần Node.js hoặc Go.
Codex CLI native tương thích là dependency ngoài; protocol hiện được kiểm tra với
`0.160.0` trong CI và `0.163.0` trên Linux cục bộ. Có thể dùng binary native của extension VS Code hoặc npm.
Trên Linux cần Secret Service, ví dụ GNOME Keyring đã mở khóa; trên macOS dùng
Keychain của người dùng. Không có phương án hạ cấp sang khóa plaintext.

Kaggle cần Python 3.11+, `kaggle>=2.2.4,<3` và `kagglesdk>=0.1.37,<1`.
Nếu để tự tìm Python, lệnh cài đặt trong app tạo venv riêng dưới dữ liệu Kaggle,
tránh sửa Python hệ thống. Nếu chọn Python riêng, hãy chọn interpreter trong venv
của bạn. `padkaggle` hỗ trợ Bash 3.2+ và Zsh; `use`, `off`, `list`, `status` hoạt
động trong terminal hiện tại, mỗi terminal giữ lựa chọn riêng.

## Kiểm thử và đóng gói

```bash
npm run check
npm test
npm run test:helper
npm run smoke:protocol
npm run smoke:say-hi
npm run smoke:desktop
```

Linux dùng kho khóa kiểm thử độc lập:

```bash
dbus-run-session -- sh scripts/linux-test-session.sh sh -c 'npm run smoke && npm run smoke:ui'
npm run dist
dbus-run-session -- sh scripts/linux-test-session.sh npm run smoke:packaged
node scripts/checksums.cjs
```

Trong CI không có màn hình, thêm `xvfb-run -a` trước `dbus-run-session`.
macOS dùng `npm run smoke`, `npm run smoke:ui`, `npm run dist`,
`npm run smoke:packaged` trong phiên desktop của runner.

`npm run build` chỉ tạo thư mục unpacked. `npm run dist` tạo `.AppImage` + `.deb`
trên Linux hoặc `.dmg` + `.zip` trên macOS, theo kiến trúc của máy build.
Gói Mac preview được ký ad-hoc; chưa có Developer ID/notarization. Có thể đặt
`PADSWITCHER_MAC_IDENTITY` khi đã chuẩn bị signing identity; kiểm chứng ký số và
notarization cho phát hành rộng rãi là công việc riêng.

`PADSWITCHER_APPDATA_DIR` cho phép chọn thư mục app-data khác khi chạy kiểm thử
executable đóng gói; phải là đường dẫn tuyệt đối. Namespace `PADSwitcher-Unix`
vẫn luôn được thêm vào bên trong.

### Codex desktop giữ lịch sử

Xem [các bước sử dụng](UNIX-INSTALL.md#tiếp-tục-hội-thoại-codex-trong-chatgptcodex-desktop).
Desktop dùng backend native đi kèm ứng dụng đã cài, với `CODEX_HOME` mặc định
`~/.codex` để đọc lại lịch sử. Backend này chia sẻ bộ định tuyến tài khoản chung
với PAD, nhưng không dùng cơ sở dữ liệu riêng của gateway CLI/IDE. Đăng nhập
được cấp trong bộ nhớ và xác minh bằng `getAuthStatus`; không ghi đè auth.json
hay sửa binary/launcher của desktop. Công cụ MCP được gắn với pipe của phiên
desktop hiện tại theo từng thread, không dùng pipe cũ kế thừa từ PAD.

`desktop-integration.json` chỉ lưu bật/tắt và đường dẫn lịch sử. PAD truyền
`CODEX_CLI_PATH` và chế độ stdio khi người dùng mở desktop từ nút kết nối.
Đây là cơ chế override nội bộ của app desktop, cần kiểm tra lại sau các bản
cập nhật upstream. Linux discovery hỗ trợ gói `/usr/lib/chatgpt` và một số
đường dẫn `/opt`; macOS kiểm tra ChatGPT/Codex trong Applications. Không tự
đóng ứng dụng đang chạy hoặc cố chiếm phiên daemon của desktop.

`npm run smoke:desktop` dùng tài khoản JWT giả, server model loopback và lịch
sử tạm: đổi do quota, retry giữ nguyên request, thao tác công cụ đúng một lần,
đổi thủ công, restart/resume và MCP. Không cần tài khoản OpenAI thật.
Trên Linux có desktop đã cài, `PADSWITCHER_DESKTOP_SMOKE_APP=1 npm run smoke:desktop`
kiểm tra thêm app thật chạy headless với userData tạm và proxy chặn mạng.
Tùy chọn headless này không phải kiểm thử giao diện app macOS.

## GitHub và phát hành

`unix-ci.yml` chạy trên push/PR vào `feature/cross-platform`: unit test lõi dùng chung trên Windows và
build/test Linux x64, Linux arm64, macOS Intel, macOS Apple Silicon.
Artifact tải được trong Actions sau khi job tương ứng thành công.

Chỉ phát hành khi các kiểm tra đã qua và chủ động tạo tag:

Tag phải trỏ vào commit đã kiểm tra và không chứa `[skip ci]` trong commit message.
GitHub có thể bỏ qua cả workflow push tag khi commit mang nhãn này. Với commit
tài liệu có `[skip ci]` ở đầu nhánh, hãy chỉ định SHA của commit đã qua CI khi tạo tag.

```bash
git tag unix-v1.19.1-unix.5
git push origin unix-v1.19.1-unix.5
```

`unix-release.yml` kiểm tra tag khớp package version và commit thuộc nhánh Unix,
build các kiến trúc rồi tạo **Pre-release**, đặt `latest=false`.
Quy trình chạy cả unit test lõi dùng chung trên Windows, cài thử deb, mở app sao chép từ DMG và kiểm chữ ký bản ZIP.
AppImage giữ Chromium sandbox, không tự thêm `--no-sandbox`.
Trước khi công khai, script xác nhận đủ tám bộ cài và checksum, thêm hướng dẫn
Việt/Anh cùng SHA256SUMS, tải lên draft, đối chiếu tên/kích thước/digest SHA-256
do GitHub trả về cho toàn bộ 19 asset rồi mới bỏ trạng thái draft.
Rerun có thể tiếp tục draft; không ghi đè release đã công khai.
Nó không tải artifact lên release Windows. Quy trình Windows trên `main` giữ nguyên.

Giới hạn kiểm chứng và kết quả thực tế được ghi tại [UNIX-VALIDATION.md](UNIX-VALIDATION.md).
