'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process');
const {GatewayHub}=require('../src/core/gateway-hub.cjs'),{ModelRouter}=require('../src/core/model-router.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs'),{fixture,auth}=require('./helpers.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(t){
  const cleanup=[];const f=await fixture({after:fn=>cleanup.push(fn)}),profiles=[];
  for(const n of ['a','b','c','d'])profiles.push(await f.service.capture(auth(n)));
  const hub=new GatewayHub(f.service,{disableRouter:true,executable:'fixture-codex.exe',spawn:(_exe,args,opts)=>spawn(process.execPath,[path.join(__dirname,'mock-backend.cjs'),...args],opts)}),clients=[];
  t.after(async()=>{clients.forEach(c=>c.close());await hub.stop(true);for(const fn of cleanup)await fn();});await hub.start(profiles[0].id);
  const client=async scope=>{const c=new WsRpc(await connect(hub.shared.url,hub.shared.frontToken));clients.push(c);await c.request('initialize',{clientInfo:{name:scope==='vscode'?'codex_vscode':scope==='cli'?'codex_cli_rs':'jetbrains'},...(scope==='jetbrains'?{_padswitcherClient:'jetbrains'}:{})});c.send({method:'initialized',params:{}});await pause(15);return c;};
  return {...f,hub,profiles,client};
}
const email=n=>'fixture-account-'+n+'@example.test';
test('one stable endpoint dispatches shared clients together and private clients to isolated native accounts',async t=>{
  const {hub,profiles:[a,b,c,d],client}=await ready(t);
  await hub.configure({scope:'vscode',mode:'private',profileId:a.id});await hub.configure({scope:'jetbrains',mode:'private',profileId:c.id});
  const vs=await client('vscode'),jb=await client('jetbrains'),cli=await client('cli');
  assert.equal((await vs.request('account/read')).account.email,email('a'));assert.equal((await jb.request('account/read')).account.email,email('c'));
  await hub.start(b.id,'vscode');assert.equal((await vs.request('account/read')).account.email,email('b'));assert.equal((await jb.request('account/read')).account.email,email('c'));assert.equal((await cli.request('account/read')).account.email,email('a'));
  await hub.start(d.id);assert.equal((await cli.request('account/read')).account.email,email('d'));assert.equal((await vs.request('account/read')).account.email,email('b'));assert.equal((await jb.request('account/read')).account.email,email('c'));
  assert.deepEqual(hub.view().connected,{vscode:1,jetbrains:1,cli:1,other:0});assert.notEqual(hub.private.get('vscode').backend.pid,hub.private.get('jetbrains').backend.pid);
});
test('private quota fallback preserves request bytes and affects only that route; account cooldown is shared',async t=>{
  const {hub,service,profiles:[a,b,c,d],client}=await ready(t);
  await hub.configure({scope:'vscode',mode:'private',profileId:a.id});await hub.configure({scope:'jetbrains',mode:'private',profileId:c.id});
  await service.autoSwitchSettings({scope:'vscode',enabled:true,order:[a.id,b.id]});await service.autoSwitchSettings({scope:'jetbrains',enabled:true,order:[c.id,d.id]});
  const vs=await client('vscode'),jb=await client('jetbrains'),seen=[];
  const g=hub.private.get('vscode');g.router=new ModelRouter(g,{fetch:async(_url,options)=>{seen.push({account:options.headers['chatgpt-account-id'],bytes:Buffer.from(options.body)});return options.headers['chatgpt-account-id']==='fixture-account-a'?new Response(JSON.stringify({error:{type:'usage_limit_reached',resets_in_seconds:900}}),{status:429,headers:{'Content-Type':'application/json'}}):new Response('fixture complete',{headers:{'Content-Type':'text/plain'}});}});await g.router.start();g.router.select(a.id);
  const body=JSON.stringify({model:'fixture',input:[{role:'user',content:'Earlier context'},{type:'function_call_output',call_id:'done',output:'Already wrote once'}]});
  const result=await fetch(g.router.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer fixture','Content-Type':'application/json'},body});assert.equal(await result.text(),'fixture complete');
  assert.deepEqual(seen.map(s=>s.account),['fixture-account-a','fixture-account-b']);assert(seen[0].bytes.equals(seen[1].bytes));assert.equal(hub.view().scopes.vscode.profileId,b.id);assert.equal(hub.view().scopes.jetbrains.profileId,c.id);assert.equal(hub.view().profileId,a.id);assert(service.state.quotaCooldowns[a.id]>Date.now());
  await pause(1100);assert.equal((await vs.request('account/read')).account.email,email('b'));assert.equal((await jb.request('account/read')).account.email,email('c'));
  await service.autoSwitchSettings({scope:'vscode',enabled:false,order:[a.id,b.id]});assert.equal(service.state.clientRoutes.jetbrains.autoSwitch.enabled,true);assert.equal(service.state.autoSwitch.enabled,false);
});
test('mode changes refuse active work, disconnect only the changed idle client and preserve shared users',async t=>{
  const {hub,profiles:[a,b],client}=await ready(t),vs=await client('vscode'),jb=await client('jetbrains');
  const turn=(await vs.request('turn/start',{threadId:'vs-thread',input:[{type:'text',text:'Work'}]})).turn;
  await assert.rejects(hub.configure({scope:'vscode',mode:'private',profileId:b.id}),{code:'GATEWAY_ACTIVE'});assert.equal(hub.view().scopes.vscode.mode,'shared');
  await vs.request('fixture/complete',{turnId:turn.id});await pause(20);await hub.configure({scope:'vscode',mode:'private',profileId:b.id});await pause(20);assert.equal(vs.socket.readyState,3);assert.equal((await jb.request('account/read')).account.email,email('a'));
  const replacement=await client('vscode');assert.equal((await replacement.request('account/read')).account.email,email('b'));await hub.configure({scope:'vscode',mode:'shared'});await pause(20);assert.equal(replacement.socket.readyState,3);assert.equal((await jb.request('account/read')).account.email,email('a'));assert.equal(hub.private.has('vscode'),false);
});
test('pending manual switches wait only for their private route and whole-app stop protects all routes',async t=>{
  const {hub,profiles:[a,b,c],client}=await ready(t);await hub.configure({scope:'vscode',mode:'private',profileId:a.id});await hub.configure({scope:'jetbrains',mode:'private',profileId:c.id});
  const vs=await client('vscode'),jb=await client('jetbrains');const turn=(await vs.request('turn/start',{threadId:'vs-work',input:[{type:'text',text:'Work'}]})).turn;
  await hub.start(b.id,'vscode');assert.equal(hub.view().scopes.vscode.pendingId,b.id);assert.equal((await jb.request('account/read')).account.email,email('c'));await assert.rejects(hub.stop(),{code:'GATEWAY_ACTIVE'});assert.equal(hub.status,'ready');
  await vs.request('fixture/complete',{turnId:turn.id});await pause(100);assert.equal((await vs.request('account/read')).account.email,email('b'));
});
test('mode setup reserves only its idle client while credential lookup is pending',async t=>{
  const {hub,service,profiles:[a,b],client}=await ready(t),vs=await client('vscode'),jb=await client('jetbrains');
  let entered,release;const began=new Promise(r=>entered=r),gate=new Promise(r=>release=r),bundle=service.accessBundle.bind(service);
  service.accessBundle=async id=>{if(id===b.id){entered();await gate;}return bundle(id);};
  const changing=hub.configure({scope:'vscode',mode:'private',profileId:b.id});await began;
  await assert.rejects(vs.request('turn/start',{threadId:'vs-new',input:[]}));
  const turn=(await jb.request('turn/start',{threadId:'jb-work',input:[]})).turn;assert.equal((await jb.request('account/read')).account.email,email('a'));
  release();await changing;assert.equal(hub.view().scopes.vscode.mode,'private');assert.equal(hub.view().scopes.jetbrains.mode,'shared');
  await jb.request('fixture/complete',{turnId:turn.id});
});
test('private configuration persists, protects selected accounts and rejects unknown route policies',async t=>{
  const {hub,service,profiles:[a,b],client,create}=await ready(t);await hub.configure({scope:'jetbrains',mode:'private',profileId:b.id});await service.autoSwitchSettings({scope:'jetbrains',enabled:true,order:[b.id,a.id]});
  await assert.rejects(service.remove(b.id),{code:'PROFILE_ACTIVE'});await assert.rejects(service.autoSwitchSettings({scope:'invalid',enabled:false,order:[]}),{code:'INVALID_SETTINGS'});
  const restored=await create();assert.equal(restored.state.clientRoutes.jetbrains.mode,'private');assert.equal(restored.state.clientRoutes.jetbrains.profileId,b.id);assert.deepEqual(restored.state.clientRoutes.jetbrains.autoSwitch,{enabled:true,order:[b.id,a.id]});
  const jb=await client('jetbrains');jb.serverRequest=async()=>({decision:'accept'});assert.equal((await jb.request('fixture/approval')).ok,true);await assert.rejects(jb.request('account/logout'));assert.equal((await jb.request('account/read')).account.email,email('b'));
});
test('failed private startup leaves the shared client and saved mode unchanged; private faults never fall back to shared auth',async t=>{
  const {hub,service,profiles:[a,b],client}=await ready(t),vs=await client('vscode');const bundle=service.accessBundle.bind(service);service.accessBundle=async id=>{if(id===b.id)throw Error('Fixture unavailable');return bundle(id);};
  await assert.rejects(hub.configure({scope:'vscode',mode:'private',profileId:b.id}));assert.equal(service.state.clientRoutes.vscode.mode,'shared');assert.equal((await vs.request('account/read')).account.email,email('a'));assert.equal(hub.private.has('vscode'),false);
  service.accessBundle=bundle;await hub.configure({scope:'jetbrains',mode:'private',profileId:b.id});await hub.private.get('jetbrains').stop(true);
  const broken=new WsRpc(await connect(hub.shared.url,hub.shared.frontToken));t.after(()=>broken.close());await assert.rejects(broken.request('initialize',{clientInfo:{name:'jetbrains'},_padswitcherClient:'jetbrains'}),{code:'GATEWAY_CLOSED'});assert.equal((await vs.request('account/read')).account.email,email('a'));
});
test('legacy metadata defaults to shared and invalid private configuration fails without rewriting it',async t=>{
  const {service,create}=await fixture(t);delete service.state.clientRoutes;await service.save();const migrated=await create();assert.equal(migrated.state.clientRoutes.vscode.mode,'shared');
  migrated.state.clientRoutes.jetbrains={mode:'private',profileId:'unknown',autoSwitch:{enabled:false,order:[]}};await migrated.save();const before=await fs.readFile(migrated.metadataFile);await assert.rejects(create(),{code:'STORE_INVALID'});assert.deepEqual(await fs.readFile(migrated.metadataFile),before);
});
test('shared host restart protects private work and closes every old endpoint before rebuilding it',async t=>{
  const {hub,profiles:[a,b],client}=await ready(t);await hub.configure({scope:'jetbrains',mode:'private',profileId:b.id});const jb=await client('jetbrains');
  const turn=(await jb.request('turn/start',{threadId:'private-active',input:[]})).turn;hub.shared.backendFailed();
  await assert.rejects(hub.start(a.id),{code:'GATEWAY_ACTIVE'});assert.equal((await jb.request('account/read')).account.email,email('b'));
  await jb.request('fixture/complete',{turnId:turn.id});await pause(20);await hub.start(a.id);assert.equal(hub.status,'ready');assert.equal(hub.view().scopes.jetbrains.profileId,b.id);
  const reopened=await client('jetbrains');assert.equal((await reopened.request('account/read')).account.email,email('b'));
});
