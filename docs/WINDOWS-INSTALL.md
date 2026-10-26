# Cài và dùng PADSwitcher trên Windows

[English](WINDOWS-INSTALL.en.md) · [Mục lục](README.md)

## Tải và mở ứng dụng

1. Máy cần **Windows 10/11 x64**, .NET Framework 4.8 và kết nối Internet.
2. Mở [bản Windows ổn định](https://github.com/padduwcs/PADSwitcher/releases/latest),
   mở **Assets**, tải `PADSwitcher-<version>-Windows.exe` và file `.sha256` cùng tên.
   Không chọn **Source code** nếu chỉ muốn sử dụng.
3. Trong PowerShell tại thư mục tải về, kiểm tra mã SHA-256:

   ```powershell
   Get-FileHash .\PADSwitcher-*-Windows.exe -Algorithm SHA256
   ```

   So sánh kết quả với nội dung file `.sha256` đi kèm.
4. Đặt `.exe` vào thư mục muốn giữ ứng dụng và mở trực tiếp. Đây là bản portable;
   không cần Node.js hoặc clone repo. Ứng dụng chưa ký số; chỉ mở file đã tải từ
   release chính thức và kiểm tra ở bước trên.

## Kết nối Codex lần đầu

1. Cài Codex CLI hoặc extension Codex cho VS Code bản Windows.
2. Mở **Dịch vụ → Codex → Tài khoản → Thêm tài khoản**, đăng nhập trong trình duyệt.
3. Chọn tài khoản → **Dùng tài khoản này**.
4. Mở **Kết nối** và chọn công cụ cần dùng:
   - **VS Code:** bấm **Thiết lập VS Code**, lưu công việc rồi chạy
     **Developer: Reload Window** trong Command Palette một lần.
   - **CLI / terminal VS Code:** sao chép lệnh tại trang Kết nối và chạy trong
     PowerShell. Lệnh `codex` thông thường vẫn dùng phiên đăng nhập riêng.
   - **JetBrains:** cài AI Assistant và Codex agent, chọn **Thiết lập JetBrains**,
     sau đó chọn **Codex · PADSwitcher** trong AI Chat.
5. Giữ PADSwitcher chạy khi sử dụng kết nối. Trạng thái **Đang kết nối** trên
   thẻ công cụ xác nhận công cụ đã nối vào PADSwitcher.

[Hướng dẫn Codex chi tiết](CODEX.md) có cách mở lại chat, chọn tài khoản riêng
cho từng kết nối và xử lý thiết lập bị workspace/profile ghi đè.
Tính năng mở desktop Codex qua PADSwitcher hiện có trên
[bản Unix](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.md).

## Bật tự chuyển khi hết quota

1. Thêm ít nhất **hai tài khoản Codex cá nhân** Free/Plus/Pro đã đăng nhập.
2. Vào **Tài khoản**. Nếu đang dùng lựa chọn **Dùng cho**, chọn nhóm cần cấu hình:
   **Dùng chung** hoặc kết nối có tài khoản riêng.
3. Bấm **Tự đổi · Tắt** để mở **Tự đổi khi hết quota**.
4. Đánh dấu **Tự đổi tài khoản khi hết quota**, chọn ít nhất hai tài khoản dự phòng
   và đặt thứ tự ưu tiên; số nhỏ được thử trước.
5. Bấm **Lưu thiết lập**. Kiểm tra nút đã hiện **Tự đổi · Bật**.

Thiết lập Dùng chung áp dụng cho các kết nối đang dùng chung. Kết nối chọn
tài khoản riêng có chính sách riêng, cần bật cho đúng nhóm.
Khi một lần gọi model bị từ chối vì quota trước khi trả kết quả, PADSwitcher
thử cùng yêu cầu trên tài khoản dự phòng phù hợp và giữ ngữ cảnh/kết quả công cụ.
Nếu đã có kết quả, lỗi mạng, kết quả chưa rõ hoặc hết tài khoản dự phòng, ứng dụng
dừng để bạn kiểm tra rồi tiếp tục. ChatGPT thông thường và tác vụ cloud/remote
không thuộc kết nối này. Đổi tài khoản không sao chép lịch sử ChatGPT giữa các tài khoản.

## Kaggle

Vào **Dịch vụ → Kaggle → Thiết lập**, làm theo hướng dẫn cài Python 3.11+ và
công cụ Kaggle, rồi **Lưu & kiểm tra**. Thêm API token, chọn tài khoản và mở
terminal của tài khoản đó. Mỗi terminal giữ lựa chọn riêng.
Xem [hướng dẫn Kaggle](KAGGLE.md) để cấu hình và gửi notebook.

## Thoát, cập nhật và dữ liệu

- Nút **X** có thể chỉ ẩn cửa sổ vào khay hệ thống. Để thoát hẳn, mở menu biểu
  tượng PADSwitcher cạnh đồng hồ (có thể nằm trong mục biểu tượng ẩn) và chọn thoát.
- Khi cập nhật, lưu công việc, thoát hẳn bản cũ rồi thay `.exe` bằng bản mới đã
  kiểm tra checksum. Chưa có tự cập nhật.
- Dữ liệu trong `%APPDATA%\PADSwitcher\data` được giữ lại; phiên đăng nhập được
  mã hóa bằng Windows DPAPI. Không gửi thư mục này, file auth hoặc gateway cho người khác.
- Xem [hỗ trợ](../SUPPORT.md) khi gặp lỗi. Kèm phiên bản, Windows/kiến trúc và các
  bước tái hiện; che thông tin tài khoản trong ảnh chụp.

Muốn sửa mã nguồn? Dùng nhánh `main` và [hướng dẫn phát triển Windows](DEVELOPMENT.md).
Linux/macOS dùng nhánh và bộ cài Unix riêng.
