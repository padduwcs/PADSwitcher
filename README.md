# PADSwitcher

**Mới ở 1.11.0:** trình thiết lập **GPT Web** ngay trong PADSwitcher, có tiếng
Việt/Anh, tự kiểm tra và cài model sau khi đăng nhập. Quản lý nhiều tài khoản Web,
kết nối công cụ theo từng bước và giữ tiến độ khi lỗi. Mặc định tắt; giữ tuyến Codex hiện có.
Xem [thiết lập, cách dùng và phạm vi kiểm chứng](docs/GPT_WEB.md).

<img src="src/assets/padswitcher-emblem.png" alt="PADSwitcher" width="96">

Quản lý các tài khoản Codex cá nhân trên Windows: xem quota, đổi tài khoản và tiếp tục làm việc trong VS Code, CLI hoặc JetBrains AI Assistant. Giao diện sáng/tối, tiếng Việt/Anh.

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

### Android Studio / JetBrains AI Assistant

1. Cài plugin **AI Assistant** và agent **Codex** trong mục **Agents**, mở Codex một lần để IDE tải runtime. Tích hợp hiện hỗ trợ adapter **codex-acp 2.1.1**.
2. Trong PADSwitcher, bật kết nối bằng **Dùng tài khoản này**, mở **Kết nối → Thiết lập JetBrains**.
3. Trong **AI Chat**, chọn agent **Codex · PADSwitcher** và mở chat mới. Nếu chưa thấy agent, mở lại IDE một lần.
4. Xem **Agent → Đang kết nối** trong PADSwitcher để xác nhận chat đang đi qua ứng dụng. **Đã thiết lập** chỉ xác nhận cấu hình, chưa xác nhận chat đang kết nối.

Đổi tài khoản thủ công/tự động áp dụng cho agent này như VS Code/CLI. Agent **Codex** thông thường vẫn dùng đăng nhập riêng. Hội thoại cũ của agent thông thường không tự chuyển sang agent PADSwitcher. Tích hợp thêm một agent trong `%USERPROFILE%\.jetbrains\acp.json`, giữ các agent khác. Không cần cài Node.js riêng; dùng runtime đã được IDE tải.

Muốn trở về cách dùng cũ: chọn lại agent **Codex** trong AI Chat. Có thể gỡ agent PADSwitcher tại **Kết nối → Gỡ kết nối JetBrains**. Bước duyệt công cụ vẫn hiển thị trong IDE.

## Dùng hằng ngày

### Dùng chung hoặc tài khoản riêng

Mặc định VS Code, JetBrains và CLI qua PADSwitcher dùng chung tài khoản. Muốn tách:

1. Mở **Kết nối**, bấm **Tài khoản** ở mục VS Code, JetBrains hoặc CLI.
2. Chọn **Tài khoản riêng**, chọn tài khoản rồi **Lưu thiết lập**. Chờ lượt đang chạy xong trước khi đổi chế độ.
3. Reload Window trong VS Code, mở lại chat JetBrains hoặc CLI **một lần** để áp dụng chế độ mới. Không phải thiết lập lại đường dẫn kết nối.
4. Trong trang **Tài khoản**, chọn **Dùng cho → VS Code / JetBrains / CLI**. Nút **Dùng tài khoản này**, **Tự đổi** và lịch sử tự đổi áp dụng cho kết nối đang chọn. Chọn **Dùng chung** để quản lý nhóm dùng chung.

Ví dụ VS Code dùng A → B, JetBrains dùng C → D: VS Code hết quota thì chuyển sang B, JetBrains vẫn dùng C. Các lần đổi tài khoản trong cùng chế độ không cần mở lại IDE. Nếu cùng dùng một tài khoản, hai bên cùng tiêu quota; thông tin tài khoản hết quota được chia sẻ để tránh chọn lại tài khoản đó.

Muốn gộp lại, mở **Kết nối → Tài khoản → Dùng chung**, rồi mở lại kết nối đó một lần. Cấu hình tự đổi riêng được giữ lại để dùng sau. Phạm vi tách là loại kết nối: tất cả cửa sổ VS Code dùng cùng nhóm VS Code, tất cả chat agent PADSwitcher trong JetBrains dùng cùng nhóm JetBrains. CLI trong terminal VS Code thuộc nhóm **CLI**.

Mở PADSwitcher trước khi dùng Codex qua kết nối này. Có thể mở VS Code trước; nếu extension chưa tự nối sau khi PADSwitcher sẵn sàng, Reload Window một lần.

- **Đổi thủ công:** chọn tài khoản khác → **Dùng tài khoản này**. Ứng dụng đợi lượt đang chạy kết thúc rồi đổi. Nếu Codex đã dừng vì quota, nhắn **tiếp tục** trong cùng hội thoại. Không cần đăng nhập hay mở lại VS Code cho mỗi lần đổi.
- **Đổi tự động:** bật **Tự đổi**, chọn ít nhất hai tài khoản cá nhân và đặt ưu tiên. Khi lần gọi model bị từ chối vì quota trước khi có nội dung trả về, ứng dụng thử lại chính yêu cầu đó bằng tài khoản dự phòng, giữ nguyên ngữ cảnh. Cách này áp dụng cả lúc bắt đầu và sau các bước đã hoàn thành; không tự gửi tin nhắn “tiếp tục”.
- **Quota:** hai thanh hiển thị phần **còn lại** của cửa sổ ngắn/dài. Làm mới khi cần; dữ liệu cũ được đánh dấu trên giao diện.

Bản **1.9.2** sửa lỗi làm mất thông tin giữ cache và cắt lượt trả lời dài ở bản cũ. Cập nhật quota **mỗi phút** chỉ đọc thông tin tài khoản, không gọi model; có thể bỏ qua một lần nếu thao tác khác đang chạy. Nếu dùng bản cũ, thoát PADSwitcher bằng biểu tượng khay hệ thống rồi mở bản mới; kết nối lại client để nhận bản sửa. Tài khoản đã lưu được giữ lại.

Nếu muốn kiểm tra mức sử dụng, mở **Cài đặt → Kiểm tra hệ thống → Hoạt động model**: xem số yêu cầu, lần gửi, lần thử tài khoản khác và tỷ lệ ngữ cảnh dùng lại được server báo. Số liệu bắt đầu lại khi khởi động lại kết nối, không phải lượng quota bị trừ. Quota còn phụ thuộc model, mức suy luận và toàn bộ ngữ cảnh; yêu cầu mới ngắn trong hội thoại dài vẫn có thể tốn nhiều, nhất là khi đổi sang tài khoản chưa có cache.
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
