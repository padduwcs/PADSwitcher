'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8');
const script = fs.readFileSync(path.join(__dirname,'../src/renderer/app.js'),'utf8');
const mock = require('../scripts/preview-data.cjs');
const settle = async () => { await new Promise(resolve => setTimeout(resolve,10)); };
test('Say hi sends the selected account without activation and all means every saved account, including search-hidden rows',async t=>{
  const w=dom(t);await settle();const d=w.document,calls=[],action=w.pad.action;
  w.pad.action=async(command,args)=>{calls.push({command,args});return action(command,args);};
  d.querySelector('[data-service=codex]').click();d.querySelectorAll('.account-card')[1].click();
  const id=d.querySelector('.account-card.selected').dataset.id;d.querySelector('#say-hi-one').click();await settle();
  assert.equal(calls[0].command,'sayHi');assert.equal(calls[0].args.id,id);assert(d.querySelector('#say-hi-one').disabled);
  assert(!d.querySelector('#refresh-all').disabled);await new Promise(r=>setTimeout(r,60));
  assert(d.querySelector('#say-hi-summary').textContent.includes('1/1'));assert.equal(d.querySelectorAll('.say-hi-row').length,1);
  d.querySelector('#search').value='Dự án';d.querySelector('#search').dispatchEvent(new w.Event('input'));
  d.querySelector('#say-hi-all').click();await settle();
  for(let wait=0;wait<100&&d.querySelector('#say-hi-all').disabled;wait++)await settle();
  assert.equal(d.querySelectorAll('.say-hi-row').length,3);assert(d.querySelector('#say-hi-summary').textContent.includes('2/3'));
  assert(!calls.some(c=>['gateway','switch','launch'].includes(c.command)));
  d.querySelector('#language-toggle').click();assert.equal(d.querySelector('#say-hi-all').textContent,'Say hi to all');
  assert.match(d.querySelector('#say-hi-summary').textContent,/2\/3 sent/);assert(d.querySelector('.say-hi-row.failed').textContent.includes('Codex did not complete'));
  d.querySelector('#say-hi-dismiss').click();await settle();assert(d.querySelector('#say-hi-panel').classList.contains('hidden'));
});
test('Say hi stop, in-flight account protection, empty state and error text remain safe',async t=>{
  const empty=dom(t,false);await settle();assert(empty.document.querySelector('#say-hi-all').disabled);
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-service=codex]').click();
  d.querySelector('#say-hi-all').click();await settle();assert(d.querySelector('#reauth-profile').disabled);assert(d.querySelector('#remove-profile').disabled);
  d.querySelector('#say-hi-stop').click();await new Promise(r=>setTimeout(r,60));
  assert.equal(d.querySelectorAll('.say-hi-row.cancelled').length,2);assert(!d.querySelector('#say-hi-one').disabled);
  const unsafe=dom(t,true,s=>{s.sayHi={active:false,rows:[{id:s.profiles[0].id,label:'<img src=x onerror=alert(1)>',status:'uncertain',error:{code:'SAY_HI_UNCERTAIN',message:'<script>bad</script>'}}]};});await settle();
  assert.equal(unsafe.document.querySelector('#say-hi-rows img'),null);assert.equal(unsafe.document.querySelector('#say-hi-rows script'),null);
  assert(unsafe.document.querySelector('#say-hi-rows').textContent.includes('<img'));
});
test('services are the entry point; navigation preserves selection and never switches or launches an account',async t=>{
  const w=dom(t);await settle();const d=w.document,calls=[],action=w.pad.action;
  w.pad.action=async(command,args)=>{calls.push(command);return action(command,args);};
  assert.equal(d.querySelector('.page:not(.hidden)').id,'services-page');
  assert.deepEqual([...d.querySelectorAll('.sidebar .nav')].map(n=>n.dataset.page),['services','settings','help']);
  assert.equal(d.querySelectorAll('.service-card').length,2);
  d.querySelector('[data-service=codex]').click();assert.equal(d.querySelector('.page:not(.hidden)').id,'accounts-page');
  assert.equal(d.querySelector('.nav.active').dataset.page,'services');assert.equal(d.querySelector('.service-tab[aria-current]').dataset.page,'accounts');
  d.querySelectorAll('.account-card')[1].click();const selected=d.querySelector('.account-card.selected').dataset.id;
  d.querySelector('.service-tab[data-page=connections]').click();assert.equal(d.querySelector('.page:not(.hidden)').id,'connections-page');
  d.querySelector('#breadcrumb [data-page=services]').click();assert(d.querySelector('#service-context').classList.contains('hidden'));
  d.querySelector('[data-service=kaggle]').click();assert.equal(d.querySelector('.page:not(.hidden)').id,'kaggle-page');assert(d.querySelector('#service-tabs').classList.contains('hidden'));
  d.querySelector('#breadcrumb [data-page=services]').click();d.querySelector('[data-service=codex]').click();
  assert.equal(d.querySelector('.account-card.selected').dataset.id,selected);assert.deepEqual(calls,[]);
});
test('service cards remain usable after updates and translate in both languages',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('#language-toggle').click();assert.equal(d.querySelector('#services-heading h1').textContent,'Services');
  assert(d.querySelector('[data-service=kaggle]').textContent.includes('3 accounts'));
  d.querySelector('[data-service=codex]').click();assert.equal(d.querySelector('.service-tab[aria-current]').textContent,'Accounts');
  d.querySelector('#use-gateway').click();await settle();d.querySelector('#breadcrumb [data-page=services]').click();
  assert(d.querySelector('[data-service=codex] .service-state').textContent.includes('Connected'));
  d.querySelector('[data-service=kaggle]').click();assert.equal(d.querySelector('.page:not(.hidden)').id,'kaggle-page');
});
test('global settings lead to service settings, preserve unsaved Codex fields and show matching help',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('.nav[data-page=settings]').click();assert.equal(d.querySelector('#settings-page #settings-form'),null);
  d.querySelector('#service-settings-links [data-page=codex-settings]').click();assert.equal(d.querySelector('.page:not(.hidden)').id,'codex-settings-page');
  const field=d.querySelector('#workspace');field.value='D:\\Unsaved work';d.querySelector('#settings-form').dataset.dirty='1';
  d.querySelector('.nav[data-page=help]').click();d.querySelector('[data-help-service=kaggle]').click();
  assert(d.querySelector('#help-codex').classList.contains('hidden'));assert(!d.querySelector('#help-kaggle').classList.contains('hidden'));assert(d.querySelector('#help-kaggle').textContent.includes('padkaggle use username'));
  d.querySelector('#language-toggle').click();assert(d.querySelector('#help-kaggle').textContent.includes('Select from your terminal'));
  d.querySelector('.nav[data-page=settings]').click();d.querySelector('#service-settings-links [data-page=codex-settings]').click();assert.equal(field.value,'D:\\Unsaved work');
});
test('Kaggle reveals optional details on demand and preserves them during refreshes',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('[data-service=kaggle]').click();assert.equal(d.querySelector('#kg-management').open,false);assert.equal(d.querySelector('#kg-quota-info').open,false);
  assert(d.querySelector('#kg-terminal-copy').classList.contains('primary'));
  d.querySelector('#kg-management').open=true;d.querySelector('#kg-quota-info').open=true;
  d.querySelector('#kg-refresh-one').click();await settle();assert(d.querySelector('#kg-management').open);assert(d.querySelector('#kg-quota-info').open);
  d.querySelectorAll('.kg-account')[1].click();assert.equal(d.querySelector('#kg-management').open,false);
});
test('Kaggle account cards omit idle filler and duplicate names but keep activity and warnings',async t=>{
  const w=dom(t,true,s=>{
    const [idle,active]=s.kaggle.accounts;
    idle.label=idle.username;idle.notebooks.forEach(n=>n.status='complete');
    active.notebooks.push({ref:'padvision/waiting',status:'queued'});
  });await settle();const d=w.document;d.querySelector('[data-service=kaggle]').click();
  const [idle,active,expired]=d.querySelectorAll('.kg-account');
  assert.equal(idle.querySelector('.avatar'),null);assert.equal(idle.querySelector('small'),null);assert.equal(idle.querySelector('.kg-account-hint'),null);
  assert(idle.querySelector('.kg-account-quota').textContent.includes('18,5 h'));assert.equal(idle.getAttribute('aria-pressed'),'true');
  assert.equal(active.querySelector('.kg-account-hint').textContent,'1 đang chạy · 1 đang chờ');
  assert.equal(expired.querySelector('.kg-account-hint').textContent,'Cần token mới');assert(expired.querySelector('.kg-account-quota').classList.contains('kg-stale'));
  active.click();assert.equal(d.querySelector('.kg-account.selected').getAttribute('aria-pressed'),'true');assert.equal(d.querySelectorAll('.kg-account[aria-pressed=true]').length,1);
});
test('Kaggle offers the same three-step guide in help and keeps technical instructions collapsed',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-service=kaggle]').click();
  assert.equal(d.querySelector('#kg-layout-hint'),null);assert.equal(d.querySelector('#kg-scope-info'),null);
  assert.equal(d.querySelector('#kg-terminal-copy').textContent,'Sao chép lệnh');d.querySelector('#kg-help').click();
  assert.equal(d.querySelectorAll('#modal-body .kg-instructions>li').length,3);
  const guide=d.querySelector('#modal-body .kg-help').textContent;
  assert.equal(d.querySelectorAll('#modal-body details').length,2);assert.equal(d.querySelector('#modal-body details[open]'),null);
  assert(guide.includes('python'));assert(guide.includes('kaggle kernels push'));d.querySelector('#modal-cancel').click();
  d.querySelector('.nav[data-page=help]').click();d.querySelector('[data-help-service=kaggle]').click();
  assert.equal(d.querySelector('#help-kaggle .kg-help').textContent,guide);
  d.querySelector('#language-toggle').click();assert(d.querySelector('#help-kaggle').textContent.includes('Copy command'));
});
test('Kaggle setup puts a ready user first and keeps Python configuration available on demand',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-service=kaggle]').click();d.querySelector('#kg-setup').click();await settle();
  assert(d.querySelector('.kg-tool-state.ready'));assert.equal(d.querySelector('#modal-body details').open,false);
  assert(d.querySelector('#kg-copy-setup').closest('details'));assert(d.querySelector('#kg-python').closest('details'));
  assert(d.querySelector('#kg-tools-terminal'));d.querySelector('#modal-cancel').click();d.querySelector('#kg-add').click();await settle();
  assert.equal(d.querySelector('#kg-folder').closest('details').open,false);assert(d.querySelector('#kg-token-input').required);
});
test('Kaggle supports independent account terminals, search, quota and notebook monitoring in both languages',async t=>{
  const w=dom(t);await settle();const d=w.document,commands=[],action=w.pad.action;
  w.pad.action=async(command,args)=>{commands.push({command,args});return action(command,args);};
  d.querySelector('[data-page=kaggle]').click();assert.equal(d.querySelector('#kaggle-page').classList.contains('hidden'),false);
  assert.equal(d.querySelectorAll('.kg-account').length,3);assert(d.querySelector('#kg-detail').textContent.includes('18,5 h'));
  d.querySelector('#kg-help').click();assert(d.querySelector('#modal-body').textContent.includes('12 notebook'));d.querySelector('#modal-cancel').click();assert(d.querySelector('#kg-detail').textContent.includes('Đang chạy'));
  d.querySelector('#kg-launch').click();await settle();d.querySelectorAll('.kg-account')[1].click();d.querySelector('#kg-launch').click();await settle();
  const launches=commands.filter(c=>c.command==='kaggleLaunch');assert.equal(launches.length,2);assert.notEqual(launches[0].args.id,launches[1].args.id);assert(!commands.some(c=>c.command==='gateway'||c.command==='switch'));
  const search=d.querySelector('#kg-search');search.value='archive';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.kg-account').length,1);assert(d.querySelector('#kg-detail').textContent.includes('Dữ liệu cũ'));
  d.querySelector('#language-toggle').click();assert(d.querySelector('#kg-detail').textContent.includes('Older data'));assert(d.querySelector('#kg-detail').textContent.includes('expired or was revoked'));
  assert.equal(d.querySelector('#kg-launch').textContent,'Open new terminal');assert.equal(search.placeholder,'Search name or username');
});
test('Kaggle verifies a token once, clears password inputs and never inserts token into monitoring state',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();d.querySelector('#kg-add').click();await settle();
  const token='KGAT_fixture-renderer-token';d.querySelector('#kg-token-input').value=token;d.querySelector('#kg-label').value='<img src=x onerror=alert(1)>';
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(d.querySelector('#kg-token-input').value,'');await settle();
  assert.equal(d.querySelector('#modal').open,false);assert.equal(d.querySelectorAll('.kg-account').length,4);assert.equal(d.querySelector('#kg-detail img'),null);assert(!d.querySelector('#kg-detail').textContent.includes(token));
  d.querySelector('#kg-token').click();await settle();d.querySelector('#kg-token-input').value=token;d.querySelector('#modal-cancel').click();assert.equal(d.querySelector('#kg-token-input').value,'');
});

