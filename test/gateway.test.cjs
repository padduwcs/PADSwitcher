'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {fixture,auth}=require('./helpers.cjs');
const {Gateway}=require('../src/core/gateway.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs');
const WebSocket=require('ws');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(t){
  const cleanup=[];const f=await fixture({after:fn=>cleanup.push(fn)}),a=await f.service.capture(auth('a')),b=await f.service.capture(auth('b'));
  const g=new Gateway(f.service,{executable:'fixture-codex.exe',spawn:(_exe,args,opts)=>spawn(process.execPath,[path.join(__dirname,'mock-backend.cjs'),...args],opts)});
  let c;t.after(async()=>{c?.close();await g.stop(true);for(const fn of cleanup)await fn();});await g.start(a.id);
  c=new WsRpc(await connect(g.url,g.frontToken));await c.initialize();
  return {...f,g,c,a,b};
}
async function until(condition){for(let i=0;i<100&&!condition();i++)await pause(20);assert(condition());}
test('gateway changes memory authentication across connected clients without writing shared auth',async t=>{
  const {g,c,a,b,desktop}=await ready(t);const d=new WsRpc(await connect(g.url,g.frontToken));await d.initialize();t.after(()=>d.close());
  assert.equal((await c.request('account/read')).account.email,'fixture-account-a@example.test');
  const pid=g.backend.pid;await g.select(b.id);
  assert.equal((await c.request('account/read')).account.email,'fixture-account-b@example.test');
  assert.equal((await d.request('account/read')).account.email,'fixture-account-b@example.test');
  assert.equal(g.backend.pid,pid);assert.equal(g.profileId,b.id);assert.equal(await fs.stat(path.join(desktop,'auth.json')).then(()=>true,()=>false),false);
  const view=JSON.stringify(g.view());assert(!view.includes(g.frontToken));assert(!view.includes(g.backToken));assert(!view.includes('accessToken'));
  assert((await fs.readFile(path.join(g.root,'connection.json'),'utf8')).includes('tokenFile'));
  assert.equal(a.id!==b.id,true);
});
test('switch waits for every active turn; refuses new turns and does not replay them',async t=>{
  const {g,c,b}=await ready(t);const first=await c.request('turn/start',{threadId:'one'}),second=await c.request('turn/start',{threadId:'two'});
  await g.select(b.id);assert.equal(g.turns.size,2);assert.equal(g.pendingId,b.id);
  await assert.rejects(c.request('turn/start',{threadId:'three'}));assert.equal(g.turns.size,2);
  await c.request('fixture/complete',{turnId:first.turn.id});assert.equal(g.turns.size,1);assert.equal(g.pendingId,b.id);
  await c.request('fixture/complete',{turnId:second.turn.id});await until(()=>g.profileId===b.id);assert.equal(g.turns.size,0);
});
test('failed starts release the reservation and detached review releases on completion',async t=>{
  const {g,c,b}=await ready(t);await assert.rejects(c.request('turn/start',{threadId:'one',input:[{type:'text',text:'reject'}]}));assert.equal(g.turns.size,0);
  const review=await c.request('review/start',{threadId:'old-thread'});await g.select(b.id);
  await c.request('fixture/complete',{turnId:review.turn.id,failed:true});await until(()=>g.profileId===b.id);assert.equal(g.turns.size,0);
});
test('client authentication mutation is blocked; server refresh is handled privately',async t=>{
  const {g,c}=await ready(t);await assert.rejects(c.request('account/logout'));await assert.rejects(c.request('account/login/start',{type:'chatgpt'}));
  let tokenVisible=false;c.serverRequest=()=>{tokenVisible=true;return {};};
  assert.equal((await c.request('fixture/refresh')).ok,true);assert.equal(tokenVisible,false);assert.equal(g.status,'ready');
  await assert.rejects(c.request('thread/realtime/start'));assert.equal(g.turns.size,0);
});
test('loopback connection requires capability and rejects browser Origin even with token',async t=>{
  const {g}=await ready(t);await assert.rejects(connect(g.url,'wrong'));
  await new Promise(resolve=>{const s=new WebSocket(g.url,{headers:{Authorization:'Bearer '+g.frontToken,Origin:'https://example.test'}});s.once('error',resolve);});
  assert.equal(g.http.address().address,'127.0.0.1');
});
test('native tool approvals remain bidirectional and keep the client decision',async t=>{
  const {c}=await ready(t);let asked=false;c.serverRequest=(method,params)=>{assert.equal(method,'item/commandExecution/requestApproval');assert.equal(params.command,'Get-Content MARKER.txt');asked=true;return {decision:'accept'};};
  assert.equal((await c.request('fixture/approval')).ok,true);assert(asked);
});
test('disconnect interrupts its active turns before switching and stop refuses active work',async t=>{
  const {g,c,b}=await ready(t);await c.request('turn/start',{threadId:'disconnect-thread'});await assert.rejects(g.stop(),{code:'GATEWAY_ACTIVE'});
  await g.select(b.id);c.close();await until(()=>g.profileId===b.id);assert.equal(g.turns.size,0);
});
test('malformed JSON messages close only their connection and leave gateway healthy',async t=>{
  const {g}=await ready(t);const s=await connect(g.url,g.frontToken);const closed=new Promise(r=>s.once('close',r));s.send('null');await closed;assert.equal(g.status,'ready');
});
test('gateway stop removes capability files and supports a clean restart',async t=>{
  const {g,a}=await ready(t);await g.stop();assert.equal(g.status,'stopped');
  for(const name of ['connection.json','client-capability','backend-capability'])assert.equal(await fs.stat(path.join(g.root,name)).then(()=>true,()=>false),false);
  await g.start(a.id);assert.equal(g.status,'ready');
});
test('a pending credential lookup cannot change authentication after stop and restart',async t=>{
  const {g,c,a,b,service}=await ready(t);const original=service.accessBundle.bind(service);let release;
  service.accessBundle=id=>id===b.id?new Promise(r=>{release=async()=>r(await original(id));}):original(id);
  const switching=g.select(b.id);await until(()=>!!release);await g.stop(true);await g.start(a.id);await release();await switching;
  assert.equal(g.profileId,a.id);assert.equal(g.pendingId,null);assert.equal(g.changing,false);
  assert.equal(c.socket.readyState!==1,true);
});
test('native background work absent from client notifications also blocks switching',async t=>{
  const {g,c,b}=await ready(t);const background=await c.request('fixture/startBackground');await g.select(b.id);
  assert.equal(g.pendingId,b.id);assert.equal(g.turns.size,1);await assert.rejects(g.stop(),{code:'GATEWAY_ACTIVE'});
  await c.request('fixture/complete',{turnId:background.turnId});await until(()=>g.profileId===b.id);assert.equal(g.turns.size,0);
});

