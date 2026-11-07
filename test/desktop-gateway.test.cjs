'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {GatewayHub}=require('../src/core/gateway-hub.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs');
const {fixture,auth}=require('./helpers.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(t){
  const cleanup=[],f=await fixture({after:fn=>cleanup.push(fn)}),clients=[];
  const a=await f.service.capture(auth('a')),b=await f.service.capture(auth('b'));
  f.service.platform.run=async()=> 'codex-cli 0.163.0';
  const privateHome=path.join(f.directory,'private-home');await fs.mkdir(privateHome);f.service.state.settings.desktopHome=privateHome;
  const hub=new GatewayHub(f.service,{executable:'fixture-codex',spawn:(_exe,args,options)=>spawn(process.execPath,[path.join(__dirname,'mock-backend.cjs'),...args],options)});
  t.after(async()=>{clients.forEach(c=>c.close());await hub.stop(true);for(const fn of cleanup)await fn();});
  await hub.start(a.id);
  const client=async(g,desktop=false)=>{const c=new WsRpc(await connect(g.url,g.frontToken));clients.push(c);await c.request('initialize',{clientInfo:{name:desktop?'codex_desktop':'codex_vscode'},...(desktop?{_padswitcherClient:'desktop'}:{})});c.send({method:'initialized'});return c;};
  return {...f,a,b,hub,client};
}
test('desktop keeps its history and thread while a shared switch applies at once and native auth follows when idle',async t=>{
  const f=await setup(t),{hub,a,b}=f;
  const original=Buffer.from('original sign-in sentinel');await fs.writeFile(path.join(f.desktop,'auth.json'),original);
  await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  assert.equal(hub.desktop.router,hub.shared.router);assert.equal(hub.desktop.service.state.settings.desktopHome,f.desktop);assert.notEqual(hub.shared.service.state.settings.desktopHome,f.desktop);
  const desktop=await f.client(hub.desktop,true),vscode=await f.client(hub.shared);
  const thread=(await desktop.request('thread/start')).thread;
  const first=(await desktop.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Remember the project context'}]})).turn;
  await hub.start(b.id);assert.equal(hub.shared.router.profileId,b.id);assert.equal(hub.view().profileId,b.id);assert.equal(hub.view().pendingId,null);assert.equal(f.service.state.gatewayProfileId,b.id);
  assert.equal(hub.desktop.profileId,a.id,'native auth waits for the turn on that backend');assert.equal(hub.desktop.view().pendingId,null);
  const other=(await vscode.request('turn/start',{threadId:'other',input:[]})).turn,inDesktop=await f.client(hub.desktop,true);
  const parallel=(await inDesktop.request('turn/start',{threadId:'second-chat',input:[]})).turn;
  await vscode.request('fixture/complete',{turnId:other.id});await inDesktop.request('fixture/complete',{turnId:parallel.id});
  await desktop.request('fixture/complete',{turnId:first.id});
  for(let i=0;i<100&&(hub.shared.profileId!==b.id||hub.desktop.profileId!==b.id||hub.shared.changing||hub.desktop.changing);i++)await pause(30);
  assert.equal(hub.shared.profileId,b.id);assert.equal(hub.desktop.profileId,b.id);assert.equal(hub.desktop.pendingId,null);
  const second=(await desktop.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Continue the same project'}]})).turn;
  const turns=(await desktop.request('fixture/turns')).turns;
  const same=turns.filter(x=>x.threadId===thread.id);assert.equal(same.length,2);assert.equal(same[0].accountId,'fixture-account-a');assert.equal(same[1].accountId,'fixture-account-b');
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),original);assert.equal(await fs.readFile(path.join(f.desktop,'history.jsonl'),'utf8'),'KEEP HISTORY\n');
  await desktop.request('fixture/complete',{turnId:second.id});await pause(20);
  await assert.rejects(hub.stopDesktop(),{code:'DESKTOP_RUNNING'});
  desktop.close();inDesktop.close();for(let i=0;i<30&&hub.desktop.clients.size;i++)await pause(10);
  await hub.stopDesktop();assert.equal(hub.shared.status,'ready');assert(hub.shared.router.server.listening);assert.equal((await vscode.request('account/read')).account.email,'fixture-account-b@example.test');
});
test('a pending desktop sync follows the router and can never strand either route',async t=>{
  const f=await setup(t),{hub,a,b}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const desktop=await f.client(hub.desktop,true),vscode=await f.client(hub.shared),busy=(await desktop.request('turn/start',{threadId:'busy',input:[]})).turn;
  await hub.desktop.select(b.id);assert.equal(hub.desktop.pendingId,a.id,'desktop never picks an account the router did not');
  hub.shared.router.select(b.id);hub.desktop.syncRoute();assert.equal(hub.desktop.pendingId,b.id);
  const turn=(await vscode.request('turn/start',{threadId:'free',input:[]})).turn;await vscode.request('fixture/complete',{turnId:turn.id});
  await desktop.request('fixture/complete',{turnId:busy.id});for(let i=0;i<100&&(hub.desktop.pendingId||hub.desktop.changing||hub.desktop.profileId!==b.id);i++)await pause(20);
  assert.equal(hub.desktop.profileId,b.id);assert.equal(hub.desktop.pendingId,null);
});
test('a managed account is refused before the router moves and a transient lookup failure leaves desktop connected',async t=>{
  const f=await setup(t),{hub,a,b,service}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const original=service.accessBundle.bind(service);service.accessBundle=async(id,force)=>id===b.id?{...await original(id,force),chatgptPlanType:'business'}:original(id,force);
  await assert.rejects(hub.start(b.id),{code:'GATEWAY_ROUTER_PLAN'});assert.equal(hub.shared.router.profileId,a.id);assert.equal(hub.shared.pendingId,null);assert.equal(service.state.gatewayProfileId,a.id);
  service.accessBundle=original;const client=await f.client(hub.desktop,true);
  service.accessBundle=async()=>{throw Object.assign(Error('Transient'),{code:'RPC_TIMEOUT'});};
  hub.desktop.pendingId=a.id;hub.desktop.pendingSource='route';await assert.rejects(hub.desktop.applyPending());assert.equal(hub.desktop.status,'ready');assert.equal(client.socket.readyState,1);
  service.accessBundle=original;
});
test('a catalog read or an auth sync never refuses a mode change, while model work still does',async t=>{
  const f=await setup(t),{hub,a}=f,g=hub.shared;
  g.router.active=1;g.changing=true;setTimeout(()=>{g.changing=false;},150);
  await hub.configure({scope:'jetbrains',mode:'private',profileId:a.id});assert.equal(hub.view().scopes.jetbrains.mode,'private');
  g.router.inferring=1;await assert.rejects(hub.configure({scope:'cli',mode:'private',profileId:a.id}),{code:'GATEWAY_ACTIVE'});assert.equal(hub.view().scopes.cli.mode,'shared');
  g.router.inferring=0;g.router.active=0;
});
test('choosing an account in a quota cooldown lifts that cooldown only',async t=>{
  const f=await setup(t),{hub,a,b,service}=f;service.state.quotaCooldowns={[a.id]:Date.now()+60000,[b.id]:Date.now()+60000};
  await hub.start(b.id);assert.equal(hub.shared.router.profileId,b.id);assert.deepEqual(Object.keys(service.state.quotaCooldowns),[a.id]);
});
test('with the router, goals reach native Codex and realtime stays refused',async t=>{
  const f=await setup(t),vscode=await f.client(f.hub.shared);
  await vscode.request('thread/goal/get',{threadId:'with-goal'});await assert.rejects(vscode.request('thread/realtime/start',{threadId:'with-goal'}));
});
test('losing a client releases its unfinished records so account sync cannot stall on them',async t=>{
  const f=await setup(t),{hub,b}=f,g=hub.shared,vscode=await f.client(g),client=[...g.clients][0];
  const turn=(await vscode.request('turn/start',{threadId:'lost',input:[]})).turn;
  g.turns.set('unknown-start',{client,threadId:undefined,turnId:null});assert.equal(g.knownTurns.size,1);
  await hub.start(b.id);assert.equal(g.profileId,f.a.id);vscode.close();
  for(let i=0;i<150&&(g.turns.size||g.profileId!==b.id);i++)await pause(20);
  assert.equal(g.turns.size,0);assert.equal(g.knownTurns.size,0);assert.equal(g.profileId,b.id);assert.equal(g.error,null);assert(turn.id);
});
test('desktop fails closed if native auth does not match; the existing shared connection remains usable',async t=>{
  const f=await setup(t);const vs=await f.client(f.hub.shared);
  await assert.rejects(f.hub.startDesktop({home:f.desktop,executable:'fixture-codex',environment:{PAD_TEST_WRONG_AUTH:'1'}}),{code:'DESKTOP_AUTH_VERIFY'});
  assert.equal(f.hub.shared.status,'ready');assert(f.hub.shared.router.server.listening);assert.equal((await vs.request('account/read')).account.email,'fixture-account-a@example.test');
});
test('desktop inherits gateway network settings and applies its runtime overrides to the spawned backend',async t=>{
  const f=await setup(t),{hub}=f;
  hub.options.environment={HTTP_PROXY:'http://127.0.0.1:9',NO_PROXY:'localhost,127.0.0.1',CODEX_CLI_PATH:'shared-runtime'};
  const start=hub.options.spawn;let environment;
  hub.options.spawn=(exe,args,options)=>{environment=options.env;return start(exe,args,options);};
  await hub.startDesktop({home:f.desktop,executable:'fixture-codex',environment:{CODEX_CLI_PATH:'desktop-runtime'}});
  assert.equal(environment.HTTP_PROXY,'http://127.0.0.1:9');assert.equal(environment.NO_PROXY,'localhost,127.0.0.1');
  assert.equal(environment.CODEX_CLI_PATH,'desktop-runtime');assert.equal(environment.CODEX_HOME,f.desktop);
  assert.equal(hub.options.environment.CODEX_CLI_PATH,'shared-runtime');
});
test('runtime account verification failure closes desktop transport without stopping the shared router',async t=>{
  const f=await setup(t),{hub}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const desktop=await f.client(hub.desktop,true);await desktop.request('fixture/wrongAuth');
  await assert.rejects(hub.start(f.b.id),{code:'DESKTOP_AUTH_VERIFY'});
  assert.equal(hub.desktop.status,'error');assert.equal(hub.shared.status,'ready');assert(hub.shared.router.server.listening);
  for(let i=0;i<50&&hub.desktop.clients.size;i++)await pause(10);
  assert.equal(hub.desktop.clients.size,0);
});
test('desktop tool policy does not invent a standalone transport or override explicit user policy',async t=>{
  const f=await setup(t),{hub}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const c=new WsRpc(await connect(hub.desktop.url,hub.desktop.frontToken));t.after(()=>c.close());
  await c.request('initialize',{clientInfo:{name:'Codex Desktop'},_padswitcherDesktopEnvironment:{CODEX_MCP_NODE_PATH:'/runtime/node',OPENAI_API_KEY:'fixture-secret'},_padswitcherDesktopConfig:{'plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled':true,'plugins.code-review@openai-bundled.mcp_servers.code-review.enabled':true,'model_provider':'fixture-invalid'}});
  const client=[...hub.desktop.clients][0];assert.equal(client.desktopEnvironment.OPENAI_API_KEY,undefined);
  // Observe what the native backend receives after decoration.
  const request=client.back.send.bind(client.back);let sent;
  client.back.send=data=>{sent=JSON.parse(data);return request(data);};
  await c.request('thread/resume',{threadId:'existing',config:{'mcp_servers.other.enabled':true}});
  assert(!Object.keys(sent.params.config).some(k=>k.startsWith('mcp_servers.codex_app')));assert.equal(sent.params.config['plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.env'],undefined);assert.equal(sent.params.config['mcp_servers.other.enabled'],true);
  assert.equal(sent.params.config['plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled'],true);
  assert.equal(sent.params.config['plugins.code-review@openai-bundled.mcp_servers.code-review.enabled'],true);assert.equal(sent.params.config.model_provider,undefined);
  await c.request('thread/fork',{threadId:'existing',config:{'plugins.code-review@openai-bundled.mcp_servers.code-review.enabled':false}});assert.equal(sent.params.config['plugins.code-review@openai-bundled.mcp_servers.code-review.enabled'],false);
  assert(!JSON.stringify(hub.view()).includes('current-desktop.sock'));assert(!JSON.stringify(sent).includes('fixture-secret'));
});
test('startup policy probes do not count as an interactive desktop connection or leak internal metadata',async t=>{
  const f=await setup(t),{hub}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const c=new WsRpc(await connect(hub.desktop.url,hub.desktop.frontToken));t.after(()=>c.close());
  await c.request('initialize',{clientInfo:{name:'codex_desktop'},_padswitcherStartup:true});c.send({method:'initialized',params:{}});await pause(15);
  assert.equal(hub.view().connected.desktop,0);assert.equal(hub.desktop.clients.size,1);
  const client=[...hub.desktop.clients][0],send=client.back.send.bind(client.back);let sent;
  client.back.send=data=>{sent=JSON.parse(data);return send(data);};
  await c.request('initialize',{clientInfo:{name:'codex_desktop'},_padswitcherStartup:true});assert.equal(sent.params._padswitcherStartup,undefined);
  c.close();await f.client(hub.desktop,true);await pause(15);assert.equal(hub.view().connected.desktop,1);
});
