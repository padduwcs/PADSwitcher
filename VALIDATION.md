# Kiểm chứng PADSwitcher 1.5.0

Bản gốc 1.4.0 được lưu tại commit `749cf8f2378e2953d6ed33dd5e2dfae1f6b02ee8` trên `https://github.com/padduwcs/PADSwitcher.git`. Bản 1.5.0 bổ sung các thay đổi và kiểm chứng bên dưới.

## Phạm vi mới của 1.5.0

- 93 bài kiểm thử: thêm 8 bài backend reset và 5 bài renderer về reset, ngôn ngữ, theme, giữ nguyên tên/ghi chú người dùng và chống chèn HTML.
- Reset: đối chiếu tài liệu OpenAI và JSON Schema do Codex 0.160.0 đang cài sinh ra. Read nhận `rateLimitResetCredits`; consume gửi `idempotencyKey` và `creditId` nếu chọn dòng cụ thể. Số lượt từ `availableCount`, không dùng độ dài danh sách.
- **Không gọi consume thật, không dùng lượt reset người dùng.** Backend mô phỏng kiểm tra xác nhận, hủy, sai tài khoản/mã cũ, TTL xác nhận, số dư thay đổi, phản hồi mất, cùng mã sau khởi động lại, yêu cầu lặp, các outcome và lỗi đọc quota sau khi consume đã thành công.
- Phiên cho consume dùng external ChatGPT tokens trong bộ nhớ và kho ephemeral riêng, không đổi tài khoản gateway/phiên chung. Mã lần thử được lưu trước request. Khi chưa rõ kết quả, UI yêu cầu kiểm tra cùng lần thử; không tự retry/tiêu thụ lượt khác. Tự đổi tài khoản không gọi phần consume mới.
- Electron fixture: kiểm tra sáng/Việt và tối/Anh, hai quota xếp dọc, danh sách reset, xác nhận và hủy. Cửa sổ 1000 × 680 có nút chọn tài khoản và vùng reset trong viewport; không tràn ngang. Native tray và hộp thoại theo ngôn ngữ UI.
- Ảnh mới: `accounts-light-vi.png`, `accounts-dark-en.png`, `reset-confirmation-sample.png`, `settings-dark-en.png` trong `artifacts/electron-qa`, hoàn toàn dữ liệu giả.

Ngày 03/10/2026; Windows x64, Node.js 24.18.1, Electron 44.5.1, .NET Framework 4.8. Binary gateway hiện tại: Codex 0.160.0 trong extension VS Code 26.930.31730-win32-x64; CLI độc lập 0.159.2 dùng cho các kiểm tra cũ. Các kết quả tài khoản/inference thật của bản 1.1.0 trước đây được ghi riêng trong bảng; bản 1.2.0 bổ sung kiểm chứng tự phục hồi bằng Codex chính thức và model fixture cục bộ.

## Kết quả

| Hạng mục | Kết quả / phạm vi |
|---|---|
| Cú pháp | `npm run check` qua |
| Kiểm thử tự động | **93 bài qua**, sử dụng phiên mẫu và backend mô phỏng; luồng tài khoản đầu tiên, trang Kết nối, bàn phím, giữ mục mở rộng khi cập nhật; kiểm tra thông tin thường được ẩn nhưng lỗi kết nối/trạng thái tự tiếp tục bị chặn vẫn hiển thị |
| Hai tài khoản thật (đã kiểm chứng ở 1.1.0) | A → B trên cùng tiến trình gateway/App Server và cùng kết nối WebSocket; account/read đúng tài khoản, rateLimits đọc được cho cả hai |
| Inference thật A → B (đã kiểm chứng ở 1.1.0) | Lượt A hoàn tất trước khi đổi; lượt B tiếp tục trên **cùng thread**, nhớ marker trong ngữ cảnh A; không khởi động lại backend/kết nối |
| Tự phục hồi bằng Codex chính thức 1.2.0 | Codex gọi dynamic tool ghi marker → model fixture báo HTTP 429 usage_limit_reached → Codex phát mã usageLimitExceeded → PADSwitcher tự A → B → lượt tiếp tục hoàn tất cùng thread, nhận lịch sử kết quả công cụ. Marker chỉ ghi **một lần**; backend không tạo auth.json, hash phiên gốc không đổi |
| CLI tương tác tự phục hồi 1.2.0 | TUI Codex chính thức nối qua PADCodex; model cục bộ trả lượt đầu thành công, lượt sau lỗi quota; gateway tự chuyển sang B, gửi lượt tiếp tục và hoàn tất. TUI nhận các sự kiện lượt mới trên kết nối đang mở |
| Phiên gốc | SHA-256 auth.json dùng chung không thay đổi sau kiểm tra thật; backend ephemeral trong CODEX_HOME thử nghiệm không tạo auth.json |
| Cầu nối native | PADCodex.exe thực sự chuyển JSON stdio của client sang WebSocket; initialize/initialized, account/read A → B và cờ CLI remote qua |
| CLI tương tác thật | TUI Codex 0.160.0 kết nối qua PADCodex; trả lời prompt thử nghiệm; yêu cầu đọc MARKER.txt được hiển thị để xác nhận, thực hiện và trả nội dung qua công cụ native |
| Windows DPAPI / ACL | Mã hóa/giải mã thật; blob không chứa dữ liệu gốc. Thử thêm quyền Everyone rồi áp lại ACL: chỉ còn người dùng hiện tại + SYSTEM, chặn kế thừa |
| Dừng khi chủ sở hữu bị kết thúc | Windows Job Object thật; dừng tiến trình quản lý thử nghiệm khiến cả helper và Codex con thoát |
| Bộ giám sát CLI riêng cũ | PowerShell thật mã hóa phiên mẫu và bỏ auth.json tạm |
| Electron / renderer | Giao diện 1.5.0: khởi động thật, preload/IPC, sandbox, CSP; font local tải đủ 400/500/600; trang Tài khoản/Kết nối/Cài đặt/Hướng dẫn, trạng thái chưa có tài khoản, hộp tự đổi và ưu tiên; không tràn ngang ở 1260 × 900 và 1000 × 680; nút chọn tài khoản nằm trong viewport tối thiểu |
| Gói ASAR | Chạy mã đóng gói bằng Electron trong app-data thử nghiệm; khởi động gateway, copy helper đã unpack, initialize và thread/loaded/list qua stdio; đóng cửa sổ thu xuống khay, gateway vẫn hoạt động; giữ nguyên auth fixture |
| Thành phần trong gói | gateway.cjs, ws và jsonc-parser có trong ASAR; helper có trong ASAR unpacked; không có auth.json, DPAPI vault, danh sách tài khoản hay khóa gateway thử nghiệm |
| Electron fuses | RunAsNode, NodeOptions, Node CLI inspect tắt; OnlyLoadAppFromAsar và EmbeddedAsarIntegrity bật |
| npm audit | **0 lỗ hổng** tại thời điểm đóng gói |
| Portable | dist/PADSwitcher-1.5.0-Windows.exe và tệp SHA-256; Windows x64, chưa ký chứng thư |

