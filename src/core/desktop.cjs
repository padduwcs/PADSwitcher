'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { nativeExecutable } = require('./windows.cjs');
const { atomicWrite, assertDirectory, exists, readLimited } = require('./files.cjs');
const { UserError, publicError } = require('./errors.cjs');

async function installedDesktop(options={}) {
  return require('./windows.cjs').findDesktop(options);
}

function launchEnvironment(input, { home, helper }) {
  const env = { ...input };
  // The desktop owns its bundled runtime. Do not inherit another Electron app's
  // loader, a private Codex home, credential overrides, or a test connection.
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'ACCESS_TOKEN', 'OPENAI_IDENTITY_TOKEN_FILE', 'OPENAI_WORKLOAD_IDENTITY_CONTEXT', 'OPENAI_FEDERATION_RULE_ID', 'OPENAI_WORKSPACE_ID', 'OPENAI_BASE_URL', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'CODEX_SQLITE_HOME', 'CODEX_MCP_NODE_PATH', 'CODEX_APP_TOOLS_PIPE_PATH', 'CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY', 'BROWSER_USE_ACCESS_VERIFYING_IDENTITY', 'CODEX_ELECTRON_USER_DATA_PATH', 'PADSWITCHER_CONNECTION_FILE', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
  if (env.APPDIR && env.LD_LIBRARY_PATH?.split(':').some(p => p.startsWith(env.APPDIR))) delete env.LD_LIBRARY_PATH;
  delete env.APPIMAGE; delete env.APPDIR;
  if (/^code(?:-insiders)?$/.test(env.SNAP_NAME || '')) {
    for (const key of ['GTK_PATH', 'GIO_MODULE_DIR', 'GSETTINGS_SCHEMA_DIR', 'GTK_EXE_PREFIX', 'GTK_IM_MODULE_FILE', 'GDK_PIXBUF_MODULE_FILE', 'GDK_PIXBUF_MODULEDIR']) delete env[key];
    for (const key of ['XDG_DATA_DIRS', 'XDG_CONFIG_DIRS']) if (env[key + '_VSCODE_SNAP_ORIG']) env[key] = env[key + '_VSCODE_SNAP_ORIG'];
  }
  return { ...env, CODEX_HOME: home, CODEX_CLI_PATH: helper, PADSWITCHER_CLIENT_KIND: 'desktop', CODEX_APP_SERVER_FORCE_CLI: '1', CODEX_APP_SERVER_USE_LOCAL_DAEMON: '0' };
}

function waitForDesktopConnection(child, connected, timeout = 45000) {
  return new Promise((resolve, reject) => {
    let timer, poll;
    const finish = error => { clearTimeout(timer); clearInterval(poll); child.off('close', closed); error ? reject(error) : resolve(); };
    const closed = () => finish(new UserError('Desktop đã thoát trước khi kết nối. Thử mở lại và kiểm tra phiên bản ứng dụng.', 'DESKTOP_START_EXIT'));
    const check = () => { try { if (connected()) finish(); else if (child.exitCode != null) closed(); } catch (error) { finish(error); } };
    child.once('close', closed);
    timer = setTimeout(() => finish(new UserError('Desktop chưa kết nối được với PADSwitcher. Thoát hẳn desktop rồi thử mở lại; kiểm tra cấu hình và phiên bản ứng dụng nếu lỗi lặp lại.', 'DESKTOP_START_TIMEOUT')), timeout);
    poll = setInterval(check, 100); check();
  });
}

