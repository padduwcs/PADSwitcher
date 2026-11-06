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
  while(!f.service.login?.rpc)await new Promise(r=>setTimeout(r,1));f.service.cancelLogin();await assert.rejects(promise,{code:'CANCELLED'});
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

function freshAuth(name,revision='1'){
  const data=JSON.parse(auth(name,revision).toString());data.tokens.access_token=jwt({sub:'fixture-user-'+name,revision,exp:Math.floor(Date.now()/1000)+3600});
  return Buffer.from(JSON.stringify(data));
}
function countVault(service){let reads=0;const dpapi=service.platform.dpapi;service.platform.dpapi=(bytes,decrypt)=>{if(decrypt)reads++;return dpapi(bytes,decrypt);};return ()=>reads;}
test('model calls reuse a valid credential without decrypting the vault or changing app state',async t=>{
  const f=await fixture(t),p=await f.service.capture(freshAuth('a')),reads=countVault(f.service),first=await f.service.accessBundle(p.id);
  let changes=0;f.service.on('change',()=>changes++);first.accessToken=null;
  const second=await f.service.accessBundle(p.id);assert(second.accessToken);assert.equal(second.chatgptAccountId,'fixture-account-a');assert.equal(reads(),1);assert.equal(changes,0);
  p.plan='business';assert.equal((await f.service.accessBundle(p.id)).chatgptPlanType,'business');
});
test('a rotated, expiring or forced credential is never served from memory',async t=>{
  const f=await fixture(t),p=await f.service.capture(freshAuth('a'));await f.service.accessBundle(p.id);
  await f.service.storeAuth(p.id,freshAuth('a','rotated'));
  const rotated=await f.service.accessBundle(p.id);assert.equal(JSON.parse(Buffer.from(rotated.accessToken.split('.')[1],'base64url')).revision,'rotated');
  const reads=countVault(f.service);f.service.credentials.get(p.id).expires=Date.now()+1000;await f.service.accessBundle(p.id).catch(()=>{});assert.equal(reads(),1);
  f.service.credentials.get(p.id).expires=Date.now()+3600000;f.service.rpcFactory=()=>({initialize:async()=>{},request:async()=>{},close:async()=>{}});
  await f.service.runtime(p.id);await f.service.accessBundle(p.id,true);assert.equal(reads()>=2,true);
});
test('removing a profile forgets its in-memory credential',async t=>{
  const f=await fixture(t),a=await f.service.capture(freshAuth('a'));await f.service.capture(freshAuth('b'));await f.service.accessBundle(a.id);
  await f.service.remove(a.id);assert.equal(f.service.credentials.has(a.id),false);await assert.rejects(f.service.accessBundle(a.id),{code:'PROFILE_MISSING'});
});
test('work on one account never waits for another, and the same account runs in order',async t=>{
  const f=await fixture(t),a=await f.service.capture(freshAuth('a')),b=await f.service.capture(freshAuth('b')),order=[];
  let release,entered;const gate=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
  const slow=f.service.exclusive(async()=>{order.push('a-start');entered();await gate;order.push('a-end');},{account:a.id});await inside;
  assert.equal((await f.service.accessBundle(b.id)).chatgptAccountId,'fixture-account-b');await f.service.exclusive(async()=>order.push('b'),{account:b.id});
  const same=f.service.exclusive(async()=>order.push('a-next'),{account:a.id});
  assert.equal(f.service.view().busy,false,'one account never marks the whole app busy');release();await Promise.all([slow,same]);
  assert.deepEqual(order,['a-start','b','a-end','a-next']);assert.equal(f.service.busy,false);
});
test('a whole-store operation waits its turn instead of failing and later work follows it',async t=>{
  const f=await fixture(t),a=await f.service.capture(freshAuth('a')),order=[];let release,entered;const gate=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
  const running=f.service.exclusive(async()=>{entered();await gate;order.push('account');},{account:a.id});await inside;
  const whole=f.service.exclusive(async()=>order.push('whole')),after=f.service.exclusive(async()=>order.push('after'),{account:a.id});
  await new Promise(r=>setTimeout(r,10));assert.deepEqual(order,[]);release();await Promise.all([running,whole,after]);assert.deepEqual(order,['account','whole','after']);
});
test('quota refresh covers every account, up to three at once, and shows which are refreshing',async t=>{
  const f=await fixture(t),all=[];for(const n of ['a','b','c','d','e'])all.push(await f.service.capture(auth(n)));
  let active=0,peak=0;const seen=[];f.service.refreshOne=async id=>{seen.push(id);active++;peak=Math.max(peak,active);assert.equal(f.service.view().profiles.find(p=>p.id===id).refreshing,true);await new Promise(r=>setTimeout(r,5));active--;};
  await f.service.refreshAll();assert.deepEqual(seen.sort(),all.map(p=>p.id).sort());assert.equal(peak,3);assert(f.service.view().profiles.every(p=>!p.refreshing));
});
test('parallel credential lookups for one account read the vault once',async t=>{
  const f=await fixture(t),p=await f.service.capture(freshAuth('a')),reads=countVault(f.service);
  const bundles=await Promise.all([1,2,3,4].map(()=>f.service.accessBundle(p.id)));assert(bundles.every(b=>b.accessToken));assert.equal(reads(),1);
});
test('waiting for a browser sign-in leaves accounts usable and allows only one sign-in',async t=>{
  const f=await fixture(t),p=await f.service.capture(auth('a'));let opened;const browser=new Promise(r=>opened=r);
  const listeners=new Set(),rpc={listeners,closed:false,initialize:async()=>{},request:async method=>method==='account/login/start'?{loginId:'fixture',authUrl:'https://auth.openai.com/fixture'}:{},close:async()=>{}};f.service.rpcFactory=()=>rpc;
  const login=f.service.addAccount('New',async()=>opened());await browser;
  assert.equal(f.service.busy,false);await f.service.edit(p.id,'Renamed','');await f.service.refresh(p.id).catch(()=>{});
  await assert.rejects(f.service.addAccount('Second',async()=>{}),{code:'LOGIN_ACTIVE'});
  f.service.cancelLogin();await assert.rejects(login,{code:'CANCELLED'});assert.equal(f.service.login,null);
});
test('accounts keep a saved order, and a stale list is refused',async t=>{
  const f=await fixture(t),a=await f.service.capture(auth('a')),b=await f.service.capture(auth('b')),c=await f.service.capture(auth('c'));
  await f.service.reorderProfiles([c.id,a.id,b.id]);assert.deepEqual(f.service.view().profiles.map(p=>p.id),[c.id,a.id,b.id]);
  assert.deepEqual((await f.create()).state.profiles.map(p=>p.id),[c.id,a.id,b.id]);
  for(const ids of [[a.id,b.id],[a.id,a.id,b.id],[a.id,b.id,'unknown'],'invalid',null])await assert.rejects(f.service.reorderProfiles(ids),{code:'INVALID_ORDER'});
  assert.deepEqual(f.service.state.profiles.map(p=>p.id),[c.id,a.id,b.id]);
});
test('a periodic pass reads accounts in use or due; a skipped pass and a busy user action are quiet',async t=>{
  const f=await fixture(t),a=await f.service.capture(auth('a')),b=await f.service.capture(auth('b')),now=new Date().toISOString(),seen=[];
  f.service.refreshOne=async id=>{seen.push(id);};f.service.gateway={isUsing:id=>id===a.id,view:()=>({})};
  for(const p of [a,b]){p.quotaAt=now;p.status='ready';}
  await f.service.refreshBackground({dueOnly:true});assert.deepEqual(seen,[a.id]);
  b.quotaAt=new Date(Date.now()-5*60000).toISOString();await f.service.refreshBackground({dueOnly:true});assert.deepEqual(seen,[a.id,a.id,b.id]);
});
test('startup removes leftover temporary backend folders and nothing else',async t=>{
  const f=await fixture(t);for(const name of ['sayhi-rpc-AbC123','reset-rpc-xYz789','profiles-keep','sayhi-rpc-'])await fs.mkdir(path.join(f.data,name),{recursive:true});
  await fs.writeFile(path.join(f.data,'reset-rpc-file'),'keep');await f.service.sweepTemporary();
  assert.equal(await exists(path.join(f.data,'sayhi-rpc-AbC123')),false);assert.equal(await exists(path.join(f.data,'reset-rpc-xYz789')),false);
  for(const name of ['profiles-keep','sayhi-rpc-','reset-rpc-file','profiles'])assert(await exists(path.join(f.data,name)));
});
test('the connection log keeps only allow-listed scalar fields and rotates at its limit',async t=>{
  const {EventLog}=require('../src/core/event-log.cjs'),f=await fixture(t),file=path.join(f.directory,'events.jsonl'),log=new EventLog(file,{maxBytes:400});
  log.write({scope:'shared',type:'model_step_uncertain',reason:'idle_timeout',attempt:2,accessToken:'secret-token',threadId:'secret-thread',prompt:'secret-prompt',from:'secret-account',kind:{nested:'secret-object'}});await log.flush();
  const entry=JSON.parse(await fs.readFile(file,'utf8'));assert.deepEqual(Object.keys(entry),['at','scope','type','reason','attempt']);
  for(let i=0;i<20;i++)log.write({type:'client_closed',kind:'vscode',code:1006,activeTurns:i});await log.flush();
  assert((await fs.stat(file)).size<=400);assert(await exists(file+'.1'));assert(!(await fs.readFile(file+'.1','utf8')).includes('secret'));
});
test('an unwritable connection log never reaches the caller',async t=>{
  const {EventLog}=require('../src/core/event-log.cjs'),f=await fixture(t),log=new EventLog(path.join(f.directory,'missing','events.jsonl'));
  log.write({type:'fixture'});await log.flush();
});
test('the helper launcher exists only while the connection is enabled',async t=>{
  const {syncManagerLauncher}=require('../src/core/manager-launcher.cjs'),f=await fixture(t),file=path.join(f.data,'gateway','launcher.json');
  f.service.state.gatewayEnabled=true;await syncManagerLauncher(f.service,'C:\\Apps\\PADSwitcher.exe');assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{version:1,executable:'C:\\Apps\\PADSwitcher.exe'});
  f.service.state.gatewayEnabled=false;await syncManagerLauncher(f.service,'C:\\Apps\\PADSwitcher.exe');assert.equal(await exists(file),false);await syncManagerLauncher(f.service,null);
  f.service.state.gatewayEnabled=true;await syncManagerLauncher(f.service,null);assert.equal(await exists(file),false);
});

