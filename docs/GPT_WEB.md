# GPT Web trong PADSwitcher 1.10.1

GPT Web là chức năng bổ sung, mặc định tắt. Trang **Tài khoản** tiếp tục quản lý
đăng nhập Codex; trang **GPT Web** quản lý phiên đăng nhập ChatGPT riêng.
Không cần nhập API key, access token hoặc cookie vào PADSwitcher.

## Thiết lập lần đầu

1. Bật kết nối Codex của PADSwitcher như trước.
2. Mở **GPT Web → Thêm tài khoản Web**, đặt tên dễ nhận biết.
3. Bấm **Đăng nhập & thiết lập**. Cửa sổ GPT Web riêng xuất hiện; đăng nhập
   ChatGPT trong trình duyệt do cửa sổ này mở, chạy kiểm tra trình duyệt và
   hoàn tất thiết lập model theo các bước trên màn hình.
4. Chọn **Browser-only** nếu chỉ chat. Muốn dùng công cụ đọc file, sửa code,
   terminal: chọn **Full**, hoàn tất MCP/tunnel và xác minh công cụ trong
   cửa sổ thiết lập. Tên connector có mã tài khoản; dùng đúng tên và URL mà
   cửa sổ hướng dẫn cung cấp. Không dùng chung connector giữa hai hồ sơ.
5. Quay lại PADSwitcher, chọn tài khoản vừa thiết lập rồi **Bật GPT Web**.
   Chỉ bật được khi đăng nhập và bộ chạy đã sẵn sàng ở chế độ tự động.
6. Reload Window trong VS Code, mở lại CLI hoặc chat JetBrains một lần để
   cập nhật danh sách model. Mở **hội thoại mới** và chọn model có hậu tố
   **(Web · tên tài khoản)**. Model thường tiếp tục dùng tuyến Codex hiện có.

Có thể lặp lại bước 2–4 để thêm nhiều tài khoản. Chức năng Web cần Chrome hoặc
Edge tương thích theo hướng dẫn của bộ chạy. Khả năng model và Full/MCP phụ
thuộc tài khoản ChatGPT; PADSwitcher chỉ hiển thị những model đã được bộ chạy
thiết lập. Cửa sổ bộ chạy hiện dùng tiếng Anh; trang quản lý có tiếng Việt/Anh.

## Sử dụng hằng ngày

- **Đổi tài khoản Web:** chọn tài khoản khác ở trang GPT Web, chờ tài khoản
  sẵn sàng, cập nhật danh sách model rồi mở chat mới với model của tài khoản đó.
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
qua tuyến Web. **Chưa kiểm chứng chat và công cụ Full/MCP với một tài khoản
ChatGPT thật trong lần triển khai này**; cần chủ tài khoản đăng nhập và làm
các bước kiểm tra trên màn hình. Kiểm thử giả lập không thay thế bước này.
