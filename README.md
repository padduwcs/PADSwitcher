# PADSwitcher

<img src="src/assets/padswitcher-emblem.png" alt="PADSwitcher" width="96">

Quản lý các tài khoản Codex cá nhân trên Windows: xem quota, đổi tài khoản và tiếp tục làm việc trong VS Code hoặc CLI. Giao diện sáng/tối, tiếng Việt/Anh.

**[Tải bản Windows](https://github.com/padduwcs/PADSwitcher/releases/latest)** · [English](README.en.md) · [Báo lỗi](https://github.com/padduwcs/PADSwitcher/issues)

<img src="docs/images/light.png" alt="Giao diện sáng với tài khoản mẫu" width="49%"> <img src="docs/images/dark.png" alt="Giao diện tối với tài khoản mẫu" width="49%">

## Cài đặt lần đầu

**Yêu cầu:** Windows 10/11 x64, .NET Framework 4.8 và Codex CLI hoặc extension Codex cho VS Code bản Windows. Tuyến kết nối đã kiểm chứng với Codex **0.160.0**; bản cũ hơn không được hỗ trợ. Bản portable không cần Node.js.

1. Tải `PADSwitcher-<version>-Windows.exe` từ Releases, đặt vào thư mục bạn muốn và mở ứng dụng.
2. Bấm **Thêm tài khoản**, đăng nhập trong trình duyệt. Lặp lại cho các tài khoản của bạn. Nếu đã đăng nhập Codex, có thể nhập phiên hiện tại bằng tùy chọn tương ứng trong ứng dụng.
3. Chọn tài khoản → **Dùng tài khoản này** để bật kết nối.
4. Cấu hình nơi bạn dùng Codex theo hướng dẫn dưới đây.

### Extension trong VS Code

1. Trong PADSwitcher, mở **Kết nối → Thiết lập VS Code**.
2. Lưu công việc, chạy **Developer: Reload Window** trong VS Code một lần, rồi mở extension Codex.
3. Xem trạng thái trong PADSwitcher: **Đã thiết lập · chờ extension** nghĩa là cấu hình đã đúng nhưng extension chưa nối; **Đang kết nối** nghĩa là extension đã hoàn tất kết nối.

Cấu hình tự động áp dụng cho VS Code bản thường, hồ sơ User mặc định. Workspace hoặc profile khác có thể ghi đè `chatgpt.cliExecutable`; kiểm tra lại nếu extension chưa nối.

### CLI trong terminal VS Code hoặc PowerShell

Trong **Kết nối**, sao chép lệnh CLI của PADSwitcher và chạy trong terminal bạn đang dùng. Đường dẫn mặc định:

```powershell
& "$env:APPDATA\PADSwitcher\data\gateway\PADCodex.exe"
```

Có thể thêm `resume` để mở lại hội thoại. Lệnh `codex` thông thường vẫn dùng đăng nhập riêng và không đi qua PADSwitcher. CLI được kết nối bằng lệnh trên mới nhận việc đổi tài khoản từ ứng dụng.

## Dùng hằng ngày

Mở PADSwitcher trước khi dùng Codex qua kết nối này. Có thể mở VS Code trước; nếu extension chưa tự nối sau khi PADSwitcher sẵn sàng, Reload Window một lần.

- **Đổi thủ công:** chọn tài khoản khác → **Dùng tài khoản này**. Ứng dụng đợi lượt đang chạy kết thúc rồi đổi. Nếu Codex đã dừng vì quota, nhắn **tiếp tục** trong cùng hội thoại. Không cần đăng nhập hay mở lại VS Code cho mỗi lần đổi.
- **Đổi tự động:** bật **Tự đổi**, chọn ít nhất hai tài khoản cá nhân và đặt ưu tiên. Khi lần gọi model bị từ chối vì quota trước khi có nội dung trả về, ứng dụng thử lại chính yêu cầu đó bằng tài khoản dự phòng, giữ nguyên ngữ cảnh. Cách này áp dụng cả lúc bắt đầu và sau các bước đã hoàn thành; không tự gửi tin nhắn “tiếp tục”.
- **Quota:** hai thanh hiển thị phần **còn lại** của cửa sổ ngắn/dài. Làm mới khi cần; dữ liệu cũ được đánh dấu trên giao diện.
- **Reset:** chỉ hiện số lượt/hạn dùng khi Codex cung cấp. `—` là chưa có dữ liệu, khác với 0. **Dùng reset** mở bước xác nhận; chỉ xác nhận mới tiêu thụ lượt. Nếu kết quả chưa rõ, dùng **Kiểm tra reset**, tránh gửi một yêu cầu mới. Reset không tự tiếp tục hội thoại đã dừng.
- **Đóng cửa sổ:** khi kết nối đang chạy, nút **X** ẩn vào khay hệ thống và vẫn phục vụ Codex; nút **–** thu nhỏ xuống taskbar. Muốn thoát hẳn, dùng menu biểu tượng ở khay hệ thống. Nếu kết nối đã dừng, X đóng ứng dụng.

PADSwitcher hiện chưa tự mở cùng Windows và chưa có cập nhật tự động.

## Phạm vi và dữ liệu

Tuyến đổi tự động hỗ trợ tài khoản cá nhân Free/Plus/Pro. Chưa hỗ trợ tài khoản tổ chức, WSL, SSH/containers hay Codex cloud. Ứng dụng dùng Codex cài trên máy; không thay sandbox hoặc bước duyệt công cụ.

Chỉ đổi tự động khi xác định được lỗi quota và chưa chuyển nội dung trả về. Nếu đã nhận một phần câu trả lời, gặp lỗi mạng/lỗi khác hoặc hết tài khoản dự phòng, Codex có thể dừng: chọn tài khoản còn quota rồi tiếp tục trong cùng hội thoại. Không bảo đảm mọi lỗi hoặc phiên bản Codex mới đều tiếp tục tự động.

Phiên tài khoản được mã hóa bằng Windows DPAPI, lưu tại `%APPDATA%\PADSwitcher\data`. Không chia sẻ thư mục này hoặc file kết nối. Mã nguồn và bản phát hành không chứa tài khoản của tác giả. Xem [bảo mật](SECURITY.md) và [phạm vi kiểm chứng](VALIDATION.md). Tính năng **tiêu thụ reset thật chưa được thử**; kiểm thử dùng dữ liệu giả.

**Cập nhật:** thoát bản cũ từ khay hệ thống rồi mở bản mới. Giữ nguyên thư mục dữ liệu; không cần thêm lại tài khoản. Nếu extension chưa nối lại, Reload Window. Bản portable hiện chưa ký số; đối chiếu SHA-256 bằng `Get-FileHash` với file `.sha256` trên Releases.

## Clone và chạy từ mã nguồn

Cần thêm **Node.js 24 LTS** và Git:

```powershell
git clone https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

`npm run dist` tạo bản portable trong `dist`. Helper native được build tự động. Hướng dẫn kiểm thử/build: [DEVELOPMENT.md](docs/DEVELOPMENT.md). Chi tiết hệ thống: [ROUTING.md](ROUTING.md).

Giấy phép [MIT](LICENSE) · [Thành phần bên thứ ba](THIRD_PARTY_NOTICES.md). Dự án độc lập, không phải sản phẩm chính thức của OpenAI.
