# Định tuyến Codex trên Unix

[English](ROUTING.en.md) · [Hướng dẫn sử dụng](../UNIX-INSTALL.md) · [Kiểm chứng](../UNIX-VALIDATION.md)

## Kết nối và tài khoản

`GatewayHub` giữ endpoint helper ổn định cho VS Code, CLI và JetBrains. Kết nối
Dùng chung dùng một router; kết nối Tài khoản riêng có backend/router và chính
sách dự phòng riêng. Desktop Codex cục bộ có backend riêng để giữ kho hội thoại
hiện có, nhưng dùng cùng router/chính sách Dùng chung.

Backend native giữ thread, công cụ, sandbox và approvals. Đăng nhập Codex được
cấp trong bộ nhớ; cấu hình và tệp đăng nhập desktop gốc không bị thay thế.
Không chuyển socket đang làm việc sang backend khác. Đổi chế độ kết nối cần
client mở lại một lần; đổi tài khoản trong cùng chế độ giữ kết nối.

## Luồng gọi model

1. Backend OpenAI gốc trỏ `openai_base_url` vào relay loopback riêng. Model
   WebSocket nhận HTTP 426 để Codex dùng HTTP Responses đầy đủ input.
2. Relay lấy bearer/account ID từ cùng một bundle, giữ nguyên byte body và
   các header cache/session cho phép, rồi gửi tới Codex upstream cố định.
3. HTTP 429 có `usage_limit_reached`, hoặc SSE quota trước kết quả, có thể đổi
   sang tài khoản cá nhân dự phòng. Mỗi tài khoản được thử tối đa một lần cho
   lần gọi đó. Request được giữ nguyên, không thêm tin nhắn tiếp tục.
4. Khi có text/tool output được chuyển cho client, không đổi tài khoản cho
   response đó. Công cụ đã thực hiện không bị chạy lại để chuyển tài khoản.
5. Token sticky-routing được giữ riêng theo tài khoản trong bộ nhớ có giới hạn.
   Token của tài khoản A không được gửi sang B.
6. Sau khi các lượt thích hợp hoàn tất, backend native đồng bộ đăng nhập với
   lựa chọn router. Đồng bộ tự động khác lựa chọn thủ công; một đăng nhập chậm
   không được ghi đè lựa chọn router mới hơn.

## Lỗi và tiếp tục

Sau lỗi mạng/model hoặc stream không hoàn chỉnh, relay dừng native tự gửi lặp
bước chưa rõ kết quả. Khóa gồm tuyến, thread/turn và dấu tiến trình đã băm từ
input người dùng/kết quả công cụ; không lưu nội dung chat. Tin nhắn bổ sung và
kết quả công cụ mới trong cùng lượt được tiếp tục. Assistant partial-recovery
đơn thuần không mở lại bước lỗi. Các tuyến compact/lite có khóa riêng.

Thành công được nhận diện từ SSE terminal thực tế, kể cả thiếu Content-Type và
completion lớn dạng data-only. Event kết thúc thiếu separator hoặc JSON hỏng
không được suy đoán là thành công. Diagnostics chỉ giữ bộ đếm, model/effort và
usage số học; nội dung frame không được ghi vào metadata/log của PADSwitcher.

## Phạm vi và giới hạn

- Tài khoản cá nhân Free/Plus/Pro đã xác định; không tự luân chuyển workspace
  tổ chức hoặc gói chưa rõ. Không tự đổi model hay suy ra entitlement từ catalog.
- Request có `previous_response_id`, `conversation` hoặc item reference riêng
  của tài khoản không được phát lại sang tài khoản khác.
- Chỉ quota có cấu trúc đủ điều kiện. Lỗi mạng, 429 chung, 403, 5xx và lời nhắc
  có chữ quota không kích hoạt chuyển tài khoản.
- Chỉ nghe loopback, capability ngẫu nhiên, kiểm tra Host/bearer và chặn Origin.
  Upstream HTTPS cố định; không mở proxy URL tùy ý hoặc theo redirect token.
- Tối đa 16 request; body/decoded body 64 MiB, upstream error body 1 MiB.
  Thời gian chờ 5 phút áp dụng cho **không có hoạt động**, không cắt stream dài
  vẫn có dữ liệu. Tìm tài khoản dự phòng giới hạn hai phút cho lần gọi.
- Tắt tự chuyển hoặc chọn tài khoản thủ công ngăn fallback mới. Stop/disconnect
  hủy request đang chạy; tài khoản đang dùng được bảo vệ khỏi xóa/reauth.
- Không tự tiêu reset credit. App không ghi prompt, response, token hay capability
  URL vào diagnostics; native Codex vẫn giữ lịch sử theo cấu hình của người dùng.

## Kiểm chứng

| Lệnh | Nội dung |
| --- | --- |
| `npm test` | Byte-identical fallback, stream framing, auth, quyền, lỗi, thứ tự đồng bộ |
| `npm run smoke:protocol` | Native tools/cache/sticky state và đổi A/B trong một lượt |
| `npm run smoke:faults` | Mỗi lỗi mô phỏng chỉ một lần gọi upstream; lượt mới hoạt động |
| `npm run smoke:continuity` | Desktop/extension, 12 lần đổi, steering và ghi tệp không lặp |
| `npm run smoke:desktop` | MCP hiện tại, auth gốc, cùng chat, mở lại backend/desktop |

Các bài trên dùng tài khoản và model server giả lập. Kiểm tra GUI ChatGPT Linux
thật có thể chạy bằng tùy chọn mô tả trong [UNIX.md](../UNIX.md).
Kết quả và phạm vi từng bản nằm trong [validation](../UNIX-VALIDATION.md).
