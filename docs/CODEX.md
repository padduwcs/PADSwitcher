# Dùng Codex với PADSwitcher

[English](#english)

PADSwitcher kết nối Codex trong VS Code, PowerShell và JetBrains AI Assistant với các phiên tài khoản được lưu riêng. Ứng dụng giữ nguyên sandbox, công cụ, bước duyệt và lịch sử do Codex quản lý.

## Thiết lập lần đầu

1. Cài Codex CLI hoặc extension Codex cho VS Code bản Windows. Tuyến kết nối hiện được kiểm chứng với Codex `0.160.0`.
2. Trong PADSwitcher, mở **Dịch vụ → Codex → Tài khoản → Thêm tài khoản** và hoàn tất đăng nhập trong trình duyệt.
3. Chọn tài khoản → **Dùng tài khoản này**.
4. Mở trang **Kết nối** và chọn cách dùng bên dưới.

### VS Code

1. Bấm **Thiết lập VS Code**.
2. Lưu công việc, mở Command Palette và chạy **Developer: Reload Window** một lần.
3. Mở extension Codex. **Đã thiết lập · chờ extension** nghĩa là đường dẫn đã đúng; **Đang kết nối** xác nhận extension đã nối.

Thiết lập tự động áp dụng cho VS Code thông thường và User profile mặc định. Workspace hoặc profile khác có thể ghi đè `chatgpt.cliExecutable`.

### PowerShell hoặc terminal VS Code

Sao chép lệnh tại trang **Kết nối** và chạy trong terminal:

```powershell
& "$env:APPDATA\PADSwitcher\data\gateway\PADCodex.exe"
```

Có thể thêm `resume` để mở lại hội thoại. Lệnh `codex` thông thường dùng đăng nhập riêng; chỉ CLI mở bằng lệnh PADSwitcher mới nhận việc đổi tài khoản.

### JetBrains / Android Studio

1. Cài **AI Assistant** và agent **Codex**, sau đó mở Codex một lần để IDE tải runtime. PADSwitcher hiện hỗ trợ adapter `codex-acp 2.1.1`.
2. Trong PADSwitcher, bật kết nối rồi bấm **Thiết lập JetBrains**.
3. Trong AI Chat, chọn **Codex · PADSwitcher** và mở chat mới. Khởi động lại IDE một lần nếu chưa thấy agent.
4. Kiểm tra trạng thái **Agent → Đang kết nối** trong PADSwitcher.

Thiết lập thêm một agent trong `%USERPROFILE%\.jetbrains\acp.json` và giữ nguyên các agent khác. Muốn quay lại cách dùng thông thường, chọn agent **Codex**; có thể gỡ agent PADSwitcher tại trang **Kết nối**.

## Đổi tài khoản

- **Thủ công:** chọn tài khoản khác → **Dùng tài khoản này**. PADSwitcher đợi lượt đang chạy kết thúc rồi mới đổi.
- **Tự động:** bật **Tự đổi**, chọn ít nhất hai tài khoản cá nhân và đặt ưu tiên. Nếu model trả về lỗi quota đã xác định trước khi có nội dung, cùng yêu cầu được thử một lần trên từng tài khoản dự phòng phù hợp.
- **Tài khoản riêng theo kết nối:** tại trang **Kết nối**, bấm **Tài khoản** trên thẻ VS Code, JetBrains hoặc CLI rồi chọn **Tài khoản riêng**. Mở lại kết nối đó một lần. Sau này có thể quản lý từng nhóm qua **Dùng cho** ở trang Tài khoản.

PADSwitcher không tự phát lại sau khi đã nhận nội dung, lỗi mạng, lỗi không phải quota hoặc kết quả chưa rõ. Trong trường hợp đó, kiểm tra hội thoại, chọn tài khoản phù hợp và tiếp tục thủ công.

## Quota, Say hi và reset

- Hai thanh quota hiển thị phần **còn lại** của cửa sổ ngắn và dài. Dữ liệu cũ được đánh dấu.
- Cập nhật mỗi phút chỉ đọc metadata tài khoản, không gọi model; tác vụ khác có thể trì hoãn một lượt đọc.
- **Say hi** tạo một cuộc trò chuyện ngắn, riêng biệt bằng tài khoản được chọn để bắt đầu chu kỳ quota sớm. Thao tác này tiêu hao một ít quota nhưng không đổi tài khoản đang dùng và không tiêu thụ lượt reset.
- **Say hi tất cả** chạy tuần tự; tài khoản hết quota hoặc cần đăng nhập lại được bỏ qua. Kết quả chưa rõ không được tự gửi lại.
- Chỉ xác nhận trong hộp thoại **Dùng reset** mới tiêu thụ một lượt. Reset không tự tiếp tục hội thoại đã dừng.

Số liệu trong **Cài đặt Codex → Kiểm tra hệ thống → Hoạt động model** là bộ đếm trong tiến trình, không phải hóa đơn quota. Đổi tài khoản trong hội thoại dài có thể làm giảm cache dùng lại.

## Vận hành và giới hạn

- Mở PADSwitcher trước khi dùng kết nối. Nếu VS Code không tự nối lại, chạy Reload Window một lần.
- Khi kết nối đang chạy, nút **X** ẩn ứng dụng vào khay hệ thống; dùng menu khay để thoát hẳn.
- Tự đổi hỗ trợ tài khoản cá nhân Free/Plus/Pro. Tài khoản tổ chức, WSL, SSH/container và Codex cloud chưa được hỗ trợ.
- Phiên được mã hóa bằng Windows DPAPI trong `%APPDATA%\PADSwitcher\data`. Không chia sẻ thư mục này hoặc file gateway.
- Bản portable chưa ký số và chưa có tự cập nhật.

Xem thêm [bảo mật](../SECURITY.md), [ranh giới định tuyến](../ROUTING.md) và [phạm vi kiểm chứng](../VALIDATION.md).

---

<a id="english"></a>

# Using Codex with PADSwitcher

PADSwitcher connects Codex in VS Code, PowerShell, and JetBrains AI Assistant to separately stored account sessions. Codex keeps control of sandboxing, tools, approvals, and conversation history.

## First-time setup

1. Install the Windows Codex CLI or VS Code Codex extension. Routing is currently verified with Codex `0.160.0`.
2. Open **Services → Codex → Accounts → Add account** in PADSwitcher and complete browser sign-in.
3. Select the account → **Use this account**.
4. Open **Connections** and choose a client below.

### VS Code

1. Select **Set up VS Code**.
2. Save your work and run **Developer: Reload Window** once.
3. Open Codex. **Configured · waiting for extension** confirms the path; **Connected** confirms the extension handshake.

Automatic setup targets regular VS Code and its default User profile. A workspace or another profile can override `chatgpt.cliExecutable`.

### PowerShell or a VS Code terminal

Copy the command from **Connections** and run it:

```powershell
& "$env:APPDATA\PADSwitcher\data\gateway\PADCodex.exe"
```

Append `resume` to reopen a conversation. The regular `codex` command uses its own login; only the connected command receives PADSwitcher account changes.

### JetBrains / Android Studio

1. Install **AI Assistant** and the **Codex** agent, then open Codex once so the IDE downloads its runtime. PADSwitcher currently supports `codex-acp 2.1.1`.
2. Start the PADSwitcher connection and choose **Set up JetBrains**.
3. Select **Codex · PADSwitcher** in AI Chat and start a new chat. Restart the IDE once if the agent is missing.
4. Confirm **Agent → Connected** in PADSwitcher.

Setup adds one agent to `%USERPROFILE%\.jetbrains\acp.json` and preserves the others. Select the regular **Codex** agent to return to normal operation; the PADSwitcher agent can be removed from **Connections**.

## Account switching

- **Manual:** select another account → **Use this account**. PADSwitcher waits for active turns to finish.
- **Automatic:** enable **Auto switch**, choose at least two personal accounts, and set their priority. A confirmed quota failure before response output retries the same request once per eligible backup account.
- **Separate client accounts:** select **Account** on the VS Code, JetBrains, or CLI card, then choose **Separate account**. Reopen that client once. Manage each group later with **Use for** on Accounts.

PADSwitcher does not replay after response output, network errors, non-quota errors, or uncertain outcomes. Inspect the conversation, select an available account, and continue manually.

## Quota, Say hi, and resets

- Quota bars show the **remaining** short- and long-window allowance. Stale snapshots are marked.
- Minute refresh reads account metadata only and does not call the model; another operation may delay a poll.
- **Say hi** starts one short, isolated conversation to begin the selected account's quota cycle early. It uses a small amount of quota, preserves active client selections, and never consumes reset credits.
- **Say hi to all** runs sequentially. Exhausted and signed-out accounts are skipped, and uncertain outcomes are not resubmitted.
- Only confirming **Use reset** consumes a credit. A reset does not resume a stopped conversation.

**Codex Settings → Check system → Model activity** contains process-local counters, not billing figures. Changing accounts in a long conversation can reduce cache reuse.

## Operation and limits

- Open PADSwitcher before using a connected client. Reload VS Code once if it does not reconnect.
- While the connection is running, **X** hides the app in the system tray; use the tray menu to quit.
- Automatic switching supports personal Free/Plus/Pro accounts. Organization accounts, WSL, SSH/containers, and Codex cloud are unsupported.
- Sessions are encrypted with Windows DPAPI under `%APPDATA%\PADSwitcher\data`. Do not share this directory or gateway files.
- The portable build is unsigned and has no automatic updater.

See [security](../SECURITY.md), [routing boundaries](../ROUTING.en.md), and [validation scope](../VALIDATION.md).


## Windows 1.20: Codex desktop

**Tiếng Việt:** Mở Kết nối → Codex trong desktop. Lưu công việc và thoát hẳn
desktop lần đầu, chọn tài khoản chung rồi Mở desktop qua PADSwitcher. Chờ trạng
thái Đang kết nối trước khi tiếp tục chat cũ. Giữ nguyên thư mục hội thoại đã có;
chọn thư mục khác chỉ khi desktop đã đóng. Desktop dùng cùng chính sách tự chuyển
với các kết nối Dùng chung, giữ tools/plugin và không thay file đăng nhập gốc.

**English:** Open Connections → Codex in desktop. Save work and fully quit the
existing desktop for the first connection, choose the Shared account and open
desktop through PADSwitcher. Wait for Connected before resuming an existing chat.
Desktop shares the common fallback policy and preserves plugin tools and original
authentication files. Quit desktop before changing its conversation home or
disconnecting. GUI acceptance on a closed ordinary Windows installation remains
manual; see VALIDATION.md for automated native protocol coverage.

Uncertain native recovery is blocked per model step. A new user message, steering
input or completed tool result can continue in the same chat. A new message may
be needed after an interrupted step whose outcome cannot be established.
