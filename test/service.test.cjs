'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { auth,jwt,fixture } = require('./helpers.cjs');
const { parseAuth,normalizeLimits } = require('../src/core/auth.cjs');
const { profilePath,exists,atomicWrite } = require('../src/core/files.cjs');
const { publicError } = require('../src/core/errors.cjs');
const { blockers } = require('../src/core/windows.cjs');

test('account login and refresh can use an extension-only installation and preserve the explicit path',async t=>{
  const f=await fixture(t);let received;
  f.service.platform.findCodex=async()=>{throw Error('No standalone CLI installed');};
  f.service.platform.findGatewayCodex=async custom=>{received=custom;return custom||'extension-codex.exe';};
  assert.equal(await f.service.executable(),'extension-codex.exe');
  f.service.state.settings.codexPath='chosen-codex.exe';
  assert.equal(await f.service.executable(),'chosen-codex.exe');assert.equal(received,'chosen-codex.exe');
});

test('gateway credentials use the latest shared login without replacing it',async t=>{
  const f=await fixture(t),p=await f.service.capture(auth('a'));
  const data=JSON.parse(auth('a').toString());data.tokens.access_token=jwt({sub:'fixture-user-a',revision:'new'});
  const bytes=Buffer.from(JSON.stringify(data));await fs.writeFile(path.join(f.desktop,'auth.json'),bytes);
  const bundle=await f.service.accessBundle(p.id);assert.equal(bundle.accessToken,data.tokens.access_token);assert.equal(bundle.chatgptAccountId,'fixture-account-a');
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),bytes);
});
test('forced gateway refresh retains newly rotated credentials even while a private CLI is open',async t=>{
  const f=await fixture(t),p=await f.service.capture(auth('b'));await f.service.runtime(p.id);f.service.running.set(p.id,{desktop:false});
  const data=JSON.parse(auth('b','rotated').toString());data.tokens.access_token=jwt({sub:'fixture-user-b',revision:'rotated'});
  f.service.rpcFactory=(_exe,home)=>({initialize:async()=>{},request:async()=>fs.writeFile(path.join(home,'auth.json'),JSON.stringify(data)),close:async()=>{}});
  const bundle=await f.service.accessBundle(p.id,true);assert.equal(bundle.accessToken,data.tokens.access_token);
  const saved=await f.service.loadAuth(p.id);assert.equal(JSON.parse(saved.toString()).tokens.refresh_token,data.tokens.refresh_token);saved.fill(0);
  assert(await exists(path.join(f.service.home(p.id),'auth.json')));f.service.running.delete(p.id);await f.service.seal(p.id);
});
test('an active gateway profile is protected from removal and reauthentication',async t=>{
  const f=await fixture(t),p=await f.service.capture(auth('b'));f.service.gateway={profileId:p.id,pendingId:null,status:'ready',view:()=>({status:'ready'})};
  await assert.rejects(f.service.remove(p.id),{code:'PROFILE_ACTIVE'});
  await assert.rejects(f.service.addAccount('b',async()=>{},false,p.id),{code:'PROFILE_ACTIVE'});
  await assert.rejects(f.service.settings({workspace:f.desktop}),{code:'GATEWAY_RUNNING'});
  assert(await exists(f.service.vault(p.id)));
});

