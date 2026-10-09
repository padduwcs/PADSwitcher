'use strict';
// Managed setup uses the SAME guarded handlers as the launcher UI. It never
// receives native credentials, changes native routing or retries failed jobs.
const URLS = Object.freeze({
  tunnels: 'https://platform.openai.com/settings/organization/tunnels',
  keys: 'https://platform.openai.com/settings/organization/api-keys',
  plugins: 'https://chatgpt.com/#settings/Plugins',
});
const MESSAGES = Object.freeze({
  login: 'Đang chờ bạn đăng nhập trong cửa sổ ChatGPT. Nếu trang trắng, bấm nút tải lại ở thanh trên.',
  authentication: 'Đang kiểm tra phiên đăng nhập.',
  smoke: 'Đang kiểm tra trình duyệt bằng một lượt ChatGPT Web.',
  install: 'Đang cài model và khởi động bộ chạy Web.',
  connect: 'Đang kết nối công cụ.',
  verify: 'Đang kiểm tra bộ chạy và quyền truy cập công cụ.',
  external: 'Đang mở trang thiết lập.',
});
function setupError(code, message) { return Object.assign(new Error(message), {code}); }
function createPadSetup({invoke, browserHost, runtimeHost, supervisor, stateStore, version, showBrowser}) {
  let job = null;
  const requests = new Set();
  const snapshot = () => {
    const prefs = stateStore.read(), config = runtimeHost.runtimeConfigSnapshot().config;
    return {
      supported: true,
      prepared: prefs.coreSetupComplete === true && !!config,
      smokePassed: prefs.browserSmokePassed === true && prefs.browserSmokeVersion === version,
      credentialsConfigured: runtimeHost.mcpCredentialsConfigured() === true,
      toolsVerified: prefs.mcpSetupComplete === true && config?.mode === 'full',
      connectorName: runtimeHost.setupConnectorName(),
      tunnelId: config?.tunnel?.tunnelId || '',
      job: job ? {...job} : null,
    };
  };
  const active = () => job?.status === 'running';
  const step = name => { job.step = name; job.message = MESSAGES[name]; };
  function start(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || !['login','prepare','connect','verify','external'].includes(input.action)
      || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)) {
      throw setupError('WEB_SETUP_INPUT', 'Yêu cầu thiết lập không hợp lệ.');
    }
    // A lost HTTP acknowledgement must never replay smoke tests or setup.
    if (requests.has(input.requestId)) return {accepted: true, duplicate: true};
    if (requests.size >= 1000) throw setupError('WEB_SETUP_LIMIT', 'Đã đạt giới hạn thao tác của phiên thiết lập. Mở lại PADSwitcher khi không còn lượt chạy.');
    if (active() || runtimeHost.currentOperation() || browserHost.activeTraceId
      || browserHost.currentOperation() && browserHost.currentOperation() !== 'ChatGPT login'
        && !(input.action === 'login' && browserHost.currentOperation() === 'session refresh')) {
      throw setupError('WEB_SETUP_BUSY', 'Chờ lượt Web hoặc thao tác thiết lập đang chạy hoàn tất.');
    }
    if (stateStore.read().browserInteractionMode !== 'automatic') {
      throw setupError('WEB_SETUP_MODE', 'Thiết lập nhanh cần chế độ With Automation. Đổi chế độ trong cửa sổ nâng cao trước.');
    }
    if (input.action === 'prepare' && input.consent !== true) {
      throw setupError('WEB_SETUP_CONSENT', 'Đồng ý kiểm tra bằng một lượt ChatGPT Web trước khi thiết lập.');
    }
    if (input.action === 'external' && !Object.hasOwn(URLS, input.target)) {
      throw setupError('WEB_SETUP_INPUT', 'Trang thiết lập không hợp lệ.');
    }
    if (input.action === 'connect' && input.reuse !== true
      && (typeof input.tunnelId !== 'string' || !/^tunnel_[a-f0-9]{32}$/.test(input.tunnelId.trim())
      || typeof input.runtimeKey !== 'string' || !/^sk-[A-Za-z0-9_-]{16,512}$/.test(input.runtimeKey.trim()))) {
      throw setupError('WEB_SETUP_INPUT', 'Nhập Tunnel ID và API key hợp lệ; dùng khóa thường có quyền Tunnels Read và Use.');
    }
    if (input.action === 'connect' && input.reuse === true && !snapshot().credentialsConfigured) {
      throw setupError('WEB_SETUP_INPUT', 'Tài khoản này chưa có thông tin kết nối công cụ.');
    }
    if (input.action === 'verify' && (!snapshot().credentialsConfigured || !snapshot().prepared)) {
      throw setupError('WEB_SETUP_INPUT', 'Kết nối công cụ trước khi xác minh.');
    }
    requests.add(input.requestId);
    job = {id: input.requestId, action: input.action, status: 'running', step: input.action, message: MESSAGES[input.action] || MESSAGES.authentication};
    void run(input).then(() => {
      job.status = 'completed'; job.message = input.action === 'login'
        ? 'Trang đăng nhập đã mở. Hoàn tất đăng nhập rồi quay lại PADSwitcher.'
        : input.action === 'external' ? 'Trang thiết lập đã mở.' : 'Đã hoàn tất bước thiết lập.';
    }).catch(() => {
      // Do not expose upstream errors, commands or secrets to the PAD renderer.
      job.status = 'failed';
      job.message = ({login: 'Chưa hoàn tất đăng nhập. Nếu trang trắng, mở lại đăng nhập; chưa cần thiết lập model hay công cụ.',
        authentication: 'Chưa đăng nhập ChatGPT. Bấm Đăng nhập rồi quay lại.',
        smoke: 'Kiểm tra trình duyệt chưa thành công. Kiểm tra đăng nhập/mạng; chỉ thử lại khi bạn bấm nút.',
        install: 'Chưa cài xong model. Lượt kiểm tra đã thành công được giữ lại; bấm Thiết lập tự động để tiếp tục.',
        connect: 'Chưa kết nối được công cụ. Kiểm tra Tunnel ID, quyền API key, workspace và mạng.',
        verify: 'Chưa xác minh được công cụ. Kiểm tra plugin đã cài, đúng tên, đúng tunnel và quyền thao tác.',
        external: 'Chưa mở được trang thiết lập.'})[job.step] || 'Thiết lập chưa hoàn tất. Mở cửa sổ nâng cao để kiểm tra.';
    }).finally(() => { delete input.runtimeKey; });
    return {accepted: true};
  }
  async function run(input) {
    const config = supervisor.readConfig();
    const health = config ? await supervisor.proxyHealthPayload(config).catch(() => null) : null;
    if (health?.active_http_turns || health?.active_browser_turns) throw Error('Web turn active');
    if (input.action === 'external') { await invoke('launcher:open-external', URLS[input.target]); return; }
    if (input.action === 'login') {
      await showBrowser(); await browserHost.waitForSurfaceReady();
      await invoke('launcher:browser-login'); return;
    }
    step('authentication');
    if (browserHost.state.authenticated !== true) throw Error('Sign in required');
    const auth = await browserHost.probeAuthentication();
    if (!auth.authenticated) throw Error('Sign in required');
    if (input.action === 'prepare') {
      const prepared = snapshot().prepared;
      if (!prepared || health?.service !== 'codex-chatgpt-web' || health.version !== config?.releaseVersion) {
        if (!prepared && !snapshot().smokePassed) {
          step('smoke'); await showBrowser(); await invoke('launcher:browser-smoke');
        }
        step('install'); await invoke('launcher:setup-core');
      }
    } else if (input.action === 'connect') {
      if (!snapshot().prepared) throw Error('Prepare first');
      step('connect');
      if (input.reuse === true) await invoke('launcher:setup-core');
      else await invoke('launcher:setup-mcp', {tunnelId: input.tunnelId.trim(), runtimeKey: input.runtimeKey.trim(), interactionMode: 'automatic', replace: false});
    } else if (input.action === 'verify') {
      step('verify'); await showBrowser();
      const report = await invoke('launcher:mcp-verify');
      if (report.ok !== true) throw Error('Verification failed');
    }
  }
  return {start, snapshot, active};
}
module.exports = {createPadSetup};
