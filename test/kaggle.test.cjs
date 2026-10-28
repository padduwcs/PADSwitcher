'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {KaggleService,notebookRef,safeEnvironment,TERMINAL_SCRIPT}=require('../src/core/kaggle.cjs');
const {fixture}=require('./helpers.cjs');
const {UserError,publicError}=require('../src/core/errors.cjs');
const tokenA='KGAT_fixture-only-account-a',tokenB='KGAT_fixture-only-account-b';
async function setup(t){
  const f=await fixture(t),requests=[],launches=[];
  const scriptsPath=path.join(f.directory,'tools');await fs.mkdir(scriptsPath);await fs.writeFile(path.join(scriptsPath,'kaggle.exe'),'fixture');
  let responder=async payload=>({ok:true,username:payload.token===tokenB?'account-b':'account-a',quota:[{resource:'GPU',used:10,total:30,remaining:20,reserved:2}],notebooks:[{ref:'account-a/job',title:'Job',status:'running',accelerator:'GPU'}]});
  const bridge=async(_python,payload)=>{requests.push(payload);return payload.action==='probe'?{ok:true,supported:true,python:'3.12.10',kaggle:'2.2.4',kagglesdk:'0.1.37',scriptsPath,executable:path.join(scriptsPath,'python.exe')}:responder(payload);};
  const create=async()=>{const k=new KaggleService(f.data,{...f.adapter,bridge,launchTerminal:async args=>launches.push(args)});await k.init();return k;};
  const k=await create();return {...f,k,create,requests,launches,setResponder(fn){responder=fn;}};
}
test('Kaggle saves encrypted per-account tokens, survives restart, and never exposes them in state or launch options',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,label:'A',workspace:f.directory}),b=await f.k.add({token:tokenB,label:'B',workspace:f.directory});
  for(const id of [a,b])assert(!String(await fs.readFile(f.k.vault(id))).includes('KGAT_'));
  assert(!String(await fs.readFile(f.k.file)).includes('KGAT_'));assert(!JSON.stringify(f.k.view()).includes('KGAT_'));
  const reopened=await f.create();assert.equal(await reopened.loadToken(a),tokenA);assert.equal(await reopened.loadToken(b),tokenB);
  await reopened.launch(a);await reopened.launch(b,'en');assert.equal(f.launches.length,2);assert.notEqual(f.launches[0].vault,f.launches[1].vault);assert.notEqual(f.launches[0].configPath,f.launches[1].configPath);
  assert.equal(f.launches[0].username,'account-a');assert.equal(f.launches[1].username,'account-b');assert(!JSON.stringify(f.launches).includes('KGAT_'));
});
test('duplicate or wrong-account tokens cannot overwrite a saved account',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});
  await assert.rejects(f.k.add({token:tokenA,workspace:f.directory}),{code:'KAGGLE_DUPLICATE'});
  await assert.rejects(f.k.add({id:a,token:tokenB,workspace:f.directory}),{code:'KAGGLE_IDENTITY'});
  assert.equal(await f.k.loadToken(a),tokenA);assert.equal(f.k.view().accounts.length,1);
  f.setResponder(async()=>({ok:false,code:'KAGGLE_AUTH',raw:tokenB}));
  await assert.rejects(f.k.add({id:a,token:tokenB,workspace:f.directory}),error=>error.code==='KAGGLE_AUTH'&&!error.message.includes(tokenB));
  assert.equal(await f.k.loadToken(a),tokenA);
});
test('concurrent refreshes use the intended token, deduplicate per account, and do not lock Codex',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory}),b=await f.k.add({token:tokenB,workspace:f.directory});
  let unblock;const gate=new Promise(r=>{unblock=r;}),tokens=[];
  f.setResponder(async payload=>{tokens.push(payload.token);await gate;return {ok:true,username:payload.token===tokenA?'account-a':'account-b',quota:[],notebooks:[]};});
  const first=f.k.refresh(a),duplicate=f.k.refresh(a),other=f.k.refresh(b);
  await new Promise(r=>setTimeout(r,20));assert.equal(f.k.view().accounts.filter(p=>p.refreshing).length,2);assert.equal(f.service.busy,false);
  await assert.rejects(f.k.remove(a),{code:'BUSY'});unblock();await Promise.all([first,duplicate,other]);
  assert.deepEqual(tokens.sort(),[tokenA,tokenB]);assert.equal(f.k.flights.size,0);
});
test('refresh errors preserve quota and notebook snapshots and mark reauthentication safely',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});await f.k.refresh(a);
  const before=f.k.view().accounts[0];assert.equal(before.notebooks[0].status,'running');
  f.setResponder(async()=>{throw new UserError('raw secret '+tokenA,'KAGGLE_AUTH');});await f.k.refresh(a);
  const after=f.k.view().accounts[0];assert.equal(after.status,'reauth');assert.deepEqual(after.quota,before.quota);assert.equal(after.quotaAt,before.quotaAt);assert.equal(after.notebooksAt,before.notebooksAt);assert(!JSON.stringify(after).includes(tokenA));
  await assert.rejects(f.k.launch(a),{code:'KAGGLE_AUTH'});assert.equal(f.launches.length,0);
});
test('partial refresh retains old listings as unknown and redacts token from notebook metadata',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});await f.k.refresh(a);const stamp=f.k.get(a).notebooksAt;
  f.setResponder(async()=>({ok:true,username:'account-a',quotaError:'KAGGLE_RATE_LIMIT',notebooksError:'KAGGLE_NETWORK',notebooks:[{ref:'account-a/pinned',title:tokenA,status:'unknown',machineShape:tokenA,errorCode:'KAGGLE_NOT_FOUND'}]}));await f.k.refresh(a);
  const p=f.k.view().accounts[0];assert.equal(p.quota[0].remaining,20);assert.equal(p.notebooksAt,stamp);assert.equal(p.notebooks.length,2);assert(p.notebooks.every(n=>n.status==='unknown'));assert(!JSON.stringify(p).includes(tokenA));assert(p.quotaError&&p.notebooksError);
});
test('saved token can be replaced, pinning is bounded, and deletion erases the vault only',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});const replacement='KGAT_fixture-only-new-token';
  await f.k.add({id:a,token:replacement,label:'New',workspace:f.directory});assert.equal(await f.k.loadToken(a),replacement);
  await f.k.watch(a,'https://www.kaggle.com/code/account-a/job');await f.k.watch(a,'account-a/job');assert.equal(f.k.get(a).watch.length,1);
  for(let i=1;i<20;i++)await f.k.watch(a,'account-a/job-'+i);
  await assert.rejects(f.k.watch(a,'account-a/overflow'),{code:'KAGGLE_LIMIT'});await f.k.watch(a,'account-a/job',true);assert.equal(f.k.get(a).watch.length,19);
  await f.k.remove(a);await assert.rejects(fs.stat(f.k.vault(a)),{code:'ENOENT'});assert.equal((await f.create()).view().accounts.length,0);assert.equal(await fs.readFile(path.join(f.desktop,'history.jsonl'),'utf8'),'KEEP HISTORY\n');
});
test('unsafe refs, tokens and workspaces are rejected; missing tools never launch or store credentials',async t=>{
  const f=await setup(t);assert.equal(notebookRef('https://www.kaggle.com/code/person/slug?scriptVersionId=1'),'person/slug');
  for(const ref of ['../job','a/b/c','https://evil.test/code/a/b','https://www.kaggle.com:444/code/a/b','https://user@www.kaggle.com/code/a/b'])assert.throws(()=>notebookRef(ref));
  await assert.rejects(f.k.add({token:'invalid; Write-Host bad',workspace:f.directory}),{code:'KAGGLE_TOKEN'});
  await assert.rejects(f.k.add({token:tokenA,workspace:path.join(f.directory,'missing')}));
  f.k.bridge=async()=>({ok:true,executable:path.join(f.directory,'python.exe'),scriptsPath:f.directory,supported:false});f.k.tool=null;
  await assert.rejects(f.k.add({token:tokenA,workspace:f.directory}),{code:'KAGGLE_DEPENDENCIES'});assert.equal(f.k.view().accounts.length,0);assert.equal(f.launches.length,0);
});
test('failed metadata save rolls back token replacement and account removal',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,label:'Original',workspace:f.directory}),save=f.k.save.bind(f.k);
  f.k.save=async()=>{throw Error('fixture disk failure');};
  await assert.rejects(f.k.add({id:a,token:'KGAT_fixture-only-replacement',label:'Changed',workspace:f.directory}));assert.equal(await f.k.loadToken(a),tokenA);assert.equal(f.k.get(a).label,'Original');
  await assert.rejects(f.k.remove(a));assert.equal(await f.k.loadToken(a),tokenA);assert.equal(f.k.view().accounts.length,1);
  f.k.save=save;await f.k.shutdown();
});