class DesktopIntegration {
  constructor(service, hub, options = {}) {
    this.service = service; this.hub = hub; this.options = options;
    this.file = path.join(service.root, 'desktop-integration.json');
    this.record = { version: 1, enabled: false, home: options.home || service.state.settings.desktopHome || path.join(os.homedir(), '.codex') };
    this.available = false; this.running = false; this.error = null; this.flight = null;
    service.desktopIntegration = this;
  }
  get configured() { return this.record.enabled; }
  async installed() { return this.options.installed ? this.options.installed() : installedDesktop(); }
  async init() {
    if (await exists(this.file)) {
      const record = JSON.parse((await readLimited(this.file, 16384)).toString('utf8'));
      if (record.version !== 1 || typeof record.enabled !== 'boolean' || typeof record.home !== 'string' || !path.isAbsolute(record.home)) throw new UserError('Cấu hình desktop không hợp lệ. Giữ nguyên dữ liệu để kiểm tra.', 'DESKTOP_CONFIG');
      this.record = { version: 1, enabled: record.enabled, home: record.home };
    }
    return this.status();
  }
  view() {
    const gateway = this.hub.desktop;
    const connected = gateway?.view().connected.desktop || 0;
    return { configuration: this.configured ? 'configured' : 'notConfigured', available: this.available, running: this.running, launching: !!this.flight, connected, profileId: gateway?.router?.profileId || gateway?.profileId || null, pendingId: this.hub.shared.pendingId || gateway?.pendingId || null, home: this.record.home, lastError: gateway?.error || (!connected ? this.error : null) || null };
  }
  async status() {
    try {
      const app = await this.installed(); this.available = true;
      const list = await this.service.platform.processes();
      this.running = list.some(p => p.ExecutablePath ? path.normalize(p.ExecutablePath).toLowerCase() === path.normalize(app.executable).toLowerCase() : p.Name?.toLowerCase() === path.basename(app.executable).toLowerCase());
    } catch (error) { this.available = false; if (error.code !== 'DESKTOP_MISSING') this.error = publicError(error).message; }
    return this.view();
  }
  async resumeGateway() {
    if (!this.configured || this.hub.status !== 'ready') return;
    const app = await this.installed();
    await assertDirectory(this.record.home);
    const environment = { CODEX_CLI_PATH: app.engine };
    const node = await nativeExecutable(path.join(app.resources, 'cua_node/bin/node.exe'));
    if (node) environment.CODEX_MCP_NODE_PATH = node;
    return this.hub.startDesktop({ home: this.record.home, executable: app.engine, environment });
  }
  async perform(action) {
    if (this.flight) throw new UserError('Đang cập nhật kết nối desktop. Hãy chờ hoàn tất.', 'BUSY');
    this.flight = Promise.resolve().then(action); this.service.changed();
    try { return await this.flight; } finally { this.flight = null; this.service.changed(); }
  }
  launch(id) { return this.perform(() => this.launchInner(id)); }
  async launchInner(id) {
    this.service.get(id); this.error = null;
    if (this.view().connected) {
      await this.hub.start(id);
      return { launched: false, connected: true, pending: !!this.hub.shared.pendingId || !!this.hub.desktop?.pendingId };
    }
    const app = await this.installed(); await this.status();
    if (this.running) throw new UserError('Lưu công việc và thoát hẳn ChatGPT/Codex desktop trước lần kết nối này. PADSwitcher không tự đóng ứng dụng. Sau khi mở qua PADSwitcher, đổi tài khoản không cần mở lại desktop.', 'DESKTOP_RUNNING');
    if (this.hub.turns.size || this.hub.shared.router?.active) throw new UserError('Chờ các lượt Codex đang chạy hoàn tất trước lần kết nối desktop đầu tiên.', 'GATEWAY_ACTIVE');
    await fs.mkdir(this.record.home, { recursive: true, mode: 0o700 }); await assertDirectory(this.record.home);
    await this.hub.start(id);
    const previous = { ...this.record }; this.record.enabled = true;
    try {
      const gateway = await this.resumeGateway();
      if (!gateway?.profileId) throw new UserError('Chưa xác minh được tài khoản desktop. Hãy thử kết nối lại.', 'DESKTOP_AUTH_VERIFY');
      const env = { ...launchEnvironment(this.options.environment || process.env, { home: this.record.home, helper: gateway.helper }), ...this.options.testEnvironment };
      try {
        const policy = this.options.readStartupConfig ? await this.options.readStartupConfig(gateway.helper, env) : JSON.parse(await this.service.platform.run(gateway.helper, ['app-server', '--print-startup-config', '--startup-client-info', JSON.stringify({name:'codex_desktop',title:'Codex Desktop',version:require('../../package.json').version})], {env,timeout:35000}));
        if (typeof policy?.appServerVersion !== 'string' || !policy.configRequirements || !Object.hasOwn(policy.configRequirements, 'requirements')) throw Error('Invalid startup policy');
      } catch { throw new UserError('Chưa đọc được cấu hình khởi động của Codex Desktop. Giữ nguyên đăng nhập, kiểm tra cấu hình Codex và thử kết nối lại.', 'DESKTOP_STARTUP_POLICY'); }
      await atomicWrite(this.file, JSON.stringify(this.record));
      const child = (this.options.spawn || spawn)(app.executable, this.options.arguments || [], { env, cwd: this.service.state.settings.workspace, detached: true, stdio: 'ignore', windowsHide: false });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.once('close', code => { if (code) this.error = 'Desktop đã thoát trước khi hoàn tất kết nối. Kiểm tra ứng dụng và thử mở lại.'; this.running = false; this.service.changed(); });
      child.unref(); this.running = true;
      clearTimeout(this.launchTimer);
      await waitForDesktopConnection(child, () => {
        if (this.hub.desktop?.status === 'error') throw new UserError('Backend Codex Desktop đã dừng. Kiểm tra cấu hình và mở lại kết nối.', 'DESKTOP_BACKEND_STOPPED');
        return this.view().connected > 0;
      }, this.options.startupTimeout || 45000);
      this.error = null;
      return { launched: true, connected: true };
    } catch (error) {
      this.record = previous; await atomicWrite(this.file, JSON.stringify(previous));
      if (!previous.enabled) await this.hub.stopDesktop().catch(() => {});
      this.error = publicError(error).message; throw error;
    }
  }
  disconnect() { return this.perform(() => this.disconnectInner()); }
  async disconnectInner() {
    await this.status();
    if (this.running) throw new UserError('Thoát desktop đã kết nối trước khi gỡ kết nối. Sau đó mở ứng dụng từ menu hệ thống để trở về đăng nhập ban đầu.', 'DESKTOP_RUNNING');
    await this.hub.stopDesktop();
    clearTimeout(this.launchTimer);
    this.record.enabled = false; await atomicWrite(this.file, JSON.stringify(this.record));
    this.error = null; this.service.changed();
  }
  setHome(home) { return this.perform(() => this.setHomeInner(home)); }
  async setHomeInner(home) {
    if (typeof home !== 'string' || !path.isAbsolute(home) || home.length > 2048) throw new UserError('Chọn thư mục Codex tuyệt đối chứa hội thoại desktop.', 'INVALID_SETTINGS');
    await this.status();
    if (this.running || this.view().connected) throw new UserError('Thoát desktop trước khi đổi thư mục hội thoại.', 'DESKTOP_RUNNING');
    await assertDirectory(home); await this.hub.stopDesktop();
    this.record.home = home; await atomicWrite(this.file, JSON.stringify(this.record)); this.service.changed();
  }
}
module.exports = { DesktopIntegration, installedDesktop, launchEnvironment, waitForDesktopConnection };
