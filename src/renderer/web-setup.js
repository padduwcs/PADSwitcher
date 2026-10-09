'use strict';
window.padWebSetup = (() => {
  const $ = s => document.querySelector(s), ui = window.padUI;
  let hooks, current, latest, submitting = false, finishPending = false;
  const hidden = (id, value) => $(id).classList.toggle('hidden', value);
  const profile = () => latest?.web?.profiles.find(p => p.id === current);
  const wantsTools = () => $('[name="web-purpose"]:checked')?.value === 'tools';
  function render(state) {
    latest = state;
    if (!current || !$('#web-wizard').open) return;
    const p = profile(); if (!p) { close(); return; }
    const setup = p.setup || {}, job = setup.job, w = state.web;
    const busy = submitting || finishPending || w.busy || w.active > 0 || w.setupLocked || job?.status === 'running';
    const prepared = !!setup.prepared, tools = wantsTools();
    const verified = p.mode === 'full' && setup.toolsVerified === true;
    const ready = p.authenticated && p.status === 'ready' && prepared && !p.operation
      && (p.mode !== 'full' || verified) && (!tools || verified);
    $('#web-wizard-account').textContent = p.label;
    $('#web-connector-name').value = setup.connectorName || '';
    const step = !p.authenticated ? 1 : !prepared ? 2 : tools && !verified ? 3 : 4;
    document.querySelectorAll('.web-steps li').forEach((li, i) => {
      if (i + 1 === step) li.setAttribute('aria-current','step'); else li.removeAttribute('aria-current');
    });
    let message = job?.status === 'running' || job?.status === 'failed' ? job.message
      : !setup.supported ? 'Đang mở bộ chạy. Nếu chưa có thiết lập nhanh, mở lại bản PADSwitcher mới khi hết lượt chạy.'
      : !p.authenticated ? 'Bấm Đăng nhập ChatGPT, hoàn tất đăng nhập rồi quay lại đây.'
      : !prepared ? 'Đã đăng nhập. Chọn nhu cầu, đồng ý lượt kiểm tra rồi bấm Thiết lập tự động.'
      : p.runtimeReady === false ? 'Đã lưu thiết lập. Bấm Khởi động lại bộ chạy Web để tiếp tục, không chạy lại lượt kiểm tra.'
      : tools && !verified ? 'Đã cài model. Hoàn tất kết nối công cụ bên dưới để dùng lập trình.'
      : 'Đã sẵn sàng. Bấm Hoàn tất và sử dụng.';
    if (w.setupLocked && job?.status !== 'running') message = 'Đang xác định kết quả thiết lập. Chờ cập nhật trạng thái; ứng dụng không tự gửi lại thao tác.';
    $('#web-wizard-progress').textContent = ui.t(message);
    $('#web-wizard-progress').classList.toggle('error',job?.status === 'failed');
    hidden('#web-wizard-login',p.authenticated === true);
    hidden('#web-purpose',p.mode === 'full');
    hidden('#web-wizard-prepare',!p.authenticated || prepared && (p.runtimeReady === true || p.runtimeReady === undefined && p.status === 'ready'));
    hidden('#web-consent-label',prepared || setup.smokePassed === true);
    hidden('#web-wizard-tools',!p.authenticated || !prepared || !tools && p.mode !== 'full');
    hidden('#web-tools-ready',!verified);hidden('#web-tools-config',verified);
    hidden('#web-tunnel-new',setup.credentialsConfigured === true);
    hidden('#web-tunnel-saved',setup.credentialsConfigured !== true);
    hidden('#web-plugin-guide',setup.credentialsConfigured !== true);
    hidden('#web-wizard-finish',!ready);
    $('#web-wizard-mode').textContent = ui.t(p.mode === 'full' ? 'Sẵn sàng trò chuyện và sử dụng công cụ lập trình.' : 'Sẵn sàng trò chuyện. Muốn đọc file hoặc sửa code, chọn nhu cầu lập trình phía trên.');
    $('#web-wizard-signin').disabled = busy;
    $('#web-wizard-signin').textContent = ui.t(p.authenticated ? 'Mở lại trang đăng nhập' : 'Đăng nhập ChatGPT');
    $('#web-wizard-auto').textContent = ui.t(prepared ? 'Khởi động lại bộ chạy Web' : 'Thiết lập tự động');
    $('#web-wizard-auto').disabled = busy || !p.authenticated || !setup.supported || !prepared && !setup.smokePassed && !$('#web-smoke-consent').checked;
    $('#web-wizard-connect').disabled = busy || !prepared;
    $('#web-wizard-connect').textContent = ui.t(setup.credentialsConfigured ? 'Kết nối lại bằng thông tin đã lưu' : 'Kết nối công cụ');
    $('#web-wizard-verify').disabled = busy || !setup.credentialsConfigured;
    $('#web-wizard-done').disabled = busy || !ready;
    $('#web-wizard-refresh').disabled = submitting;
    $('#web-wizard-advanced').disabled = busy;
    document.querySelectorAll('[data-web-external]').forEach(b => b.disabled = busy);
    document.querySelectorAll('[name="web-purpose"]').forEach(b => b.disabled = busy);
    $('#web-wizard-copy').disabled = !setup.connectorName;
    ui.apply($('#web-wizard'));
  }
  function close() {
    $('#web-tunnel-key').value = ''; $('#web-wizard').close(); current = null;
  }
  async function command(action, extra = {}) {
    if (submitting || !current) return;
    const id = current;
    submitting = true; render(latest);
    try {
      await hooks.call('webSetup',{id, action, requestId: crypto.randomUUID(), ...extra});
    } finally {
      // Secrets are never retained in DOM, localStorage or public state.
      $('#web-tunnel-key').value = ''; submitting = false; render(latest);
    }
  }
  async function open(id) {
    current = id; $('#web-smoke-consent').checked = false;
    $('#web-tunnel-id').value = ''; $('#web-tunnel-key').value = '';
    const saved = localStorage.getItem('pad-web-purpose-' + id);
    const value = profile()?.mode === 'full' || saved !== 'chat' ? 'tools' : 'chat';
    $(`[name="web-purpose"][value="${value}"]`).checked = true;
    $('#web-wizard').showModal(); render(latest);
    // Opening/status refresh never runs a smoke test or installs models.
    submitting = true;render(latest);
    try { await hooks.call('webLaunchSetup',{id}); } finally { submitting = false;render(latest); }
  }
  function setup(next) {
    hooks = next;
    $('#web-wizard-close').onclick = close; $('#web-wizard-later').onclick = close;
    $('#web-wizard').addEventListener('cancel',() => { $('#web-tunnel-key').value = ''; current = null; });
    $('#web-wizard-signin').onclick = () => command('login');
    $('#web-wizard-auto').onclick = () => command('prepare',{consent:true});
    $('#web-smoke-consent').onchange = () => render(latest);
    document.querySelectorAll('[name="web-purpose"]').forEach(b => b.onchange = () => {
      localStorage.setItem('pad-web-purpose-' + current,b.value); render(latest);
    });
    $('#web-wizard-connect').onclick = () => {
      const p = profile(), reuse = p?.setup?.credentialsConfigured === true;
      void command('connect',reuse ? {reuse:true} : {tunnelId:$('#web-tunnel-id').value.trim(),runtimeKey:$('#web-tunnel-key').value.trim()});
    };
    $('#web-wizard-verify').onclick = () => command('verify');
    document.querySelectorAll('[data-web-external]').forEach(b => b.onclick = () => command('external',{target:b.dataset.webExternal}));
    $('#web-wizard-copy').onclick = () => hooks.call('webCopyConnector',{id:current},'Đã sao chép tên plugin.');
    $('#web-wizard-refresh').onclick = () => hooks.call('webRefresh');
    $('#web-wizard-advanced').onclick = () => hooks.call('webOpen',{id:current});
    $('#web-wizard-done').onclick = async () => {
      if (finishPending || !current) return;
      const id = current; finishPending = true; render(latest);
      try {
        if (!(await hooks.call('webSelect',{id}))) return;
        if (await hooks.call('webEnable',{},'GPT Web đã bật. Mở chat mới và chọn model Web.')) close();
      } finally { finishPending = false; render(latest); }
    };
  }
  return {setup,render,open};
})();