test('automatic Python detection prefers a supported interpreter and retains an install target when neither is ready',async t=>{
  const f=await setup(t),probes=[];
  const info=python=>({ok:true,executable:path.join(f.directory,python,'python.exe'),scriptsPath:f.directory,python:'3.12.10',supported:python==='python3.exe'});
  f.k.bridge=async(python)=>{probes.push(python);if(path.isAbsolute(python))throw Error('Fixture environment not installed');return info(python);};
  assert.equal((await f.k.checkTools()).executable,info('python3.exe').executable);assert.deepEqual(probes,[path.join(f.k.root,'venv','Scripts','python.exe'),'python.exe','python3.exe']);
  f.k.bridge=async(python)=>{if(path.isAbsolute(python))throw Error('Fixture environment not installed');return {...info(python),supported:false};};
  const missing=await f.k.checkTools(true);assert.equal(missing.supported,false);assert.equal(missing.executable,info('python.exe').executable);
  await f.k.settings({pythonPath:info('custom').executable,autoRefresh:false});
  probes.length=0;f.k.bridge=async(python)=>{probes.push(python);return {...info('custom'),supported:true};};
  assert.equal((await f.k.checkTools()).supported,true);assert.deepEqual(probes,[info('custom').executable]);
});

test('a managed Kaggle environment is preferred without probing unrelated interpreters',async t=>{
  const f=await setup(t),managed=path.join(f.k.root,'venv','Scripts','python.exe'),probes=[];
  f.k.bridge=async python=>{probes.push(python);return {ok:true,executable:managed,scriptsPath:path.dirname(managed),python:'3.12',supported:true};};
  assert.equal((await f.k.checkTools()).executable,managed);assert.deepEqual(probes,[managed]);
  const {installCommand}=require('../src/core/kaggle-setup.cjs');assert(!installCommand({root:f.k.root,python:managed}).includes(' -m venv '));
  const command=installCommand({root:path.join(f.directory,"a'b"),python:process.execPath});assert(command.includes("a''b"));assert(command.includes('if ($LASTEXITCODE -ne 0)'));assert(!command.includes('&&'));
});
test('subprocess environment excludes inherited Kaggle credentials and Python hooks',()=>{
  const old={};for(const key of ['KAGGLE_API_TOKEN','KAGGLE_KEY','PADSWITCHER_KAGGLE_VAULT','PYTHONPATH']){old[key]=process.env[key];process.env[key]='fixture-secret';}
  try{const env=safeEnvironment();for(const key of Object.keys(old))assert.equal(env[key],undefined);assert.equal(env.SystemRoot,process.env.SystemRoot);}
  finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  assert(TERMINAL_SCRIPT.includes('. $env:PADSWITCHER_KAGGLE_HELPER'));assert(TERMINAL_SCRIPT.includes('padkaggle use'));assert(!TERMINAL_SCRIPT.includes(tokenA));
});
test('shutdown cancels read-only bridge work and preserves the last successful snapshot',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});await f.k.refresh(a);const before=f.k.view().accounts[0];
  const original=f.k.bridge;let entered;const started=new Promise(resolve=>entered=resolve);
  f.k.bridge=async(python,payload,timeout,signal)=>payload.action!=='refresh'?original(python,payload):new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new UserError('Cancelled','KAGGLE_CANCELLED')),{once:true});entered();});
  const read=f.k.refresh(a);await started;assert.equal(f.k.controllers.size,1);await f.k.shutdown();await read;
  const after=f.k.view().accounts[0];assert.deepEqual(after.quota,before.quota);assert.deepEqual(after.notebooks,before.notebooks);assert.equal(after.lastError,null);assert.equal(f.k.controllers.size,0);assert.equal(f.k.flights.size,0);
});
test('corrupt Kaggle metadata disables its mutations without blocking Codex or overwriting the file',async t=>{
  const f=await fixture(t),k=new KaggleService(f.data,f.adapter);await fs.mkdir(k.root);const corrupted='{"version":1,"accounts":"broken"}';await fs.writeFile(k.file,corrupted);
  try{await k.init();assert.fail('Invalid store must be rejected');}catch(error){k.initError=publicError(error);}
  f.service.kaggle=k;assert.equal(f.service.view().kaggle.storeError.code,'KAGGLE_STORE');assert.equal(f.service.view().busy,false);
  await assert.rejects(k.settings({pythonPath:'',autoRefresh:false}),{code:'KAGGLE_STORE'});assert.equal(await fs.readFile(k.file,'utf8'),corrupted);await f.service.settings({workspace:f.directory,desktopHome:f.desktop,codexPath:'',autoRefresh:false});assert.equal(f.service.view().settings.autoRefresh,false);
  const malformed={version:1,settings:{pythonPath:'',autoRefresh:true},accounts:[{id:'11111111-1111-4111-8111-111111111111',username:'fixture',label:'Fixture',workspace:f.directory,watch:[],status:'ready',quota:'invalid cached quota'}]};
  await fs.writeFile(k.file,JSON.stringify(malformed));await assert.rejects(new KaggleService(f.data,f.adapter).init(),{code:'KAGGLE_STORE'});
});

