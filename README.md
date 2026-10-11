<p align="center">
  <img src="src/assets/padswitcher-emblem.png" alt="Biểu trưng PADSwitcher" width="120">
</p>

<h1 align="center">PADSwitcher</h1>

<p align="center">
  <strong>Profile Account Directory Switcher</strong><br>
  <strong>Một nơi để quản lý tài khoản Codex và Kaggle trên Windows.</strong><br>
  Theo dõi quota, đổi tài khoản an toàn và tiếp tục làm việc trong IDE hoặc terminal.
</p>

<p align="center">
  <a href="https://github.com/padduwcs/PADSwitcher/releases/latest"><img alt="Phiên bản mới nhất" src="https://img.shields.io/github/v/release/padduwcs/PADSwitcher?style=for-the-badge&color=147de5"></a>
  <a href="https://github.com/padduwcs/PADSwitcher/actions/workflows/ci.yml"><img alt="Trạng thái kiểm thử" src="https://img.shields.io/github/actions/workflow/status/padduwcs/PADSwitcher/ci.yml?branch=main&style=for-the-badge&label=checks"></a>
  <a href="LICENSE"><img alt="Giấy phép MIT" src="https://img.shields.io/github/license/padduwcs/PADSwitcher?style=for-the-badge&color=338f85"></a>
  <img alt="Windows 10 và 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge&logo=windows11">
</p>

<p align="center">
  <a href="https://github.com/padduwcs/PADSwitcher/releases/latest"><strong>⬇️ Tải bản Windows mới nhất</strong></a>
  &nbsp;·&nbsp; <a href="README.en.md">English</a>
  &nbsp;·&nbsp; <a href="https://github.com/padduwcs/PADSwitcher/issues/new/choose">Báo lỗi</a>
</p>

> [!IMPORTANT]
> PADSwitcher là ứng dụng portable cho Windows, hiện **chưa ký số**. Hãy tải từ trang Releases chính thức và đối chiếu file `.sha256` đi kèm.

<p align="center">
  <img src="docs/images/light.png" alt="PADSwitcher quản lý tài khoản Codex ở giao diện sáng" width="49%">
  <img src="docs/images/dark.png" alt="PADSwitcher quản lý tài khoản Codex ở giao diện tối" width="49%">
</p>

## Điểm nổi bật

- 🔄 **Codex không gián đoạn:** đổi tài khoản thủ công hoặc tự thử tài khoản dự phòng khi gặp lỗi quota trước khi câu trả lời bắt đầu.
- 🧩 **Dùng ở nơi bạn làm việc:** hỗ trợ Codex trong VS Code, PowerShell CLI và JetBrains AI Assistant.
- 📊 **Quota rõ ràng:** xem phần còn lại, thời gian đặt lại, lịch sử đổi và hoạt động model ngay trong ứng dụng.
- 🚀 **Kaggle song song:** mỗi terminal dùng một tài khoản riêng; theo dõi GPU/TPU, notebook đã ghim và các lượt chạy gần đây.
- 🔐 **Dữ liệu nằm trên máy:** phiên Codex và token Kaggle được mã hóa bằng Windows DPAPI.
- 🌗 **Giao diện chỉn chu:** sáng/tối, tiếng Việt/English, bố cục responsive và có thể điều chỉnh.

<p align="center">
  <img src="docs/images/services.png" alt="Màn hình chọn dịch vụ Codex hoặc Kaggle" width="49%">
  <img src="docs/images/kaggle.png" alt="Màn hình quản lý nhiều tài khoản Kaggle" width="49%">
</p>

## Bắt đầu trong 3 phút

### Yêu cầu

- Windows 10/11 x64 và .NET Framework 4.8.
- Với Codex: Codex CLI hoặc extension Codex cho VS Code bản Windows. Đã kiểm chứng với Codex `0.160.0`.
- Với Kaggle: Python 3.11+ và công cụ Kaggle theo hướng dẫn trong ứng dụng.
- Bản portable không cần cài Node.js.

### Cài đặt

