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
test('Kaggle supports independent account terminals, search, quota and notebook monitoring in both languages',async t=>{
  const w=dom(t);await settle();const d=w.document,commands=[],action=w.pad.action;
  w.pad.action=async(command,args)=>{commands.push({command,args});return action(command,args);};
  d.querySelector('[data-page=kaggle]').click();assert.equal(d.querySelector('#kaggle-page').classList.contains('hidden'),false);
  assert.equal(d.querySelectorAll('.kg-account').length,3);assert(d.querySelector('#kg-detail').textContent.includes('18,5 h'));
  assert(d.querySelector('#kg-detail').textContent.includes('12 notebook'));assert(d.querySelector('#kg-detail').textContent.includes('Đang chạy'));
  d.querySelector('#kg-launch').click();await settle();d.querySelectorAll('.kg-account')[1].click();d.querySelector('#kg-launch').click();await settle();
  const launches=commands.filter(c=>c.command==='kaggleLaunch');assert.equal(launches.length,2);assert.notEqual(launches[0].args.id,launches[1].args.id);assert(!commands.some(c=>c.command==='gateway'||c.command==='switch'));
  const search=d.querySelector('#kg-search');search.value='archive';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.kg-account').length,1);assert(d.querySelector('#kg-detail').textContent.includes('Dữ liệu cũ'));
  d.querySelector('#language-toggle').click();assert(d.querySelector('#kg-detail').textContent.includes('Older data'));assert(d.querySelector('#kg-detail').textContent.includes('expired or was revoked'));
  assert.equal(d.querySelector('#kg-launch').textContent,'Open account terminal');assert.equal(search.placeholder,'Search name or username');
});
test('Kaggle verifies a token once, clears password inputs and never inserts token into monitoring state',async t=>{
  const w=dom(t);await settle();const d=w.document;d.querySelector('[data-page=kaggle]').click();d.querySelector('#kg-add').click();await settle();
  const token='KGAT_fixture-renderer-token';d.querySelector('#kg-token-input').value=token;d.querySelector('#kg-label').value='<img src=x onerror=alert(1)>';
  d.querySelector('#modal-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(d.querySelector('#kg-token-input').value,'');await settle();
  assert.equal(d.querySelector('#modal').open,false);assert.equal(d.querySelectorAll('.kg-account').length,4);assert.equal(d.querySelector('#kg-detail img'),null);assert(!d.querySelector('#kg-detail').textContent.includes(token));
  d.querySelector('#kg-token').click();await settle();d.querySelector('#kg-token-input').value=token;d.querySelector('#modal-cancel').click();assert.equal(d.querySelector('#kg-token-input').value,'');
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
  window.HTMLDialogElement.prototype.showModal = function() {this.setAttribute('open','');};
  window.HTMLDialogElement.prototype.close = function() {this.removeAttribute('open');};
  window.eval(mock);
  if (editState) {
    const action = window.pad.action;
    window.pad.action = async (...args) => { const response = await action(...args); if (args[0] === 'state') editState(response.result); return response; };
  }
  window.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/i18n.js'),'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/kaggle.js'),'utf8'));
  window.eval(script); t.after(() => window.close()); return window;
}
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
  assert.equal(d.querySelector('.nav[data-page=connections]').getAttribute('aria-current'),'page');
  assert.equal(d.querySelector('#connect-vscode').disabled,true);
  d.querySelector('.nav[data-page=accounts]').click();d.querySelectorAll('.account-card')[1].click();d.querySelector('#use-gateway').click();await settle();
  d.querySelector('.nav[data-page=connections]').click();assert.equal(d.querySelector('#connect-vscode').disabled,false);
  assert(d.querySelector('#connection-hint').textContent.includes('Dự án'));
});

test('account management stays expanded across updates and card selection retains keyboard focus',async t=>{
  const w=dom(t);await settle();const d=w.document;
  d.querySelectorAll('.account-card')[1].click();assert.equal(d.activeElement,d.querySelector('.account-card.selected'));
  d.querySelector('#profile-management').open=true;d.querySelector('#privacy').click();
  assert.equal(d.querySelector('#profile-management').open,true);
  d.querySelectorAll('.account-card')[0].click();assert.equal(d.querySelector('#profile-management').open,false);
});

test('quiet status hides normal explanations but exposes connection errors and blocked recovery',async t=>{
  const normal=dom(t);await settle();
  assert(normal.document.querySelector('#gateway-detail').classList.contains('hidden'));
  assert(normal.document.querySelector('#recovery-detail').classList.contains('hidden'));
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
  for(const page of ['connections','settings','help']){d.querySelector('.nav[data-page='+page+']').click();assert(!d.querySelector('#'+page+'-page').classList.contains('hidden'));}
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
