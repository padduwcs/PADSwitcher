# GPT Web trong PADSwitcher 1.12.0

GPT Web là chức năng bổ sung, mặc định tắt. Trang **Tài khoản** tiếp tục quản lý
đăng nhập Codex; trang **GPT Web** quản lý phiên đăng nhập ChatGPT riêng.
Đăng nhập bằng trình duyệt riêng, không sao chép access token hoặc cookie.
Chỉ trò chuyện không cần API key. Công cụ lập trình cần API key cho tunnel/MCP;
khóa này không dùng để gọi model API.

## Thiết lập lần đầu

1. Bật kết nối Codex của PADSwitcher như trước.
2. Mở **GPT Web → Thêm tài khoản ChatGPT**, đặt tên (có thể để trống) rồi bấm
   **Tiếp tục**.
3. Cửa sổ đăng nhập ChatGPT mở ra phía trước. Đăng nhập như bình thường (Google,
   Apple, email…). Có tối đa 15 phút; nếu lỡ đóng hoặc bị che, bấm **Mở cửa sổ đăng
   nhập** trên thẻ tài khoản.
4. Đăng nhập xong, PADSwitcher tự làm tiếp: gửi **một tin nhắn kiểm tra ngắn**
   (dùng giới hạn Web của tài khoản), cài model, ẩn cửa sổ, chọn tài khoản và bật
   GPT Web. Thẻ tài khoản hiện tiến độ; khi xong có thông báo.
5. Trong VS Code: **Reload Window** (hoặc mở lại CLI/chat JetBrains) một lần, mở
   **chat mới** và chọn model có hậu tố **(Web · tên tài khoản)**. Model thường
   tiếp tục dùng tuyến Codex hiện có.

Nếu một bước lỗi, thẻ tài khoản hiện lý do và **Chi tiết** (đã che khóa/token),
rồi dừng lại. Bấm **Thử lại** khi sẵn sàng; ứng dụng không tự gửi lại. Bấm **Hủy**
trong lúc chờ đăng nhập để đóng bộ chạy của tài khoản chưa dùng.

### Công cụ lập trình (tùy chọn)

Mặc định model Web chỉ trò chuyện. Muốn model Web đọc file, chạy lệnh và sửa code,
bấm **Công cụ lập trình** trên thẻ tài khoản đã kết nối:

1. Mở trang tunnel và API key bằng hai nút. Dùng đúng tổ chức/workspace gắn với
   ChatGPT. Tạo tunnel cần Tunnels Read + Manage; API key thường để dùng tunnel cần
   Tunnels Read + Use, không dùng Admin key. Nhập Tunnel ID và API key →
   **Kết nối công cụ**. Khóa bị xóa khỏi ô nhập sau khi gửi hoặc đóng hộp thoại.
2. **Sao chép tên** → **Mở cài đặt plugin ChatGPT**. Thêm custom MCP server đúng
   tên, Connection: Tunnel, đúng tunnel, xác thực None; bật Developer Mode nếu được
   yêu cầu. Khả năng thêm plugin phụ thuộc quyền và chính sách workspace.
3. **Xác minh công cụ**. Từ lúc kết nối đến khi xác minh thành công, chat Web của
   tài khoản này tạm dừng để không chạy chế độ Full thiếu connector.

Có thể lặp lại cho nhiều tài khoản; mỗi tài khoản dùng tên connector riêng.
**Nâng cao** mở cửa sổ gốc của bộ chạy (tiếng Anh) để xử lý chi tiết.

## Sử dụng hằng ngày

- **Sau khi bật máy:** mở shortcut PADSwitcher trước. Kết nối Codex và GPT Web
  tự khôi phục nếu lần trước đang bật; tính năng đã tắt vẫn tắt. Không cần chạy
  thiết lập/kiểm tra hoặc tạo tunnel lại. Nếu phiên hết hạn, đăng nhập lại hồ sơ
  cũ. Khởi động lại máy không yêu cầu tạo chat mới khi vẫn dùng tài khoản cũ.

- **Đổi tài khoản Web:** bấm **Dùng cho chat mới** ở tài khoản khác, cập nhật
  danh sách model rồi mở chat mới với model của tài khoản đó.
  Chat cũ giữ tài khoản ban đầu, kể cả khi khởi động lại PADSwitcher.
- **Trở về Codex:** mở chat mới, chọn model thường. Không chuyển lịch sử Web
  sang Codex ngay trong chat cũ: PADSwitcher chặn trước khi gửi yêu cầu để tránh
  gửi sai lịch sử hoặc tốn quota do thử lại.
- **Tắt GPT Web:** chờ lượt và thao tác thiết lập hoàn tất, bấm Tắt GPT Web.
  Các bộ chạy Web đóng; phiên đăng nhập được giữ để dùng lần sau. Kết nối,
  quota và tự đổi tài khoản Codex tiếp tục hoạt động.
