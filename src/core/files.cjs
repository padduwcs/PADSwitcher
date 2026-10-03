'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { UserError } = require('./errors.cjs');
async function exists(file) { try { await fs.access(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function assertRegular(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new UserError('Tệp không hợp lệ hoặc đang được liên kết sang vị trí khác.', 'UNSAFE_PATH');
}
async function assertDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new UserError('Thư mục liên kết không được hỗ trợ để bảo vệ dữ liệu.', 'UNSAFE_PATH');
}
async function atomicWrite(file, data) {
  await assertDirectory(path.dirname(file));
  if (await exists(file)) await assertRegular(file);
  const temp = path.join(path.dirname(file), `.pad-${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temp, 'wx', 0o600);
    await handle.writeFile(data); await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temp, file);
  } finally { await handle?.close(); await fs.unlink(temp).catch(() => {}); }
}
function profilePath(root, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new UserError('Mã hồ sơ không hợp lệ.', 'INVALID_PROFILE');
  const result = path.resolve(root, id);
  if (path.dirname(result).toLowerCase() !== path.resolve(root).toLowerCase()) throw new UserError('Đường dẫn hồ sơ không hợp lệ.', 'UNSAFE_PATH');
  return result;
}
async function readLimited(file, max = 1024 * 1024) {
  await assertRegular(file);
  const stat = await fs.stat(file);
  if (stat.size > max) throw new UserError('Tệp lớn bất thường; không thể đọc an toàn.', 'FILE_TOO_LARGE');
  return fs.readFile(file);
}
module.exports = { exists, assertRegular, assertDirectory, atomicWrite, profilePath, readLimited };
