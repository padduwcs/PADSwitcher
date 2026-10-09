'use strict';
// Optional coding-tools (MCP) setup for an already connected Web account. Chat-only use never
// needs this dialog; sign-in, the setup check and model install run from the account card.
window.padWebSetup = (() => {
  const $ = s => document.querySelector(s), ui = window.padUI;
  let hooks, current, latest, submitting = false;
  const hidden = (id, value) => $(id).classList.toggle('hidden', value);
  const profile = () => latest?.web?.profiles.find(p => p.id === current);
  function render(state) {
    latest = state;
    if (!current || !$('#web-wizard').open) return;
    const p = profile(); if (!p) { close(); return; }
    const setup = p.setup || {}, job = setup.job, w = state.web;
    const busy = submitting || w.busy || w.active > 0 || w.setupLocked || job?.status === 'running' || !!p.flow?.running;
    const verified = p.mode === 'full' && setup.toolsVerified === true;
    const toolJob = job && ['connect','verify','external'].includes(job.action) ? job : null;
    $('#web-wizard-account').textContent = p.label;
    $('#web-connector-name').value = setup.connectorName || '';
    const message = toolJob?.status === 'running' ? toolJob.message
      : toolJob?.status === 'failed' ? toolJob.message + (toolJob.detail ? ' ' + ui.t('Chi tiết:') + ' ' + toolJob.detail : '')
      : !setup.supported ? 'Đang mở bộ chạy GPT Web…'
      : !setup.prepared ? 'Kết nối tài khoản này trước (nút Kết nối trên thẻ tài khoản).'
      : '';
    $('#web-wizard-progress').textContent = message ? ui.t(message) : '';
    hidden('#web-wizard-progress', !message || verified);
    $('#web-wizard-progress').classList.toggle('danger', toolJob?.status === 'failed');
    hidden('#web-tools-ready', !verified); hidden('#web-tools-config', verified);
    hidden('#web-tunnel-new', setup.credentialsConfigured === true);
    hidden('#web-tunnel-saved', setup.credentialsConfigured !== true);
    hidden('#web-plugin-guide', setup.credentialsConfigured !== true);
    $('#web-wizard-connect').disabled = busy || !setup.prepared;
    $('#web-wizard-connect').textContent = ui.t(setup.credentialsConfigured ? 'Kết nối lại bằng thông tin đã lưu' : 'Kết nối công cụ');
    $('#web-wizard-verify').disabled = busy || !setup.credentialsConfigured;
    $('#web-wizard-advanced').disabled = busy;
    document.querySelectorAll('[data-web-external]').forEach(b => b.disabled = busy);
    $('#web-wizard-copy').disabled = !setup.connectorName;
    ui.apply($('#web-wizard'));
  }
  function close() {
    $('#web-tunnel-key').value = ''; if ($('#web-wizard').open) $('#web-wizard').close(); current = null;
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
    current = id; $('#web-tunnel-id').value = ''; $('#web-tunnel-key').value = '';
    $('#web-wizard').showModal(); render(latest);
    // Opening only starts the account runtime; it never sends a ChatGPT message.
    submitting = true; render(latest);
    try { await hooks.call('webLaunchSetup',{id}); } finally { submitting = false; render(latest); }
  }
  function setup(next) {
    hooks = next;
    $('#web-wizard-close').onclick = close; $('#web-wizard-later').onclick = close;
    $('#web-wizard').addEventListener('cancel',() => { $('#web-tunnel-key').value = ''; current = null; });
    $('#web-wizard-connect').onclick = () => {
      const p = profile(), reuse = p?.setup?.credentialsConfigured === true;
      void command('connect',reuse ? {reuse:true} : {tunnelId:$('#web-tunnel-id').value.trim(),runtimeKey:$('#web-tunnel-key').value.trim()});
    };
    $('#web-wizard-verify').onclick = () => command('verify');
    document.querySelectorAll('[data-web-external]').forEach(b => b.onclick = () => command('external',{target:b.dataset.webExternal}));
    $('#web-wizard-copy').onclick = () => hooks.call('webCopyConnector',{id:current},'Đã sao chép tên plugin.');
    $('#web-wizard-advanced').onclick = () => hooks.call('webOpen',{id:current});
  }
  return {setup,render,open};
})();