- **Web lỗi/hết giới hạn:** lỗi được trả về tại Web, không tự đổi tài khoản,
  không tự gửi lại sang Codex. Khi cần, tự chọn tài khoản Web khác và chat mới.
- **Một lượt Web tại một thời điểm**, tính chung các client và tài khoản.
  Các yêu cầu Web song song bị từ chối, không xếp hàng hoặc tự chạy lại.
  Chưa hỗ trợ nhiều tác vụ/subagent Web song song.
- Nút X của PADSwitcher ẩn vào khay khi kết nối hoặc bộ chạy còn hoạt động.
  Thoát hẳn bằng menu khay; ứng dụng yêu cầu đợi lượt đang chạy hoàn tất.

## Cách tách biệt với Codex hiện tại

Yêu cầu model thường giữ nguyên byte, thông tin cache, phiên và cơ chế quota
của PADSwitcher 1.9.2. Chỉ model có định danh `chatgpt-web/pad-<id>/...` mới đi
qua tuyến Web. Tuyến này không lấy token Codex, không gọi router quota và
không tự chuyển sang tuyến Codex. Việc kiểm tra trạng thái định kỳ chỉ đọc
trạng thái bộ chạy; không sinh câu trả lời model.
Thiết lập Web khóa riêng việc gửi Web khi thao tác đang chạy; model Codex thường
vẫn hoạt động. Mỗi thao tác có request ID để tránh chạy trùng khi mất phản hồi.
Kênh điều khiển yêu cầu capability, từ chối browser Origin và giới hạn POST
thiết lập ở 8 KiB. Cookie và khóa không xuất hiện trong trạng thái/log trả về UI.

Mỗi hồ sơ có thư mục `CODEX_HOME`, cấu hình bridge và dữ liệu trình duyệt riêng
dưới `%APPDATA%\PADSwitcher\data\gpt-web\profiles\<id>`. Thiết lập bridge chỉ
ghi cấu hình Codex riêng này. Thư mục Codex thật chỉ được đọc để xác thực
ngữ cảnh/sandbox của hội thoại và công cụ; bộ chạy không ghi auth/config thật.
Tài khoản Web được lưu bằng phiên trình duyệt, không phải định dạng hồ sơ
DPAPI của tài khoản Codex. Không chia sẻ thư mục dữ liệu này.

Liên kết chat chỉ lưu hash ID hội thoại và ID hồ sơ, không lưu prompt trong
`bindings.json`. Bộ chạy upstream có dữ liệu phiên/log riêng. Xóa tài khoản
không xóa dấu sở hữu của chat cũ để vẫn ngăn chuyển nhầm sang Codex. Tối đa
5.000 liên kết chat; khi đầy, từ chối chat Web mới thay vì quên tài khoản chat cũ.
Xóa tài khoản
chuyển dữ liệu riêng vào `gpt-web/trash/<id>`, không xóa ngay trên ổ đĩa;
giao diện hiện chưa có nút phục hồi Web. Không xóa hoặc tắt tài khoản đang chạy.

## Phát triển và kiểm chứng

`vendor/codex-chatgpt-web` giữ nguồn phiên bản 6.1.6 tại commit
`307763887a8ba61143ac12815856f4f0d92885d2` cùng giấy phép. Bản clone trong
`D:\references_repo\Test` không được dùng làm nơi ghi build hoặc thay đổi mã.

```powershell
npm ci
npm run web:build
npm start
npm test
npm run check
npm run smoke:protocol
npm run smoke:web:protocol
npm run smoke:web
npm run smoke:ui
npm run dist
```

Build tự lấy Bun 1.4.0 cục bộ trong `artifacts`, cài dependency bằng lockfile
và đóng gói bộ chạy Electron/Bun vào portable. Máy người dùng không cần Node
hoặc Bun riêng. `web:build` dùng hash nguồn để bỏ qua build không đổi; thêm
`-- --force` để build lại. Kiểm thử Web dùng hồ sơ tạm, credential giả và
endpoint loopback; không đăng nhập hoặc tiêu quota thật.

Đã kiểm chứng cô lập hai bộ chạy đóng gói, kiểm soát loopback có xác thực,
không thay đổi auth/config Codex, không fallback/retry Codex, giữ byte/cache
của yêu cầu thường và Codex thật thực thi hai công cụ giả lập đúng một lần
qua tuyến Web. **Chưa kiểm chứng đăng nhập hoàn chỉnh, chat và công cụ Full/MCP
với một tài khoản ChatGPT thật**; cần chủ tài khoản đăng nhập. Kiểm thử giả lập
không thay thế bước này.