1. Tải `PADSwitcher-<version>-Windows.exe` và file `.sha256` từ [Releases](https://github.com/padduwcs/PADSwitcher/releases/latest).
2. Kiểm tra file tải về:

   ```powershell
   Get-FileHash .\PADSwitcher-*-Windows.exe -Algorithm SHA256
   ```

3. Mở ứng dụng → **Dịch vụ** → chọn **Codex** hoặc **Kaggle**.
4. Làm theo hướng dẫn 3 bước ngay trong ứng dụng để thêm tài khoản và kết nối công cụ.

PADSwitcher là portable: đặt file `.exe` ở thư mục bạn muốn và chạy trực tiếp. Khi nâng cấp, thoát bản cũ từ khay hệ thống rồi mở bản mới; dữ liệu trong `%APPDATA%\PADSwitcher\data` được giữ nguyên.

## Kết nối Codex

- **VS Code:** **Kết nối → Thiết lập VS Code**, sau đó chạy `Developer: Reload Window` một lần.
- **PowerShell/terminal VS Code:** sao chép lệnh tại trang **Kết nối**. Lệnh `codex` thông thường vẫn dùng phiên riêng.
- **JetBrains/Android Studio:** cài AI Assistant và Codex agent, sau đó chọn **Codex · PADSwitcher** trong AI Chat.

Mặc định ba loại kết nối dùng chung một tài khoản. Bạn cũng có thể gán tài khoản và chính sách tự đổi riêng cho từng loại kết nối. Xem [hướng dẫn Codex đầy đủ](docs/CODEX.md).

## Dùng Kaggle

1. Mở **Dịch vụ → Kaggle → Thiết lập**, cài các công cụ được đề xuất rồi **Lưu & kiểm tra**.
2. Tạo API token tại [Kaggle Settings](https://www.kaggle.com/settings), sau đó **Thêm tài khoản**.
3. Chọn tài khoản → **Sao chép lệnh** hoặc **Mở terminal mới**.
4. Gửi notebook bằng Kaggle CLI và theo dõi quota/lượt chạy trong PADSwitcher.

Mỗi PowerShell giữ lựa chọn riêng, nên nhiều terminal có thể dùng nhiều tài khoản song song trong giới hạn của Kaggle. Xem [hướng dẫn Kaggle đầy đủ](docs/KAGGLE.md).

## An toàn và giới hạn

- PADSwitcher không vận hành proxy trên Internet; gateway chỉ lắng nghe loopback và dùng capability mới ở mỗi lần chạy.
- Ứng dụng không ghi prompt hoặc credential vào log riêng. Không chia sẻ thư mục dữ liệu, file kết nối hay ảnh chụp có thông tin cá nhân.
- Tự đổi chỉ hỗ trợ tài khoản Codex cá nhân Free/Plus/Pro và lỗi quota đã xác định trước khi có nội dung trả về.
- Chưa hỗ trợ tài khoản tổ chức, WSL, SSH/container, Codex cloud, tự mở cùng Windows hoặc tự cập nhật.
- Ứng dụng không bỏ qua sandbox hay bước duyệt công cụ của Codex.

Đọc thêm: [Bảo mật](SECURITY.md) · [Ranh giới định tuyến](ROUTING.md) · [Phạm vi kiểm chứng](VALIDATION.md)

## Phát triển

```powershell
git clone https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

Cần Node.js 24 LTS và Git. Các lệnh chính:

```powershell
npm run check
npm test
npm run smoke:ui
npm run dist
```

Helper native được build tự động. Xem [hướng dẫn phát triển](docs/DEVELOPMENT.md), [quy trình đóng góp](CONTRIBUTING.md) và [lịch sử phiên bản](CHANGELOG.md).

## Cộng đồng

Nếu gặp lỗi, hãy [mở issue](https://github.com/padduwcs/PADSwitcher/issues/new/choose) với phiên bản ứng dụng, phiên bản Windows và các bước tái hiện; nhớ che thông tin tài khoản. Báo cáo lỗ hổng theo [chính sách bảo mật](SECURITY.md).

---

<p align="center">
  Phát hành theo <a href="LICENSE">giấy phép MIT</a> ·
  <a href="THIRD_PARTY_NOTICES.md">Thành phần bên thứ ba</a><br>
  Dự án độc lập, không phải sản phẩm chính thức của OpenAI, Kaggle hoặc JetBrains.
</p>