test('notebook pagination deduplicates requests and refs, isolates accounts, and leaves saved snapshots bounded',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory}),b=await f.k.add({token:tokenB,workspace:f.directory});
  f.setResponder(async payload=>({ok:true,username:payload.username,quota:[{resource:'GPU',remaining:20,total:30}],notebooks:[{ref:payload.username+'/job',title:'Fresh first page',status:'running'}],hasMore:true}));
  await f.k.refresh(a);await f.k.refresh(b);const before=f.k.view().accounts[0];
  let release;const gate=new Promise(resolve=>release=resolve),reads=[];
  f.setResponder(async payload=>{reads.push(payload);await gate;return {ok:true,username:payload.username,page:payload.page,hasMore:false,notebooks:[{ref:payload.username+'/job',title:'Older duplicate',status:'complete'},{ref:payload.username+'/older',title:tokenA,status:'complete',machineShape:tokenB}]};});
  const first=f.k.notebooksMore(a),duplicate=f.k.notebooksMore(a),other=f.k.notebooksMore(b);
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(reads.length,2);assert(f.k.view().accounts.every(p=>p.notebookList.loading));
  await assert.rejects(f.k.remove(a),{code:'BUSY'});release();await Promise.all([first,duplicate,other]);
  assert.deepEqual(reads.map(p=>[p.token,p.page]).sort(),[[tokenA,2],[tokenB,2]]);assert(reads.every(p=>p.action==='notebooks'&&!p.watch));
  const p=f.k.view().accounts[0];assert.equal(p.notebooks.length,2);assert.equal(p.notebooks[0].title,'Fresh first page');assert(p.notebooks[1].readAt);assert.equal(p.notebookList.hasMore,false);assert.equal(p.notebookList.loading,false);
  assert.equal(p.quotaAt,before.quotaAt);assert.equal(p.notebooksAt,before.notebooksAt);assert(!JSON.stringify(p).includes(tokenA));
  assert(f.k.view().accounts[1].notebooks.every(n=>n.ref.startsWith('account-b/')));
  await f.k.notebooksMore(a);assert.equal(reads.length,2);
  const saved=JSON.parse(await fs.readFile(f.k.file,'utf8'));assert.equal(saved.accounts[0].notebooks.length,1);assert.equal((await f.create()).view().accounts[0].notebooks.length,1);
  await f.k.remove(a);assert(!f.k.notebookPages.has(a));
});

