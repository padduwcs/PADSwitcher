'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{EventEmitter}=require('node:events');
const {DesktopIntegration,launchEnvironment}=require('../src/core/desktop.cjs');
const {fixture,auth}=require('./helpers.cjs');

test('desktop launch keeps the conversation home and removes inherited credentials and isolated databases',()=>{
  const env=launchEnvironment({HOME:'/home/test',DISPLAY:':1',CODEX_HOME:'/wrong',CODEX_SQLITE_HOME:'/wrong-db',CODEX_ELECTRON_USER_DATA_PATH:'/wrong-ui',CODEX_APP_TOOLS_PIPE_PATH:'/old/desktop.sock',OPENAI_API_KEY:'fixture-secret',CODEX_ACCESS_TOKEN:'fixture-token',ELECTRON_RUN_AS_NODE:'1',PADSWITCHER_CONNECTION_FILE:'/other/connection'}, {home:'/existing-codex',helper:'/private/PADCodex'});
  assert.equal(env.CODEX_HOME,'/existing-codex');assert.equal(env.CODEX_CLI_PATH,'/private/PADCodex');assert.equal(env.DISPLAY,':1');assert.equal(env.PADSWITCHER_CLIENT_KIND,'desktop');
  for(const k of ['CODEX_SQLITE_HOME','CODEX_ELECTRON_USER_DATA_PATH','CODEX_APP_TOOLS_PIPE_PATH','OPENAI_API_KEY','CODEX_ACCESS_TOKEN','ELECTRON_RUN_AS_NODE','PADSWITCHER_CONNECTION_FILE'])assert.equal(env[k],undefined);
  assert.equal(env.CODEX_APP_SERVER_FORCE_CLI,'1');assert.equal(env.CODEX_APP_SERVER_USE_LOCAL_DAEMON,'0');
});
async function setup(t){
  const f=await fixture(t),p=await f.service.capture(auth('b')),calls=[];
  const hub={status:'ready',turns:new Map(),shared:{router:{active:0},pendingId:null},desktop:null,start:async id=>calls.push(['start',id]),startDesktop:async opts=>{calls.push(['desktop',opts]);return hub.desktop={profileId:p.id,pendingId:null,helper:'/private/PADCodex',view:()=>({connected:{desktop:0}})};},stopDesktop:async()=>{calls.push(['stop']);hub.desktop=null;}};
  f.service.platform.processes=async()=>[];
  let child;
  const desktop=new DesktopIntegration(f.service,hub,{home:f.desktop,installed:async()=>({executable:'/official/ChatGPT',engine:'/official/resources/codex',resources:f.directory}),spawn:(...args)=>{calls.push(['spawn',...args]);child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
  await desktop.init();return {...f,desktopHome:f.desktop,p,hub,desktop,calls,child:()=>child};
}
test('desktop uses the original home without replacing its auth, config or conversation history',async t=>{
  const f=await setup(t);await fs.writeFile(path.join(f.desktop.record.home,'auth.json'),auth('original'));
  const files=['auth.json','config.toml','history.jsonl'],before=await Promise.all(files.map(n=>fs.readFile(path.join(f.desktop.record.home,n))));
  const result=await f.desktop.launch(f.p.id);assert.deepEqual(result,{launched:true,connected:false});
  const spawn=f.calls.find(c=>c[0]==='spawn');assert.equal(spawn[1],'/official/ChatGPT');assert.deepEqual(spawn[2],[]);assert.equal(spawn[3].env.CODEX_HOME,f.desktop.record.home);assert.equal(spawn[3].env.CODEX_CLI_PATH,'/private/PADCodex');
  assert.equal(spawn[3].env.CODEX_SQLITE_HOME,undefined);assert.equal(spawn[3].detached,true);
  assert.deepEqual(await Promise.all(files.map(n=>fs.readFile(path.join(f.desktop.record.home,n)))),before);
  const record=await fs.readFile(f.desktop.file,'utf8');assert(!record.includes('fixture-only'));assert(!record.includes('token'));assert.equal(JSON.parse(record).enabled,true);
});
test('desktop refuses to change shared routing or spawn a second instance while the ordinary app is running',async t=>{
  const f=await setup(t);f.service.platform.processes=async()=>[{Name:'ChatGPT',ExecutablePath:'/official/ChatGPT'}];
  await assert.rejects(f.desktop.launch(f.p.id),{code:'DESKTOP_RUNNING'});assert.equal(f.calls.length,0);
  assert.equal(await fs.stat(f.desktop.file).then(()=>true,()=>false),false);
});
test('a native Codex backend is not mistaken for a running desktop GUI',async t=>{
  const f=await setup(t);f.service.platform.processes=async()=>[{Name:'codex',ExecutablePath:'/official/resources/codex'}];
  assert.equal((await f.desktop.status()).running,false);await f.desktop.launch(f.p.id);assert(f.calls.some(c=>c[0]==='spawn'));
});
test('account selection on a connected desktop keeps the same instance and waits for active turns',async t=>{
  const f=await setup(t);f.hub.desktop={profileId:f.p.id,pendingId:'next',view:()=>({connected:{desktop:1}})};f.hub.shared.pendingId='next';
  f.desktop.error='Previous startup timeout';assert.equal(f.desktop.view().lastError,null);
  const result=await f.desktop.launch(f.p.id);assert.equal(result.launched,false);assert.equal(result.connected,true);assert.equal(result.pending,true);assert.deepEqual(f.calls,[['start',f.p.id]]);
});
test('desktop startup failure restores configuration and stops only the new desktop endpoint',async t=>{
  const f=await setup(t);f.desktop.options.spawn=()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('error',Object.assign(new Error('fixture'),{code:'ENOENT'})));return child;};
  await assert.rejects(f.desktop.launch(f.p.id));assert.equal(f.desktop.configured,false);assert.equal(f.hub.desktop,null);assert(f.calls.some(c=>c[0]==='stop'));assert.equal(f.desktop.flight,null);
});
test('desktop launch reserves the integration against concurrent disconnect and history changes',async t=>{
  const f=await setup(t);let release;const original=f.desktop.installed.bind(f.desktop);
  f.desktop.installed=async()=>{await new Promise(r=>release=r);return original();};
  const launch=f.desktop.launch(f.p.id);await new Promise(r=>setImmediate(r));
  await assert.rejects(f.desktop.disconnect(),{code:'BUSY'});await assert.rejects(f.desktop.setHome(f.directory),{code:'BUSY'});
  f.desktop.installed=original;release();await launch;assert.equal(f.calls.filter(c=>c[0]==='spawn').length,1);
});
test('disconnect and home changes require closing desktop and preserve original credentials',async t=>{
  const f=await setup(t);await f.desktop.launch(f.p.id);f.service.platform.processes=async()=>[{Name:'ChatGPT',ExecutablePath:'/official/ChatGPT'}];
  await assert.rejects(f.desktop.disconnect(),{code:'DESKTOP_RUNNING'});await assert.rejects(f.desktop.setHome(f.directory),{code:'DESKTOP_RUNNING'});
  f.service.platform.processes=async()=>[];await f.desktop.disconnect();assert.equal(f.desktop.configured,false);
  await f.desktop.setHome(f.directory);assert.equal(f.desktop.record.home,f.directory);assert.equal(await fs.readFile(path.join(f.desktopHome,'history.jsonl'),'utf8'),'KEEP HISTORY\n');
});
