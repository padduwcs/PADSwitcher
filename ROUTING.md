# Định tuyến model — PADSwitcher 1.7.0

## Quyết định triển khai

Tham khảo cơ chế account fallback của 9router, không sao chép bộ dịch request/provider hoặc các thao tác sửa schema. PADSwitcher triển khai relay riêng với phạm vi hẹp: chỉ Codex Responses, chỉ quota có cấu trúc, giữ nguyên byte request.

[OpenAI Docs về cấu hình](https://learn.chatgpt.com/docs/config-file/config-advanced) cho phép đặt `openai_base_url` cho provider OpenAI gốc. [Yêu cầu gateway](https://learn.chatgpt.com/docs/enterprise/gateway-compatibility) yêu cầu giữ SSE, history, tool call/result và phân biệt lỗi. Đã đối chiếu mã nguồn OpenAI Codex `rust-v0.160.0`, `model-provider-info/src/lib.rs` và `core/src/client.rs`: HTTP 426 khi kết nối model WebSocket kích hoạt fallback HTTP theo session. Đây là hành vi đã thử bằng binary 0.160.0 trên máy; các bản mới vẫn cần kiểm chứng khi cập nhật.

## Luồng chính

1. PADCodex nối extension/CLI vào App Server chính thức như trước. App Server giữ thread, sandbox, công cụ và approvals.
2. Chỉ tiến trình backend có `openai_base_url` trỏ đến relay loopback; không sửa cấu hình hay auth chung.
3. Model WebSocket được trả 426. Codex dùng HTTP Responses với đầy đủ input, tránh phụ thuộc trạng thái incremental của tài khoản trước.
4. Relay đọc credential từ kho phiên hiện có, chuyển nguyên body đến `https://chatgpt.com/backend-api/codex/`. Account ID và bearer luôn lấy từ cùng một bundle.
5. Nếu HTTP 429 có `usage_limit_reached`, chọn tài khoản cá nhân dự phòng theo ưu tiên và gửi lại **cùng byte request**. SSE quota ở đầu luồng cũng có thể đổi trước khi client nhận bất kỳ phần nào.
6. Khi response đã bắt đầu được chuyển tiếp, không thử tài khoản khác cho response ấy. Phần còn lại do Codex xử lý theo cơ chế lỗi gốc.
7. Không có `turn/start` thứ hai hoặc input “tiếp tục”. Sau khi hết các lượt đang chạy, native account được đồng bộ với lựa chọn của relay.

## Ranh giới an toàn

- Chỉ tài khoản cá nhân Free/Plus/Pro đã xác định. Tài khoản tổ chức và gói chưa rõ bị từ chối ở tuyến này; không chuyển dữ liệu của workspace được quản lý qua tuyến cá nhân. Nếu token hoặc metadata cho biết gói tổ chức, tuyến cá nhân bị chặn, kể cả trong lúc thông tin gói đang chuyển đổi.
- Không phát lại body có `previous_response_id`, `conversation`, input string reference hoặc `item_reference` qua tài khoản khác. Không suy ra tính khả dụng của model từ catalog; lỗi model/entitlement được trả về, không tự đổi model.
- Sau text delta hoặc item/tool event đầu tiên, SSE được chuyển tiếp nguyên trạng. Chỉ giữ phần prelude tối đa 128 KiB/5 giây; không đợi toàn bộ câu trả lời, không trộn hai stream.
- Chỉ nghe `127.0.0.1`, port ngẫu nhiên, URL capability 256 bit đổi mỗi lần khởi động. Kiểm tra Host, bearer có mặt, từ chối Origin và Sec-Fetch-Site; gateway App Server vẫn có capability riêng.
- Chỉ whitelist endpoint model; không cung cấp proxy URL tùy ý. Upstream production cố định HTTPS. Không theo redirect có thể làm lộ token. HTTP headers lọc, bearer/account luôn ghi đè bằng bundle đúng hồ sơ.
- Tối đa 16 yêu cầu model đồng thời; body tối đa 64 MiB, decoded body cũng có giới hạn, lỗi upstream tối đa 1 MiB. Chọn dự phòng tối đa 2 phút, toàn yêu cầu tối đa 5 phút. Mỗi tài khoản thử một lần cho quota; credential 401 được refresh đúng hồ sơ một lần.
- Không tự rotate vì lỗi mạng, 429 chung, 403, 5xx, hoặc chữ quota trong nội dung. Relay không tự retry kết quả chưa rõ; Codex vẫn có hành vi xử lý lỗi/transport của chính nó.
- Khi người dùng tắt Tự đổi hoặc chọn thủ công, không bắt đầu fallback mới. Ngắt client/stop gateway abort upstream. Tài khoản đang dùng trong các request đều được bảo vệ khỏi xóa/reauth.
- Relay không ghi prompt, body, token hoặc URL capability vào log/metadata/UI. Codex vẫn lưu lịch sử hội thoại theo cấu hình của người dùng. Metadata chỉ có profile ID, quota/cooldown và lựa chọn; token nằm trong DPAPI và bộ nhớ khi dùng.
- Không tự gọi consume reset. Các kiểm thử reset tiếp tục chỉ dùng fixture.

Đây là bảo vệ kỹ thuật của ứng dụng; không phải bảo đảm tài khoản luôn được dịch vụ chấp nhận hoặc không bao giờ thay đổi giới hạn/điều kiện sử dụng. Không thay sandbox/approval để giúp một lần thử thành công.

## Kiểm chứng

- `test/model-router.test.cjs`: retry ở đầu và sau tool giữ byte request, SSE chunk/CRLF, không retry sau output, không rotate khi disabled/chọn thủ công, tham chiếu account, gói tổ chức, auth refresh, zstd compact, exhaustion, browser/capability/redirect, 426, disconnect.
- `test/model-router-lifecycle.test.cjs`: bảo vệ native account, routed account và các account đang có request.
- `node scripts/router-native-smoke.cjs --live`: native Codex 0.160.0 + model fixture cục bộ; policy discovery read-only bằng phiên thật. Initial và post-tool đều một turn completed, không failed turn; tool ghi marker đúng một lần; request A/B giống từng byte; không thêm continuation; auth chung giữ nguyên hash.
- `node scripts/router-live-smoke.cjs --live --inference`: đã kiểm chứng bằng hai phản hồi ngắn thật với model mặc định do Codex trả về (`gpt-6.1-sol`). A trả marker; quota được chèn **cục bộ** trước lần gọi tiếp theo; B nhận request y hệt và nhớ marker. Hai turn completed trong cùng thread, không phát sinh continuation. Không ép tài khoản hết quota, không tiêu thụ reset hay sửa dự án người dùng.
- Giao diện được xem và kiểm thử Electron sáng/tối, Việt/Anh, cửa sổ thường và 1000 × 680. Ảnh dùng dữ liệu mẫu trong `artifacts/electron-qa`.
