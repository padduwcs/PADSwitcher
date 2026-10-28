# Dùng Kaggle với PADSwitcher


Khi để tự tìm Python, lệnh cài tạo venv riêng trong `%APPDATA%\PADSwitcher\data\kaggle\venv`; ứng dụng ưu tiên `Scripts\python.exe` trong venv này. Python riêng do bạn chọn vẫn được giữ. Lệnh cài cần bạn chạy trong PowerShell, ứng dụng không tự cài package.
Mở **Dịch vụ → Kaggle**. Bạn lưu các tài khoản một lần, chọn tài khoản cho từng terminal và xem giờ GPU/TPU còn lại cùng trạng thái notebook.

## Bắt đầu trong 3 bước

1. **Thêm tài khoản.** Tạo API token tại [Kaggle → Settings → API](https://www.kaggle.com/settings), bấm **Thêm tài khoản** và dán token. Tên dễ nhớ là tùy chọn. Nếu ứng dụng yêu cầu cài công cụ, làm theo **Thiết lập** trước.
2. **Chọn tài khoản trong terminal.** Chọn tài khoản bên trái → **Sao chép lệnh** → dán vào PowerShell, kể cả terminal trong VS Code. Bạn tiếp tục làm việc ở thư mục hiện tại và không cần nhập lại token.
3. **Chạy và theo dõi.** Gửi notebook bằng Kaggle CLI. Quay lại PADSwitcher để xem quota và trạng thái; bấm **Làm mới** khi cần. Để chạy song song, chọn tài khoản khác trong một terminal khác rồi gửi notebook của tài khoản đó.

GPU Kaggle dùng cho notebook chạy trên Kaggle. `python train.py` chạy trực tiếp trong terminal vẫn dùng máy của bạn.

![Tài khoản, quota và notebook Kaggle](images/kaggle.png)

## Những thao tác thường dùng

- **Lệnh ngắn:** mở **Thiết lập → Thiết lập padkaggle**, bật một lần rồi mở terminal PowerShell mới. Gõ `padkaggle list` để xem tài khoản, `padkaggle use username` để chọn, `padkaggle off` để bỏ chọn. Terminal đã mở vẫn dùng được nút **Sao chép lệnh**.
- **Terminal mới:** bấm **Mở terminal mới** để mở PowerShell với tài khoản đã chọn. Thư mục mở đầu nằm trong **Tùy chọn tài khoản**. Đổi thư mục bằng `cd` vẫn giữ lựa chọn của terminal.
- **Notebook:** bấm biểu tượng ghim ở **Gần đây**, hoặc **＋ Ghim notebook** để nhập đường dẫn. **Đã ghim** và **Gần đây** cuộn riêng; cuộn Gần đây xuống cuối để tải thêm, hoặc bấm **Tải thêm**.
- **Bố cục:** kéo vạch giữa hai cột để đổi chiều rộng, kéo vạch dưới danh sách để đổi chiều cao. App nhớ kích thước; **Bố cục mặc định** đặt lại. Có thể dùng phím mũi tên khi chọn vạch, Enter hoặc nhấp đúp để đặt lại từng vạch, Escape để hủy kéo.
- **Tài khoản:** mở **Tùy chọn tài khoản** để sửa tên, thư mục, cập nhật token hoặc xóa tài khoản. Bấm **Cách dùng** ở đầu trang nếu cần xem lại hướng dẫn.

<details>
<summary>Cài công cụ lần đầu</summary>

Mở **Thiết lập**. Nếu chưa sẵn sàng, cài Python, bấm **Sao chép lệnh cài**, chạy lệnh trong PowerShell rồi **Lưu & kiểm tra**.

Ứng dụng cần Python 3.11+, `kaggle >=2.2.4,<3` và `kagglesdk >=0.1.37,<1`. PADSwitcher không đóng gói Python hoặc tự cài package. Mục **Python & công cụ** cho phép xem phiên bản và chọn `python.exe` riêng, gồm Python trong venv. Mặc định ứng dụng tự tìm Python.

Token phải là API token mới; không nhập mật khẩu hoặc tệp `kaggle.json` cũ. Username được nhận diện tự động khi xác minh token.

</details>

<details>
<summary>Ví dụ gửi notebook từ máy</summary>

Trong terminal đã chọn tài khoản, tạo cấu hình:

```powershell
kaggle kernels init -p ./job
```

Sửa `job/kernel-metadata.json`: đặt `id` thành `username/notebook-slug`, `code_file` trỏ tới code, khai báo nguồn dữ liệu và đặt `enable_gpu: true` nếu cần GPU. Sau đó:

```powershell
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

`padkaggle use` áp dụng cho chính terminal PowerShell đang chạy, ở bất kỳ thư mục nào. Có thể chọn bằng tên dễ nhớ trong dấu nháy nếu tên không trùng, ví dụ `padkaggle use 'Nhóm nghiên cứu'`. `padkaggle status` xem lựa chọn hiện tại; không xác minh token trực tuyến.

Lệnh ngắn hỗ trợ Windows PowerShell và PowerShell 7. Terminal dùng `-NoProfile` cần nạp bằng **Sao chép lệnh**. CMD, Git Bash và WSL chưa hỗ trợ cách chọn tại chỗ này. Nếu PowerShell chặn script, xử lý theo chính sách máy; ứng dụng không bỏ qua execution policy.

`padkaggle off` bỏ chọn trong terminal và khôi phục các biến Kaggle trước lần chọn đầu tiên. Nó không dừng notebook đã gửi hoặc tiến trình đã chạy. Có thể gỡ lệnh trong mục **Tùy chọn nâng cao** của **Lệnh padkaggle**.

Token được mã hóa trên máy. Xóa hoặc cập nhật token trong PADSwitcher không thay đổi token của terminal đã mở. Muốn ngắt truy cập hoàn toàn, đóng các terminal đó và thu hồi token trên Kaggle. Đóng PADSwitcher không dừng terminal hoặc notebook đã gửi.

PADSwitcher quản lý tài khoản và đọc trạng thái. Công việc được gửi bằng Kaggle CLI; ứng dụng không chia job, lên lịch hay tự đổi tài khoản.

</details>

<details>
<summary>Technical reference and verification</summary>

## Storage and implementation

- Metadata: `%APPDATA%\PADSwitcher\data\kaggle\accounts.json`.
- Pagination stores additional rows and their read times in memory per account; persisted snapshots remain bounded to the first 12 plus up to 20 pins. Page requests verify identity, skip quota/pinned queries, deduplicate simultaneous requests per account and retain the cursor on failure. They cannot mutate or remove an account while its read is active.
- Credential vault: `kaggle\<UUID>\token.dpapi`, Windows DPAPI CurrentUser and the existing PADSwitcher entropy. The Kaggle directory has the same private Windows ACL policy as Codex data.
- The renderer receives allowlisted metadata and safe errors. Token input is masked and cleared on submission, cancellation, Escape and dialog close. Tokens are never put in command arguments, clipboard commands, plaintext launchers or metadata files.
- The Python reader uses the official `kagglesdk` client with an explicit API token and production endpoint. Credentials travel over the subprocess stdin pipe. Inherited Kaggle credentials and Python environment hooks are removed; Python starts with `-E -P` to ignore environment configuration and unsafe import paths while allowing normal user-site installations.
- The Python bridge is ASAR-unpacked for portable builds. Packages remain user-installed. SDK stdout/stderr and raw HTTP errors are not forwarded; only the reader’s JSON contract is returned. Request timeout is 12 seconds; the overall reader is bounded to 90 seconds.
- Quitting cancels pending read-only bridge processes and retains the last successful snapshot. Invalid Kaggle storage disables Kaggle mutations while leaving Codex available; the invalid file is preserved for repair.
- Terminal startup decrypts the vault inside PowerShell and sets process-only `KAGGLE_API_TOKEN`. Per-account `KAGGLE_CONFIG_DIR` keeps CLI preferences separate. A deliberately invalid legacy key prevents a rejected modern token from silently falling back to the machine’s default saved account in Kaggle CLI 2.2.4. It does not grant access. No user-level environment variable or default `.kaggle` credential file is changed.
- `terminal/padkaggle.ps1` and its read-only Python dependency reader are exported from the packaged app to a stable path. The shell command reads saved metadata and DPAPI vaults directly, without rewriting account storage or requiring the app to remain open. It resolves and validates the account, tools and vault before changing the caller's environment; failures retain the prior selection. Credentials are never part of copied commands or profile blocks.
- Optional profile setup modifies only the marked PADSwitcher block in the user's all-hosts `profile.ps1` files for Windows PowerShell and PowerShell 7. Existing UTF-8/UTF-16LE encodings are preserved; malformed blocks, unsupported encodings, signed profiles and linked files are left alone. Concurrent profile edits cause setup to stop and roll back files it has already changed when they remain unchanged.
- The token is necessarily present in memory and in that terminal’s environment. Software running as the same Windows user can read it; DPAPI is protection at rest, not isolation from the current user.

## Verification and boundaries

The normal Node suite covers encrypted storage, reload, duplicate/identity checks, rollback on disk errors, per-account refresh deduplication, simultaneous account reads, partial snapshots, pinning limits, dependency failures, safe error messages, independent launches and UI workflows. Windows tests decrypt synthetic tokens in simultaneous hidden PowerShell processes and verify in-place switching, safe failures, PATH restoration, profile preservation and environments without printing tokens. PowerShell 7 is checked when installed, including in Windows CI.

For the real SDK request/response contract, install the stated packages in a disposable venv and run:

```powershell
& '<venv>\Scripts\python.exe' -I test/kaggle-reader-test.py
```

This offline suite uses real SDK model types and fixture clients; it makes no Kaggle requests. It checks requested pages, full/short/empty page handling, invalid paging and safe partial errors. Electron smoke checks include the Kaggle page in light/dark, VI/EN and 1000/1260px layouts, with 20 pins, independently bounded scroll areas, incremental loading and scroll preservation. If `artifacts/kaggle-sdk-probe/Scripts/python.exe` exists, startup and packaged smoke also verify the actual Python bridge and tool detection without authentication.

Live acceptance checks use two authorized real Kaggle accounts to verify token creation/revocation, account-specific CLI submissions, parallel jobs, quota and private notebook status. These workflows have not been executed by the automated checks; they require real tokens and consume Kaggle compute when jobs run.

Primary references: [official Kaggle CLI](https://github.com/Kaggle/kaggle-cli), [Kaggle API documentation](https://www.kaggle.com/docs/api), [Kaggle Settings](https://www.kaggle.com/settings). The implementation was checked against locally installed `kaggle 2.2.4` and `kagglesdk 0.1.37`.

</details>