test('quota recovery switches automatically, keeps thread/security/context and never replays original input',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const params={threadId:'saved-thread',input:[{type:'text',text:'ORIGINAL_WRITE_FILE_REQUEST'}],approvalPolicy:'on-request',sandboxPolicy:{type:'readOnly'},model:'fixture-model',environments:[{environmentId:'local',cwd:'D:/fixture'}],outputSchema:{type:'object'},clientUserMessageId:'original-id',toolOutput:{sensitive:'old-result'}};
  const started=await c.request('turn/start',params);
  await c.request('fixture/complete',{turnId:started.turn.id,quota:true,duplicate:true,items:[{type:'commandExecution',status:'completed'},{type:'fileChange',status:'completed'}]});
  await until(()=>g.recovery.events.some(e=>e.type==='continued'));
  const turns=(await c.request('fixture/turns')).turns;assert.equal(turns.length,2);
  assert.equal(g.profileId,b.id);const next=turns[1];assert.equal(next.threadId,'saved-thread');assert.equal(next.accountId,'fixture-account-b');
  assert(next.params.input[0].text.includes('Continue'));assert(!next.params.input[0].text.includes('ORIGINAL_WRITE_FILE_REQUEST'));
  for(const key of ['approvalPolicy','sandboxPolicy','model','environments','outputSchema'])assert.deepEqual(next.params[key],params[key]);
  assert.equal(next.params.clientUserMessageId,undefined);assert.equal(next.params.toolOutput,undefined);
  assert.equal(g.recovery.events.filter(e=>e.type==='continued').length,1);
  assert(!JSON.stringify(service.view()).includes('ORIGINAL_WRITE_FILE_REQUEST'));
  assert((await fs.readFile(service.metadataFile,'utf8')).includes('quotaCooldowns'));
});
test('recovery is opt-in and does not rotate for generic 429, auth, network errors, review or interruptions',async t=>{
  const {g,c,a,b,service}=await ready(t);let turn=await c.request('turn/start',{threadId:'off'});
  await c.request('fixture/complete',{turnId:turn.turn.id,quota:true});await pause(80);assert.equal(g.profileId,a.id);assert.equal(g.recovery.queue.length,0);
  await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  for(const error of [{codexErrorInfo:'rateLimitExceeded'},{codexErrorInfo:'unauthorized'},{codexErrorInfo:{responseStreamDisconnected:{httpStatusCode:429}}},{message:'quota exceeded',httpStatusCode:429}]){
    turn=await c.request('turn/start',{threadId:'errors'});await c.request('fixture/complete',{turnId:turn.turn.id,failed:true,error});
  }
  turn=await c.request('review/start',{threadId:'review'});await c.request('fixture/complete',{turnId:turn.turn.id,quota:true});
  turn=await c.request('turn/start',{threadId:'cancel'});await c.request('turn/interrupt',{threadId:'cancel',turnId:turn.turn.id});await pause(80);
  assert.equal(g.profileId,a.id);assert.equal(g.recovery.queue.length,0);
});
test('recovery waits for all clients and can be cancelled by disabling the option',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const busy=await c.request('turn/start',{threadId:'busy'}),failed=await c.request('turn/start',{threadId:'failed'});
  await c.request('fixture/complete',{turnId:failed.turn.id,quota:true});await pause(80);assert.equal(g.profileId,a.id);assert.equal(g.recovery.queue.length,1);
  await assert.rejects(c.request('turn/start',{threadId:'third'}));
  await service.autoSwitchSettings({enabled:false,order:[a.id,b.id]});await c.request('fixture/complete',{turnId:busy.turn.id});await pause(100);
  assert.equal(g.profileId,a.id);assert.equal((await c.request('fixture/turns')).turns.length,2);
});
test('automatic recovery tries each account once, then stops when all reach quota',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const first=await c.request('turn/start',{threadId:'all-empty'});await c.request('fixture/complete',{turnId:first.turn.id,quota:true});await until(()=>g.recovery.events.some(e=>e.type==='continued'));
  const turns=(await c.request('fixture/turns')).turns;await c.request('fixture/complete',{turnId:turns[1].turn.id,quota:true});
  await until(()=>g.recovery.events.some(e=>e.type==='exhausted'));assert.equal((await c.request('fixture/turns')).turns.length,2);assert.equal(g.turns.size,0);
});
test('unfinished tool status prevents automatic continuation',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const first=await c.request('turn/start',{threadId:'unknown-tool'});await c.request('fixture/complete',{turnId:first.turn.id,quota:true,items:[{type:'commandExecution',status:'inProgress'}]});
  await until(()=>g.recovery.events.some(e=>e.type==='blocked'));assert.equal(g.profileId,a.id);assert.equal((await c.request('fixture/turns')).turns.length,1);
});
test('manual selection cancels queued continuation; a disconnected owner is never auto-resumed',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const busy=await c.request('turn/start',{threadId:'busy'}),failed=await c.request('turn/start',{threadId:'manual'});
  await c.request('fixture/complete',{turnId:failed.turn.id,quota:true});await g.select(b.id);await c.request('fixture/complete',{turnId:busy.turn.id});await until(()=>g.profileId===b.id);assert.equal((await c.request('fixture/turns')).turns.length,2);
  await g.select(a.id);await until(()=>!g.pendingId&&!g.changing);const again=await c.request('turn/start',{threadId:'lost'});await c.request('fixture/complete',{turnId:again.turn.id,quota:true});c.close();await pause(150);assert.equal(g.recovery.queue.length,0);
});
test('temporary title threads do not trigger account rotation',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const thread=await c.request('thread/start',{ephemeral:true,threadSource:'thread_title'}),first=await c.request('turn/start',{threadId:thread.thread.id});
  await c.request('fixture/complete',{turnId:first.turn.id,quota:true});await pause(80);assert.equal(g.profileId,a.id);assert.equal(g.recovery.events.filter(e=>e.type==='waiting'||e.type==='continued').length,0);
});
test('cancel during credential lookup prevents late login and continuation',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const original=service.accessBundle.bind(service);let release;service.accessBundle=id=>id===b.id?new Promise(r=>{release=async()=>r(await original(id));}):original(id);
  const first=await c.request('turn/start',{threadId:'cancel-in-flight'});await c.request('fixture/complete',{turnId:first.turn.id,quota:true});await until(()=>!!release);
  g.recovery.cancel('User cancelled.');await release();await until(()=>!g.recovery.flight);assert.equal(g.profileId,a.id);assert.equal((await c.request('fixture/turns')).turns.length,1);assert.equal(g.pendingId,null);
});
test('a quota continuation still asks native client for tool approval',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  let asked=0;c.serverRequest=method=>{assert.equal(method,'item/commandExecution/requestApproval');asked++;return {decision:'accept'};};
  const first=await c.request('turn/start',{threadId:'approved',approvalPolicy:'on-request'});await c.request('fixture/complete',{turnId:first.turn.id,quota:true});await until(()=>g.recovery.events.some(e=>e.type==='continued'));
  assert.equal((await c.request('fixture/approval')).ok,true);assert.equal(asked,1);
});
test('native reconciliation cannot discard the original turn context needed for quota recovery',async t=>{
  const {g,c,a,b,service}=await ready(t);await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  const first=await c.request('turn/start',{threadId:'reconciled',approvalPolicy:'on-request'});
  // Reconciliation can replace a client record with a native/background record.
  g.turns.clear();await g.reconcile();assert.equal([...g.turns.values()][0].client,null);
  await c.request('fixture/complete',{turnId:first.turn.id,quota:true});await until(()=>g.recovery.events.some(e=>e.type==='continued'));
  const turns=(await c.request('fixture/turns')).turns;assert.equal(turns[1].params.approvalPolicy,'on-request');assert.equal(turns.length,2);
});