test('new installs enable polling while existing preferences survive reopening',async t => {
  const f = await fixture(t); assert.equal(f.service.state.settings.autoRefresh,true);
  f.service.state.settings.autoRefresh=false; await f.service.save();
  const next = await f.create(); assert.equal(next.state.settings.autoRefresh,false);
});
test('import encrypts credentials, deduplicates account and leaves desktop files unchanged',async t => {
  const f = await fixture(t), original = auth('a'); await fs.writeFile(path.join(f.desktop,'auth.json'),original);
  const id = await f.service.importCurrent('Personal'); await f.service.importCurrent();
  assert.equal(f.service.state.profiles.length,1); assert.equal(f.service.get(id).label,'Personal');
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),original);
  const vault = await fs.readFile(f.service.vault(id)); assert.ok(!vault.includes(Buffer.from('fixture-only')));
  assert.deepEqual(await f.service.loadAuth(id),original);
  assert.equal(await exists(path.join(f.service.home(id),'auth.json')),false);
  assert.equal((await fs.readFile(f.service.metadataFile,'utf8')).includes('refresh_token'),false);
  assert.equal(await fs.readFile(path.join(f.desktop,'history.jsonl'),'utf8'),'KEEP HISTORY\n');
});
test('desktop switch and rollback preserve history/config and save refreshed outgoing tokens',async t => {
  const f = await fixture(t), a = auth('a'), b = auth('b'); await fs.writeFile(path.join(f.desktop,'auth.json'),a);
  const aid = await f.service.importCurrent(); const bid = (await f.service.capture(b,'Backup')).id;
  const refreshed = auth('a','rotated'); await fs.writeFile(path.join(f.desktop,'auth.json'),refreshed);
  await f.service.switchDesktop(bid);
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),b);
  assert.deepEqual(await f.service.loadAuth(aid),refreshed);
  assert.equal(f.service.state.activeDesktopId,bid); assert.ok(f.service.view().canRestore);
  await f.service.restoreDesktop();
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),refreshed);
  assert.equal(f.service.state.activeDesktopId,aid); assert.equal(f.service.view().canRestore,false);
  assert.equal(await fs.readFile(path.join(f.desktop,'config.toml'),'utf8'),'model = "fixture-model"\n');
  assert.equal(await fs.readFile(path.join(f.desktop,'history.jsonl'),'utf8'),'KEEP HISTORY\n');
});
test('rejects switch while Codex/IDE is active without writing credentials',async t => {
  const f = await fixture(t), a = auth('a'); await fs.writeFile(path.join(f.desktop,'auth.json'),a);
  const bid = (await f.service.capture(auth('b'),'B')).id;
  f.service.platform.processes = async () => [{ProcessId:123,Name:'Code.exe'}];
  await assert.rejects(f.service.switchDesktop(bid),{code:'DESKTOP_RUNNING'});
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),a);
  assert.equal(await exists(f.service.journalFile),false);
  assert.equal(f.service.busy,false);
});
test('keyring desktop is refused without changing its config or authentication',async t => {
  const f = await fixture(t), a = auth('a'); await fs.writeFile(path.join(f.desktop,'auth.json'),a);
  await fs.writeFile(path.join(f.desktop,'config.toml'),'cli_auth_credentials_store = "keyring"\n');
  const bid = (await f.service.capture(auth('b'),'B')).id;
  await assert.rejects(f.service.switchDesktop(bid),{code:'DESKTOP_AUTH_STORE'});
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),a);
});
test('tampered encrypted vault fails before the desktop is touched',async t => {
  const f = await fixture(t), a = auth('a'); await fs.writeFile(path.join(f.desktop,'auth.json'),a);
  const bid = (await f.service.capture(auth('b'),'B')).id;
  const bytes = await fs.readFile(f.service.vault(bid)); bytes[bytes.length-1] ^= 1; await fs.writeFile(f.service.vault(bid),bytes);
  await assert.rejects(f.service.switchDesktop(bid)); assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),a);
});
test('refresh quota seals temporary auth and does not overwrite account identity',async t => {
  const f = await fixture(t); const id = (await f.service.capture(auth('b'),'B')).id;
  await f.service.refresh(id); const p = f.service.get(id);
  assert.equal(p.quota[0].windows[0].usedPercent,25); assert.equal(p.status,'ready'); assert.ok(p.quotaAt);
  assert.equal(await exists(path.join(f.service.home(id),'auth.json')),false);
  assert.deepEqual(await f.service.loadAuth(id),auth('b'));
});
test('quota failure closes RPC and seals rotated auth before surfacing error',async t => {
  const f = await fixture(t); const id = (await f.service.capture(auth('b'),'B')).id; let closed = false;
  f.service.rpcFactory = (_exe,home) => ({closed:false,initialize:async () => {},request:async method => {
    if (method === 'account/read') return {account:{type:'chatgpt'}};
    await fs.writeFile(path.join(home,'auth.json'),auth('b','new-refresh')); throw Error('SECRET_DIAGNOSTIC');
  },close:async () => {closed = true;}});
  await assert.rejects(f.service.refresh(id)); assert.ok(closed);
  assert.equal(await exists(path.join(f.service.home(id),'auth.json')),false);
  assert.deepEqual(await f.service.loadAuth(id),auth('b','new-refresh'));
  assert.ok(!f.service.get(id).lastError.includes('SECRET_DIAGNOSTIC'));
});
test('startup recovers fresher runtime credentials after unexpected shutdown',async t => {
  const f = await fixture(t); const id = (await f.service.capture(auth('b'),'B')).id;
  await f.service.runtime(id); await fs.writeFile(path.join(f.service.home(id),'auth.json'),auth('b','rotated-on-disk'));
  const next = await f.create();
  assert.deepEqual(await next.loadAuth(id),auth('b','rotated-on-disk'));
  assert.equal(await exists(path.join(next.home(id),'auth.json')),false);
});
test('startup leaves authentication of a still-running managed terminal available',async t => {
  const f = await fixture(t); const id = (await f.service.capture(auth('b'),'B')).id;
  await f.service.runtime(id); await fs.writeFile(path.join(f.service.home(id),'runtime.json'),JSON.stringify({pid:4321}));
  f.adapter.processes = async () => [{ProcessId:4321,Name:'powershell.exe'}];
  const next = await f.create(); assert.ok(next.running.has(id)); assert.ok(await exists(path.join(next.home(id),'auth.json')));
  next.platform.processes = async () => []; await next.checkRecovered(); assert.equal(next.running.size,0); assert.equal(await exists(path.join(next.home(id),'auth.json')),false);
});
test('interrupted switch after auth commit is reconciled on restart',async t => {
  const f = await fixture(t), a = auth('a'), b = auth('b'); await fs.writeFile(path.join(f.desktop,'auth.json'),a); await f.service.importCurrent();
  const bid = (await f.service.capture(b,'B')).id;
  const save = f.service.save.bind(f.service);
  f.service.save = async () => { if (f.service.state.activeDesktopId === bid) throw Error('SIMULATED POWER LOSS'); return save(); };
  await assert.rejects(f.service.switchDesktop(bid)); assert.ok(await exists(f.service.journalFile));
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),b);
  const next = await f.create(); assert.equal(next.state.activeDesktopId,bid); assert.ok(next.state.rollback); assert.equal(await exists(next.journalFile),false);
  await next.restoreDesktop(); assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),a);
});
test('concurrent external auth change before commit is detected',async t => {
  const f = await fixture(t), a = auth('a'); await fs.writeFile(path.join(f.desktop,'auth.json'),a); const bid = (await f.service.capture(auth('b'),'B')).id;
  let checks = 0; const original = f.service.checkDesktopOffline.bind(f.service);
  f.service.checkDesktopOffline = async () => { await original(); if (++checks === 2) await fs.writeFile(path.join(f.desktop,'auth.json'),auth('a','external-change')); };
  await assert.rejects(f.service.switchDesktop(bid),{code:'AUTH_CHANGED'});
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),auth('a','external-change'));
  assert.ok(f.service.recoveryPending);
});
test('switch with no prior login can restore the signed-out state',async t => {
  const f = await fixture(t); const bid = (await f.service.capture(auth('b'),'B')).id;
  await f.service.switchDesktop(bid); assert.ok(await exists(path.join(f.desktop,'auth.json')));
  await f.service.restoreDesktop(); assert.equal(await exists(path.join(f.desktop,'auth.json')),false);
});
test('safe removal moves only an inactive profile into private trash',async t => {
  const f = await fixture(t); const id = (await f.service.capture(auth('b'),'B')).id;
  await f.service.remove(id); assert.equal(f.service.state.profiles.length,0);
  assert.ok(await exists(path.join(f.data,'trash',id,'session.dpapi'))); assert.equal(await exists(f.service.home(id)),false);
  assert.equal((await f.service.listTrash())[0].id,id);await f.service.restoreProfile(id);
  assert.equal(f.service.state.profiles.length,1);assert.deepEqual(await f.service.loadAuth(id),auth('b'));assert.equal((await f.service.listTrash()).length,0);
});
test('active profile cannot be removed or reauthenticated concurrently',async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.desktop,'auth.json'),auth('a')); const id = await f.service.importCurrent();
  await assert.rejects(f.service.remove(id),{code:'PROFILE_ACTIVE'});
  await assert.rejects(f.service.addAccount('A',async () => {},false,id),{code:'PROFILE_ACTIVE'});
});
test('recover login persists into encrypted vault before removing original',async t => {
  const f = await fixture(t); const login = path.join(f.data,'login'); await fs.mkdir(login); await fs.writeFile(path.join(login,'auth.json'),auth('b'));
  const id = await f.service.recoverLogin(); assert.deepEqual(await f.service.loadAuth(id),auth('b')); assert.equal(await exists(path.join(login,'auth.json')),false);
});
test('path validation, malformed auth and public errors never expose raw credentials',async t => {
  assert.throws(() => profilePath('C:/test','../../auth.json'),{code:'INVALID_PROFILE'});
  assert.throws(() => parseAuth(Buffer.from('{"OPENAI_API_KEY":"fixture-only"}')),{code:'AUTH_UNSUPPORTED'});
  assert.throws(() => parseAuth(Buffer.from('broken')),{code:'AUTH_INVALID'});
  assert.ok(!publicError(new Error('access_token=SECRET')).message.includes('SECRET'));
  assert.equal(blockers([{Name:'codex.exe',ProcessId:123},{Name:'ChatGPT.exe',ProcessId:124},{Name:'Code.exe',ProcessId:125},{Name:'notepad.exe',ProcessId:126}]).length,3);
});
test('quota normalization supports multiple buckets and missing fields without fabricated usage',async () => {
  assert.deepEqual(normalizeLimits({}),[]);
  const result = normalizeLimits({rateLimitsByLimitId:{codex:{primary:{usedPercent:155,windowDurationMins:300,resetsAt:99}},extra:{primary:null,secondary:{usedPercent:35}}}});
  assert.equal(result.length,2); assert.equal(result[0].windows[0].usedPercent,100); assert.equal(result[1].windows[0].resetsAt,null);
});
test('atomic file writes reject links rather than overwriting a linked destination',async t => {
  const f = await fixture(t); const target = path.join(f.directory,'protected.txt'); const linked = path.join(f.directory,'linked.txt');
  await fs.writeFile(target,'DO NOT CHANGE'); await fs.link(target,linked);
  await assert.rejects(atomicWrite(linked,'BAD'),{code:'UNSAFE_PATH'}); assert.equal(await fs.readFile(target,'utf8'),'DO NOT CHANGE');
});
test('rollback uses the latest saved token if the previous account was refreshed while inactive',async t => {
  const f = await fixture(t);await fs.writeFile(path.join(f.desktop,'auth.json'),auth('a'));const aid=await f.service.importCurrent();const bid=(await f.service.capture(auth('b'),'B')).id;
  await f.service.switchDesktop(bid);await f.service.storeAuth(aid,auth('a','new-token-after-switch'));
  await f.service.restoreDesktop();assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),auth('a','new-token-after-switch'));
});
test('a failed next switch cannot destroy the previous committed rollback',async t => {
  const f=await fixture(t);await fs.writeFile(path.join(f.desktop,'auth.json'),auth('a'));await f.service.importCurrent();const bid=(await f.service.capture(auth('b'),'B')).id, cid=(await f.service.capture(auth('c'),'C')).id;
  await f.service.switchDesktop(bid);const oldBackup=f.service.backup(f.service.state.rollback);const oldBytes=await fs.readFile(oldBackup);
  const originalSave=f.service.save.bind(f.service);f.service.save=async()=>{if(f.service.state.rollback?.targetId===cid) throw Error('SAVE FAILED');return originalSave();};
  await assert.rejects(f.service.switchDesktop(cid));assert.deepEqual(await fs.readFile(oldBackup),oldBytes);
});
test('browser OAuth flow persists only after completion and removes temporary credentials',async t => {
  const f=await fixture(t);let opened=false;
  f.service.rpcFactory=(_exe,home)=>{const rpc={listeners:new Set(),closed:false,initialize:async()=>{},close:async()=>{rpc.closed=true;},request:async method=>{
    if(method==='account/login/start'){await fs.writeFile(path.join(home,'auth.json'),auth('b'));queueMicrotask(()=>{for(const cb of rpc.listeners)cb('account/login/completed',{loginId:'fixture-login',success:true});});return {loginId:'fixture-login',authUrl:'https://auth.openai.com/fixture'};}
    return {};
  }};return rpc;};
  const id=await f.service.addAccount('Backup',async()=>{opened=true;});assert.ok(opened);assert.equal(f.service.get(id).label,'Backup');assert.deepEqual(await f.service.loadAuth(id),auth('b'));
  assert.equal(await exists(path.join(f.data,'login','auth.json')),false);assert.equal(f.service.login,null);assert.equal(f.service.busy,false);
});
test('cancellation during initialization never opens browser or starts another login',async t => {
  const f=await fixture(t);let started=false,opened=false,closed=false;
  f.service.rpcFactory=()=>({listeners:new Set(),closed:false,initialize:async()=>{await new Promise(r=>setTimeout(r,20));},request:async()=>{started=true;return {};},close:async()=>{closed=true;}});
  const promise=f.service.addAccount('B',async()=>{opened=true;});
  while(!f.service.login)await new Promise(r=>setTimeout(r,1));f.service.cancelLogin();await assert.rejects(promise,{code:'CANCELLED'});
  assert.equal(started,false);assert.equal(opened,false);assert.ok(closed);assert.equal(f.service.busy,false);
});
test('wrong-account reauthentication leaves existing vault intact and retains recoverable login',async t => {
  const f=await fixture(t);const id=(await f.service.capture(auth('b'),'B')).id;
  f.service.rpcFactory=(_exe,home)=>{const rpc={listeners:new Set(),closed:false,initialize:async()=>{},close:async()=>{rpc.closed=true;},request:async method=>{
    if(method==='account/login/start'){await fs.writeFile(path.join(home,'auth.json'),auth('c'));queueMicrotask(()=>{for(const cb of rpc.listeners)cb('account/login/completed',{loginId:'fixture',success:true});});return {loginId:'fixture',authUrl:'https://auth.openai.com/fixture'};}return {};
  }};return rpc;};
  await assert.rejects(f.service.addAccount('B',async()=>{},false,id),{code:'IDENTITY_MISMATCH'});assert.deepEqual(await f.service.loadAuth(id),auth('b'));
  assert.ok(await exists(path.join(f.data,'login','auth.json')));assert.equal(f.service.state.profiles.length,1);
});