SHA-256 bản portable nằm trong `dist/PADSwitcher-1.5.0-Windows.exe.sha256`.

## Thiết kế giao diện 1.5.0

Logo `padswitcher-emblem.png` giữ nguyên ảnh người dùng đã lọc nền; icon Windows lấy từ ảnh này ở 16–256 px. Bản 1.5.0 giữ thanh điều hướng ngang, thêm nền tối xanh đậm và ngôn ngữ Việt/Anh, dùng Be Vietnam Pro local (400/500/600). Hai thanh quota xếp dọc; xanh dương và xanh ngọc phân biệt hai cửa sổ, phần reset có nền cam nhẹ. Có nút đổi theme/ngôn ngữ trên thanh trên và lựa chọn trong Cài đặt. Giao diện nhớ lựa chọn; tên/ghi chú tài khoản giữ nguyên khi đổi ngôn ngữ. Thông tin thường dùng vẫn gọn, chi tiết reset và tùy chọn tài khoản mở theo nhu cầu. Không dùng thư viện UI, CDN hoặc font service; giấy phép font nằm trong `src/assets/fonts/OFL.txt`.

Ảnh QA nằm trong `artifacts/electron-qa`: `startup.png`, `accounts-sample.png`, `accounts-compact.png`, `connections-sample.png`, `settings-sample.png`, `help-logo.png`, `automatic-switch-setup.png`. Nền ảnh dùng tài khoản mẫu, không chứa phiên người dùng. Phần gateway/tự phục hồi giữ triển khai 1.2.0; các kiểm chứng native quota/CLI đã ghi bên dưới thuộc lần kiểm chứng 1.2.0, không coi ảnh UI là kiểm chứng quota thật.

## Tự phục hồi: phạm vi kiểm chứng

`npm run smoke:recovery` dùng Codex chính thức, kho dữ liệu/CODEX_HOME riêng và Responses server **mô phỏng tại 127.0.0.1**. Đọc hai phiên thật trong bộ nhớ để Codex lấy chính sách tài khoản bình thường; không đăng nhập lại/ép xoay refresh token. Tất cả yêu cầu model trong bài này tới dịch vụ cục bộ, không ép tài khoản thật hết quota. HTTP quota được mô phỏng, nhưng phân loại lỗi, lưu history, dynamic tool, chuyển account/login/start và lượt tiếp tục đều do Codex chính thức thực hiện. Phiên mẫu thuần túy không đủ cho bước chính sách tài khoản của Codex 0.160.0; không coi thử nghiệm phiên mẫu bị lỗi network policy là kiểm chứng thành công.

Kiểm thử mới bao gồm: tùy chọn mặc định tắt; chỉ nhận mã usageLimitExceeded; bỏ qua rateLimitExceeded/429 chung/lỗi mạng/quyền; giữ cùng thread, model, môi trường, sandbox, approval policy và output schema; không phát lại input hoặc toolOutput; chờ mọi lượt; hủy khi đổi thủ công, tắt tùy chọn, mất client hoặc hủy trong lúc tra token; mỗi tài khoản chỉ thử một lần rồi dừng; dừng khi công cụ chưa rõ; bỏ qua thread đặt tiêu đề/hội thoại tạm; context của lượt gốc không bị mất do reconciliation; hộp duyệt công cụ vẫn chuyển tới client; cấu hình lưu/đọc và cập nhật khi xóa hồ sơ; chống HTML injection trong lịch sử tự đổi.