test('pagination retries the same page after partial errors and rejects wrong identity or malformed paging',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});
  f.k.get(a).notebooksHasMore=true;const pages=[];
  for(const response of [
    {ok:true,username:'account-a',notebooksError:'KAGGLE_RATE_LIMIT',page:2,hasMore:false,notebooks:[]},
    {ok:true,username:'account-a',page:9,hasMore:true,notebooks:[]},
    {ok:true,username:'wrong-user',page:2,hasMore:false,notebooks:[]}
  ]){
    f.setResponder(async payload=>{pages.push(payload.page);return response;});await f.k.notebooksMore(a);
    assert.equal(f.k.view().accounts[0].notebooks.length,0);assert(f.k.view().accounts[0].notebookList.error);assert(f.k.view().accounts[0].notebookList.hasMore);
  }
  assert.equal(f.k.get(a).status,'reauth');assert.deepEqual(pages,[2,2,2]);
  f.setResponder(async payload=>{pages.push(payload.page);return {ok:true,username:'account-a',page:2,hasMore:true,notebooks:[{ref:'account-a/older',status:'complete'}]};});await f.k.notebooksMore(a);
  assert.equal(f.k.view().accounts[0].notebookList.error,null);
  f.setResponder(async payload=>{pages.push(payload.page);return {ok:true,username:'account-a',page:3,hasMore:false,notebooks:[]};});await f.k.notebooksMore(a);
  assert.deepEqual(pages,[2,2,2,2,3]);assert.equal(f.k.view().accounts[0].notebooks.length,1);assert.equal(f.k.view().accounts[0].notebookList.hasMore,false);
});