test('Kaggle copies selection for the existing terminal and enables/removes PowerShell commands explicitly',async t=>{
  const w=dom(t);await settle();const d=w.document,calls=[],action=w.pad.action;w.pad.action=async(command,args)=>{calls.push({command,args});return action(command,args);};
  d.querySelector('[data-page=kaggle]').click();d.querySelector('#kg-terminal-copy').click();await settle();
  assert.equal(calls.find(c=>c.command==='kaggleTerminalCopy').args.id,'11111111-1111-4111-8111-111111111111');assert(!calls.some(c=>c.command==='kaggleLaunch'));
  d.querySelector('#kg-terminal-setup').click();await settle();assert(d.querySelector('#modal-body').textContent.includes('padkaggle off'));assert(!calls.some(c=>c.command==='kaggleTerminalConfigure'));
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(calls.find(c=>c.command==='kaggleTerminalConfigure').args.enabled,true);
  d.querySelector('#kg-terminal-setup').click();await settle();d.querySelector('#kg-terminal-disable').click();await settle();assert.equal(calls.filter(c=>c.command==='kaggleTerminalConfigure').at(-1).args.enabled,false);
});
test('Kaggle setup guides missing dependencies and notebook pins can be managed',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();
  const action=w.pad.action;w.pad.action=async(command,args)=>{const r=await action(command,args);if(command==='kaggleTools'){r.result.supported=false;r.state.kaggle.tool.supported=false;}return r;};
  d.querySelector('#kg-add').click();await settle();assert.equal(d.querySelector('#kg-token-input'),null);assert(d.querySelector('#modal-body').textContent.includes('Cần cài'));
  d.querySelector('#modal-cancel').click();d.querySelector('#kg-pin').click();d.querySelector('#kg-ref').value='padresearch/new-job';d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert(d.querySelector('#kg-detail').textContent.includes('padresearch/new-job'));d.querySelector('[data-kg-unpin="padresearch/new-job"]').click();await settle();assert.equal(d.querySelector('[data-kg-unpin="padresearch/new-job"]'),null);
});
test('Kaggle empty state and removal explain terminal credential lifetime',async t=>{
  const w=dom(t,false);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();assert(d.querySelector('#kg-empty').textContent.includes('đầu tiên'));assert(d.querySelector('#kg-toolbar').classList.contains('hidden'));
  const other=dom(t);await settle();const od=other.document;od.querySelector('[data-page=kaggle]').click();od.querySelector('#kg-remove').click();assert(od.querySelector('#modal-body').textContent.includes('Terminal đã mở vẫn giữ token'));od.querySelector('#modal-form').dispatchEvent(new other.Event('submit',{cancelable:true}));await settle();assert.equal(od.querySelectorAll('.kg-account').length,2);
});
test('Kaggle separates pinned rows, preserves all scroll positions and moves quick pins without duplication',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();
  assert.equal(d.querySelectorAll('#kg-notebooks-pinned .kg-notebook').length,1);assert.equal(d.querySelectorAll('#kg-notebooks-recent .kg-notebook').length,2);
  const regions=['kg-notebooks-pinned','kg-notebooks-recent'];
  regions.forEach((id,i)=>d.getElementById(id).scrollTop=(i+1)*23);
  d.querySelector('#kg-refresh-one').click();await settle();regions.forEach((id,i)=>assert.equal(d.getElementById(id).scrollTop,(i+1)*23));
  const ref='padresearch/feature-index';d.querySelector(`[data-kg-pin-ref="${ref}"]`).click();await settle();
  assert(d.querySelector(`#kg-notebooks-pinned [data-kg-open="${ref}"]`));assert.equal(d.querySelector(`#kg-notebooks-recent [data-kg-open="${ref}"]`),null);
  d.querySelector(`[data-kg-unpin="${ref}"]`).click();await settle();assert(d.querySelector(`#kg-notebooks-recent [data-kg-open="${ref}"]`));
  d.querySelectorAll('.kg-account')[1].click();regions.forEach(id=>assert.equal(d.getElementById(id).scrollTop,0));
});
test('Kaggle resizing supports keyboard, persistence through updates, responsive bounds and reset',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();
  const layout=d.querySelector('#kg-layout');Object.defineProperty(layout,'clientWidth',{value:1000,configurable:true});
  for(const id of ['kg-list','kg-notebooks-pinned','kg-notebooks-recent'])d.getElementById(id).getBoundingClientRect=()=>({height:300,top:0});
  w.padKaggleUI.layout();const root=d.querySelector('#kaggle-content');
  let handle=d.querySelector('[data-kg-resize=recent]');handle.focus();handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(root.style.getPropertyValue('--kg-recent-height'),'320px');assert.equal(JSON.parse(w.localStorage.getItem('pad-kaggle-layout')).recent,320);
  d.querySelector('#kg-refresh-one').click();await settle();assert.equal(root.style.getPropertyValue('--kg-recent-height'),'320px');
  d.querySelector('[data-kg-resize=width]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(JSON.parse(w.localStorage.getItem('pad-kaggle-layout')).width,.32);
  Object.defineProperty(layout,'clientWidth',{value:700,configurable:true});w.dispatchEvent(new w.Event('resize'));assert.equal(root.style.getPropertyValue('--kg-account-width'),'240px');
  d.querySelector('#language-toggle').click();assert(d.querySelector('[data-kg-resize=recent]').getAttribute('aria-label').includes('Resize Recent'));
  d.querySelector('#kg-layout-reset').click();assert.equal(w.localStorage.getItem('pad-kaggle-layout'),null);assert.equal(root.style.getPropertyValue('--kg-recent-height'),'');
  assert.equal(d.querySelector('#kg-detail-body').hasAttribute('data-kg-scroll'),false);
});
test('Kaggle drag resizing survives a state update and cancellation restores the prior size',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();
  Object.defineProperty(d.querySelector('#kg-layout'),'clientWidth',{value:1000});d.querySelector('#kg-notebooks-pinned').getBoundingClientRect=()=>({height:240});w.padKaggleUI.layout();
  const pointer=(type,y)=>{const event=new w.MouseEvent(type,{bubbles:true,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:7});return event;};
  d.querySelector('[data-kg-resize=pinned]').dispatchEvent(pointer('pointerdown',200));
  d.querySelector('#kaggle-content').dispatchEvent(pointer('pointermove',360));assert.equal(d.querySelector('#kaggle-content').style.getPropertyValue('--kg-pinned-height'),'400px');
  d.querySelector('#kg-refresh-one').click();await settle();d.querySelector('#kaggle-content').dispatchEvent(pointer('pointermove',380));assert.equal(d.querySelector('#kaggle-content').style.getPropertyValue('--kg-pinned-height'),'420px');
  d.querySelector('#kaggle-content').dispatchEvent(pointer('pointercancel',380));assert.equal(d.querySelector('#kaggle-content').style.getPropertyValue('--kg-pinned-height'),'');assert.equal(w.localStorage.getItem('pad-kaggle-layout'),null);assert(!d.body.classList.contains('kg-resizing-height'));
  // The release position is authoritative when the browser coalesces the last move.
  d.querySelector('#kg-notebooks-pinned').getBoundingClientRect=()=>({height:240});d.querySelector('[data-kg-resize=pinned]').dispatchEvent(pointer('pointerdown',200));d.querySelector('#kaggle-content').dispatchEvent(pointer('pointermove',300));d.querySelector('#kaggle-content').dispatchEvent(pointer('pointerup',320));assert.equal(JSON.parse(w.localStorage.getItem('pad-kaggle-layout')).pinned,360);
});
test('Kaggle loads one page on downward end scroll, waits while busy and leaves errors for explicit retry',async t=>{
  const w=dom(t);await settle();const d=w.document,action=w.pad.action,calls=[];
  let error=false;
  w.pad.action=async(command,args)=>{
    calls.push(command);const r=await action(command,args);
    if(command==='state'||command==='kaggleRefresh'||command==='kaggleNotebooksMore'){
      const k=command==='state'?r.result.kaggle:r.state.kaggle;
      k.accounts[0].notebookList={hasMore:true,loading:false,error:error?'Kaggle đang giới hạn yêu cầu. Chờ trước khi làm mới lại.':null};
    }
    return r;
  };
  d.querySelector('[data-page=kaggle]').click();d.querySelector('#kg-refresh-one').click();await settle();
  const metrics=region=>{Object.defineProperties(region,{clientHeight:{value:100,configurable:true},scrollHeight:{value:300,configurable:true}});};
  let box=d.querySelector('#kg-notebooks-recent');metrics(box);box.scrollTop=160;box.dispatchEvent(new w.Event('scroll'));box.dispatchEvent(new w.Event('scroll'));
  await settle();assert.equal(calls.filter(c=>c==='kaggleNotebooksMore').length,1);assert(d.querySelector('#kg-notebooks-recent').getAttribute('aria-busy')==='true');
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(d.querySelector('#kg-notebooks-recent').scrollTop,160);assert(d.querySelectorAll('#kg-notebooks-recent .kg-notebook').length>2);
  error=true;d.querySelector('#kg-load-more').click();await new Promise(resolve=>setTimeout(resolve,60));assert(d.querySelector('.kg-page-error'));const count=calls.filter(c=>c==='kaggleNotebooksMore').length;
  box=d.querySelector('#kg-notebooks-recent');metrics(box);box.scrollTop=200;box.dispatchEvent(new w.Event('scroll'));await settle();assert.equal(calls.filter(c=>c==='kaggleNotebooksMore').length,count);
  error=false;d.querySelector('#kg-load-more').click();await new Promise(resolve=>setTimeout(resolve,60));assert.equal(calls.filter(c=>c==='kaggleNotebooksMore').length,count+1);assert.equal(d.querySelector('.kg-page-error'),null);
});
test('scoped UI changes only the selected account and auto-switch policy, and translates separate account setup',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('#use-gateway').click();await settle();
  d.querySelector('[data-route=jetbrains]').click();assert.equal(d.querySelector('#modal').open,true);
  d.querySelector('#route-mode').value='private';d.querySelector('#route-mode').dispatchEvent(new w.Event('change'));
  const ids=[...d.querySelectorAll('.account-card')].map(c=>c.dataset.id);d.querySelector('#route-profile').value=ids[1];
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.equal(d.querySelector('#account-scope').value,'jetbrains');assert(d.querySelector('#route-jetbrains').textContent.includes('Tài khoản riêng'));
  d.querySelectorAll('.account-card')[1].click();assert.equal(d.querySelector('#use-gateway').disabled,true);
  d.querySelector('#configure-auto').click();d.querySelector('#auto-enabled').checked=true;d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert(d.querySelector('#recovery-title').textContent.includes('Bật'));
  d.querySelector('#account-scope').value='shared';d.querySelector('#account-scope').dispatchEvent(new w.Event('change'));assert(d.querySelector('#recovery-title').textContent.includes('Tắt'));assert.equal(d.querySelector('#use-gateway').disabled,false);
  d.querySelector('#account-scope').value='jetbrains';d.querySelector('#account-scope').dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('#use-gateway').disabled,true);
  d.querySelector('#language-toggle').click();assert(d.querySelector('#route-jetbrains').textContent.includes('Separate account'));
  d.querySelector('[data-route=jetbrains]').click();assert.equal(d.querySelector('#modal-title').textContent,'Account for JetBrains');assert(d.querySelector('#modal-body').textContent.includes('Later account switches do not need a restart'));
});
test('JetBrains distinguishes configured and connected states, translates and never appears as VS Code',async t=>{
  const w=dom(t,true,s=>{s.jetbrains={configuration:'configured',runtimePresent:true};s.gateway={...s.gateway,status:'ready',connected:{jetbrains:1,vscode:0,cli:0}};});await settle();
  assert.equal(w.document.querySelector('#jetbrains-live').textContent,'Đang kết nối');assert.equal(w.document.querySelector('#jetbrains-config').textContent,'Đã thiết lập');
  assert.equal(w.document.querySelector('#connect-jetbrains').disabled,true);assert.equal(w.document.querySelector('#restore-jetbrains').disabled,false);
  assert(!w.document.querySelector('#vscode-pill').classList.contains('connected'));
  w.document.querySelector('#language-toggle').click();assert.equal(w.document.querySelector('#jetbrains-live').textContent,'Connected');assert.equal(w.document.querySelector('#connect-jetbrains').textContent,'Set up JetBrains');
});
function dom(t,demo = true, editState = null) {
  const window = new JSDOM(html,{url:'http://localhost/'+(demo?'?demo=1':''),runScripts:'outside-only'}).window;
  const errors=[];window.addEventListener('error',event=>errors.push(event.message));
  window.HTMLDialogElement.prototype.showModal = function() {this.setAttribute('open','');};
  window.HTMLDialogElement.prototype.close = function() {this.removeAttribute('open');};
  window.eval(mock);
  if (editState) {
    const action = window.pad.action;
    window.pad.action = async (...args) => { const response = await action(...args); if (args[0] === 'state') editState(response.result); return response; };
  }
  window.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/i18n.js'),'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/services.js'),'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/kaggle.js'),'utf8'));
  window.eval(script); t.after(() => {window.close();assert.deepEqual(errors,[],'Renderer must not throw uncaught errors');}); return window;
}
test('Windows desktop launch names the shared account, explains history and waits for a verified connection',async t=>{
  const w=dom(t,true,s=>{s.platform='windows';s.desktop={available:true,configuration:'notConfigured',home:'/home/test/.codex',connected:0};s.gateway={...s.gateway,status:'ready',profileId:s.profiles[1].id};});await settle();const d=w.document,calls=[];
  w.pad.action=async(command,args)=>{calls.push({command,args});return {ok:true,result:{launched:true,connected:false}};};
  assert(!d.querySelector('#open-desktop-connected').disabled);d.querySelector('#open-desktop-connected').click();
  assert(d.querySelector('#modal-body').textContent.includes('Dự án · Pro'));assert(d.querySelector('#modal-body').textContent.includes('thoát hẳn desktop'));assert.equal(calls.length,0);
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.equal(calls[0].command,'desktopLaunch');assert.equal(calls[0].args.id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');assert(!calls.some(c=>c.command==='switch'));
  assert(d.querySelector('.toast').textContent.includes('Chờ trạng thái'));assert.equal(d.querySelector('#desktop-state').textContent,'Chưa kết nối');
});
test('desktop indicators distinguish waiting, pending and missing app states and translate account labels safely',async t=>{
  for(const [desktop,expected]of [[{available:false},'Chưa kết nối'],[{available:true,configuration:'configured'},'Chờ desktop'],[{available:true,connected:2,pendingId:'next'},'Đang chờ đổi tài khoản']]){
    const w=dom(t,true,s=>{s.platform='windows';s.desktop={...desktop,profileId:s.profiles[1].id};});await settle();const d=w.document;
    assert.equal(d.querySelector('#desktop-state').textContent,expected);assert(d.querySelector('#open-desktop-connected').disabled);
    d.querySelector('#language-toggle').click();if(desktop.connected){assert.equal(d.querySelector('#desktop-state').textContent,'Waiting to switch accounts');assert(d.querySelector('#desktop-next').textContent.includes('Dự án · Pro'));}else if(!desktop.available)assert(d.querySelector('#desktop-next').textContent.includes('Install the official'));
  }
});
test('renderer shows a useful empty state and disables quota refresh with no accounts',async t => {
  const w = dom(t,false); await settle();
  assert.equal(w.document.querySelector('#empty').classList.contains('hidden'),false);
  assert.equal(w.document.querySelector('#total').textContent,'0');
  assert.equal(w.document.querySelector('#refresh-all').disabled,true);
  assert.equal(w.document.querySelector('#account-layout').classList.contains('hidden'),true);
});
test('renderer distinguishes depleted quota from ready accounts and marks stale data',async t => {
  const w = dom(t); await settle(); const d = w.document;
  assert.equal(d.querySelector('#total').textContent,'3'); assert.equal(d.querySelector('#available').textContent,'1');
  assert.equal(d.querySelectorAll('.account-card').length,3);
  assert.ok(d.querySelector('#account-list').textContent.includes('Dữ liệu cũ'));
  assert.equal(d.querySelector('#use-desktop').disabled,true);
  d.querySelectorAll('.account-card')[1].click(); assert.equal(d.querySelector('#use-desktop').disabled,false);
  assert.ok(d.querySelector('#detail').textContent.includes('24% đã dùng'));
  assert.ok(d.querySelector('#detail .quota-label b').textContent.includes('76%'));
  assert.equal(d.querySelector('#detail progress').value,76);
  assert.ok(d.querySelector('#detail progress').getAttribute('aria-label').includes('76% còn lại'));
  assert.equal(d.querySelector('#account-list progress').value,0);
  assert.ok(d.querySelector('#account-list progress').parentElement.classList.contains('low'));
  assert.ok(d.querySelector('#detail').textContent.includes('Nguồn: dịch vụ Codex'));
});

test('model diagnostics distinguish attempts from charges and show minute refresh in both languages',async t=>{
  const w=dom(t);await settle();const info={modelUsage:[{scope:'shared',requests:2,attempts:3,quotaRetries:1,authRefreshes:0,inputTokens:100,cachedInputTokens:90,lastModel:'gpt-fixture',lastEffort:'medium'}]};
  const action=w.pad.action;w.pad.action=async(...args)=>{const result=await action(...args);if(args[0]==='diagnostics')result.result.modelUsage=info.modelUsage;return result;};
  w.document.querySelector('#check-system').click();await settle();const vi=w.document.querySelector('#diagnostics').textContent;assert(vi.includes('90%'));assert(vi.includes('Lần gửi tới model'));assert(vi.includes('không phải số quota bị trừ'));
  assert(w.document.querySelector('label.check-label').textContent.includes('mỗi phút'));
  w.document.querySelector('#language-toggle').click();w.document.querySelector('#check-system').click();await settle();const en=w.document.querySelector('#diagnostics').textContent;assert(en.includes('Upstream attempts'));assert(en.includes('not quota charges'));
  assert(w.document.querySelector('label.check-label').textContent.includes('every minute'));
});

test('a failed refresh marks the last snapshot stale even when its timestamp is recent',async t => {
  const w = dom(t,true,state => {state.profiles[0].status='error';}); await settle(); const d = w.document;
  assert.ok(d.querySelector('#detail .timestamp').classList.contains('stale'));
  assert.ok(d.querySelector('.account-card .timestamp').textContent.includes('Dữ liệu cũ'));
});

test('a malformed quota timestamp never counts as a fresh available account',async t => {
  const w = dom(t,true,state => {state.profiles[1].quotaAt='invalid';}); await settle(); const d = w.document;
  assert.equal(d.querySelector('#available').textContent,'0');
  d.querySelectorAll('.account-card')[1].click();
  assert.ok(d.querySelector('#detail .timestamp').classList.contains('stale'));
  assert.ok(d.querySelector('#detail .timestamp').textContent.includes('Chưa cập nhật'));
});
test('search filters accounts and empty-result state recovers on clear',async t => {
  const w = dom(t); await settle(); const d = w.document, search = d.querySelector('#search');
  search.value = 'projects@'; search.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.account-card').length,1); assert.ok(d.querySelector('#detail').textContent.includes('Dự án'));
  search.value = 'absent'; search.dispatchEvent(new w.Event('input')); assert.equal(d.querySelector('#no-results').classList.contains('hidden'),false);
  search.value = ''; search.dispatchEvent(new w.Event('input')); assert.equal(d.querySelectorAll('.account-card').length,3);
});
test('hide-email applies to cards, desktop indicator, details and persists preference',async t => {
  const w = dom(t); await settle(); const d = w.document; d.querySelector('#privacy').click();
  assert.equal(w.localStorage.getItem('pad-hide-email'),'1');
  assert.ok(!d.querySelector('#account-list').textContent.includes('personal@example.test'));
  assert.ok(!d.querySelector('#active-caption').textContent.includes('personal@example.test'));
  assert.ok(!d.querySelector('#detail').textContent.includes('personal@example.test'));
});
test('profile editor saves user input as text and prevents HTML injection',async t => {
  const w = dom(t); await settle(); const d = w.document;
  d.querySelector('#edit-profile').click(); assert.ok(d.querySelector('#modal').hasAttribute('open'));
  d.querySelector('#profile-label').value = '<img src=x onerror=alert(1)>';
  d.querySelector('#profile-notes').value = '<script>window.pwned=true</script>';
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true})); await settle();
  assert.equal(d.querySelector('#detail img'),null); assert.equal(d.querySelector('#detail script'),null);
  assert.ok(d.querySelector('#detail').textContent.includes('<img src=x onerror=alert(1)>'));
});
test('switch dialog explains offline requirement and displays backend refusal',async t => {
  const w = dom(t); await settle(); const d = w.document; d.querySelectorAll('.account-card')[1].click();
  d.querySelector('#use-desktop').click(); assert.ok(d.querySelector('#modal-body').textContent.includes('thoát Codex'));
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true})); await settle();
  assert.ok(d.querySelector('#toasts').textContent.includes('Code.exe')); assert.ok(!d.querySelector('#modal').hasAttribute('open'));
});
test('settings navigation, diagnostics and recovery availability are wired',async t => {
  const w = dom(t); await settle(); const d = w.document; d.querySelector('[data-page=settings]').click();
  assert.equal(d.querySelector('#settings-page').classList.contains('hidden'),false);
  assert.equal(d.querySelector('#restore').disabled,true); d.querySelector('#check-system').click(); await settle();
  assert.ok(d.querySelector('#diagnostics').textContent.includes('codex-cli 0.159.2'));
  assert.ok(d.querySelector('#diagnostics').textContent.includes('Code.exe'));
  d.querySelector('[data-page=help]').click(); assert.ok(d.querySelector('#help-page').textContent.includes('Giữ hội thoại'));
});

