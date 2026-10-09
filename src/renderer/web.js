'use strict';
window.padWebUI = (() => {
  const $=s=>document.querySelector(s);
  const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ui=window.padUI;let hooks;const running=new Set();
  const usable=p=>p.status==='ready'||p.status==='stopped'&&p.connected;
  function statusText(p){
    if(p.flow?.running)return ui.t(p.flow.message);
    const names={ready:'Sẵn sàng',signedOut:'Cần đăng nhập lại',setup:'Cần hoàn tất kết nối',stopped:p.connected?'Đã kết nối':'Chưa kết nối'};
    return ui.t(names[p.status]||'Chưa kết nối')+(p.mode?' · '+ui.t(p.mode==='full'?'Có công cụ lập trình':'Chỉ chat'):'');
  }
  function actions(p,w){
    const off=w.busy||!w.runtimeAvailable;
    if(p.flow?.running)return (p.flow.step==='login'?`<button class="button primary" data-web-connect="${escape(p.id)}">Mở cửa sổ đăng nhập</button>`:'')
      +`<button class="button ghost" data-web-cancel="${escape(p.id)}">Hủy</button>`;
    const connect=p.flow?.error?'Thử lại':p.status==='signedOut'?'Đăng nhập lại':'Kết nối';
    return (usable(p)&&!p.flow?.error?'':`<button class="button primary" data-web-connect="${escape(p.id)}" ${off?'disabled':''}>${connect}</button>`)
      +(p.selected?'':`<button class="button ${usable(p)?'primary':'secondary'}" data-web-select="${escape(p.id)}" ${w.busy?'disabled':''}>Dùng cho chat mới</button>`)
      +`<button class="button secondary" data-web-tools="${escape(p.id)}" ${off||!usable(p)?'disabled':''}>Công cụ lập trình</button>`
      +`<button class="button ghost" data-web-open="${escape(p.id)}" ${off?'disabled':''}>Nâng cao</button>`
      +`<button class="button ghost danger-text" data-web-remove="${escape(p.id)}" ${w.busy||w.enabled&&p.selected||w.active?'disabled':''}>Xóa</button>`;
  }
  function notifyFinished(w){
    // A flow that disappears without an error finished successfully.
    for(const p of w.profiles){
      if(p.flow?.running){running.add(p.id);continue;}
      if(running.delete(p.id)&&!p.flow&&usable(p))hooks?.toast(w.enabled&&p.selected
        ?`Đã kết nối ${p.label}. Trong VS Code: Reload Window, mở chat mới và chọn model (Web · ${p.label}).`
        :`Đã kết nối ${p.label}.`);
    }
  }
  function render(state){
    const w=state.web||{enabled:false,profiles:[],runtimeAvailable:false};
    $('#web-state').textContent=w.enabled?'Đang bật':'Đang tắt';
    const p=w.profiles.find(p=>p.id===w.selectedId);$('#web-selected').textContent=p?ui.t('Chat mới dùng: ')+p.label:ui.t('Chưa chọn tài khoản Web');
    $('#web-selected').setAttribute('data-literal','');
    $('#web-runtime-hint').classList.toggle('hidden',w.runtimeAvailable);
    const next=!w.profiles.length?'Bấm Thêm tài khoản ChatGPT để bắt đầu.'
      :w.enabled?'Đang bật. Trong VS Code: Reload Window (hoặc mở lại CLI) một lần, mở chat mới và chọn model có nhãn (Web · tên tài khoản).'
      :p&&usable(p)?'Tài khoản đã kết nối. Bấm Bật GPT Web để sử dụng.'
      :w.profiles.some(x=>x.flow?.running)?'Đang kết nối tài khoản. Làm theo hướng dẫn trên thẻ tài khoản bên dưới.'
      :'Bấm Kết nối ở tài khoản bên dưới.';
    $('#web-next-step').textContent=ui.t(next);$('#web-next-step').setAttribute('data-literal','');
    $('#web-next-step').classList.toggle('hidden',!w.runtimeAvailable);
    $('#web-error').classList.toggle('hidden',!w.lastError);$('#web-error').textContent=w.lastError||'';
    $('#web-empty').classList.toggle('hidden',w.profiles.length>0);
    $('#web-add').disabled=w.busy||!w.runtimeAvailable;
    $('#web-enable').classList.toggle('hidden',w.enabled);$('#web-disable').classList.toggle('hidden',!w.enabled);
    $('#web-enable').disabled=w.busy||w.setupLocked||!w.runtimeAvailable||!p||!usable(p)||!!p.flow?.running;
    $('#web-disable').disabled=w.busy;
    $('#web-refresh').disabled=w.busy;
    $('#web-accounts').innerHTML=w.profiles.map(p=>`<article class="panel web-account${p.flow?.running?' connecting':''}"><div class="web-account-heading"><div class="avatar">W</div><div class="web-account-identity"><h2 data-literal>${escape(p.label)}</h2><p data-literal class="web-account-status">${escape(statusText(p))}</p></div>${p.selected?'<span class="badge active">'+escape(ui.t('Dùng cho chat mới'))+'</span>':''}</div>${p.flow?.error?'<p data-literal class="banner danger web-flow-error" role="alert">'+escape(ui.t(p.flow.error))+(p.flow.detail?'<br>'+escape(ui.t('Chi tiết:'))+' '+escape(p.flow.detail):'')+'</p>':''}<div class="integration-actions">${actions(p,w)}</div></article>`).join('');
    const on=(attr,fn)=>$('#web-accounts').querySelectorAll(`[${attr}]`).forEach(b=>b.onclick=()=>fn(b.getAttribute(attr)));
    on('data-web-connect',id=>hooks.call('webConnect',{id}));
    on('data-web-cancel',id=>hooks.call('webCancelConnect',{id}));
    on('data-web-select',id=>hooks.call('webSelect',{id},'Đã chọn tài khoản cho chat Web mới. Mở chat mới để dùng.'));
    on('data-web-tools',id=>window.padWebSetup.open(id));
    on('data-web-open',id=>hooks.call('webOpen',{id}));
    on('data-web-remove',id=>{
      const p=w.profiles.find(p=>p.id===id);
      hooks.showModal('Xóa tài khoản GPT Web?',`<p data-literal>${escape(p.label)}</p><p>Tài khoản được bỏ khỏi danh sách. Dữ liệu đăng nhập riêng được giữ trong thư mục trash để phục hồi.</p>`,async()=>{hooks.closeModal();await hooks.call('webRemove',{id:p.id});},'Xóa');
    });
    notifyFinished(w);
    window.padWebSetup?.render(state);
  }
  function setup(next){
    hooks=next;window.padWebSetup?.setup(next);
    $('#web-add').onclick=()=>hooks.showModal('Thêm tài khoản ChatGPT','<label for="web-label">Tên tài khoản</label><input id="web-label" maxlength="80" placeholder="Ví dụ: ChatGPT cá nhân"><p class="field-help">Cửa sổ đăng nhập ChatGPT sẽ mở. Đăng nhập xong, PADSwitcher tự kiểm tra bằng một tin nhắn ngắn, cài model và bật GPT Web.</p>',async()=>{
      const count=document.querySelectorAll('#web-accounts .web-account').length;
      const label=$('#web-label').value.trim()||'ChatGPT '+(count+1);hooks.closeModal();
      const response=await hooks.call('webAdd',{label});if(response?.result)await hooks.call('webConnect',{id:response.result,activate:true});
    },'Tiếp tục');
    $('#web-enable').onclick=()=>hooks.call('webEnable',{},'GPT Web đã bật. Mở chat mới và chọn model Web.');
    $('#web-disable').onclick=()=>hooks.showModal('Tắt GPT Web?','<p>Bộ chạy Web sẽ dừng sau khi các lượt và thao tác thiết lập hoàn tất. Tài khoản đã đăng nhập được giữ lại. Các kết nối Codex thường tiếp tục hoạt động.</p>',async()=>{hooks.closeModal();await hooks.call('webDisable',{},'Đã tắt GPT Web.');},'Tắt GPT Web');
    $('#web-refresh').onclick=()=>hooks.call('webRefresh');
  }
  return {setup,render};
})();