const {Updater,newer,notes,assetUrl}=require('../src/core/updater.cjs');
function release(version,bytes,extra={}){
  const name='PADSwitcher-'+version+'-Windows.exe',base='https://github.com/padduwcs/PADSwitcher/releases/download/v'+version+'/';
  return {tag_name:'v'+version,draft:false,prerelease:false,published_at:'2026-11-07T00:00:00Z',body:'Tiếng **Việt** [link](https://x.test)\n\n---\n\nEnglish',assets:[{name,size:bytes.length,browser_download_url:base+name},{name:name+'.sha256',size:64,browser_download_url:base+name+'.sha256'}],...extra};
}
async function updateFixture(t,value,bytes,{checksum}={}){
  const f=await fixture(t),folder=path.join(f.directory,'app');await fs.mkdir(folder);const executable=path.join(folder,'PADSwitcher-1.0.0-Windows.exe');await fs.writeFile(executable,'old');
  const sum=checksum??require('node:crypto').createHash('sha256').update(bytes).digest('hex'),requests=[];
  const request=async(url,options)=>{requests.push({url,options});
    if(url.includes('api.github.com'))return new Response(JSON.stringify(value));
    if(url.endsWith('.sha256'))return new Response(sum+'  file.exe\n');
    return new Response(bytes);};
  const scripts=[],spawned=[];
  const updater=new Updater({current:'1.0.0',executable,root:f.data,fetch:request,pid:4242,platform:{powershell:'powershell.exe',ps:async(script,options)=>scripts.push({script,env:options.env})},spawn:(file,args,options)=>{spawned.push({file,args,options});const child=new (require('node:events').EventEmitter)();child.unref=()=>{};setImmediate(()=>child.emit('spawn'));return child;}});
  return {updater,executable,folder,requests,scripts,spawned};
}
test('versions compare numerically and only exact release tags count',()=>{
  assert(newer('1.10.0','1.9.9'));assert(newer('v2.0.0','1.99.99'));assert(!newer('1.0.0','1.0.0'));assert(!newer('1.0.0','1.0.1'));assert(!newer('1.0.0-unix.1','0.1.0'));assert(!newer('unix-v9.0.0','1.0.0'));
  assert.deepEqual(notes('Việt **đậm**\n---\nEnglish [a](http://b)'),{vi:'Việt đậm',en:'English a'});
  assert(assetUrl('https://github.com/padduwcs/PADSwitcher/releases/download/v1/a.exe'));
  for(const url of ['http://github.com/padduwcs/PADSwitcher/releases/download/v1/a.exe','https://github.com/other/PADSwitcher/releases/download/v1/a.exe','https://evil.test/padduwcs/PADSwitcher/releases/download/v1/a.exe','bad'])assert.equal(assetUrl(url),null);
});
test('an update downloads beside the app, passes its checksum and repoints shortcuts before relaunching',async t=>{
  const bytes=Buffer.from('new executable'),f=await updateFixture(t,release('1.1.0',bytes),bytes),{updater}=f;
  assert.equal((await updater.check()).status,'available');assert.equal(updater.view().notes.vi,'Tiếng Việt link');
  await updater.install().then(()=>assert.fail('not ready'),e=>assert.equal(e.code,'UPDATE_NONE'));
  const done=await updater.download();assert.equal(done.status,'ready');assert.equal(done.progress,100);
  const target=path.join(f.folder,'PADSwitcher-1.1.0-Windows.exe');assert.deepEqual(await fs.readFile(target),bytes);assert.equal((await fs.readFile(f.executable,'utf8')),'old','the previous version stays available');
  assert.equal((await fs.readdir(f.folder)).length,2);
  await updater.install();assert.equal(f.scripts[0].env.PAD_UPDATE_OLD,f.executable);assert.equal(f.scripts[0].env.PAD_UPDATE_NEW,target);
  const start=f.spawned[0];assert.equal(start.options.detached,true);assert.equal(start.options.env.PAD_UPDATE_PID,'4242');assert.equal(start.options.env.PORTABLE_EXECUTABLE_FILE,undefined);
  assert(!start.args.join(' ').includes(target),'paths reach PowerShell only through its environment');
  assert(f.requests.every(r=>r.options.headers['user-agent'].startsWith('PADSwitcher/')&&!JSON.stringify(r.options.headers).includes('authorization')));
});
test('a download failing its checksum is removed and can be retried',async t=>{
  const bytes=Buffer.from('tampered'),f=await updateFixture(t,release('1.1.0',bytes),bytes,{checksum:'0'.repeat(64)}),{updater}=f;
  await updater.check();await assert.rejects(updater.download(),{code:'UPDATE_VERIFY'});
  assert.equal(updater.view().status,'available');assert(updater.view().error.includes('checksum'));assert.deepEqual(await fs.readdir(f.folder),[path.basename(f.executable)]);
});
test('the same or an older release, a draft or missing assets never offer an update',async t=>{
  const bytes=Buffer.from('x');
  for(const value of [release('1.0.0',bytes),release('0.9.0',bytes),release('1.1.0',bytes,{prerelease:true}),release('1.1.0',bytes,{draft:true})]){const f=await updateFixture(t,value,bytes);assert.equal((await f.updater.check()).status,'current');}
  const missing=await updateFixture(t,release('1.1.0',bytes,{assets:[]}),bytes);const view=await missing.updater.check();assert.equal(view.status,'idle');assert(view.error);
  const foreign=release('1.1.0',bytes);foreign.assets[0].browser_download_url='https://evil.test/a.exe';assert((await (await updateFixture(t,foreign,bytes)).updater.check()).error);
});
test('a verified earlier download is reused, an offline check stays quiet, and source builds cannot self-install',async t=>{
  const bytes=Buffer.from('ready'),f=await updateFixture(t,release('1.1.0',bytes),bytes);await fs.writeFile(path.join(f.folder,'PADSwitcher-1.1.0-Windows.exe'),bytes);
  assert.equal((await f.updater.check()).status,'ready');
  const offline=new Updater({current:'1.0.0',root:f.folder,platform:{},fetch:async()=>{throw Error('offline');}});const view=await offline.check();assert.equal(view.status,'idle');assert(view.error);assert.equal(view.supported,false);
  await assert.rejects(offline.download(),{code:'UPDATE_UNSUPPORTED'});
});
test('cancelling a download removes its partial file',async t=>{
  const bytes=Buffer.alloc(1024,1),f=await updateFixture(t,release('1.1.0',bytes),bytes),{updater}=f;await updater.check();
  updater.request=async(url,options)=>{if(url.endsWith('.sha256'))return new Response('a'.repeat(64));return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(10));options.signal.addEventListener('abort',()=>c.error(Error('aborted')));}}));};
  const download=updater.download();for(let i=0;i<50&&!updater.controller;i++)await new Promise(r=>setTimeout(r,5));await new Promise(r=>setTimeout(r,20));updater.cancel();
  assert.equal((await download).status,'available');assert.equal(updater.view().error,null);assert.deepEqual(await fs.readdir(f.folder),[path.basename(f.executable)]);
});

test('a sign-in cancelled before Codex starts never launches a backend',async t=>{
  const f=await fixture(t);let created=false;f.service.rpcFactory=()=>{created=true;return {};};
  const promise=f.service.addAccount('B',async()=>{});f.service.cancelLogin();await assert.rejects(promise,{code:'CANCELLED'});
  assert.equal(created,false);assert.equal(f.service.login,null);
});