test('gateway status exposes deferred switching and protects integration until ready',async t=>{
  const w=dom(t,true,state=>{state.gateway={status:'ready',profileId:state.profiles[0].id,pendingId:state.profiles[1].id,clients:2,activeTurns:1};});await settle();const d=w.document;
  assert(d.querySelector('#gateway-detail').textContent.includes('2 kết nối · 1 lượt'));
  assert(d.querySelector('#gateway-detail').textContent.includes('khi lượt hiện tại xong'));
  assert.equal(d.querySelector('#connect-vscode').disabled,false);
  assert(d.querySelector('#account-list').textContent.includes('Chờ lượt xong'));
  d.querySelector('#connect-vscode').click();assert(d.querySelector('#modal-body').textContent.includes('Reload Window'));
});

test('automatic switching setup selects accounts, orders priority and persists opt-in',async t=>{
  const w=dom(t);await settle();const d=w.document;assert(d.querySelector('#recovery-title').textContent.includes('Tắt'));
  d.querySelector('#configure-auto').click();d.querySelector('#auto-enabled').checked=true;
  const priorities=d.querySelectorAll('[data-auto-priority]');priorities[0].value='2';priorities[1].value='1';
  d.querySelector('[data-auto-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]').checked=false;
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  const saved=(await w.pad.action('state')).result.autoSwitch;assert.equal(saved.enabled,true);assert.deepEqual(Array.from(saved.order),['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);assert(d.querySelector('#recovery-title').textContent.includes('Bật'));
});

test('connections expose shared auto-switch status and open its setup from another selected scope',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('[data-service=codex]').click();d.querySelector('#account-scope').value='vscode';d.querySelector('#account-scope').dispatchEvent(new w.Event('change'));d.querySelector('.service-tab[data-page=connections]').click();
  assert.equal(d.querySelector('#shared-auto-status').textContent,'Tự chuyển khi hết quota: Tắt');
  d.querySelector('#open-shared-auto').click();assert.equal(d.querySelector('#account-scope').value,'shared');assert.equal(d.querySelector('#modal').classList.contains('hidden'),false);
  d.querySelector('#auto-enabled').checked=true;d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.equal(d.querySelector('#shared-auto-status').textContent,'Tự chuyển khi hết quota: Bật');
  d.querySelector('#language-toggle').click();assert.equal(d.querySelector('#shared-auto-status').textContent,'Auto-switch on quota: On');
});
test('automatic recovery history escapes labels and explains blocked state',async t=>{
  const w=dom(t,true,state=>{state.autoSwitch={enabled:true,order:state.profiles.map(p=>p.id)};state.gateway.recovery={queued:1,events:[{at:new Date().toISOString(),message:'<img src=x onerror=alert(1)>',from:state.profiles[0].id}],message:'Hết quota: đang chờ.'};});await settle();const d=w.document;
  assert.equal(d.querySelector('#cancel-recovery').disabled,false);assert(d.querySelector('#recovery-detail').textContent.includes('đang chờ'));
  d.querySelector('#recovery-history').click();assert.equal(d.querySelector('#modal-body img'),null);assert(d.querySelector('#modal-body').textContent.includes('<img'));
});

test('new users see the first-account action before connection and quota controls',async t=>{
  const w=dom(t,false);await settle();const d=w.document;
  for(const selector of ['.session-grid','.toolbar','.list-heading'])assert(d.querySelector(selector).classList.contains('hidden'));
  d.querySelector('#empty-import').click();await settle();
  assert.equal(d.querySelector('.session-grid').classList.contains('hidden'),false);
  assert.equal(d.querySelectorAll('.account-card').length,3);
});

test('connection setup has its own page and shortcuts update navigation accessibly',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('.session-label [data-page=connections]').click();
  assert.equal(d.querySelector('#connections-page').classList.contains('hidden'),false);
  assert.equal(d.querySelector('#accounts-page').classList.contains('hidden'),true);
  assert.equal(d.querySelector('.service-tab[data-page=connections]').getAttribute('aria-current'),'page');
  assert.equal(d.querySelector('#connect-vscode').disabled,true);
  d.querySelector('.service-tab[data-page=accounts]').click();d.querySelectorAll('.account-card')[1].click();d.querySelector('#use-gateway').click();await settle();
  d.querySelector('.service-tab[data-page=connections]').click();assert.equal(d.querySelector('#connect-vscode').disabled,false);
  assert(d.querySelector('#connection-hint').textContent.includes('Dự án'));
});