test('quota polling preference can change during a live connection while path changes remain blocked',async t=>{
  const f=await fixture(t);f.service.gateway={status:'ready',view:()=>({status:'ready'})};
  await f.service.settings({...f.service.state.settings,autoRefresh:false});assert.equal(f.service.state.settings.autoRefresh,false);
  await f.service.settings({autoRefresh:true});assert.equal(f.service.state.settings.autoRefresh,true);
  await assert.rejects(f.service.settings({workspace:f.desktop}),{code:'GATEWAY_RUNNING'});assert.equal(f.service.state.settings.workspace,f.directory);
});

test('diagnostics show each model route once and do not persist numeric telemetry',async t=>{
  const f=await fixture(t);f.service.platform.blockers=()=>[];
  const shared={requests:3,attempts:4},own={requests:2,attempts:2};
  f.service.gateway={view:()=>({usage:shared,scopes:{vscode:{mode:'shared',usage:shared},cli:{mode:'shared',usage:shared},jetbrains:{mode:'private',usage:own}}})};
  const info=await f.service.diagnostics();assert.deepEqual(info.modelUsage,[{scope:'shared',...shared},{scope:'jetbrains',...own}]);
  await f.service.save();assert(!(await fs.readFile(f.service.metadataFile,'utf8')).includes('attempts'));
});
