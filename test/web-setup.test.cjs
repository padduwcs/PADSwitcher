'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createPadSetup}=require('../vendor/codex-chatgpt-web/launcher/electron/padswitcher-setup.cjs');
const {WebService}=require('../src/core/web-service.cjs');
test('browser opening survives a managed sign-in request before the launcher React view subscribes',()=>{
  const vm=require('node:vm'),events=new (require('node:events').EventEmitter)();let api;
  const source=require('node:fs').readFileSync(path.join(__dirname,'../vendor/codex-chatgpt-web/launcher/electron/preload.cjs'),'utf8');
  vm.runInNewContext(source,{require:()=>({ipcRenderer:events,contextBridge:{exposeInMainWorld:(_name,value)=>api=value}})});
  events.emit('launcher:pad-browser',{},true);let shown=0;
  const unsubscribe=api.onPadBrowser(active=>{assert.equal(active,true);shown++;});assert.equal(shown,1);
  events.emit('launcher:pad-browser',{},true);assert.equal(shown,2);unsubscribe();
  events.emit('launcher:pad-browser',{},true);assert.equal(shown,2);
});
const pause=()=>new Promise(r=>setImmediate(r));
async function completed(setup){for(let i=0;i<100&&setup.active();i++)await pause();assert.equal(setup.active(),false);return setup.snapshot().job;}
function fixture(options={}) {
  const calls=[],prefs={browserInteractionMode:'automatic'},stateStore={read:()=>prefs,update:x=>Object.assign(prefs,x)};
  let config=null,authenticated=true,operation=null,health={service:'codex-chatgpt-web',version:'6.1.6',active_http_turns:0,active_browser_turns:0};
  const browserHost={get state(){return {authenticated};},activeTraceId:null,currentOperation:()=>null,probeAuthentication:async()=>({authenticated}),waitForSurfaceReady:async()=>{calls.push({channel:'surface-ready'});}};
  const runtimeHost={currentOperation:()=>operation,runtimeConfigSnapshot:()=>({config}),mcpCredentialsConfigured:()=>!!config?.tunnel,setupConnectorName:()=> 'CodexNative2-pad-fixture'};
  const supervisor={readConfig:()=>config,proxyHealthPayload:async()=>health};
  const invoke=async(channel,input)=>{
    calls.push({channel,input});await options.invoke?.(channel,input);
    if(channel==='launcher:browser-smoke')Object.assign(prefs,{browserSmokePassed:true,browserSmokeVersion:'6.1.6'});
    if(channel==='launcher:setup-core'){config||={mode:'browseronly',releaseVersion:'6.1.6'};prefs.coreSetupComplete=true;}
    if(channel==='launcher:setup-mcp'){config={mode:'full',releaseVersion:'6.1.6',tunnel:{tunnelId:input.tunnelId}};prefs.coreSetupComplete=true;prefs.mcpSetupComplete=false;}
    if(channel==='launcher:mcp-verify'){prefs.mcpSetupComplete=options.verifyOk!==false;return {ok:prefs.mcpSetupComplete};}
  };
  const setup=createPadSetup({invoke,browserHost,runtimeHost,supervisor,stateStore,version:'6.1.6',showBrowser:async()=>{calls.push({channel:'show-browser'});}});
  const start=(action,extra={})=>setup.start({action,requestId:crypto.randomUUID(),...extra});
  return {setup,start,calls,prefs,browserHost,setAuth:x=>authenticated=x,setOperation:x=>operation=x,setHealth:x=>health=x};
}
test('managed setup snapshot is passive; consent and valid action are required',()=>{
  const f=fixture();assert.equal(f.setup.snapshot().prepared,false);assert.equal(f.calls.length,0);
  assert.throws(()=>f.start('prepare'),{code:'WEB_SETUP_CONSENT'});
  assert.throws(()=>f.start('inference'),{code:'WEB_SETUP_INPUT'});
  assert.throws(()=>f.start('external',{target:'https://evil.test'}),{code:'WEB_SETUP_INPUT'});
  assert.equal(f.calls.length,0);
});
test('managed sign-in waits for a visible measured browser before opening authentication',async()=>{
  const f=fixture();let release;
  f.browserHost.waitForSurfaceReady=()=>new Promise(r=>release=r);
  f.start('login');await pause();assert.deepEqual(f.calls.map(x=>x.channel),['show-browser']);
  assert.equal(f.setup.active(),true);release();await completed(f.setup);
  assert.deepEqual(f.calls.map(x=>x.channel),['show-browser','launcher:browser-login']);
});
test('sign-in can wait for saved-session startup, but other setup cannot compete with it',async()=>{
  const f=fixture();f.browserHost.currentOperation=()=> 'session refresh';
  assert.throws(()=>f.start('prepare',{consent:true}),{code:'WEB_SETUP_BUSY'});
  f.start('login');assert.equal((await completed(f.setup)).status,'completed');
  assert.deepEqual(f.calls.map(x=>x.channel),['show-browser','surface-ready','launcher:browser-login']);
});
test('one-click preparation runs one Web test then installation; saved setup skips both',async()=>{
  const f=fixture();f.start('prepare',{consent:true});assert.equal((await completed(f.setup)).status,'completed');
  assert.deepEqual(f.calls.map(x=>x.channel),['show-browser','launcher:browser-smoke','launcher:setup-core']);
  f.start('prepare',{consent:true});await completed(f.setup);assert.equal(f.calls.length,3);
  assert.equal(f.setup.snapshot().prepared,true);assert.equal(f.setup.snapshot().smokePassed,true);
});
test('expired login never reaches Web inference, install or MCP setup',async()=>{
  const f=fixture();f.setAuth(false);f.start('prepare',{consent:true});const job=await completed(f.setup);
  assert.equal(job.status,'failed');assert.equal(job.step,'authentication');assert.equal(f.calls.length,0);
});
test('failed smoke test stops without retry and never installs models',async()=>{
  const f=fixture({invoke:async channel=>{if(channel==='launcher:browser-smoke')throw Error('failed');}});
  f.start('prepare',{consent:true});assert.equal((await completed(f.setup)).step,'smoke');
  await pause();assert.deepEqual(f.calls.map(x=>x.channel),['show-browser','launcher:browser-smoke']);
  assert.equal(f.setup.snapshot().smokePassed,false);
});
test('installation failure preserves the passed test; explicit continuation does not respend it',async()=>{
  let fail=true;const f=fixture({invoke:async channel=>{if(fail&&channel==='launcher:setup-core')throw Error('install failed');}});
  f.start('prepare',{consent:true});assert.equal((await completed(f.setup)).status,'failed');
  fail=false;f.start('prepare',{consent:true});assert.equal((await completed(f.setup)).status,'completed');
  assert.equal(f.calls.filter(x=>x.channel==='launcher:browser-smoke').length,1);
  assert.equal(f.calls.filter(x=>x.channel==='launcher:setup-core').length,2);
});
test('lost acknowledgements and duplicate request IDs cannot replay tests, even after completion',async()=>{
  let release;const gate=new Promise(r=>release=r),f=fixture({invoke:async channel=>{if(channel==='launcher:browser-smoke')await gate;}});
  const input={action:'prepare',consent:true,requestId:crypto.randomUUID()};f.setup.start(input);await pause();
  assert.equal(f.setup.start({...input}).duplicate,true);
  assert.throws(()=>f.start('login'),{code:'WEB_SETUP_BUSY'});
  release();await completed(f.setup);assert.equal(f.setup.start({...input}).duplicate,true);
  assert.equal(f.calls.filter(x=>x.channel==='launcher:browser-smoke').length,1);
});
test('active Web turns, launcher operations and manual mode protect setup',async()=>{
  const f=fixture();f.browserHost.activeTraceId='active';assert.throws(()=>f.start('login'),{code:'WEB_SETUP_BUSY'});
  f.browserHost.activeTraceId=null;f.setOperation('install');assert.throws(()=>f.start('login'),{code:'WEB_SETUP_BUSY'});
  f.setOperation(null);f.prefs.browserInteractionMode='manual';assert.throws(()=>f.start('login'),{code:'WEB_SETUP_MODE'});assert.equal(f.calls.length,0);
});
test('Full setup validates credentials and requires connector verification; failure exposes no key',async()=>{
  const secret='sk-fixtureSecretNeverRender123456789',tunnelId='tunnel_'+'a'.repeat(32);
  let fail=false;const f=fixture({invoke:async channel=>{if(fail&&channel==='launcher:setup-mcp')throw Error(secret);}});
  assert.throws(()=>f.start('connect',{tunnelId:'../escape',runtimeKey:secret}),{code:'WEB_SETUP_INPUT'});
  f.start('prepare',{consent:true});await completed(f.setup);fail=true;
  f.start('connect',{tunnelId,runtimeKey:secret});assert.equal((await completed(f.setup)).status,'failed');
  assert(!JSON.stringify(f.setup.snapshot()).includes(secret));fail=false;
  f.start('connect',{tunnelId,runtimeKey:secret});await completed(f.setup);
  assert.equal(f.setup.snapshot().toolsVerified,false);assert.equal(f.setup.snapshot().credentialsConfigured,true);
  f.start('verify');await completed(f.setup);assert.equal(f.setup.snapshot().toolsVerified,true);
  assert.equal(f.calls.filter(x=>x.channel==='launcher:browser-smoke').length,1);
});
test('failed verification keeps Full setup incomplete instead of reporting success',async()=>{
  const f=fixture({verifyOk:false});f.start('prepare',{consent:true});await completed(f.setup);
  f.start('connect',{tunnelId:'tunnel_'+'a'.repeat(32),runtimeKey:'sk-fixtureSecretNeverRender123456789'});await completed(f.setup);
  f.start('verify');assert.equal((await completed(f.setup)).status,'failed');assert.equal(f.setup.snapshot().toolsVerified,false);
});
test('saved credentials can reconnect without another smoke test or new key',async()=>{
  const f=fixture();f.start('prepare',{consent:true});await completed(f.setup);
  f.start('connect',{tunnelId:'tunnel_'+'a'.repeat(32),runtimeKey:'sk-fixtureSecretNeverRender123456789'});await completed(f.setup);
  const count=f.calls.length;f.start('connect',{reuse:true});await completed(f.setup);
  assert.equal(f.calls.length,count+1);assert.equal(f.calls.at(-1).channel,'launcher:setup-core');
});
test('explicit repair restarts a saved unhealthy runtime without another Web test',async()=>{
  const f=fixture();f.start('prepare',{consent:true});await completed(f.setup);f.setHealth(null);
  f.start('prepare',{consent:true});assert.equal((await completed(f.setup)).status,'completed');
  assert.equal(f.calls.filter(x=>x.channel==='launcher:browser-smoke').length,1);
  assert.equal(f.calls.filter(x=>x.channel==='launcher:setup-core').length,2);
});
async function parentFixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pad-web-setup-')),web=new WebService(root);
  await web.init();const id=await web.add('Fixture');const sent=[];
  web.children.set(id,{pid:123,exitCode:null,signalCode:null});web.launch=async()=>{};
  let status={version:1,pid:123,ready:true,authenticated:true,interactionMode:'automatic',mode:'browseronly',setup:{supported:true,prepared:true,job:null}};
  web.control=async(_id,route,input)=>{if(route==='/status')return structuredClone(status);if(route==='/heartbeat')return {};sent.push({route,input});status.setup.job={id:input.requestId,status:'running'};return {accepted:true};};
  t.after(async()=>{clearInterval(web.timer);await fs.rm(root,{recursive:true,force:true});});
  return {web,id,sent,status};
}
test('owner reserves Web setup before POST, keeps it across stale polls, and releases only matching completion',async t=>{
  const f=await parentFixture(t),requestId=crypto.randomUUID();
  const control=f.web.control;f.web.control=async(id,route,input)=>{
    if(route==='/setup'){
      await f.web.refreshStatus(id);assert.equal(f.web.setupPending.size,1);return control(id,route,input);
    }
    return control(id,route,input);
  };
  await f.web.setupCommand(f.id,{action:'prepare',requestId,consent:true});assert.equal(f.web.setupPending.size,1);
  await assert.rejects(f.web.setupCommand(f.id,{action:'prepare',requestId:crypto.randomUUID(),consent:true}),{code:'WEB_SETUP_BUSY'});
  f.status.setup.job.status='completed';await f.web.refreshStatus(f.id);assert.equal(f.web.setupPending.size,0);assert.equal(f.sent.length,1);
});
test('owner does not resend after lost POST acknowledgement; inspect status and preserve active reservation',async t=>{
  const f=await parentFixture(t);const control=f.web.control;
  f.web.control=async(id,route,input)=>{const result=await control(id,route,input);if(route==='/setup')throw Error('Connection lost');return result;};
  await assert.rejects(f.web.setupCommand(f.id,{action:'prepare',requestId:crypto.randomUUID(),consent:true}),{code:'WEB_SETUP_UNCERTAIN'});
  assert.equal(f.sent.length,1);assert.equal(f.web.setupPending.size,1);
  assert.equal(f.web.view().setupLocked,true);f.status.setup.job.status='completed';await f.web.poll();assert.equal(f.web.setupPending.size,0);
});
test('active Web requests block setup; opening/status remain passive and Full cannot enable before verification',async t=>{
  const f=await parentFixture(t);f.web.active=1;
  await assert.rejects(f.web.setupCommand(f.id,{action:'login',requestId:crypto.randomUUID()}),{code:'WEB_ACTIVE'});assert.equal(f.sent.length,0);
  f.web.active=0;f.status.mode='full';f.status.setup.toolsVerified=false;
  await assert.rejects(f.web.enable(),{code:'WEB_SETUP_REQUIRED'});assert.equal(f.web.enabled,false);assert.equal(f.sent.length,0);
});
test('managed failures report a short redacted reason; waiting for sign-in never blocks quitting',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const f=fixture({invoke:async channel=>{if(channel==='launcher:browser-login')await gate;if(channel==='launcher:browser-smoke')throw Error('Composer missing sk-fixtureSecretNeverRender123456789 at https://chatgpt.com/c?token=abc');}});
  f.start('login');await pause();assert.equal(f.setup.active(),true);assert.equal(f.setup.blocking(),false);
  release();await completed(f.setup);
  f.start('prepare',{consent:true});assert.equal(f.setup.blocking(),true);const job=await completed(f.setup);
  assert.equal(job.status,'failed');assert(job.detail.includes('Composer missing'));
  assert(!job.detail.includes('fixtureSecret'));assert(!job.detail.includes('token=abc'));
});
async function flowFixture(t,{authenticated=false,prepared=false,loginPolls=3,failPrepare=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pad-web-flow-')),web=new WebService(root,{available:()=>true,flowPollMs:1});
  await web.init();const id=await web.add('Flow');const sent=[],child={pid:321,exitCode:null,signalCode:null};
  web.launch=async()=>{web.children.set(id,child);};
  const status={version:1,pid:321,ready:prepared,authenticated,interactionMode:'automatic',mode:prepared?'browseronly':null,setup:{supported:true,prepared,job:null}};
  let polls=0;
  web.control=async(_id,route,input)=>{
    if(route==='/heartbeat')return {};
    if(route==='/status'){
      const job=status.setup.job;
      if(job?.status==='running'&&job.action==='login'&&++polls>=loginPolls){status.authenticated=true;job.status='completed';}
      if(job?.status==='running'&&job.action==='prepare'){
        if(failPrepare)Object.assign(job,{status:'failed',message:'Kiểm tra trình duyệt chưa thành công.',detail:'Composer missing'});
        else{Object.assign(status,{ready:true,mode:'browseronly'});status.setup.prepared=true;job.status='completed';}
      }
      return structuredClone(status);
    }
    sent.push({route,input});
    if(route==='/setup'){status.setup.job={id:input.requestId,action:input.action,status:'running'};return {accepted:true};}
    if(route==='/shutdown'){web.children.delete(id);return {ok:true};}
    return {};
  };
  t.after(async()=>{clearInterval(web.timer);await fs.rm(root,{recursive:true,force:true});});
  const run=async(options)=>{await web.connect(id,options);const flow=web.flows.get(id);await flow?.done;};
  return {web,id,sent,status,run,root};
}
test('one-click connection signs in, prepares once, hides the runtime, selects and enables',async t=>{
  const f=await flowFixture(t);f.web.state.selectedId=null;
  await f.run({activate:true});
  assert.deepEqual(f.sent.map(x=>x.route+(x.input?.action?':'+x.input.action:'')),['/setup:login','/setup:prepare','/hide']);
  assert.equal(f.sent[1].input.consent,true);
  assert.equal(f.web.enabled,true);assert.equal(f.web.state.selectedId,f.id);assert.equal(f.web.flows.size,0);
  assert.equal(f.web.view().profiles[0].connected,true);
  const saved=JSON.parse(await fs.readFile(path.join(f.root,'accounts.json'),'utf8'));assert.equal(saved.profiles[0].connected,true);assert.equal(saved.enabled,true);
});
test('an already signed-in, prepared account connects without sign-in or another check turn',async t=>{
  const f=await flowFixture(t,{authenticated:true,prepared:true});
  await f.run({activate:true});
  assert.deepEqual(f.sent.map(x=>x.route),['/hide']);assert.equal(f.web.enabled,true);
});
test('a failed check stops with its reason and detail; nothing is retried automatically',async t=>{
  const f=await flowFixture(t,{authenticated:true,failPrepare:true});
  await f.run({activate:true});
  const flow=f.web.view().profiles[0].flow;
  assert.equal(flow.running,false);assert.equal(flow.error,'Kiểm tra trình duyệt chưa thành công.');assert.equal(flow.detail,'Composer missing');
  assert.equal(f.sent.filter(x=>x.input?.action==='prepare').length,1);assert.equal(f.web.enabled,false);
  await f.web.cancelConnect(f.id);assert.equal(f.web.view().profiles[0].flow,null);
});
test('cancelling a pending sign-in releases the unused runtime and leaves no error',async t=>{
  const f=await flowFixture(t,{loginPolls:1e9});
  await f.web.connect(f.id,{activate:true});const flow=f.web.flows.get(f.id);
  for(let i=0;i<200&&flow.step!=='login';i++)await new Promise(r=>setTimeout(r,1));
  assert.equal(f.web.view().profiles[0].flow.step,'login');assert.equal(f.web.view().setupLocked,false);
  await f.web.connect(f.id);assert.equal(f.sent.filter(x=>x.input?.action==='login').length,1);assert(f.sent.some(x=>x.route==='/show'));
  await f.web.cancelConnect(f.id);await flow.done;
  assert.equal(f.web.flows.size,0);assert(f.sent.some(x=>x.route==='/shutdown'));assert.equal(f.web.enabled,false);
});
test('only non-login setup holds the global Web lock',async t=>{
  const f=await parentFixture(t);
  f.web.setupPending.set('other',{requestId:crypto.randomUUID(),action:'login'});
  assert.equal(f.web.setupBlocking(),false);assert.equal(f.web.view().setupLocked,false);
  await f.web.setupCommand(f.id,{action:'prepare',requestId:crypto.randomUUID(),consent:true});
  assert.equal(f.web.setupBlocking(),true);assert.equal(f.web.view().setupLocked,true);
});