test('quota refresh preserves expanded pages and their read times; shutdown cancels pagination safely',async t=>{
  const f=await setup(t),a=await f.k.add({token:tokenA,workspace:f.directory});f.k.get(a).notebooksHasMore=true;
  f.setResponder(async payload=>({ok:true,username:'account-a',page:payload.page,hasMore:true,notebooks:[{ref:'account-a/older',title:'Older',status:'complete'}]}));await f.k.notebooksMore(a);
  const older=f.k.view().accounts[0].notebooks[0];
  f.setResponder(async()=>({ok:true,username:'account-a',quota:[],hasMore:false,notebooks:[{ref:'account-a/newest',status:'running'}]}));await f.k.refresh(a);
  const p=f.k.view().accounts[0];assert.equal(p.notebooks.length,2);assert.deepEqual(p.notebooks[1],older);assert.equal(p.notebookList.hasMore,true);
  const original=f.k.bridge;
  f.k.bridge=async(python,payload,timeout,signal)=>payload.action!=='notebooks'?original(python,payload):new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new UserError('cancelled','KAGGLE_CANCELLED')),{once:true}));
  const read=f.k.notebooksMore(a);await new Promise(resolve=>setTimeout(resolve,10));await f.k.shutdown();await read;
  assert.deepEqual(f.k.view().accounts[0].notebooks,p.notebooks);assert.equal(f.k.view().accounts[0].notebookList.error,null);assert.equal(f.k.flights.size,0);assert.equal(f.k.controllers.size,0);
});
