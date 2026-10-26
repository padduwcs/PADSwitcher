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
test('desktop preserves the original history store and the same thread while shared account switching waits for its active turn',async t=>{
  const f=await setup(t),{hub,a,b}=f;
  const original=Buffer.from('original sign-in sentinel');await fs.writeFile(path.join(f.desktop,'auth.json'),original);
  await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  assert.equal(hub.desktop.router,hub.shared.router);assert.equal(hub.desktop.service.state.settings.desktopHome,f.desktop);assert.notEqual(hub.shared.service.state.settings.desktopHome,f.desktop);
  const desktop=await f.client(hub.desktop,true),vscode=await f.client(hub.shared);
  const thread=(await desktop.request('thread/start')).thread;
  const first=(await desktop.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Remember the project context'}]})).turn;
  await hub.start(b.id);assert.equal(hub.shared.profileId,a.id);assert.equal(hub.desktop.profileId,a.id);assert.equal(hub.shared.pendingId,b.id);
  await assert.rejects(vscode.request('turn/start',{threadId:'other',input:[]}));
  await desktop.request('fixture/complete',{turnId:first.id});
  for(let i=0;i<100&&(hub.shared.profileId!==b.id||hub.desktop.profileId!==b.id||hub.shared.changing||hub.desktop.changing);i++)await pause(30);
  assert.equal(hub.shared.profileId,b.id);assert.equal(hub.desktop.profileId,b.id);assert.equal(hub.desktop.pendingId,null);
  const second=(await desktop.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Continue the same project'}]})).turn;
  const turns=(await desktop.request('fixture/turns')).turns;
  assert.equal(turns.length,2);assert.equal(turns[0].threadId,turns[1].threadId);assert.equal(turns[0].accountId,'fixture-account-a');assert.equal(turns[1].accountId,'fixture-account-b');
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),original);assert.equal(await fs.readFile(path.join(f.desktop,'history.jsonl'),'utf8'),'KEEP HISTORY\n');
  await desktop.request('fixture/complete',{turnId:second.id});await pause(20);
  await assert.rejects(hub.stopDesktop(),{code:'DESKTOP_RUNNING'});
  desktop.close();for(let i=0;i<30&&hub.desktop.clients.size;i++)await pause(10);
  await hub.stopDesktop();assert.equal(hub.shared.status,'ready');assert(hub.shared.router.server.listening);assert.equal((await vscode.request('account/read')).account.email,'fixture-account-b@example.test');
});
test('desktop fails closed if native auth does not match; the existing shared connection remains usable',async t=>{
  const f=await setup(t);const vs=await f.client(f.hub.shared);
  await assert.rejects(f.hub.startDesktop({home:f.desktop,executable:'fixture-codex',environment:{PAD_TEST_WRONG_AUTH:'1'}}),{code:'DESKTOP_AUTH_VERIFY'});
  assert.equal(f.hub.shared.status,'ready');assert(f.hub.shared.router.server.listening);assert.equal((await vs.request('account/read')).account.email,'fixture-account-a@example.test');
});
test('runtime account verification failure closes desktop transport without stopping the shared router',async t=>{
  const f=await setup(t),{hub}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const desktop=await f.client(hub.desktop,true);await desktop.request('fixture/wrongAuth');
  await assert.rejects(hub.start(f.b.id),{code:'DESKTOP_AUTH_VERIFY'});
  assert.equal(hub.desktop.status,'error');assert.equal(hub.shared.status,'ready');assert(hub.shared.router.server.listening);
  for(let i=0;i<50&&hub.desktop.clients.size;i++)await pause(10);
  assert.equal(hub.desktop.clients.size,0);
});
test('desktop tools bind to the current GUI pipe per thread without exposing local transport metadata to Codex',async t=>{
  const f=await setup(t),{hub}=f;await hub.startDesktop({home:f.desktop,executable:'fixture-codex'});
  const c=new WsRpc(await connect(hub.desktop.url,hub.desktop.frontToken));t.after(()=>c.close());
  await c.request('initialize',{clientInfo:{name:'Codex Desktop'},_padswitcherDesktopEnvironment:{CODEX_APP_TOOLS_PIPE_PATH:'/tmp/current-desktop.sock',CODEX_MCP_NODE_PATH:'/runtime/node',OPENAI_API_KEY:'fixture-secret'}});
  const client=[...hub.desktop.clients][0];assert.equal(client.desktopEnvironment.OPENAI_API_KEY,undefined);
  // Observe what the native backend receives after decoration.
  const request=client.back.send.bind(client.back);let sent;
  client.back.send=data=>{sent=JSON.parse(data);return request(data);};
  await c.request('thread/resume',{threadId:'existing',config:{'mcp_servers.other.enabled':true}});
  assert.equal(sent.params.config['mcp_servers.codex_app.env'].CODEX_APP_TOOLS_PIPE_PATH,'/tmp/current-desktop.sock');assert.equal(sent.params.config['mcp_servers.other.enabled'],true);
  assert.equal(sent.params.config['plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled'],true);
  assert(!JSON.stringify(hub.view()).includes('current-desktop.sock'));assert(!JSON.stringify(sent).includes('fixture-secret'));
});
