'use strict';
// UI preferences are local presentation settings, independent of account sessions.
window.padUI = (() => {
  let language = localStorage.getItem('pad-language') === 'en' ? 'en' : 'vi';
  let theme = localStorage.getItem('pad-theme') || 'light';
  if (!['light','dark'].includes(theme)) theme = 'light';
  const dictionary = {
    'Dùng chung':'Shared','Tài khoản riêng':'Separate account','Dùng cho':'Use for','Chế độ':'Mode','Tài khoản':'Account','Tài khoản cho':'Account for',
    'Tài khoản và tự đổi riêng cho kết nối này.':'Separate account and auto-switch for this connection.',
    'Áp dụng cho các kết nối đang dùng chung.':'Applies to connections using the shared account.',
    'Đã đổi chế độ. Mở lại kết nối này một lần để áp dụng.':'Mode changed. Reopen this connection once to apply it.',
    'Đổi chế độ khi không có lượt đang chạy. Sau đó Reload Window trong VS Code, mở lại chat JetBrains hoặc CLI một lần. Những lần đổi tài khoản tiếp theo không cần mở lại.':'Change mode when no turn is running. Then reload VS Code, reopen JetBrains chat or restart the CLI once. Later account switches do not need a restart.',
    'Tài khoản riêng có danh sách tự đổi riêng. Chọn kết nối ở trang Tài khoản để thiết lập.':'Separate accounts have their own auto-switch list. Select the connection on the Accounts page to configure it.',
    'Cấu hình tài khoản riêng không hợp lệ.':'Separate account configuration is invalid.',
    'Kết nối không hợp lệ.':'Invalid connection.',
    'Bật kết nối Codex trước khi chọn tài khoản riêng.':'Connect Codex before choosing a separate account.',
    'Chờ lượt đang chạy hoàn tất trước khi đổi chế độ kết nối.':'Wait for active turns to finish before changing connection mode.',
    'Một lượt mới vừa bắt đầu. Giữ chế độ hiện tại và thử lại sau.':'A new turn started. The current mode was preserved; try again later.',
    'Chờ thay đổi chế độ kết nối hoàn tất.':'Wait for the connection mode change to finish.',
    'Codex còn yêu cầu đang chạy. Chờ hoàn tất trước khi dừng.':'Codex still has active requests. Wait for completion before disconnecting.',
    'Đã thêm agent. Chọn Codex · PADSwitcher trong AI Chat.':'Agent added. Select Codex · PADSwitcher in AI Chat.',
    'Đã gỡ agent PADSwitcher. Chọn lại Codex bình thường.':'PADSwitcher agent removed. Select your regular Codex agent.',
    'Codex trong Android Studio và JetBrains.':'Codex inside Android Studio and JetBrains.',
    'Cấu hình':'Configuration','Agent':'Agent',
    'Thiết lập JetBrains':'Set up JetBrains','Gỡ kết nối JetBrains':'Remove JetBrains connection','Gỡ agent PADSwitcher':'Remove PADSwitcher agent',
    'Cài Codex trong AI Assistant → Agents, mở một lần.':'Install Codex in AI Assistant → Agents and open it once.',
    'Bấm “Thiết lập JetBrains” bên dưới.':'Select “Set up JetBrains” below.',
    'Trong AI Chat, chọn':'In AI Chat, select','và mở chat mới.':'and start a new chat.',
    'Thiết lập rồi chọn Codex · PADSwitcher trong AI Chat.':'Set up, then select Codex · PADSwitcher in AI Chat.',
    'Bấm Thiết lập JetBrains để sửa runtime bị thiếu.':'Set up JetBrains again to restore missing runtime files.',
    'Chọn Codex · PADSwitcher và mở chat mới. Nếu chưa thấy agent, mở lại IDE.':'Select Codex · PADSwitcher and start a new chat. Restart the IDE if the agent is missing.',
    'Chọn lại Codex bình thường trong AI Chat. Nút bên dưới chỉ gỡ agent Codex · PADSwitcher, giữ các agent và đăng nhập khác.':'Select regular Codex in AI Chat. This removes only Codex · PADSwitcher and keeps other agents and logins.',
    'Bật kết nối Codex trước khi thiết lập JetBrains.':'Connect Codex before setting up JetBrains.',
    'Cài Codex 2.1.1 trong AI Assistant → Agents, mở Codex một lần rồi thiết lập lại. Chưa tìm thấy adapter tương thích trên máy.':'Install Codex ACP 2.1.1 in AI Assistant → Agents, open Codex once, then try again. No compatible adapter was found.',
    'acp.json của JetBrains chưa hợp lệ. Sửa tệp trước khi thiết lập.':'JetBrains acp.json is invalid. Fix it before setup.',
    'Agent Codex · PADSwitcher đã được chỉnh riêng. Giữ nguyên cấu hình hiện tại; đổi tên agent đó trước khi thiết lập.':'Codex · PADSwitcher was customized. Rename that agent before setup to preserve your configuration.',
    'Agent JetBrains đã được bạn chỉnh. PADSwitcher giữ nguyên cấu hình hiện tại.':'The JetBrains agent was customized. PADSwitcher kept your configuration.',
    'Đóng chat Codex · PADSwitcher trong JetBrains trước khi thiết lập lại.':'Close Codex · PADSwitcher chats in JetBrains before setting up again.',
    'Chưa có kết nối JetBrains do PADSwitcher thiết lập.':'No JetBrains connection was set up by PADSwitcher.',
    'Tệp cấu hình JetBrains không khớp bản đã lưu.':'The JetBrains configuration file does not match the saved record.',
    'Thiết lập JetBrains đang chạy. Hãy chờ hoàn tất.':'JetBrains setup is in progress. Wait for completion.',
    'JetBrains vừa thay đổi acp.json. Hãy thiết lập lại.':'JetBrains changed acp.json. Run setup again.',
    'JetBrains vừa thay đổi acp.json. Hãy thử lại.':'JetBrains changed acp.json. Try again.',
    'Bộ định tuyến hiện hỗ trợ tài khoản cá nhân Free, Plus và Pro. Tài khoản tổ chức cần luồng kết nối riêng.':'The router supports personal Free, Plus and Pro accounts. Organization accounts require a separate connection flow.',
    'Bỏ qua tài khoản dự phòng chưa xác định là tài khoản cá nhân.':'Skipped a backup account without a confirmed personal plan.',
    'Tự đổi chỉ hỗ trợ tài khoản cá nhân Free, Plus và Pro đã xác định.':'Auto-switch supports identified personal Free, Plus and Pro accounts only.',
    'Bật “Tự đổi khi hết quota”, chọn ít nhất hai tài khoản và đặt ưu tiên. Lần gọi model bị từ chối vì hết quota sẽ được thử lại bằng tài khoản dự phòng, giữ nguyên ngữ cảnh và kết quả công cụ. Không thêm tin nhắn “tiếp tục”; Codex vẫn giữ quyền phê duyệt thao tác.':'Enable auto-switch, select at least two accounts and set their priorities. A model request rejected for exhausted usage is retried with a backup account and the same context and tool results. No continuation message is added; Codex still controls approvals.',
    'Nếu câu trả lời đã bắt đầu, kết quả chưa rõ hoặc hết tài khoản dự phòng, ứng dụng không tự phát lại. Kiểm tra hội thoại rồi tiếp tục thủ công nếu cần. Dùng nút dừng/Esc trong Codex để ngắt lượt đang chạy.':'No automatic replay after output begins, when the result is uncertain, or when no backup account is available. Check the conversation and continue manually if needed. Stop an active turn in Codex.',
    'Cần Codex 0.160.0 trở lên. Bộ định tuyến dùng provider OpenAI gốc, nối model qua HTTP Responses; các yêu cầu dùng tham chiếu riêng của tài khoản không tự đổi. Background/realtime và cloud jobs không hỗ trợ. Cập nhật Codex có thể cần kiểm tra lại tương thích.':'Requires Codex 0.160.0 or later. The router uses the built-in OpenAI provider over HTTP Responses. Account-specific references are not rotated. Background/realtime and cloud jobs are unsupported. Codex updates may require compatibility checks.',
    'Cần Codex 0.160.0 trở lên cho bộ định tuyến model. Cập nhật extension Codex rồi thử lại.':'The model router requires Codex 0.160.0 or later. Update the Codex extension and try again.',
    'Tự đổi khi hết quota':'Auto-switch on usage limit','Tự đổi tài khoản khi hết quota':'Switch accounts on usage limit',
    'Giữ nguyên yêu cầu đang gửi, thử tài khoản dự phòng. Không thêm tin nhắn vào hội thoại.':'Retry the same request with a backup account. No extra conversation message.',
    'Dùng cho Codex đã kết nối qua PADSwitcher. Không tự phát lại khi câu trả lời đã bắt đầu hoặc kết quả chưa rõ.':'For Codex connected through PADSwitcher. No automatic replay after output begins or when the result is uncertain.',
    'Đã đổi tài khoản và thử lại lần gọi model; không thêm tin nhắn.':'Account switched; retried the model request without an extra message.',
    'Hết quota: đang thử tài khoản dự phòng cho cùng lần gọi model.':'Usage limit reached: retrying the same model request with a backup account.',
    'Không còn tài khoản dự phòng khả dụng.':'No available backup account.',
    'Yêu cầu dùng trạng thái riêng của tài khoản; không tự phát lại.':'Request uses account-specific state; automatic replay was skipped.',
    'Lần gọi model bị lỗi kết nối; không tự phát lại.':'Model connection failed; automatic replay was skipped.',
    'Tài khoản':'Accounts','Kết nối':'Connections','Cài đặt':'Settings','Hướng dẫn':'Help',
    'tài khoản':'accounts','còn quota':'with quota','Thêm tài khoản':'Add account','Tùy chọn tài khoản':'Account options','Lưu tài khoản hiện tại':'Save current account','Ẩn email':'Hide emails','Hiện email':'Show emails',
    'Tìm tài khoản':'Search accounts','Tìm tên hoặc email tài khoản':'Search by name or email','Cập nhật quota':'Refresh usage','Làm mới':'Refresh',
    'Chưa bật kết nối':'Not connected','Đã kết nối Codex':'Codex connected','Đang khởi động Codex…':'Starting Codex…','Đang dừng…':'Stopping…','Kết nối cần khởi động lại':'Connection needs a restart','Chưa sẵn sàng':'Not ready','Đang kết nối':'Connected','Chưa bật':'Not enabled',
    'Tự đổi · Tắt':'Auto-switch · Off','Tự đổi · Bật':'Auto-switch · On','Lịch sử':'History','Hủy lượt chờ':'Cancel pending turn',
    'Thêm tài khoản đầu tiên':'Add your first account','Lưu tài khoản Codex đang dùng hoặc đăng nhập tài khoản khác.':'Save your current Codex account or sign in to another account.','Giữ nguyên phiên Codex đang dùng.':'Your current Codex session is preserved.',
    'Tài khoản đã lưu':'Saved accounts','Chi tiết tài khoản':'Account details','Không tìm thấy tài khoản. Thử tên hoặc email khác.':'No accounts found. Try another name or email.',
    'Kết nối Codex':'Connect Codex','Chọn một tài khoản trong trang Tài khoản để bật kết nối.':'Select an account on the Accounts page to connect.',
    'Extension VS Code':'VS Code extension','Codex trong cửa sổ VS Code.':'Codex inside VS Code.','Cách kết nối':'Setup instructions','Chọn “Thiết lập VS Code” bên dưới.':'Select “Set up VS Code” below.','Lưu công việc trong VS Code.':'Save your work in VS Code.','Mở Command Palette và chạy':'Open the Command Palette and run','một lần.':'once.','Thiết lập VS Code':'Set up VS Code',
    'Codex trong terminal PowerShell.':'Codex in your PowerShell terminal.','Sao chép lệnh bên dưới.':'Copy the command below.','Dán vào terminal':'Paste into a','và chạy.':'terminal and run it.','Làm việc như bình thường với Codex.':'Continue working with Codex as usual.','Sao chép lệnh':'Copy command','Mở CLI':'Open CLI','Dừng kết nối':'Disconnect',
    'Gỡ kết nối VS Code':'Remove VS Code connection','Trả lại đường dẫn Codex trước khi thiết lập. Sau đó Reload Window để áp dụng.':'Restore the previous Codex path, then Reload Window to apply.','Khôi phục cấu hình VS Code trước':'Restore previous VS Code settings',
    'Giao diện':'Appearance','Chọn cách PADSwitcher hiển thị.':'Make PADSwitcher your own.','Chế độ':'Theme','Sáng':'Light','Tối':'Dark','Ngôn ngữ':'Language','Tiếng Việt':'Vietnamese','Đổi ngôn ngữ':'Change language','Đổi giao diện sáng tối':'Toggle light and dark theme',
    'Không gian làm việc':'Workspace','Thư mục mở CLI':'CLI working folder','Chọn thư mục':'Choose folder','Cập nhật quota mỗi phút':'Refresh usage every minute','Cấu hình Codex nâng cao':'Advanced Codex settings','Tự tìm Codex đã cài':'Detect installed Codex','Chọn':'Browse','Thư mục Codex dùng chung':'Shared Codex folder','Giữ mặc định nếu bạn không dùng cấu hình Codex riêng.':'Keep the default unless you use a custom Codex configuration.','Lưu cài đặt':'Save settings',
    'Kiểm tra kết nối':'Connection check','Kiểm tra hệ thống':'Check system','Khôi phục & dữ liệu':'Recovery & data','Khôi phục tài khoản đã xóa':'Restore deleted accounts','Khôi phục đăng nhập chưa lưu':'Recover unsaved sign-in','Mở thư mục dữ liệu':'Open data folder','Nếu từng dùng cách đổi phiên chung: đóng Codex và IDE trước khi khôi phục phiên.':'If you used shared-session switching, close Codex and your IDE before restoring.','Khôi phục phiên dùng chung':'Restore shared session',
    'Bắt đầu với PADSwitcher':'Getting started','Từ tài khoản đầu tiên đến công việc hằng ngày.':'From your first account to everyday work.','Lưu tài khoản':'Save accounts','Lưu tài khoản Codex hiện tại hoặc thêm tài khoản khác qua trang đăng nhập OpenAI.':'Save your current Codex account or add another through the OpenAI sign-in page.',
    'Chọn tài khoản → “Dùng tài khoản này”. Mở trang Kết nối và làm theo hướng dẫn cho extension hoặc CLI.':'Select an account → “Use this account”. Open Connections and follow the instructions for your extension or CLI.','Mở trang Kết nối ↗':'Open Connections ↗','Làm việc như thường':'Work as usual','Đổi tài khoản khi cần, hoặc bật tự đổi khi hết quota. Giữ hội thoại và cửa sổ Codex đang mở.':'Switch accounts as needed or enable automatic switching when usage runs out. Keep your conversation and Codex window open.',
    'Những điều bạn cần biết':'Good to know','Khi hết quota, công việc tiếp tục thế nào?':'How does work continue when usage runs out?',
    'Bật “Tự đổi khi hết quota” trên trang Tài khoản, chọn ít nhất hai tài khoản và đặt thứ tự ưu tiên. Khi Codex báo hết quota, PADSwitcher chờ các lượt khác kết thúc, đổi tài khoản rồi gửi lời nhắc tiếp tục trong cùng hội thoại. Không gửi lại toàn bộ yêu cầu ban đầu; Codex vẫn có thể yêu cầu bạn duyệt thao tác.':'Enable auto-switching on Accounts, choose at least two accounts and set their priority. When Codex reports a usage limit, PADSwitcher waits for other turns to finish, switches accounts and sends a continuation in the same conversation. The original request is not replayed; Codex may still ask you to approve actions.',
    'Nếu hết tài khoản dự phòng hoặc trạng thái công cụ chưa rõ, ứng dụng sẽ dừng và báo lý do. “Hủy lượt chờ” chỉ hủy phần còn chờ; dùng nút dừng/Esc trong Codex để ngắt lượt đã chạy.':'If no backup account is available or tool state is uncertain, the app stops and explains why. “Cancel pending turn” cancels queued work; use Stop/Esc in Codex to interrupt a turn already running.',
    'Có cần giữ PADSwitcher mở không?':'Does PADSwitcher need to stay running?',
    'Có. Khi kết nối đang bật, nút × thu ứng dụng xuống khay hệ thống. Thoát ứng dụng hoặc dừng kết nối sẽ ngắt Codex đang đi qua PADSwitcher. Mở lại ứng dụng trước khi dùng; nếu extension chưa kết nối lại, chạy Developer: Reload Window.':'Yes. While connected, × minimizes the app to the system tray. Quitting or disconnecting interrupts Codex connections through PADSwitcher. Open the app before working; if the extension does not reconnect, run Developer: Reload Window.',
    'CLI trong terminal VS Code có dùng được không?':'Can I use the CLI in a VS Code terminal?',
    'Có. Chạy lệnh lấy từ trang Kết nối trong PowerShell của VS Code. Lệnh codex thông thường vẫn dùng phiên riêng và không tự đổi theo PADSwitcher. Mọi kết nối qua PADSwitcher cùng dùng tài khoản đang chọn.':'Yes. Run the command from Connections in VS Code’s PowerShell terminal. A regular codex command uses its own session and does not switch with PADSwitcher. All PADSwitcher connections share the selected account.',
    'Quota và dữ liệu của tôi':'Usage and your data',
    'Thanh quota hiển thị phần còn lại. Dữ liệu cũ hoặc lỗi cập nhật được đánh dấu; dùng “Cập nhật quota” để kiểm tra lại. Phiên đăng nhập được mã hóa trên Windows, không gửi vào giao diện hay log. Chọn tài khoản qua kết nối không thay phiên đăng nhập Codex dùng chung.':'Usage bars show the remaining allowance. Outdated data or refresh errors are marked; select Refresh to check again. Sign-in sessions are encrypted on Windows and excluded from the UI and logs. Switching the connected account does not replace your shared Codex sign-in.',
    'Giới hạn và các cách dùng riêng':'Limitations and separate sessions',
    'Tự đổi hỗ trợ các lượt hội thoại thông thường của extension/CLI qua PADSwitcher. Review, hội thoại tạm, background/realtime, lỗi mạng và cloud jobs không tự tiếp tục. Kết nối WebSocket của Codex còn experimental; cập nhật Codex có thể cần kiểm tra lại tương thích.':'Auto-switching supports regular extension/CLI turns through PADSwitcher. Reviews, temporary conversations, background/realtime turns, network failures and cloud jobs do not automatically continue. Codex’s WebSocket connection is experimental; compatibility may need checking after updates.',
    'Trong chi tiết tài khoản, “Tùy chọn tài khoản → Nâng cao” giữ các lựa chọn cũ: đổi phiên dùng chung cần đóng Codex/IDE; CLI riêng giữ hội thoại riêng từng tài khoản. Hai cách này không dùng tự đổi.':'Account options → Advanced keeps the legacy choices: shared-session switching requires closing Codex/your IDE; private CLI sessions keep separate conversations per account. Neither supports auto-switching.',
    'Lượt reset dùng thế nào?':'How do earned resets work?',
    'Trong chi tiết tài khoản, xem số lượt reset và hạn dùng nếu Codex cung cấp. Bấm Dùng reset rồi xác nhận để dùng một lượt cho đúng tài khoản đó. PADSwitcher không tự dùng reset khi đổi tài khoản. Reset không tự gửi lời nhắc tiếp tục; quay lại hội thoại Codex và nhắn tiếp tục nếu lượt trước đã dừng.':'Account details show earned resets and expiry dates when Codex provides them. Select Use reset and confirm to redeem one for that account. Switching never automatically uses resets. A reset does not send a continuation; return to your Codex conversation and ask it to continue if the previous turn stopped.',
    'Hủy':'Cancel','Tiếp tục':'Continue','Đóng':'Close','Đóng thông báo':'Dismiss notification','Hoàn tất đăng nhập trên OpenAI':'Finish signing in on OpenAI','Chọn tài khoản bạn muốn thêm trong trình duyệt.':'Choose the account you want to add in your browser.','Hủy đăng nhập':'Cancel sign-in',
    'Chưa xác định':'Unknown','Chưa cập nhật':'Not refreshed','Cập nhật vừa xong':'Just refreshed','Dữ liệu cũ':'Outdated data','Tài khoản ChatGPT':'ChatGPT account','Chờ lượt xong':'Switch queued','Đang dùng':'In use','CLI đang mở':'CLI running','Cần đăng nhập':'Sign-in needed','Cập nhật để xem quota':'Refresh to see usage','Quota còn lại':'Remaining usage','Chưa có dữ liệu quota.':'Usage data is not available.','Chưa có dữ liệu quota':'Usage data is not available','Đang sử dụng':'Currently in use','Dùng tài khoản này':'Use this account','Sửa tên':'Edit name','Đăng nhập lại':'Sign in again','Xóa':'Remove','Làm mới quota tài khoản này':'Refresh this account','Nâng cao':'Advanced','Nguồn: dịch vụ Codex':'Source: Codex service','Phiên dùng chung hiện tại':'Current shared session','Đổi phiên chung · cần đóng Codex':'Switch shared session · close Codex first','CLI riêng đang mở':'Private CLI running','Mở CLI riêng':'Open private CLI','Tiếp tục CLI riêng':'Resume private CLI','Chưa có thời gian đặt lại':'Reset time unavailable',
    'Chưa chọn tài khoản':'No account selected','Chọn tài khoản để bắt đầu':'Select an account to start','Cập nhật để xem trạng thái':'Refresh to check availability','Đang xử lý…':'Working…','Chọn tài khoản bên dưới → Dùng tài khoản này.':'Select an account below → Use this account.','Thêm một tài khoản dự phòng để bật tự đổi.':'Add a backup account to enable auto-switching.','Chọn tài khoản dự phòng để công việc tiếp tục.':'Choose backup accounts to keep working.','Chọn đúng tài khoản trên trình duyệt. Phiên hiện tại vẫn được giữ.':'Choose the correct account in your browser. Your current session is preserved.',
    'Lượt reset':'Earned resets','Dùng reset':'Use reset','Kiểm tra reset':'Check reset','Chưa có dữ liệu':'Not available','Không có lượt reset':'No resets available','Không có hạn dùng':'No expiry date','Chỉ biết số lượt; Codex chưa cung cấp chi tiết.':'Codex provided a count without individual details.','Một lần dùng sẽ tiêu thụ 1 lượt reset của tài khoản này.':'This will redeem 1 earned reset for this account.','Dùng một lượt reset?':'Use one earned reset?','Xác nhận dùng reset':'Confirm reset','Kiểm tra lần reset trước?':'Check the previous reset?',
    'Lần trước chưa rõ kết quả. Kiểm tra lại với cùng mã yêu cầu để tránh dùng thêm lượt.':'The previous result is uncertain. Check with the same request ID to avoid redeeming another reset.','Reset không tự chạy lại lượt hội thoại đã dừng.':'A reset does not restart a stopped conversation.','Reset đã dùng. Quay lại Codex và nhắn tiếp tục nếu cần.':'Reset redeemed. Return to Codex and ask it to continue if needed.','Lần reset này đã hoàn tất trước đó. Không dùng thêm lượt.':'This reset was already redeemed. No additional reset was used.','Chưa có giới hạn nào đủ điều kiện reset.':'No usage window is currently eligible for a reset.','Tài khoản không còn lượt reset.':'This account has no earned resets left.','Kết quả đã có; cần làm mới quota.':'Result received; refresh usage to update the display.','Reset':'Reset','Lần reset đang chờ xác định kết quả.':'A previous reset is awaiting confirmation.',
    'Sửa hồ sơ':'Edit account','Tên dễ nhớ':'Display name','Ghi chú':'Notes','Lưu thay đổi':'Save changes','Xóa khỏi danh sách?':'Remove this account?','Xóa hồ sơ':'Remove account','Dùng cho desktop':'Use with desktop','Chuyển tài khoản':'Switch account','Đã chuyển phiên':'Session switched','Mở Codex desktop':'Open Codex desktop','Thêm tài khoản':'Add account','Tên dễ nhớ (tùy chọn)':'Display name (optional)','Ví dụ: Cá nhân · Plus':'For example: Personal · Plus','Dùng mã thiết bị nếu đăng nhập trình duyệt lỗi':'Use a device code if browser sign-in fails','PADSwitcher không nhận mật khẩu. Mã thiết bị cần được bật trong cài đặt bảo mật ChatGPT.':'PADSwitcher never receives your password. Enable device-code sign-in in ChatGPT security settings.','Mở trang OpenAI':'Open OpenAI sign-in','tài khoản bạn muốn thêm':'the account you want to add',
    'Tự đổi khi hết quota':'Auto-switch when usage runs out','Tự đổi và tiếp tục hội thoại':'Switch and continue automatically','Thêm ít nhất hai tài khoản để bật tính năng này.':'Add at least two accounts to enable this feature.','Chọn ít nhất hai tài khoản. Số ưu tiên nhỏ được thử trước; tài khoản hết quota sẽ được bỏ qua.':'Select at least two accounts. Lower priority numbers are tried first; depleted accounts are skipped.','Tài khoản dự phòng':'Backup accounts','Ưu tiên':'Priority','Dùng cho Codex đã kết nối qua PADSwitcher. Nếu không thể tiếp tục an toàn, ứng dụng sẽ dừng và báo lý do.':'For Codex connected through PADSwitcher. If work cannot safely continue, the app stops and explains why.','Lưu thiết lập':'Save setup','Ưu tiên phải là số từ 1 đến 200.':'Priority must be a number from 1 to 200.','Lịch sử tự đổi':'Auto-switch history','Chưa có lần tự đổi nào trong phiên này.':'No switches in this session.',
    'Dừng kết nối Codex?':'Disconnect Codex?','CLI và extension qua PADSwitcher sẽ mất kết nối. Để bật lại, chọn một tài khoản rồi bấm “Dùng tài khoản này”.':'CLI and extension sessions through PADSwitcher will disconnect. To reconnect, select an account and choose “Use this account”.',
    'Không kết nối được PADSwitcher. Hãy mở lại ứng dụng.':'Cannot connect to PADSwitcher. Reopen the app.','Đã cập nhật quota.':'Usage refreshed.','Đã lưu hồ sơ.':'Account saved.','Đã chuyển hồ sơ vào trash.':'Account moved to local trash.','Đã lưu tài khoản hiện tại.':'Current account saved.','Đã lưu phiên đăng nhập được mã hóa.':'Encrypted sign-in session saved.','Đã lưu cài đặt.':'Settings saved.','Đã cập nhật các hồ sơ có thể kết nối. Xem chi tiết hồ sơ bị lỗi.':'Reachable accounts refreshed. Check account details for any errors.','Đã cập nhật quota các tài khoản.':'All accounts refreshed.','Sẽ chuyển khi lượt đang chạy hoàn tất.':'The account will switch when the current turn finishes.','Đã lưu cấu hình tự đổi tài khoản.':'Auto-switch settings saved.','Đã mở Codex CLI qua PADSwitcher.':'Codex CLI opened through PADSwitcher.','Đã sao chép. Dán lệnh vào terminal PowerShell của VS Code.':'Copied. Paste into your VS Code PowerShell terminal.','Đã thiết lập. Lưu công việc và Reload Window một lần trong VS Code.':'Setup complete. Save your work and Reload Window once in VS Code.',
    'Trước khi chuyển desktop':'Before switching desktop','Cần đóng:':'Close:','Không phát hiện ứng dụng dùng Codex đang chạy.':'No running Codex applications detected.','Kho dữ liệu riêng':'Private data folder','Có phiên đăng nhập chưa lưu. Dùng Khôi phục đăng nhập bên dưới.':'An unsaved sign-in exists. Use Recover unsaved sign-in below.',
    'Khôi phục phiên trước':'Restore previous session','Khôi phục':'Restore','Khôi phục hồ sơ đã xóa':'Restore removed account','Chọn hồ sơ để đưa lại vào danh sách tài khoản.':'Choose an account to return to your account list.','Hồ sơ trong trash':'Accounts in local trash','Khôi phục hồ sơ':'Restore account','Chưa có hồ sơ nào trong trash.':'Local trash is empty.',
    'Lần đổi phiên trước chưa hoàn tất. Mở Cài đặt → Khôi phục & dữ liệu để kiểm tra.':'The previous session switch did not finish. Open Settings → Recovery & data to check.'
  };
  Object.assign(dictionary,{
    'VS Code · Đang kiểm tra':'VS Code · Checking','VS Code · Đang kết nối':'VS Code · Connected','VS Code · Chưa rõ cấu hình':'VS Code · Configuration unknown','VS Code · Chưa thiết lập':'VS Code · Setup needed','VS Code · Kết nối đã dừng':'VS Code · Connection stopped','VS Code · Chờ extension':'VS Code · Waiting for extension',
    'Cấu hình VS Code':'VS Code configuration','Extension':'Extension','Đã thiết lập':'Configured','Chưa thiết lập':'Not configured','Chưa kết nối':'Not connected','Kết nối đã dừng':'Connection stopped','Đang kiểm tra':'Checking','Không đọc được cấu hình':'Configuration unavailable',
    'Extension đã kết nối qua PADSwitcher.':'The extension is connected through PADSwitcher.','Mở trang Kết nối để kiểm tra VS Code.':'Open Connections to check VS Code.','Kiểm tra settings.json của VS Code rồi mở lại PADSwitcher.':'Check VS Code settings.json, then reopen PADSwitcher.','Bấm Thiết lập VS Code rồi Reload Window một lần.':'Select Set up VS Code, then Reload Window once.','Chọn tài khoản → Dùng tài khoản này để bật kết nối.':'Select an account → Use this account to connect.','Chọn tài khoản để tạo lại cầu nối, rồi Reload Window.':'Select an account to restore the bridge, then Reload Window.','Mở extension Codex. Nếu vẫn chưa kết nối, lưu công việc rồi chạy Developer: Reload Window.':'Open the Codex extension. If it does not connect, save your work and run Developer: Reload Window.',
    'Kiểm tra cài đặt User của VS Code bản thường, hồ sơ mặc định.':'Checks User settings in regular VS Code with the default profile.','Chưa có CLI kết nối':'No CLI connected',
    'Bạn đã thao tác trên hội thoại; tự tiếp tục đã được hủy.':'You changed this conversation; automatic continuation was cancelled.',
    'Không lưu được thời gian chờ quota.':'Could not save the usage cooldown.',
    'Có quá nhiều hội thoại chờ; hãy tiếp tục thủ công.':'Too many queued conversations; continue manually.',
    'Hết quota: đang chờ các lượt khác kết thúc để đổi tài khoản.':'Usage limit reached: waiting for other turns to finish before switching accounts.',
    'Không tự tiếp tục được. Kiểm tra kết nối rồi nhắn tiếp trong Codex.':'Could not continue automatically. Check your connection, then continue in Codex.',
    'Đã chờ hơn 2 phút. Hãy đổi tài khoản và tiếp tục thủ công.':'Waited more than 2 minutes. Switch accounts and continue manually.',
    'Trạng thái hội thoại chưa đủ rõ để tự tiếp tục. Kiểm tra Codex rồi nhắn tiếp.':'Conversation state is unclear. Check Codex and continue manually.',
    'Đã chờ hơn 2 phút. Hãy tiếp tục thủ công.':'Waited more than 2 minutes. Continue manually.',
    'Đang tự chuyển sang tài khoản dự phòng.':'Switching to a backup account.',
    'Không đăng nhập được tài khoản dự phòng; thử tài khoản tiếp theo.':'Could not sign in to this backup; trying the next account.',
    'Không còn tài khoản dự phòng khả dụng. Cập nhật quota hoặc đăng nhập lại rồi tiếp tục thủ công.':'No backup account is available. Refresh usage or sign in again, then continue manually.',
    'Đã chuyển tài khoản nhưng vượt thời gian chờ; hãy nhắn tiếp trong Codex.':'Account switched after the timeout; continue manually in Codex.',
    'Đã đổi tài khoản và gửi lượt tiếp tục trong cùng hội thoại.':'Account switched and continuation sent in the same conversation.',
    'Hội thoại đã thay đổi; đã hủy tự tiếp tục.':'Conversation changed; automatic continuation cancelled.',
    'Không tự tiếp tục được. Kiểm tra Codex và nhắn tiếp trong hội thoại.':'Could not continue automatically. Check Codex and continue in the conversation.',
    '1 tuần':'1 week','1 ngày':'1 day','1 giờ':'1 hour','1 phút':'1 minute',
    'Trình duyệt sẽ mở trang đăng nhập chính thức của OpenAI. Chọn tài khoản bạn muốn thêm.':'Your browser will open the official OpenAI sign-in page. Choose the account you want to add.',
    'Xem lượt reset':'View resets','Giới hạn chính':'Primary limit','Giới hạn bổ sung':'Secondary limit',
    'Điều hướng chính':'Main navigation','Logo PADSwitcher':'PADSwitcher logo',
    'Trình duyệt sẽ mở trang đăng nhập chính thức của OpenAI. Chọn':'Your browser will open the official OpenAI sign-in page. Choose',
    'Chuyển sang':'Switch to','Hồ sơ':'Account','sẽ được chuyển vào thư mục trash trên máy. Tài khoản OpenAI vẫn giữ nguyên.':'will be moved to local trash. Your OpenAI account is preserved.',
    'Không thể xóa hồ sơ đang dùng cho desktop hoặc đang mở CLI.':'You cannot remove an account used by desktop or a running private CLI.',
    'Kết thúc tác vụ và thoát Codex/ChatGPT cùng IDE đang dùng Codex trước khi chuyển. Phiên trước được lưu để khôi phục; lịch sử và cấu hình được giữ nguyên.':'Finish your tasks and close Codex/ChatGPT and any IDE using Codex before switching. The previous session is saved for recovery; history and settings are preserved.',
    'Đã đổi phiên. Mở lại desktop và kiểm tra tài khoản đang hiển thị.':'Session switched. Reopen desktop and check the account shown.',
    'Mở Codex desktop để tiếp tục. Kiểm tra tên tài khoản trong ứng dụng trước khi gửi yêu cầu mới.':'Open Codex desktop to continue. Check the account name before sending a new request.',
    'Đã mở CLI. Đóng cửa sổ CLI khi xong để khóa lại phiên.':'CLI opened. Close its window when finished to lock the session again.',
    'Đã mở bộ chọn hội thoại CLI.':'CLI conversation picker opened.',
    'Khôi phục tài khoản trước lần chuyển desktop gần nhất. Hãy thoát Codex/ChatGPT và IDE đang dùng Codex trước khi tiếp tục.':'Restore the account from before the most recent desktop switch. Close Codex/ChatGPT and any IDE using Codex first.',
    'Đã khôi phục phiên desktop trước. Mở lại Codex để kiểm tra.':'Previous desktop session restored. Reopen Codex to check.',
    'Đã lưu lại phiên đăng nhập còn tồn.':'Unsaved sign-in recovered.',
    'Kết nối VS Code':'Connect VS Code',
    'PADSwitcher sẽ đặt đường dẫn Codex của extension trong cài đặt User của VS Code. Giá trị trước được giữ để khôi phục.':'PADSwitcher will set the extension’s Codex path in VS Code User settings. The previous value is saved for recovery.',
    'Áp dụng cho VS Code bản thường, hồ sơ mặc định. Sau lần thiết lập này, lưu công việc rồi chạy “Developer: Reload Window” một lần trong VS Code. Giữ gateway bật khi dùng extension; đổi tài khoản tiếp theo không cần tải lại cửa sổ.':'For regular VS Code with the default profile. After setup, save your work and run Developer: Reload Window once. Keep the connection running while using the extension; later account switches do not require reloading.',
    'Đã khôi phục đường dẫn Codex trước. Reload Window để áp dụng.':'Previous Codex path restored. Reload Window to apply.',
    'Đã hủy tự tiếp tục đang chờ. Lượt đã chạy vẫn do Codex điều khiển.':'Pending continuation cancelled. Codex still controls turns already running.',
    'Đã khôi phục hồ sơ.':'Account restored.',
    'BẢN XEM TRƯỚC · DỮ LIỆU MẪU':'PREVIEW · SAMPLE DATA'
  });
  Object.assign(dictionary, {
    'API token không hợp lệ. Dùng token được tạo trong cài đặt Kaggle.':'Invalid API token. Use a token created in Kaggle settings.',
    'Token Kaggle đã hết hạn hoặc bị thu hồi. Cập nhật token của tài khoản này.':'Your Kaggle token expired or was revoked. Update this account’s token.',
    'Token thuộc tài khoản Kaggle khác. Chưa thay thông tin đã lưu.':'This token belongs to another Kaggle account. Saved credentials were not replaced.',
    'Kaggle từ chối quyền truy cập thông tin này.':'Kaggle denied access to this information.',
    'Không tìm thấy notebook Kaggle hoặc bạn chưa có quyền xem.':'Notebook not found or this account cannot access it.',
    'Kaggle đang giới hạn yêu cầu. Chờ trước khi làm mới lại.':'Kaggle is rate limiting requests. Wait before refreshing again.',
    'Không đọc được Kaggle. Kiểm tra mạng rồi thử lại.':'Could not read Kaggle. Check your connection and try again.',
    'Kaggle trả về dữ liệu chưa hỗ trợ. Kiểm tra phiên bản công cụ.':'Unsupported Kaggle response. Check your tool versions.',
    'Cần Python 3.11+, kaggle 2.2.4+ và kagglesdk 0.1.37+. Mở Thiết lập Kaggle.':'Requires Python 3.11+, kaggle 2.2.4+ and kagglesdk 0.1.37+. Open Kaggle setup.',
    'Không chạy được Python. Chọn python.exe trong Thiết lập Kaggle.':'Could not run Python. Choose python.exe in Kaggle setup.',
    'Đọc Kaggle quá lâu. Thông tin cũ được giữ; hãy thử lại sau.':'Kaggle refresh timed out. Previous data was retained. Try again later.',
    'Dùng đường dẫn notebook trên kaggle.com.':'Use a notebook URL on kaggle.com.',
    'Nhập notebook dạng username/notebook-slug hoặc URL Kaggle.':'Enter username/notebook-slug or a Kaggle notebook URL.',
    'Không tìm thấy tài khoản Kaggle.':'Kaggle account not found.',
    'Một thao tác Kaggle khác đang chạy.':'Another Kaggle operation is running.',
    'Chờ cập nhật Kaggle hoàn tất.':'Wait for the Kaggle refresh to finish.',
    'Chọn thư mục làm việc tuyệt đối.':'Choose an absolute workspace folder.',
    'Tài khoản Kaggle này đã được thêm. Dùng Cập nhật token.':'This account is already saved. Use Update token.',
    'Đã đạt giới hạn 100 tài khoản đã lưu.':'The limit of 100 saved accounts has been reached.',
    'Cấu hình Kaggle không hợp lệ.':'Invalid Kaggle settings.',
    'Theo dõi tối đa 20 notebook ghim cho mỗi tài khoản.':'Monitor up to 20 pinned notebooks per account.',
    'Dữ liệu Kaggle bị lỗi. Giữ thư mục dữ liệu để kiểm tra.':'Kaggle storage is invalid. Keep the data folder for inspection.'
  });
  const patterns = [
    [/^Cập nhật (\d+) phút trước · Dữ liệu cũ$/, 'Updated $1 minutes ago · Outdated data'],
    [/^Cập nhật (\d+) giờ trước · Dữ liệu cũ$/, 'Updated $1 hours ago · Outdated data'],
    [/^Cập nhật (\d+) ngày trước · Dữ liệu cũ$/, 'Updated $1 days ago · Outdated data'],
    [/^Cập nhật vừa xong · Dữ liệu cũ$/, 'Just refreshed · Outdated data'],
    [/^Chưa cập nhật · Dữ liệu cũ$/, 'Not refreshed · Outdated data'],
    [/^(\d+(?:\.\d+)?) tuần$/, '$1 weeks'],[/^(\d+(?:\.\d+)?) ngày$/, '$1 days'],[/^(\d+(?:\.\d+)?) giờ$/, '$1 hours'],[/^(\d+) phút$/, '$1 minutes'],
    [/^Cập nhật (\d+) phút trước$/, 'Updated $1 minutes ago'],[/^Cập nhật (\d+) giờ trước$/, 'Updated $1 hours ago'],[/^Cập nhật (\d+) ngày trước$/, 'Updated $1 days ago'],
    [/^Đặt lại (.+)$/, 'Resets $1'],[/^Hết hạn (.+)$/, 'Expires $1'],[/^(\d+) lượt$/, '$1 available'],[/^(\d+) kết nối · (\d+) lượt đang chạy(.*)$/, '$1 connections · $2 active turns$3'],
    [/^ · Sẽ dùng (.+) khi lượt hiện tại xong$/, ' · Switching to $1 after the current turn'],
    [/^(\d+) tài khoản theo thứ tự ưu tiên. Thử lại lần gọi bị hết quota.$/, '$1 accounts in priority order. Retries quota-rejected requests.'],
    [/^(\d+)\/(\d+) hồ sơ có dữ liệu mới$/, '$1/$2 accounts with fresh data'],[/^Cập nhật gần nhất (.+)$/, 'Last refreshed $1'],[/^Đang dùng (.+)\.$/, 'Now using $1.'],[/^Đang dùng (.+). Chọn cách bạn dùng Codex bên dưới.$/, 'Using $1. Choose your Codex setup below.'],
    [/^Thiết lập tự đổi khi hết quota: đang bật$/, 'Usage auto-switch settings: enabled'],[/^Thiết lập tự đổi khi hết quota: đang tắt$/, 'Usage auto-switch settings: disabled'],[/^Ưu tiên (.+)$/, 'Priority for $1'],[/^(.+): (\d+)% còn lại$/, '$1: $2% remaining'],[/^: (\d+)% đã dùng$/, ': $1% used'],[/^(\d+)% đã dùng$/, '$1% used'],
    [/^Mã thiết bị: (.+) · Nhập mã trên trang OpenAI vừa mở.$/, 'Device code: $1 · Enter it on the OpenAI page.']
  ];
  function translate(raw) {
    if (language === 'vi') return raw;
    const s=String(raw), trim=s.trim();
    let value=dictionary[trim];
    if (value === undefined) { for(const [pattern,replacement] of patterns) if(pattern.test(trim)){value=trim.replace(pattern,replacement);break;} }
    if (value === undefined) return s;
    return s.slice(0,s.indexOf(trim))+value+s.slice(s.indexOf(trim)+trim.length);
  }
  const originals = new WeakMap();
  function apply(root = document.body) {
    if (!root) return;
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walk.nextNode())) {
      if (['SCRIPT','STYLE','TEXTAREA'].includes(node.parentElement?.tagName) || node.parentElement?.closest('[data-literal]')) continue;
      let entry=originals.get(node);
      if(!entry || node.nodeValue!==entry.output) entry={source:node.nodeValue};
      entry.output=translate(entry.source);node.nodeValue=entry.output;originals.set(node,entry);
    }
    for(const el of root.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
      let entries=originals.get(el)||{};
      for(const attr of ['title','placeholder','aria-label','alt'])if(el.hasAttribute(attr)){
        let entry=entries[attr];const value=el.getAttribute(attr);
        if(!entry||value!==entry.output)entry={source:value};
        entry.output=translate(entry.source);el.setAttribute(attr,entry.output);entries[attr]=entry;
      }
      originals.set(el,entries);
    }
  }
  function update() {document.documentElement.lang=language;document.documentElement.dataset.theme=theme;}
  update();
  return {get language(){return language;},get theme(){return theme;},t:translate,apply,
    setLanguage(value){language=value==='en'?'en':'vi';localStorage.setItem('pad-language',language);update();},
    setTheme(value){theme=value==='dark'?'dark':'light';localStorage.setItem('pad-theme',theme);update();},
    error(error){return language==='vi'?error.message:translate(error.message)!==error.message?translate(error.message):({RESET_UNCERTAIN:'The reset result is uncertain. Check the same attempt again to avoid using another reset.',RESET_STALE:'This reset confirmation is outdated. Open it again.',RESET_UNAVAILABLE:'Reset data is unavailable. Update Codex and refresh.',RESET_NO_CREDIT:'This account has no resets left.',BUSY:'Another operation is running. Please wait.',AUTH_INVALID:'Your sign-in expired. Sign in to this account again.',CODEX_RPC_ERROR:'Codex could not complete the request. Check your sign-in, connection and Codex version.',DESKTOP_RUNNING:'Close Codex/ChatGPT and Code.exe before switching the shared session.'}[error.code]||'The operation did not finish. Your saved data is preserved. Please try again.');}
  };
})();
