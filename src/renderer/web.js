'use strict';
window.padWebUI = (() => {
  const $=s=>document.querySelector(s);
  const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ui=window.padUI;let hooks;
  function render(state){
    const w=state.web||{enabled:false,profiles:[],runtimeAvailable:false};
    $('#web-state').textContent=w.enabled?'Đang bật':'Đang tắt';
    const p=w.profiles.find(p=>p.id===w.selectedId);$('#web-selected').textContent=p?p.label:ui.t('Chưa chọn tài khoản Web');
    $('#web-selected').setAttribute('data-literal','');
    $('#web-runtime-hint').classList.toggle('hidden',w.runtimeAvailable);
    const next=!p?'Bước tiếp theo: bấm Thêm tài khoản Web.':w.enabled?'Đã bật. Mở chat mới trong Codex và chọn model có nhãn (Web · tên tài khoản).':p.status==='ready'?'Tài khoản đã sẵn sàng. Bấm Bật GPT Web để sử dụng.':'Bước tiếp theo: bấm Đăng nhập & thiết lập ở tài khoản bên dưới.';
    $('#web-next-step').textContent=ui.t(next);$('#web-next-step').setAttribute('data-literal','');
    $('#web-next-step').classList.toggle('hidden',!w.runtimeAvailable);
    $('#web-error').classList.toggle('hidden',!w.lastError);$('#web-error').textContent=w.lastError||'';
    $('#web-empty').classList.toggle('hidden',w.profiles.length>0);
    $('#web-add').disabled=w.busy;
    $('#web-enable').disabled=w.busy||!w.runtimeAvailable||!p||p.status!=='ready'||!p.authenticated||w.enabled;
    $('#web-disable').disabled=w.busy||!w.enabled&&!w.profiles.some(p=>p.status!=='stopped');
    $('#web-refresh').disabled=w.busy;
    const names={ready:'Sẵn sàng',signedOut:'Cần đăng nhập',setup:'Cần thiết lập',stopped:'Chưa mở'};
    $('#web-accounts').innerHTML=w.profiles.map(p=>`<article class="panel web-account"><div class="web-account-heading"><div class="avatar">W</div><div class="web-account-identity"><h2 data-literal>${escape(p.label)}</h2><p>${escape(ui.t(names[p.status]||'Chưa mở'))}${p.mode?' · '+escape(p.mode==='full'?ui.t('Có công cụ'):ui.t('Chỉ chat')):''}</p></div>${p.selected?'<span class="badge active">'+escape(ui.t('Dùng cho chat mới'))+'</span>':''}</div>${p.operation?'<p data-literal class="field-help">'+escape(p.operation)+'</p>':''}<div class="integration-actions"><button class="button secondary" data-web-open="${escape(p.id)}" ${w.busy||!w.runtimeAvailable?'disabled':''}>Đăng nhập &amp; thiết lập</button><button class="button ${p.selected?'ghost':'primary'}" data-web-select="${escape(p.id)}" ${w.busy||p.selected?'disabled':''}>${p.selected?'Đã chọn':'Chọn tài khoản'}</button><button class="button ghost danger-text" data-web-remove="${escape(p.id)}" ${w.busy||w.enabled&&p.selected||p.status!=='stopped'||w.active?'disabled':''}>Xóa</button></div></article>`).join('');
    $('#web-accounts').querySelectorAll('[data-web-open]').forEach(b=>b.onclick=()=>hooks.call('webOpen',{id:b.dataset.webOpen}));
    $('#web-accounts').querySelectorAll('[data-web-select]').forEach(b=>b.onclick=()=>hooks.call('webSelect',{id:b.dataset.webSelect},'Đã chọn tài khoản cho chat Web mới. Mở lại danh sách model nếu cần.'));
    $('#web-accounts').querySelectorAll('[data-web-remove]').forEach(b=>b.onclick=()=>{
      const p=w.profiles.find(p=>p.id===b.dataset.webRemove);
      hooks.showModal('Xóa tài khoản GPT Web?',`<p data-literal>${escape(p.label)}</p><p>Tài khoản được bỏ khỏi danh sách. Dữ liệu đăng nhập riêng được giữ trong thư mục trash để phục hồi.</p>`,async()=>{hooks.closeModal();await hooks.call('webRemove',{id:p.id});},'Xóa');
    });
  }
  function setup(next){
    hooks=next;
    $('#web-add').onclick=()=>hooks.showModal('Thêm tài khoản GPT Web','<label for="web-label">Tên tài khoản</label><input id="web-label" required maxlength="80" placeholder="Ví dụ: ChatGPT cá nhân"><p class="field-help">Mỗi tài khoản có phiên trình duyệt riêng. Bạn sẽ đăng nhập trong cửa sổ GPT Web.</p>',async()=>{
      const label=$('#web-label').value.trim();if(!label)return;hooks.closeModal();await hooks.call('webAdd',{label},'Đã thêm tài khoản. Mở Đăng nhập & thiết lập để tiếp tục.');
    },'Thêm tài khoản Web');
    $('#web-enable').onclick=()=>hooks.call('webEnable',{},'GPT Web đã bật. Mở chat mới và chọn model Web.');
    $('#web-disable').onclick=()=>hooks.showModal('Tắt GPT Web?','<p>Bộ chạy Web sẽ dừng sau khi các lượt và thao tác thiết lập hoàn tất. Tài khoản đã đăng nhập được giữ lại. Các kết nối Codex thường tiếp tục hoạt động.</p>',async()=>{hooks.closeModal();await hooks.call('webDisable',{},'Đã tắt GPT Web.');},'Tắt GPT Web');
    $('#web-refresh').onclick=()=>hooks.call('webRefresh');
  }
  return {setup,render};
})();
