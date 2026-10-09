# GPT Web trong PADSwitcher 1.11.1

GPT Web là chức năng bổ sung, mặc định tắt. Trang **Tài khoản** tiếp tục quản lý
đăng nhập Codex; trang **GPT Web** quản lý phiên đăng nhập ChatGPT riêng.
Đăng nhập bằng trình duyệt riêng, không sao chép access token hoặc cookie.
Chỉ trò chuyện không cần API key. Công cụ lập trình cần API key cho tunnel/MCP;
khóa này không dùng để gọi model API.

## Thiết lập lần đầu

1. Bật kết nối Codex của PADSwitcher như trước.
2. Mở **GPT Web → Thêm tài khoản Web**, đặt tên dễ nhận biết.
3. Trình thiết lập mở ngay trong PADSwitcher (hoặc bấm **Đăng nhập & thiết lập**
   trên tài khoản có sẵn). Bấm **Đăng nhập ChatGPT**, đăng nhập trong cửa sổ
   trình duyệt riêng rồi quay lại PADSwitcher. Nút này mở thẳng trang đăng nhập;
   không cần tìm nút Log in trên trang chat. Trạng thái được cập nhật tự động.
   Nếu trang trắng hoặc tải mãi, bấm **tải lại** ở thanh trên của cửa sổ ChatGPT.
   Tải lại chỉ được phép trong lúc đăng nhập; vẫn bị chặn khi có lượt model hoặc
   kiểm tra trình duyệt đang chạy. Không tự tải lại, gửi prompt hay thử lại đăng nhập.
4. Chọn **Chỉ trò chuyện** hoặc **Trò chuyện và lập trình**. Đồng ý chạy một lượt
   kiểm tra ChatGPT Web rồi bấm **Thiết lập tự động**. Ứng dụng chạy kiểm tra,
   cài model và khởi động bộ chạy tuần tự. Lượt kiểm tra dùng giới hạn Web của
   tài khoản. Không chạy khi chỉ mở thiết lập hoặc khởi động ứng dụng.
5. Nếu chỉ chat, bấm **Hoàn tất và sử dụng**. Nếu dùng lập trình, làm tiếp phần
   **Kết nối công cụ** ngay trong trình thiết lập:
   - Mở trang tunnel và API key bằng hai nút trên màn hình. Dùng đúng tài khoản,
     tổ chức/workspace gắn với ChatGPT. Tạo tunnel cần Tunnels Read + Manage;
     API key thường để dùng tunnel cần Tunnels Read + Use, không dùng Admin key.
   - Nhập Tunnel ID và API key → **Kết nối công cụ**. Khóa được xóa khỏi ô nhập
     sau khi gửi hoặc đóng cửa sổ; bộ chạy lưu thông tin riêng cho hồ sơ Web.
   - **Sao chép tên** → **Mở cài đặt plugin ChatGPT**. Thêm custom MCP server,
     dùng đúng tên, Connection: Tunnel, đúng tunnel, xác thực None. Tạo/cài
     plugin và cho phép các thao tác cần dùng. Nếu giao diện yêu cầu, bật
     Developer Mode. Khả năng thêm plugin phụ thuộc quyền và chính sách workspace.
   - Quay lại PADSwitcher → **Xác minh công cụ**. Chỉ sau khi kiểm tra thành
     công mới bấm **Hoàn tất và sử dụng**. Nút này chọn tài khoản và bật GPT Web.
6. Reload Window trong VS Code, mở lại CLI hoặc chat JetBrains một lần để
   cập nhật danh sách model. Mở **hội thoại mới** và chọn model có hậu tố
   **(Web · tên tài khoản)**. Model thường tiếp tục dùng tuyến Codex hiện có.

Có thể lặp lại thiết lập cho nhiều tài khoản; mỗi tài khoản dùng tên connector
riêng, không dùng chung connector giữa hai hồ sơ. Khả năng model và Full/MCP
phụ thuộc tài khoản ChatGPT. Trình thiết lập có tiếng Việt/Anh; cửa sổ trình
duyệt/nâng cao của bộ chạy vẫn dùng tiếng Anh. Không cần chọn nút Full riêng:
kết nối công cụ sẽ chuyển cấu hình riêng của tài khoản sang Full.

Nếu kiểm tra lỗi, ứng dụng dừng tại bước đó. Bấm nút để chủ động thử lại;
không tự phát lại thao tác. Kiểm tra trình duyệt đã thành công được giữ lại
khi cài model lỗi. Thông tin tunnel đã lưu có thể kết nối lại mà không nhập
khóa. Khi bộ chạy đã có cấu hình nhưng chưa sẵn sàng, dùng **Khởi động lại bộ
chạy Web**; không gửi thêm lượt kiểm tra. **Mở cửa sổ nâng cao** dành cho xử lý
chi tiết hoặc chuyển chế độ về With Automation nếu trước đó đã dùng Zero Risk.

## Sử dụng hằng ngày

- **Sau khi bật máy:** mở shortcut PADSwitcher trước. Kết nối Codex và GPT Web
  tự khôi phục nếu lần trước đang bật; tính năng đã tắt vẫn tắt. Không cần chạy
  thiết lập/kiểm tra hoặc tạo tunnel lại. Nếu phiên hết hạn, đăng nhập lại hồ sơ
  cũ. Khởi động lại máy không yêu cầu tạo chat mới khi vẫn dùng tài khoản cũ.

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
qua tuyến Web. **Chưa kiểm chứng chat và công cụ Full/MCP với một tài khoản
ChatGPT thật trong lần triển khai này**; cần chủ tài khoản đăng nhập và làm
các bước kiểm tra trên màn hình. Kiểm thử giả lập không thay thế bước này.