Không cam kết model luôn tránh lặp thao tác: PADSwitcher không gửi lại nguyên yêu cầu và lời nhắc yêu cầu kiểm tra tiến độ, nhưng các quyết định công cụ tiếp theo vẫn do model/Codex thực hiện theo quyền đã có. Giao diện vẫn có thể hiện lỗi quota cũ và lời nhắc tiếp tục; không che lỗi hay sửa kết quả lượt cũ.

## Các tình huống tự động đã kiểm tra

Chuyển phiên khi nhiều lượt cùng chạy; chặn lượt mới trong lúc chờ; không phát lại yêu cầu; lỗi turn/start; review tách thread; logout/login từ client bị chặn; refresh token được xử lý riêng; chuyển tiếp hai chiều hộp xác nhận công cụ; mất client và ngắt lượt; từ chối dừng khi còn lượt; chặn Origin/khóa sai; thông điệp JSON không hợp lệ; xóa khóa khi dừng; khởi động lại; kết quả tra phiên cũ không được áp dụng sau stop/restart; phát hiện công việc native không có thông báo cho client bằng thread/loaded/list và trạng thái thread.

Cũng kiểm tra phiên mới nhất trong auth dùng chung, token xoay khi CLI riêng còn chạy, bảo vệ hồ sơ gateway khỏi xóa/đăng nhập lại, JSONC comments và cài đặt không liên quan khi thiết lập/khôi phục VS Code, từ chối ghi đè giá trị do người dùng tự đổi, quota còn lại/dữ liệu cũ/tần suất cập nhật, các luồng giao dịch và khôi phục của cách đổi phiên dùng chung cũ, xóa/khôi phục hồ sơ, timeout RPC và chống HTML injection.

## Phạm vi chưa kiểm chứng

- Chưa thao tác chuột trực tiếp trong giao diện extension VS Code thật hoặc tự Reload Window đang chứa phiên làm việc của người dùng. Cầu nối được kiểm tra bằng giao thức stdio thực tế và binary Codex đi kèm extension; bước thiết lập/Reload một lần nằm trong README và giao diện.
- Kiểm tra gói dùng mã ASAR đóng gói dưới Electron QA và phiên mẫu; kiểm chứng tài khoản/inference thật chạy độc lập trên mã nguồn tương ứng. Chưa có thử nghiệm người dùng bằng thao tác chuột trên portable.
- Không thử thay phiên desktop thật đang dùng. Cách cũ này vẫn được kiểm tra bằng fixture.
- Không ép hết hạn/thu hồi token tài khoản thật để thử refresh OAuth. Luồng refresh/single-flight và lưu token mới được kiểm tra bằng mô phỏng; không chủ động xoay refresh token thật của hai tài khoản.
- Client JSON-RPC của bài phục hồi kiểm chứng dynamic tool và lịch sử đã lưu; CLI gốc được kiểm chứng riêng. Chưa kiểm chứng tự tiếp tục trong giao diện extension bằng thao tác chuột hoặc mọi capability/frontend/plugin.
- Chưa thử cố làm hết quota tài khoản thật hoặc nối lại chính xác dòng trả lời đang truyền dở. Lỗi mạng/stream không phải usageLimitExceeded không tự đổi. Review, thread tạm/background và trạng thái công cụ chưa rõ không tự tiếp tục.
- WSL, SSH, Dev Containers, VS Code profiles khác, cloud jobs, realtime, mọi công cụ/plugin và thay đổi phiên bản Codex chưa được chứng nhận bởi lần kiểm tra này.

Các kiểm tra tài khoản thật chạy trong thư mục CODEX_HOME/app-data riêng, chỉ đọc vault thật vào bộ nhớ; không ghi token tài khoản vào đầu ra, tài liệu, ảnh mẫu hoặc gói phát hành. Kiểm tra inference sử dụng một lượng quota nhỏ. Kho tài khoản thật và cài đặt VS Code thật không bị các script QA thay thế.

Ảnh nhận diện dùng nguyên bản người dùng cung cấp; icon có 7 kích thước 16–256 px. Icon đã được trích và kiểm tra ở bản 1.4.0, không đổi ở 1.5.0. Metadata gói mới: ProductName/FileDescription PADSwitcher, ProductVersion 1.5.0.0. Tham khảo 9router để chọn ý tưởng điều phối; bản này dùng giao thức Codex App Server chính thức, không chép tuyến gọi endpoint ChatGPT riêng hay kho token không mã hóa của repo tham khảo.

WebSocket và external ChatGPT tokens vẫn là giao thức experimental theo [OpenAI](https://learn.chatgpt.com/docs/app-server); kết quả trên áp dụng cho phiên bản/môi trường đã ghi.

