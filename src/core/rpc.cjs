'use strict';
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const { UserError } = require('./errors.cjs');
class CodexRpc {
  constructor(executable, home, options = {}) {
    const env = { ...process.env, CODEX_HOME: home };
    for (const name of ['CODEX_SQLITE_HOME','CODEX_ACCESS_TOKEN','CODEX_API_KEY','OPENAI_API_KEY','ACCESS_TOKEN','OPENAI_IDENTITY_TOKEN_FILE','OPENAI_WORKSPACE_ID','OPENAI_FEDERATION_RULE_ID']) delete env[name];
    this.child = (options.spawn || spawn)(executable, ['app-server', '--listen', 'stdio://', ...(options.fileStore ? ['-c', 'cli_auth_credentials_store="file"'] : [])], { env, cwd: home, stdio: ['pipe','pipe','pipe'], windowsHide: true });
    this.pending = new Map(); this.listeners = new Set(); this.sequence = 0; this.closed = false;
    this.child.stderr.resume(); this.child.stdin.on('error', () => {});
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on('line', line => this.receive(line));
    this.child.on('error', () => this.fail(new UserError('Không khởi chạy được Codex. Kiểm tra codex.exe trong Cài đặt.', 'CODEX_START_FAILED')));
    this.child.on('close', () => this.fail(new UserError('Kết nối Codex đã đóng. Hãy thử lại.', 'RPC_CLOSED')));
  }
  receive(line) {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.id != null && !message.method) {
      const entry = this.pending.get(message.id); if (!entry) return;
      this.pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new UserError('Codex chưa thực hiện được yêu cầu. Phiên có thể đã hết hạn, dịch vụ đang lỗi hoặc phiên bản chưa hỗ trợ.', 'CODEX_RPC_ERROR'));
      else entry.resolve(message.result);
    } else if (message.method && message.id != null) {
      // This client never runs inference; refuse unsolicited tool requests.
      this.send({ id: message.id, error: { code: -32601, message: 'Method not supported by PADSwitcher' } });
    } else if (message.method) {
      for (const callback of this.listeners) callback(message.method, message.params || {});
    }
  }
  send(message) { if (!this.closed) this.child.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params = {}, timeout = 25000) {
    if (this.closed) return Promise.reject(new UserError('Kết nối Codex đã đóng.', 'RPC_CLOSED'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new UserError('Codex phản hồi quá lâu. Kiểm tra kết nối mạng rồi thử lại.', 'RPC_TIMEOUT')); }, timeout);
      this.pending.set(id, { resolve,reject,timer }); this.send({ id,method,params });
    });
  }
  async initialize({experimentalApi = false} = {}) {
    await this.request('initialize', { clientInfo: { name: 'padswitcher', title: 'PADSwitcher', version: require('../../package.json').version }, ...(experimentalApi ? {capabilities:{experimentalApi:true}} : {}) });
    this.send({ method: 'initialized', params: {} }); return this;
  }
  fail(error) {
    this.closed = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); } this.pending.clear();
  }
  async close() {
    if (this.closed) return;
    const child = this.child;
    const completed = new Promise(resolve => child.once('close', resolve));
    this.child.stdin.end();
    await Promise.race([completed, new Promise(resolve => setTimeout(resolve, 1200))]);
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([completed, new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    if (child.exitCode === null && !this.closed) throw new UserError('Codex chưa dừng; giữ lại phiên để tránh mất dữ liệu.', 'RPC_STOP_FAILED');
    this.lines.close(); this.fail(new UserError('Kết nối đã đóng.', 'RPC_CLOSED'));
  }
}
module.exports = { CodexRpc };
