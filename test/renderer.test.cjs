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
function dom(t,demo = true, editState = null) {
  const window = new JSDOM(html,{url:'http://localhost/'+(demo?'?demo=1':''),runScripts:'outside-only'}).window;
  window.HTMLDialogElement.prototype.showModal = function() {this.setAttribute('open','');};
  window.HTMLDialogElement.prototype.close = function() {this.removeAttribute('open');};
  window.eval(mock);
  if (editState) {
    const action = window.pad.action;
    window.pad.action = async (...args) => { const response = await action(...args); if (args[0] === 'state') editState(response.result); return response; };
  }
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
