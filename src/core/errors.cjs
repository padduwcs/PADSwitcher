'use strict';
class UserError extends Error {
  constructor(message, code = 'USER_ERROR') { super(message); this.code = code; }
}
function publicError(error) {
  if (error instanceof UserError) return { message: error.message, code: error.code };
  if (error?.code === 'ENOENT') return { message: 'Không tìm thấy tệp hoặc chương trình. Kiểm tra lại trong Cài đặt.', code: 'NOT_FOUND' };
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return { message: 'Windows từ chối truy cập. Kiểm tra quyền thư mục và phần mềm bảo vệ.', code: 'ACCESS_DENIED' };
  return { message: 'Thao tác chưa hoàn tất. Dữ liệu đã lưu vẫn được giữ; hãy thử lại hoặc mở mục Hướng dẫn.', code: 'OPERATION_FAILED' };
}
module.exports = { UserError, publicError };
