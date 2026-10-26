# Dùng Kaggle trên Linux/macOS

Mở **Dịch vụ → Kaggle**. Bạn lưu các tài khoản một lần, chọn tài khoản cho từng terminal và xem giờ GPU/TPU còn lại cùng trạng thái notebook.

## Bắt đầu trong 3 bước

1. **Thêm tài khoản.** Tạo API token tại [Kaggle → Settings → API](https://www.kaggle.com/settings), bấm **Thêm tài khoản** và dán token. Tên dễ nhớ là tùy chọn. Nếu ứng dụng yêu cầu cài công cụ, làm theo **Thiết lập** trước.
2. **Chọn tài khoản trong terminal.** Chọn tài khoản bên trái → **Sao chép lệnh** → dán vào Bash/Zsh, kể cả terminal trong VS Code. Bạn tiếp tục làm việc ở thư mục hiện tại và không cần nhập lại token.
3. **Chạy và theo dõi.** Gửi notebook bằng Kaggle CLI. Quay lại PADSwitcher để xem quota và trạng thái; bấm **Làm mới** khi cần. Để chạy song song, chọn tài khoản khác trong một terminal khác rồi gửi notebook của tài khoản đó.

GPU Kaggle dùng cho notebook chạy trên Kaggle. `python train.py` chạy trực tiếp trong terminal vẫn dùng máy của bạn.

![Tài khoản, quota và notebook Kaggle](images/kaggle.png)

## Những thao tác thường dùng

- **Lệnh ngắn:** mở **Thiết lập → Thiết lập padkaggle**, bật một lần rồi mở terminal Bash/Zsh mới. Gõ `padkaggle list` để xem tài khoản, `padkaggle use username` để chọn, `padkaggle off` để bỏ chọn. Terminal đã mở vẫn dùng được nút **Sao chép lệnh**.
- **Terminal mới:** bấm **Mở terminal mới** để mở Bash với tài khoản đã chọn. Thư mục mở đầu nằm trong **Tùy chọn tài khoản**. Đổi thư mục bằng `cd` vẫn giữ lựa chọn của terminal.
- **Notebook:** bấm biểu tượng ghim ở **Gần đây**, hoặc **＋ Ghim notebook** để nhập đường dẫn. **Đã ghim** và **Gần đây** cuộn riêng; cuộn Gần đây xuống cuối để tải thêm, hoặc bấm **Tải thêm**.
- **Bố cục:** kéo vạch giữa hai cột để đổi chiều rộng, kéo vạch dưới danh sách để đổi chiều cao. App nhớ kích thước; **Bố cục mặc định** đặt lại. Có thể dùng phím mũi tên khi chọn vạch, Enter hoặc nhấp đúp để đặt lại từng vạch, Escape để hủy kéo.
- **Tài khoản:** mở **Tùy chọn tài khoản** để sửa tên, thư mục, cập nhật token hoặc xóa tài khoản. Bấm **Cách dùng** ở đầu trang nếu cần xem lại hướng dẫn.

<details>
<summary>Cài công cụ lần đầu</summary>

Mở **Thiết lập**. Nếu chưa sẵn sàng, cài Python, bấm **Sao chép lệnh cài**, chạy lệnh trong Bash/Zsh rồi **Lưu & kiểm tra**.

Ứng dụng cần Python 3.11+, `kaggle >=2.2.4,<3` và `kagglesdk >=0.1.37,<1`. PADSwitcher không đóng gói Python hoặc tự cài package. Mục **Python & công cụ** cho phép xem phiên bản và chọn `python3` riêng, gồm Python trong venv. Mặc định ứng dụng tự tìm Python.

Token phải là API token mới; không nhập mật khẩu hoặc tệp `kaggle.json` cũ. Username được nhận diện tự động khi xác minh token.

</details>

<details>
<summary>Ví dụ gửi notebook từ máy</summary>

Trong terminal đã chọn tài khoản, tạo cấu hình:

```bash
kaggle kernels init -p ./job
```

Sửa `job/kernel-metadata.json`: đặt `id` thành `username/notebook-slug`, `code_file` trỏ tới code, khai báo nguồn dữ liệu và đặt `enable_gpu: true` nếu cần GPU. Sau đó:

```bash
kaggle kernels push -p ./job
kaggle kernels status username/notebook-slug
kaggle kernels output username/notebook-slug -p ./results
```

Mỗi terminal có thể dùng tài khoản riêng. Khi gửi bằng tài khoản B, notebook phải có `id` của B. Dùng các tài khoản bạn có quyền truy cập và tuân thủ giới hạn Kaggle.

</details>

<details>
<summary>Hiểu quota và trạng thái notebook</summary>

- Giờ còn lại bao gồm phần giữ chỗ; Kaggle quyết định việc cấp GPU. `—` nghĩa là chưa có dữ liệu. Xem **Chi tiết quota** để biết phần giữ chỗ và thời điểm đặt lại nếu có.
- **Đã ghim** theo dõi tối đa 20 notebook mà tài khoản có quyền xem. **Gần đây** tải 12 notebook mỗi lần. Số bên cạnh tên mục là số mục đã tải, không phải tổng notebook trên Kaggle.
- Trạng thái là lượt chạy mới nhất đã đọc, có thể chưa bao gồm các phiên tương tác trên web hoặc mọi phiên bản đang chạy. Rê chuột lên trạng thái để xem thời điểm cập nhật.
- **Làm mới** cập nhật quota, trang đầu và các notebook ghim. Trang tải thêm giữ dữ liệu lúc tải trong phiên mở app. Đóng rồi mở lại app sẽ bắt đầu từ trang đầu.
- Ứng dụng tự làm mới mỗi 2 phút khi đang mở; có thể tắt trong **Thiết lập**. Lỗi đọc giữ lại dữ liệu cũ và đánh dấu. Bấm **Thử lại** khi tải thêm bị lỗi; cập nhật token nếu hết hạn.
- Bấm tên notebook để mở trên Kaggle; trình duyệt có thể cần đăng nhập tài khoản phù hợp.

</details>

<details>
<summary>Lệnh terminal, token và các trường hợp khác</summary>

`padkaggle use` áp dụng cho chính terminal Bash/Zsh đang chạy, giữ nguyên thư mục.
Có thể chọn bằng username hoặc tên dễ nhớ duy nhất trong dấu nháy. Lệnh ngắn
hỗ trợ Bash 3.2+ và Zsh. Sau khi bật, mở terminal mới; terminal cũ dùng
**Sao chép lệnh** để nạp. PADSwitcher Unix và công cụ kết nối phải chạy trong
cùng môi trường Linux/macOS.

`padkaggle off` bỏ chọn trong terminal và khôi phục các biến Kaggle trước lần chọn đầu tiên. Nó không dừng notebook đã gửi hoặc tiến trình đã chạy. Có thể gỡ lệnh trong mục **Tùy chọn nâng cao** của **Lệnh padkaggle**.

Token được mã hóa trên máy. Xóa hoặc cập nhật token trong PADSwitcher không thay đổi token của terminal đã mở. Muốn ngắt truy cập hoàn toàn, đóng các terminal đó và thu hồi token trên Kaggle. Đóng PADSwitcher không dừng terminal hoặc notebook đã gửi.

PADSwitcher quản lý tài khoản và đọc trạng thái. Công việc được gửi bằng Kaggle CLI; ứng dụng không chia job, lên lịch hay tự đổi tài khoản.

</details>

## Dữ liệu và kiểm chứng

- Metadata nằm trong thư mục `data/kaggle` của app Unix; mỗi token có vault mã hóa,
  dùng khóa bảo vệ bởi Secret Service trên Linux hoặc Keychain trên Mac.
- Token không nằm trong snapshot giao diện, lệnh sao chép, arguments hay log.
- Python nhận credential trực tiếp qua stdin, bỏ biến xác thực kế thừa và trả
  hợp đồng JSON có giới hạn. Đọc/pagination theo tài khoản được chống trùng,
  xác minh danh tính và có thể hủy.
- Thiết lập `padkaggle` chỉ sửa block đánh dấu ở startup Bash/Zsh. Profile dạng
  liên kết dotfiles được giữ nguyên; hộp thoại cung cấp dòng nạp thủ công.
- Lệnh cài SDK mặc định tạo Python venv riêng, giữ nguyên Python hệ thống.

Kiểm thử thường dùng tài khoản và dịch vụ giả lập, không gọi Kaggle có xác thực
hay tiêu compute. Kiểm chứng gửi job/tài khoản thật cần được cho phép riêng.
Xem [phát triển](DEVELOPMENT.md), [bảo mật](../SECURITY.md) và
[hướng dẫn Windows](https://github.com/padduwcs/PADSwitcher/blob/main/docs/KAGGLE.md).
