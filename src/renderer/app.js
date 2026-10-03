'use strict';
const $ = selector => document.querySelector(selector);
const e = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, selectedId = null, page = 'accounts', privacy = localStorage.getItem('pad-hide-email') === '1', modalSubmit;
const api = window.pad;
const ui = window.padUI;
function toast(message,error = false) {
  const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`;
  const text = document.createElement('span'); text.textContent = ui.t(message); el.append(text);
  const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label','Đóng thông báo'); close.onclick = () => el.remove(); el.append(close);
  $('#toasts').append(el); ui.apply(el); setTimeout(() => el.remove(),error ? 25000 : 7000);
}
async function call(command,args = {},success = null) {
  try {
    const response = await api.action(command,{...args,locale:ui.language});
    if (response.state) { state = response.state; render(); }
    if (!response.ok) { if (response.error.code !== 'CANCELLED') toast(ui.error(response.error),true); return null; }
    if (success) toast(success);
    return response;
  } catch { toast('Không kết nối được PADSwitcher. Hãy mở lại ứng dụng.',true); return null; }
}
function time(value) {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat(ui.language === 'en' ? 'en-GB' : 'vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(date);
}
function windowName(w) {
  if (w.windowDurationMins >= 10080) return `${Math.round(w.windowDurationMins/10080)} tuần`;
  if (w.windowDurationMins >= 1440) return `${Math.round(w.windowDurationMins/1440)} ngày`;
  if (w.windowDurationMins >= 60) return `${Math.round(w.windowDurationMins/60*10)/10} giờ`;
  return w.windowDurationMins ? `${w.windowDurationMins} phút` : w.kind === 'primary' ? 'Giới hạn chính' : 'Giới hạn bổ sung';
}
function windows(p) { return (p.quota || []).flatMap(b => (b.windows || []).map(w => ({...w,bucket:b.name,bucketId:b.id}))); }
function stale(p) { const fetched = Date.parse(p.quotaAt); return p.status !== 'ready' || !Number.isFinite(fetched) || Date.now() - fetched > 10 * 60000 || windows(p).some(w => w.resetsAt && w.resetsAt * 1000 <= Date.now()); }
function quotaAge(p) {
  const fetched = Date.parse(p.quotaAt); if (!Number.isFinite(fetched)) return 'Chưa cập nhật';
  const minutes = Math.max(0,Math.floor((Date.now()-fetched)/60000));
  return minutes < 1 ? 'Cập nhật vừa xong' : minutes < 60 ? `Cập nhật ${minutes} phút trước` : minutes < 1440 ? `Cập nhật ${Math.floor(minutes/60)} giờ trước` : `Cập nhật ${Math.floor(minutes/1440)} ngày trước`;
}
function quotaKnown(p) { return p.status === 'ready' && windows(p).length && !stale(p); }
function initials(p) { return (p.label || 'P').split(/\s+/).slice(0,2).map(s => s[0]).join('').toUpperCase(); }
function email(p) { return privacy && p.email ? '••••••@••••••' : p.email || 'Tài khoản ChatGPT'; }
function planName(plan) { const map = { plus:'Plus',pro:'Pro',free:'Free',team:'Team',business:'Business',enterprise:'Enterprise',edu:'Edu',go:'Go' }; return map[plan] || plan || 'ChatGPT'; }
function badge(p) {
  if(state.gateway?.pendingId===p.id)return '<span class="badge error">Chờ lượt xong</span>';
  if(state.gateway?.profileId===p.id&&state.gateway?.status==='ready')return '<span class="badge active">Đang dùng</span>';
  if (p.running) return '<span class="badge active">CLI đang mở</span>';
  if (p.status === 'reauth') return '<span class="badge error">Cần đăng nhập</span>';
  if (p.status === 'error') return '<span class="badge error">Chưa cập nhật</span>';
  return `<span class="badge">${e(planName(p.plan))}</span>`;
}
function progress(w,mini = false) {
  const used = Math.max(0,Math.min(100,Number(w.usedPercent) || 0)), remaining = 100-used;
  return `<div class="${mini ? 'mini-quota' : 'quota-window'}"><div class="quota-label"><span>${e(ui.t(windowName(w)))}${!mini && w.bucketId !== 'codex' ? ' · '+e(w.bucket) : ''}</span><b>${Math.round(remaining)}<span class="quota-unit">%</span></b></div><div class="progress${remaining <= 10 ? ' low' : ''}"><progress max="100" value="${remaining}" aria-label="${e(ui.t(windowName(w)))}: ${Math.round(remaining)}% ${ui.language==='en'?'remaining':'còn lại'}"></progress></div>${!mini ? `<div class="quota-reset">${w.resetsAt ? (ui.language==='en'?'Resets ':'Đặt lại ')+e(time(w.resetsAt*1000)) : ui.t('Chưa có thời gian đặt lại')}</div>` : ''}</div>`;
}
function render() {
  if (!state) return;
  $('#nav-count').textContent = state.profiles.length; $('#total').textContent = state.profiles.length; $('#list-count').textContent = state.profiles.length;
  const known = state.profiles.filter(quotaKnown), available = known.filter(p => windows(p).every(w => w.usedPercent < 100));
  $('#available').textContent = known.length ? available.length : '—';
  $('#available-caption').textContent = known.length ? `${known.length}/${state.profiles.length} hồ sơ có dữ liệu mới` : 'Cập nhật để xem trạng thái';
  const active = state.profiles.find(p => p.id===state.gateway?.profileId);
  $('#active-name').textContent = active?.label || 'Chưa chọn tài khoản'; $('#active-caption').textContent = active ? email(active) : 'Chọn tài khoản để bắt đầu';
  $('#privacy').textContent = privacy ? 'Hiện email' : 'Ẩn email'; $('#privacy').setAttribute('aria-pressed',String(privacy));
  const times = state.profiles.filter(p => p.quotaAt).map(p => new Date(p.quotaAt).getTime()).filter(Number.isFinite);
  $('#last-update').textContent = state.busy ? 'Đang xử lý…' : times.length ? 'Cập nhật gần nhất '+time(Math.max(...times)) : 'Chưa có dữ liệu quota';
  $('#recovery-banner').classList.toggle('hidden',!state.recoveryPending);
  $('#empty').classList.toggle('hidden',state.profiles.length > 0);
  for(const selector of ['.session-grid','.toolbar','.list-heading'])$(selector).classList.toggle('hidden',!state.profiles.length);
  const query = $('#search').value.toLowerCase().trim();
  const profiles = state.profiles.filter(p => `${p.label} ${p.email} ${p.notes}`.toLowerCase().includes(query));
  if (!profiles.some(p => p.id === selectedId)) selectedId = profiles.find(p=>p.id===state.gateway?.profileId)?.id || profiles[0]?.id || null;
  $('#account-layout').classList.toggle('hidden',!profiles.length);
  $('#no-results').classList.toggle('hidden',!state.profiles.length || profiles.length > 0);
  $('#account-list').innerHTML = profiles.map(p => `<button class="account-card${p.id === selectedId ? ' selected' : ''}" data-id="${e(p.id)}" aria-pressed="${p.id === selectedId}"><div class="card-head"><div class="avatar">${e(initials(p))}</div><div class="card-identity" data-literal><strong>${e(p.label)}</strong><small>${e(email(p))}</small></div>${badge(p)}</div><div class="card-quota">${windows(p).length ? windows(p).slice(0,2).map(w => progress(w,true)).join('') : '<span class="quota-unavailable">Cập nhật để xem quota</span>'}</div><div class="timestamp${stale(p) ? ' stale' : ' fresh'}">${e(quotaAge(p))}${p.quotaAt && stale(p) ? ' · Dữ liệu cũ' : ''}</div></button>`).join('');
  document.querySelectorAll('.account-card').forEach(card => card.addEventListener('click',() => { selectedId = card.dataset.id; render(); document.querySelector('.account-card.selected')?.focus({preventScroll:true}); }));
  const p = state.profiles.find(p => p.id === selectedId); renderDetail(p);
  const g=state.gateway||{status:'stopped'};
  $('#gateway-status').textContent=({stopped:'Chưa bật kết nối',starting:'Đang khởi động Codex…',ready:'Đã kết nối Codex',stopping:'Đang dừng…',error:'Kết nối cần khởi động lại'}[g.status]||g.status);
  const pending=state.profiles.find(x=>x.id===g.pendingId);
  $('#gateway-detail').textContent=g.lastError|| (g.status==='ready'?`${g.clients} kết nối · ${g.activeTurns} lượt đang chạy${pending?' · Sẽ dùng '+pending.label+' khi lượt hiện tại xong':''}`:'Chọn tài khoản bên dưới → Dùng tài khoản này.');
  if(ui.language==='en'&&g.status==='ready'&&!g.lastError)$('#gateway-detail').textContent=`${g.clients} connections · ${g.activeTurns} active turns${pending?' · Switching to '+pending.label+' after the current turn':''}`;
  $('#gateway-detail').classList.toggle('hidden',!g.lastError&&!pending);
  $('#connection-dot').className='status-dot '+(g.status==='ready'?'ready':g.status==='error'?'error':'');
  $('.gateway-panel').classList.toggle('problem',g.status==='error');
  $('#connection-state').textContent=g.status==='ready'?'Đang kết nối':'Chưa sẵn sàng';
  $('#connection-state').classList.toggle('active',g.status==='ready');
  $('#connection-hint').textContent=g.status==='ready'?`Đang dùng ${active?.label||'tài khoản đã chọn'}. Chọn cách bạn dùng Codex bên dưới.`:g.lastError||'Chọn một tài khoản trong trang Tài khoản để bật kết nối.';
  $('#connection-hint').classList.toggle('hidden',g.status==='ready'&&!g.lastError);
  for(const id of ['connect-vscode','copy-cli','open-gateway-cli'])$('#'+id).disabled=g.status!=='ready'||state.busy;
  $('#stop-gateway').disabled=state.busy||['stopped','starting','stopping'].includes(g.status);
  const recovery=g.recovery||{},policy=state.autoSwitch||{enabled:false,order:[]};
  $('#recovery-title').textContent='Tự đổi · '+(policy.enabled?'Bật':'Tắt');
  $('#configure-auto').setAttribute('aria-label','Thiết lập tự đổi khi hết quota: '+(policy.enabled?'đang bật':'đang tắt'));
  $('#recovery-detail').textContent=recovery.message||(policy.enabled?`${policy.order.length} tài khoản theo thứ tự ưu tiên. Tự tiếp tục cùng hội thoại.`:state.profiles.length<2?'Thêm một tài khoản dự phòng để bật tự đổi.':'Chọn tài khoản dự phòng để công việc tiếp tục.');
  $('.recovery-panel').classList.toggle('enabled',policy.enabled);
  const lastRecovery=recovery.events?.at(-1);
  $('#recovery-detail').classList.toggle('hidden',!(recovery.queued||recovery.active||['blocked','error','exhausted'].includes(lastRecovery?.type)));
  $('#configure-auto').disabled=state.busy;$('#cancel-recovery').disabled=!(recovery.queued||recovery.active);$('#recovery-history').disabled=!recovery.events?.length;
  $('#recovery-history').classList.toggle('hidden',!recovery.events?.length);
  $('#cancel-recovery').classList.toggle('hidden',!(recovery.queued||recovery.active));
  for (const id of ['add-account','import-current','empty-import','refresh-all','check-system','recover-login']) $( '#'+id ).disabled = state.busy;
  $('#refresh-all').disabled = state.busy || !state.profiles.length;
  $('#restore').disabled = state.busy || !state.canRestore;
  $('#login-bar').classList.toggle('hidden',!state.login);
  if (!state.login) $('#login-detail').textContent = 'Chọn đúng tài khoản trên trình duyệt. Phiên hiện tại vẫn được giữ.';
  if (page !== 'settings' || !$('#settings-form').dataset.dirty) fillSettings();
  syncAppearance(); ui.apply();
}
function renderDetail(p) {
  if (!p) { $('#detail').innerHTML = ''; return; }
  const previous=$('#detail').dataset.profileId===p.id?new Set([...$('#detail').querySelectorAll('details[open]')].map(el=>el.id)):new Set();
  $('#detail').dataset.profileId=p.id;
  const disabled = state.busy ? 'disabled' : '';
  const current=state.gateway?.profileId===p.id&&state.gateway?.status==='ready'&&!state.gateway?.pendingId&&!state.gateway?.recovery?.active&&!state.gateway?.recovery?.queued;
  $('#detail').innerHTML = `
    <div class="detail-top"><div class="detail-profile"><div class="avatar">${e(initials(p))}</div><div data-literal><h2>${e(p.label)}</h2><p>${e(email(p))}</p></div></div><div class="detail-meta"><span class="badge">${e(planName(p.plan))}</span></div></div>
    <div class="detail-body">
      <div class="detail-label quota-title">Quota còn lại</div>
      ${p.lastError ? `<div class="inline-error">${e(ui.error({message:p.lastError,code:p.status==='reauth'?'AUTH_INVALID':'QUOTA_REFRESH'}))}</div>` : ''}
      <div class="detail-quotas">${windows(p).length ? windows(p).map(w => progress(w)).join('') : '<p class="field-help">Chưa có dữ liệu quota.</p>'}</div>
      <div class="timestamp${stale(p) ? ' stale' : ' fresh'}">${e(quotaAge(p))}${p.quotaAt&&stale(p)?' · Dữ liệu cũ':''}</div>
      <div class="detail-actions"><button class="button primary" id="use-gateway" ${disabled || (current||['starting','stopping'].includes(state.gateway?.status)?'disabled':'')}>${current?'Đang sử dụng':'Dùng tài khoản này'}</button></div>
      ${resetPanel(p,disabled)}
      <details class="detail-management" id="profile-management" ${previous.has('profile-management')?'open':''}><summary>Tùy chọn tài khoản</summary><div class="detail-bottom"><button class="button ghost" id="edit-profile" ${disabled}>Sửa tên</button><button class="button ghost" id="reauth-profile" ${disabled}>Đăng nhập lại</button><button class="button ghost danger-text" id="remove-profile" ${disabled}>Xóa</button></div><button class="button ghost refresh-detail" id="refresh-one" ${disabled}>Làm mới quota tài khoản này</button>${p.notes ? `<p class="detail-note" data-literal>${e(p.notes)}</p>` : ''}
      <details class="legacy-actions" id="profile-legacy" ${previous.has('profile-legacy')?'open':''}><summary>Nâng cao</summary><p class="field-help">${ui.language==='en'?'Source: Codex service':'Nguồn: dịch vụ Codex'}${p.quotaAt?' · '+e(time(p.quotaAt)):''}. ${windows(p).map(w=>e(ui.t(windowName(w)))+': '+Math.round(w.usedPercent)+(ui.language==='en'?'% used':'% đã dùng')).join(' · ')}. ${ui.language==='en'?'The options below do not support auto-switching.':'Các cách dùng bên dưới không hỗ trợ tự đổi.'}</p><button class="button secondary" id="use-desktop" ${disabled || (p.desktopActive ? 'disabled' : '')}>${p.desktopActive ? 'Phiên dùng chung hiện tại' : 'Đổi phiên chung · cần đóng Codex'}</button><div class="cli-actions"><button class="button secondary" id="launch-cli" ${disabled || (p.running ? 'disabled' : '')}>${p.running ? 'CLI riêng đang mở' : 'Mở CLI riêng'}</button><button class="button secondary" id="resume-cli" ${disabled || (p.running ? 'disabled' : '')}>Tiếp tục CLI riêng</button></div></details></details>
    </div>`;
  document.querySelectorAll('[data-reset-credit]').forEach(button => button.onclick = () => resetModal(p,button.dataset.resetCredit || null));
  $('#use-gateway').onclick = async()=>{const r=await call('gateway',{id:p.id});if(r)toast(state.gateway?.pendingId?'Sẽ chuyển khi lượt đang chạy hoàn tất.':'Đang dùng '+p.label+'.');};
  $('#use-desktop').onclick = () => showModal('Dùng cho desktop',`<p>Chuyển sang <span class="confirm-name" data-literal>${e(p.label)}</span>.</p><p class="field-help">Kết thúc tác vụ và thoát Codex/ChatGPT cùng IDE đang dùng Codex trước khi chuyển. Phiên trước được lưu để khôi phục; lịch sử và cấu hình được giữ nguyên.</p>`,async () => { closeModal(); const response = await call('switch',{id:p.id},'Đã đổi phiên. Mở lại desktop và kiểm tra tài khoản đang hiển thị.'); if (response) showModal('Đã chuyển phiên', '<p>Mở Codex desktop để tiếp tục. Kiểm tra tên tài khoản trong ứng dụng trước khi gửi yêu cầu mới.</p>',async () => { closeModal(); await call('openDesktop'); },'Mở Codex desktop'); },'Chuyển tài khoản');
  $('#launch-cli').onclick = () => call('launch',{id:p.id},'Đã mở CLI. Đóng cửa sổ CLI khi xong để khóa lại phiên.');
  $('#resume-cli').onclick = () => call('launch',{id:p.id,resume:true},'Đã mở bộ chọn hội thoại CLI.');
  $('#refresh-one').onclick = () => call('refresh',{id:p.id},'Đã cập nhật quota.');
  $('#edit-profile').onclick = () => showModal('Sửa hồ sơ',`<label for="profile-label">Tên dễ nhớ</label><input id="profile-label" type="text" maxlength="80" required value="${e(p.label)}"><label for="profile-notes">Ghi chú</label><textarea id="profile-notes" maxlength="500">${e(p.notes)}</textarea>`,async () => { const label = $('#profile-label').value, notes = $('#profile-notes').value; closeModal(); await call('edit',{id:p.id,label,notes},'Đã lưu hồ sơ.'); },'Lưu thay đổi');
  $('#reauth-profile').onclick = () => accountModal(p);
  $('#remove-profile').onclick = () => showModal('Xóa khỏi danh sách?',`<p>Hồ sơ <span class="confirm-name">${e(p.label)}</span> sẽ được chuyển vào thư mục trash trên máy. Tài khoản OpenAI vẫn giữ nguyên.</p><p class="field-help">Không thể xóa hồ sơ đang dùng cho desktop hoặc đang mở CLI.</p>`,async () => { closeModal(); await call('remove',{id:p.id},'Đã chuyển hồ sơ vào trash.'); },'Xóa hồ sơ');
}
function resetPanel(p,disabled) {
  const summary=p.resetCredits, pending=p.resetAttempt?.status==='pending';
  const credits=(summary?.credits||[]).filter(c=>c.status==='available');
  return `<section class="reset-panel" aria-label="Lượt reset"><div class="reset-heading"><div><span class="reset-icon" aria-hidden="true">↺</span><span>Lượt reset</span><b>${summary ? e(summary.availableCount) : '—'}</b></div>${pending || summary?.availableCount > 0 ? `<button class="button reset-button" data-reset-credit="" ${disabled}>${pending?'Kiểm tra reset':'Dùng reset'}<span aria-hidden="true">↗</span></button>` : ''}</div>
    ${pending?'<p class="reset-note">Lần reset đang chờ xác định kết quả.</p>':!summary?'<p class="reset-note">Chưa có dữ liệu</p>':!summary.availableCount?'<p class="reset-note">Không có lượt reset</p>':`<details class="reset-list" id="reset-list" ${document.querySelector('#reset-list')?.open?'open':''}><summary>Xem lượt reset</summary>${credits.length?credits.map(c=>`<div class="reset-row"><div><strong>${e(c.title || 'Reset')}</strong><small>${c.expiresAt?'Hết hạn '+e(time(c.expiresAt*1000)):'Không có hạn dùng'}</small></div><button class="button ghost" data-reset-credit="${e(c.id)}" ${disabled || (c.resetType!=='codexRateLimits'||c.expiresAt&&c.expiresAt*1000<=Date.now()?'disabled':'')}>Dùng reset</button></div>`).join(''):'<p class="reset-note">Chỉ biết số lượt; Codex chưa cung cấp chi tiết.</p>'}${summary.availableCount>credits.length&&credits.length?`<p class="reset-note">${e(ui.language==='en'?`${summary.availableCount-credits.length} more resets available.`:`Còn ${summary.availableCount-credits.length} lượt khác.`)}</p>`:''}</details>`}
  </section>`;
}
async function resetModal(p,creditId) {
  const response=await call('prepareReset',{id:p.id,creditId}); if(!response)return;
  const attempt=response.result;
  showModal(attempt.retry?'Kiểm tra lần reset trước?':'Dùng một lượt reset?',`<div class="reset-confirm-account" data-literal><div class="avatar">${e(initials(p))}</div><div><strong>${e(p.label)}</strong><p>${e(email(p))}</p></div></div><p>${attempt.retry?'Lần trước chưa rõ kết quả. Kiểm tra lại với cùng mã yêu cầu để tránh dùng thêm lượt.':'Một lần dùng sẽ tiêu thụ 1 lượt reset của tài khoản này.'}</p><p class="field-help">Reset không tự chạy lại lượt hội thoại đã dừng.</p>`,async()=>{
    // Keep the modal and its bound account/key during the request. Never retry
    // automatically; an uncertain result is retried explicitly with the same key.
    const result=await call('consumeReset',{id:p.id,key:attempt.key,confirmed:true});
    if(!result)return;
    closeModal();
    toast(({reset:'Reset đã dùng. Quay lại Codex và nhắn tiếp tục nếu cần.',alreadyRedeemed:'Lần reset này đã hoàn tất trước đó. Không dùng thêm lượt.',nothingToReset:'Chưa có giới hạn nào đủ điều kiện reset.',noCredit:'Tài khoản không còn lượt reset.'})[result.result.outcome]);
    if(!result.result.quotaRefreshed)toast('Kết quả đã có; cần làm mới quota.');
  },attempt.retry?'Kiểm tra reset':'Xác nhận dùng reset');
}
function syncAppearance() {
  $('#language-toggle').textContent=ui.language==='vi'?'EN':'VI';
  $('#language-select').value=ui.language;$('#theme-select').value=ui.theme;
  $('#theme-toggle').setAttribute('aria-pressed',String(ui.theme==='dark'));
}
function changeAppearance(kind,value) {
  if(kind==='language')ui.setLanguage(value);else ui.setTheme(value);
  syncAppearance();render();ui.apply();
  if(kind==='language')call('state'); // Keep native dialogs and tray in sync.
}
$('#language-toggle').onclick=()=>changeAppearance('language',ui.language==='vi'?'en':'vi');
$('#theme-toggle').onclick=()=>changeAppearance('theme',ui.theme==='light'?'dark':'light');
$('#language-select').onchange=event=>changeAppearance('language',event.target.value);
$('#theme-select').onchange=event=>changeAppearance('theme',event.target.value);
syncAppearance();
document.addEventListener('DOMContentLoaded',()=>ui.apply());
function showModal(title,body,submit,button = 'Tiếp tục') {
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = body; $('#modal-submit').textContent = button; $('#modal-submit').disabled = false; modalSubmit = submit;
  ui.apply($('#modal')); $('#modal').showModal(); $('#modal-body input')?.focus();
}
function closeModal() { $('#modal').close(); modalSubmit = null; }
function accountModal(p = null) {
  showModal(p ? 'Đăng nhập lại' : 'Thêm tài khoản',`<p>Trình duyệt sẽ mở trang đăng nhập chính thức của OpenAI. Chọn ${p ? `<span class="confirm-name">${e(email(p))}</span>` : 'tài khoản bạn muốn thêm'}.</p>${p ? '' : '<label for="profile-label">Tên dễ nhớ (tùy chọn)</label><input id="profile-label" type="text" maxlength="80" placeholder="Ví dụ: Cá nhân · Plus">'}<label class="check-label"><input type="checkbox" id="device-login"> Dùng mã thiết bị nếu đăng nhập trình duyệt lỗi</label><p class="field-help">PADSwitcher không nhận mật khẩu. Mã thiết bị cần được bật trong cài đặt bảo mật ChatGPT.</p>`,async () => {
    const args = { label:p?.label || $('#profile-label').value, device:$('#device-login').checked, id:p?.id || null };
    closeModal(); const response = await call('add',args,'Đã lưu phiên đăng nhập được mã hóa.');
    if (response) { selectedId = response.result; render(); await call('refresh',{id:selectedId}); }
  },'Mở trang OpenAI');
}
function fillSettings() {
  if (!state) return;
  for (const key of ['workspace','desktopHome','codexPath']) $('#'+key).value = state.settings[key];
  $('#autoRefresh').checked = state.settings.autoRefresh;
}
function navigate(next) {
  page = next;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden',el.id !== next+'-page'));
  document.querySelectorAll('.nav').forEach(el => {el.classList.toggle('active',el.dataset.page === next);if(el.dataset.page===next)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#breadcrumb').textContent = ({accounts:'Tài khoản',connections:'Kết nối',settings:'Cài đặt',help:'Hướng dẫn'}[next]);
  if (next === 'settings') fillSettings();
  ui.apply();
  document.documentElement.scrollTop=0;
}
document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => navigate(button.dataset.page));
$('#search').oninput = render;
$('#privacy').onclick = () => { privacy = !privacy; localStorage.setItem('pad-hide-email',privacy ? '1' : '0'); $('.account-menu').open=false; render(); };
$('#add-account').onclick = () => accountModal();
const importCurrent = async () => { const response = await call('import',{},'Đã lưu tài khoản hiện tại.'); if (response) { selectedId = response.result; render(); await call('refresh',{id:selectedId}); } };
$('#import-current').onclick = () => { $('.account-menu').open=false; return importCurrent(); }; $('#empty-import').onclick = importCurrent;
document.addEventListener('click',event=>{const menu=$('.account-menu');if(menu.open&&!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{const menu=$('.account-menu');if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
$('#refresh-all').onclick = async () => { const response = await call('refreshAll'); if (response) toast(state.profiles.some(p => p.lastError) ? 'Đã cập nhật các hồ sơ có thể kết nối. Xem chi tiết hồ sơ bị lỗi.' : 'Đã cập nhật quota các tài khoản.'); };
$('#modal-close').onclick = closeModal; $('#modal-cancel').onclick = closeModal;
$('#modal-form').onsubmit = async event => { event.preventDefault(); if (modalSubmit) { const submit = modalSubmit; $('#modal-submit').disabled = true; try { await submit(); } finally { $('#modal-submit').disabled = false; } } };
$('#cancel-login').onclick = () => call('cancelLogin');
document.querySelectorAll('[data-pick]').forEach(button => button.onclick = async () => { const response = await call('pick',{kind:button.dataset.pick}); if (response?.result) { $('#'+button.dataset.pick).value = response.result; $('#settings-form').dataset.dirty = '1'; } });
$('#autoRefresh').onchange = () => { $('#settings-form').dataset.dirty = '1'; };
$('#settings-form').onsubmit = async event => { event.preventDefault(); const result = await call('settings',{ workspace:$('#workspace').value,desktopHome:$('#desktopHome').value,codexPath:$('#codexPath').value,autoRefresh:$('#autoRefresh').checked },'Đã lưu cài đặt.'); if (result) { delete $('#settings-form').dataset.dirty; fillSettings(); } };
$('#check-system').onclick = async () => {
  const response = await call('diagnostics'); if (!response) return;
  const info = response.result;
  $('#diagnostics').innerHTML = `<b>${e(info.version)}</b><br>${e(info.codex)}<br><br><b>Trước khi chuyển desktop</b><br>${info.blockers.length ? (ui.language==='en'?'Close: ':'Cần đóng: ')+e(info.blockers.join(', ')) : 'Không phát hiện ứng dụng dùng Codex đang chạy.'}<br><br><b>Kho dữ liệu riêng</b><br>${e(info.storage)}${info.loginRecovery ? '<br><br>Có phiên đăng nhập chưa lưu. Dùng Khôi phục đăng nhập bên dưới.' : ''}`; ui.apply($('#diagnostics'));
};
$('#restore').onclick = () => showModal('Khôi phục phiên trước', '<p>Khôi phục tài khoản trước lần chuyển desktop gần nhất. Hãy thoát Codex/ChatGPT và IDE đang dùng Codex trước khi tiếp tục.</p>',async () => { closeModal(); await call('restore',{},'Đã khôi phục phiên desktop trước. Mở lại Codex để kiểm tra.'); },'Khôi phục');
$('#recover-login').onclick = async () => { const response = await call('recoverLogin',{},'Đã lưu lại phiên đăng nhập còn tồn.'); if (response) { selectedId = response.result; navigate('accounts'); render(); } };
$('#open-data').onclick = () => call('openData');
$('#connect-vscode').onclick=()=>showModal('Kết nối VS Code', '<p>PADSwitcher sẽ đặt đường dẫn Codex của extension trong cài đặt User của VS Code. Giá trị trước được giữ để khôi phục.</p><p class="field-help">Áp dụng cho VS Code bản thường, hồ sơ mặc định. Sau lần thiết lập này, lưu công việc rồi chạy “Developer: Reload Window” một lần trong VS Code. Giữ gateway bật khi dùng extension; đổi tài khoản tiếp theo không cần tải lại cửa sổ.</p>',async()=>{closeModal();await call('configureVSCode',{},'Đã thiết lập. Lưu công việc và Reload Window một lần trong VS Code.');},'Thiết lập VS Code');
$('#restore-vscode').onclick=()=>call('restoreVSCode',{},'Đã khôi phục đường dẫn Codex trước. Reload Window để áp dụng.');
$('#copy-cli').onclick=()=>call('copyCLI',{},'Đã sao chép. Dán lệnh vào terminal PowerShell của VS Code.');
$('#open-gateway-cli').onclick=()=>call('launchGateway',{},'Đã mở Codex CLI qua PADSwitcher.');
$('#configure-auto').onclick=()=>{
  const policy=state.autoSwitch||{enabled:false,order:[]},order=policy.order.length?policy.order:state.profiles.map(p=>p.id);
  const profiles=[...state.profiles].sort((a,b)=>(order.indexOf(a.id)<0?999:order.indexOf(a.id))-(order.indexOf(b.id)<0?999:order.indexOf(b.id)));
  showModal('Tự đổi khi hết quota',`<div class="auto-switch-toggle"><label class="check-label"><input type="checkbox" id="auto-enabled" ${policy.enabled?'checked':''} ${profiles.length<2?'disabled':''}> Tự đổi và tiếp tục hội thoại</label></div><p class="auto-hint">${profiles.length<2?'Thêm ít nhất hai tài khoản để bật tính năng này.':'Chọn ít nhất hai tài khoản. Số ưu tiên nhỏ được thử trước; tài khoản hết quota sẽ được bỏ qua.'}</p><div class="auto-heading"><span>Tài khoản dự phòng</span><span>Ưu tiên</span></div><div class="auto-accounts">${profiles.map((p,i)=>`<div class="auto-row"><label class="check-label"><input type="checkbox" data-auto-id="${e(p.id)}" ${order.includes(p.id)?'checked':''}> <span data-literal>${e(p.label)}</span></label><input type="number" min="1" max="200" value="${i+1}" data-auto-priority="${e(p.id)}" aria-label="Ưu tiên ${e(p.label)}"></div>`).join('')}</div><p class="auto-hint">Dùng cho Codex đã kết nối qua PADSwitcher. Nếu không thể tiếp tục an toàn, ứng dụng sẽ dừng và báo lý do.</p>`,async()=>{
    const enabled=$('#auto-enabled').checked;
    const chosen=[...document.querySelectorAll('[data-auto-id]:checked')].map(el=>({id:el.dataset.autoId,priority:Number(document.querySelector('[data-auto-priority="'+el.dataset.autoId+'"]').value)}));
    if(chosen.some(x=>!Number.isInteger(x.priority)||x.priority<1||x.priority>200)){toast('Ưu tiên phải là số từ 1 đến 200.',true);return;}
    const response=await call('autoSwitchSettings',{enabled,order:chosen.sort((a,b)=>a.priority-b.priority).map(x=>x.id)},'Đã lưu cấu hình tự đổi tài khoản.');if(response)closeModal();
  },'Lưu thiết lập');
};
$('#cancel-recovery').onclick=()=>call('cancelRecovery',{},'Đã hủy tự tiếp tục đang chờ. Lượt đã chạy vẫn do Codex điều khiển.');
$('#recovery-history').onclick=()=>{
  const events=state.gateway?.recovery?.events||[],label=id=>state.profiles.find(p=>p.id===id)?.label||'Tài khoản';
  showModal('Lịch sử tự đổi',events.slice().reverse().map(x=>`<div class="history-entry"><small>${e(time(x.at))}${x.from?' · '+e(label(x.from)):''}${x.to?' → '+e(label(x.to)):''}</small><p>${e(ui.language==='en'?ui.t(x.message)===x.message?'Auto-switch event: '+x.type:ui.t(x.message):x.message)}</p></div>`).join('')||'<p>Chưa có lần tự đổi nào trong phiên này.</p>',async()=>closeModal(),'Đóng');
};
$('#stop-gateway').onclick=()=>showModal('Dừng kết nối Codex?', '<p>CLI và extension qua PADSwitcher sẽ mất kết nối. Để bật lại, chọn một tài khoản rồi bấm “Dùng tài khoản này”.</p>',async()=>{closeModal();await call(state.gateway?.activeTurns?'forceStopGateway':'stopGateway');},'Dừng kết nối');
$('#restore-trash').onclick = async () => {
  const response = await call('listTrash'); if (!response) return;
  if (!response.result.length) { toast('Chưa có hồ sơ nào trong trash.'); return; }
  showModal('Khôi phục hồ sơ đã xóa',`<p>Chọn hồ sơ để đưa lại vào danh sách tài khoản.</p><label for="trash-profile">Hồ sơ trong trash</label><select id="trash-profile">${response.result.map(p => `<option value="${e(p.id)}">${e(p.label)}</option>`).join('')}</select>`,async () => {
    const id = $('#trash-profile').value; closeModal(); const restored = await call('restoreProfile',{id},'Đã khôi phục hồ sơ.');
    if (restored) { selectedId = restored.result; navigate('accounts'); render(); }
  },'Khôi phục hồ sơ');
};
api.onState(next => { state = next; render(); });
api.onDevice(device => { $('#login-detail').textContent = ui.t(`Mã thiết bị: ${device.userCode} · Nhập mã trên trang OpenAI vừa mở.`); });
api.onRefreshError?.(error => toast(ui.error(error),true));
call('state').then(response => { if (response) { state = response.result; render(); } });
setInterval(() => { if (state && page === 'accounts' && !state.busy && !$('#modal').open) render(); },30000);