test('account management stays expanded across updates and card selection retains keyboard focus',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelectorAll('.account-card')[1].click();assert.equal(d.activeElement,d.querySelector('.account-card.selected'));
  d.querySelector('#profile-management').open=true;d.querySelector('#privacy').click();
  assert.equal(d.querySelector('#profile-management').open,true);
  d.querySelectorAll('.account-card')[0].click();assert.equal(d.querySelector('#profile-management').open,false);
});

test('auto-switch setup stays visible and connection errors expose their explanation',async t=>{
  const normal=dom(t);await settle();
  assert(normal.document.querySelector('#gateway-detail').classList.contains('hidden'));
  assert.equal(normal.document.querySelector('#recovery-detail').classList.contains('hidden'),false);
  const blocked=dom(t,true,state=>{state.gateway.lastError='Không kết nối được.';state.gateway.recovery={message:'Công cụ chưa hoàn tất.',events:[{type:'blocked'}]};});await settle();
  assert.equal(blocked.document.querySelector('#gateway-detail').classList.contains('hidden'),false);
  assert.equal(blocked.document.querySelector('#recovery-detail').classList.contains('hidden'),false);
});

test('theme and language persist, translate all pages and keep account names intact',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('#theme-toggle').click();assert.equal(d.documentElement.dataset.theme,'dark');assert.equal(w.localStorage.getItem('pad-theme'),'dark');
  d.querySelector('#language-toggle').click();assert.equal(d.documentElement.lang,'en');assert.equal(w.localStorage.getItem('pad-language'),'en');
  assert.equal(d.querySelector('#accounts-page h1').textContent,'Accounts');assert(d.querySelector('.card-identity').textContent.includes('Cá nhân'));
  assert(d.querySelector('#detail progress').getAttribute('aria-label').includes('hours: 0% remaining'));
  assert.equal(d.querySelector('#search').placeholder,'Search accounts');
  for(const page of ['connections','settings','help']){d.querySelector('[data-page='+page+']').click();assert(!d.querySelector('#'+page+'-page').classList.contains('hidden'));}
  assert(d.querySelector('#help-page').textContent.includes('How do earned resets work?'));
  d.querySelector('#add-account').click();assert(d.querySelector('#modal-body').textContent.includes('official OpenAI sign-in'));assert(!d.querySelector('#modal-body').textContent.includes('Trình duyệt'));
  d.querySelector('#language-toggle').click();assert.equal(d.querySelector('#accounts-page h1').textContent,'Tài khoản');assert(d.querySelector('#modal-body').textContent.includes('Trình duyệt'));
});

