'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{WebSocketServer}=require('ws');
const windows=require('../src/core/windows.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('native desktop handshake carries only allowed startup configuration and uses the adjacent gateway',{timeout:20000},async t=>{
  const parent=path.resolve('artifacts/tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'helper-')),helper=path.join(root,'PADCodex.exe');await fs.copyFile(path.resolve('src/assets/PADCodex.exe'),helper);
  const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));
  let child,received;const token=crypto.randomBytes(32).toString('hex');
  t.after(async()=>{child?.kill();for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
  await fs.writeFile(path.join(root,'client-capability'),token);await fs.writeFile(path.join(root,'connection.json'),JSON.stringify({version:1,url:'ws://127.0.0.1:'+server.address().port,tokenFile:path.join(root,'client-capability')}));
  const initialized=new Promise(resolve=>server.on('connection',(socket,request)=>{assert.equal(request.headers.authorization,'Bearer '+token);socket.on('message',bytes=>{const m=JSON.parse(bytes);if(m.method==='initialize'){received=m;socket.send(JSON.stringify({id:m.id,result:{}}));resolve();}});}));
  const env={...process.env,PADSWITCHER_CLIENT_KIND:'desktop',CODEX_APP_TOOLS_PIPE_PATH:'\\\\.\\pipe\\fixture-current',CODEX_MCP_NODE_PATH:process.execPath};delete env.PADSWITCHER_CONNECTION_FILE;
  child=spawn(helper,['app-server','-c','plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled=true','--config=plugins.code-review@openai-bundled.mcp_servers.code-review.enabled=false','-c','model_provider="private-unrelated"'],{env,windowsHide:true,stdio:['pipe','pipe','ignore']});
  child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'Codex Desktop'}}})+'\n');await initialized;
  assert.equal(received.params._padswitcherClient,'desktop');assert.deepEqual(received.params._padswitcherDesktopEnvironment,{CODEX_APP_TOOLS_PIPE_PATH:env.CODEX_APP_TOOLS_PIPE_PATH,CODEX_MCP_NODE_PATH:process.execPath});
  assert.deepEqual(received.params._padswitcherDesktopConfig,{'plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled':true,'plugins.code-review@openai-bundled.mcp_servers.code-review.enabled':false});
});
test('native stdio host owns its Codex process and closes it when the manager dies',{timeout:25000},async t=>{
  const parent=path.resolve('artifacts/tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'owner-')),exe=await windows.findGatewayCodex();
  const script="const {CodexRpc}=require('./src/core/rpc.cjs');const r=new CodexRpc(process.argv[1],process.argv[2],{isolated:true,ephemeralStore:true});r.initialize().then(()=>{console.log(r.child.pid);setInterval(()=>{},1000);}).catch(()=>process.exit(1));";
  const owner=spawn(process.execPath,['-e',script,exe,root],{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','ignore'],windowsHide:true});
  t.after(async()=>{owner.kill();await pause(300);await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
  const hostPid=await new Promise((resolve,reject)=>{let text='';owner.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim()));});owner.once('exit',()=>reject(Error('Owner exited before native initialization')));});
  assert(Number.isSafeInteger(hostPid));const list=await windows.processes(),native=list.find(p=>p.ParentProcessId===hostPid&&p.Name.toLowerCase()==='codex.exe');assert(native);
  owner.kill();let alive;for(let i=0;i<20;i++){alive=(await windows.processes()).some(p=>p.ProcessId===native.ProcessId||p.ProcessId===hostPid);if(!alive)break;await pause(100);}assert.equal(alive,false);
});