test('language and theme selectors update immediately without saving account settings',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelector('#language-select').value='en';d.querySelector('#language-select').dispatchEvent(new w.Event('change'));
  d.querySelector('#theme-select').value='dark';d.querySelector('#theme-select').dispatchEvent(new w.Event('change'));
  assert.equal(d.documentElement.lang,'en');assert.equal(d.documentElement.dataset.theme,'dark');
  assert.equal(d.querySelector('#language-toggle').textContent,'VI');assert.equal(d.querySelector('#theme-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(d.querySelector('#settings-form').dataset.dirty,undefined);
});

test('resets show authoritative counts, optional details and unknown separately from zero',async t=>{
  const w=dom(t);await settle();const d=w.document;
  assert.equal(d.querySelector('.reset-heading b').textContent,'2');assert.equal(d.querySelectorAll('.reset-row').length,2);
  d.querySelectorAll('.account-card')[1].click();assert.equal(d.querySelector('.reset-heading b').textContent,'1');assert(d.querySelector('.reset-panel').textContent.includes('Chỉ biết số lượt'));
  d.querySelectorAll('.account-card')[2].click();assert.equal(d.querySelector('.reset-heading b').textContent,'—');assert.equal(d.querySelector('[data-reset-credit]'),null);
  const zero=dom(t,true,state=>state.profiles[0].resetCredits={availableCount:0,credits:[]});await settle();
  assert.equal(zero.document.querySelector('.reset-heading b').textContent,'0');assert(zero.document.querySelector('.reset-panel').textContent.includes('Không có lượt reset'));
});

test('reset selection and cancellation never consume; explicit confirm binds the original account',async t=>{
  const w=dom(t);await settle();const d=w.document,calls=[];const original=w.pad.action;
  w.pad.action=async(...args)=>{calls.push(args);return original(...args);};
  d.querySelector('.reset-row button').click();await settle();assert(d.querySelector('#modal').open);assert(d.querySelector('#modal-body').textContent.includes('Cá nhân'));
  assert.equal(calls.filter(x=>x[0]==='consumeReset').length,0);d.querySelector('#modal-cancel').click();assert.equal(calls.filter(x=>x[0]==='consumeReset').length,0);
  d.querySelector('.reset-row button').click();await settle();d.querySelectorAll('.account-card')[1].click();
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  const consume=calls.find(x=>x[0]==='consumeReset');assert.equal(consume[1].id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');assert.equal(consume[1].confirmed,true);assert.equal(consume[1].key,'fixture-reset-key');
});

test('a pending reset offers the same attempt, and unsafe credit titles are escaped',async t=>{
  const w=dom(t,true,state=>{state.profiles[0].resetCredits.credits[0].title='<img src=x onerror=alert(1)>';});await settle();const d=w.document;
  assert.equal(d.querySelector('.reset-panel img'),null);assert(d.querySelector('.reset-panel').textContent.includes('<img'));
  const pending=dom(t,true,state=>state.profiles[0].resetAttempt={key:'same-key',status:'pending'});await settle();
  assert(pending.document.querySelector('[data-reset-credit]').textContent.includes('Kiểm tra reset'));assert.equal(pending.document.querySelector('.reset-row'),null);
});
test('VS Code distinguishes setup from a live extension and a ready gateway or CLI is insufficient',async t=>{
  const cases=[
    [{configuration:'notConfigured'},'ready',{cli:1},'Chưa thiết lập'],
    [{configuration:'configured',helperPresent:true},'ready',{cli:2},'Chờ extension'],
    [{configuration:'configured',helperPresent:true},'stopped',{vscode:1},'Kết nối đã dừng'],
    [{configuration:'unknown'},'ready',{},'Chưa rõ cấu hình'],
    [{configuration:'configured',helperPresent:true},'ready',{vscode:1},'Đang kết nối']
  ];
  for(const [vscode,status,connected,expected] of cases){const w=dom(t,true,state=>{state.vscode=vscode;state.gateway={...state.gateway,status,connected};});await settle();const d=w.document;assert(d.querySelector('#vscode-status').textContent.includes(expected));assert.equal(d.querySelector('#vscode-pill').classList.contains('connected'),expected==='Đang kết nối');}
});
test('connection indicators explain the next step, translate and offer a shortcut',async t=>{
  const w=dom(t,true,state=>{state.vscode={configuration:'configured',helperPresent:true};state.gateway={...state.gateway,status:'ready',connected:{vscode:0,cli:1}};});await settle();const d=w.document;
  assert(d.querySelector('#vscode-next').textContent.includes('Reload Window'));d.querySelector('#vscode-pill').click();assert(!d.querySelector('#connections-page').classList.contains('hidden'));
  d.querySelector('#language-toggle').click();assert.equal(d.querySelector('#vscode-status').textContent,'VS Code · Waiting for extension');assert.equal(d.querySelector('#vscode-config').textContent,'Configured');assert.equal(d.querySelector('#cli-status').textContent,'1 CLI connections');
});
