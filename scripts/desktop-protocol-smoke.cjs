'use strict';
// Native Codex + the installed desktop (optional), synthetic accounts, isolated
// history and loopback inference only. Never reads the user's auth or app data.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {GatewayHub}=require('../src/core/gateway-hub.cjs');
const {defaults}=require('../src/core/client-routes.cjs');
const {createUnixPlatform}=require('../src/core/unix.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {DesktopIntegration,installedDesktop}=require('../src/core/desktop.cjs');
const {decodeRequest}=require('../src/core/model-router.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const jwt=p=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.fixture-signature';
function token(id){return jwt({sub:'fixture-user-'+id,email:id+'@example.test',exp:Math.floor(Date.now()/1000)+86400,'https://api.openai.com/auth':{chatgpt_account_id:id,chatgpt_user_id:'fixture-user-'+id,chatgpt_plan_type:'plus'}});}
function respond(res,output){
  const event=(type,value={})=>'event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n';
  const id='resp_fixture';res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.write(event('response.created',{response:{id,status:'in_progress',output:[]}}));
  output.forEach((item,index)=>{res.write(event('response.output_item.added',{output_index:index,item:{...item,...(item.type==='message'?{content:[]}:{arguments:''})}}));if(item.type==='function_call')res.write(event('response.function_call_arguments.delta',{item_id:item.id,output_index:index,delta:item.arguments}));res.write(event('response.output_item.done',{output_index:index,item}));});
  res.end(event('response.completed',{response:{id,status:'completed',output,usage:{input_tokens:100,output_tokens:5,total_tokens:105}}}));
}
async function until(fn,label){for(let i=0;i<300;i++){const value=await fn();if(value)return value;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
  if(process.platform==='win32')throw Error('Run the desktop smoke on Linux/macOS.');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-desktop-smoke-')),home=path.join(root,'existing-codex'),privateHome=path.join(root,'pad-private');
  for(const p of [home,privateHome])await fs.mkdir(p,{mode:0o700});
  const original=Buffer.from('Original sign-in sentinel; never import this.');await fs.writeFile(path.join(home,'auth.json'),original,{mode:0o600});
  const marker=path.join(root,'mcp-marker'),mcp=path.join(root,'mcp-fixture.cjs');
  await fs.writeFile(mcp,`const readline=require('node:readline'),fs=require('node:fs');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id==null)return;let result={};if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'desktop-fixture',version:'1'}};if(m.method==='tools/list')result={tools:[{name:'desktop_fixture',description:'Verify the current desktop tools pipe.',inputSchema:{type:'object',properties:{}}}]};if(m.method==='tools/call'){fs.appendFileSync(process.env.CODEX_APP_TOOLS_PIPE_PATH,'called\\n');result={content:[{type:'text',text:'MCP_PIPE_VERIFIED'}]};}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`);
  const config='model = "gpt-5.4"\nmodel_reasoning_effort = "low"\n[analytics]\nenabled = false\n';await fs.writeFile(path.join(home,'config.toml'),config+'[mcp_servers.codex_app]\ncommand = '+JSON.stringify(process.execPath)+'\nargs = ['+JSON.stringify(mcp)+']\nenabled = false\n[mcp_servers.codex_app.tools.desktop_fixture]\napproval_mode = "approve"\n',{mode:0o600});await fs.writeFile(path.join(privateHome,'config.toml'),config,{mode:0o600});
  const seen=[];let tools=0,completed=0,failed=0,rpc,hub,appChild;
  const upstream=http.createServer(async(req,res)=>{
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"models":[]}');return;}
    const parts=[];for await(const p of req)parts.push(p);const bytes=Buffer.concat(parts),body=decodeRequest(bytes,req.headers['content-encoding']);seen.push({bytes,body,account:req.headers['chatgpt-account-id'],thread:req.headers['thread-id']});
    if(seen.length===1){respond(res,[{type:'function_call',id:'fc_first',call_id:'call_first',name:'write_marker',arguments:'{}'}]);return;}
    if(seen.length===2){res.writeHead(429,{'Content-Type':'application/json'});res.end('{"error":{"type":"usage_limit_reached","resets_in_seconds":900}}');return;}
    if(seen.length===5){assert(JSON.stringify(body.tools).includes('desktop_fixture'),'MCP tool must be visible after desktop restart');respond(res,[{type:'function_call',id:'fc_mcp',call_id:'call_mcp',namespace:'mcp__codex_app',name:'desktop_fixture',arguments:'{}'}]);return;}
    respond(res,[{type:'message',id:'msg_'+seen.length,role:'assistant',status:'completed',content:[{type:'output_text',text:'DESKTOP_CONTEXT_PRESERVED_'+seen.length,annotations:[]}]}]);
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const platform={...createUnixPlatform(root),processes:async()=>[]};
  const executable=process.env.PADSWITCHER_DESKTOP_SMOKE_CODEX||(process.env.PADSWITCHER_DESKTOP_SMOKE_APP?(await installedDesktop()).engine:await platform.findGatewayCodex());
  const service={root,platform,state:{profiles:['a','b','c'].map(id=>({id,plan:'plus',status:'ready'})),settings:{desktopHome:privateHome,workspace:home,codexPath:executable},autoSwitch:{enabled:true,order:['a','b']},quotaCooldowns:{},clientRoutes:defaults()},running:new Map(),get:id=>({id,email:id+'@example.test'}),accessBundle:async id=>({accessToken:token(id),chatgptAccountId:id,chatgptPlanType:'plus'}),save:async()=>{},changed:()=>{}};
  const open=async()=>{
    const r=new CodexRpc(hub.desktop.helper,home,{spawn:(exe,args,opts)=>spawn(exe,args,{...opts,env:{...opts.env,PADSWITCHER_CLIENT_KIND:'desktop',CODEX_APP_TOOLS_PIPE_PATH:marker,CODEX_MCP_NODE_PATH:process.execPath}})});
    await r.initialize({experimentalApi:true});
    r.listeners.add((method,p)=>{if(method==='turn/completed'){if(p.turn.status==='completed')completed++;else failed++;}});
    const receive=r.receive.bind(r);r.receive=line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.method==='item/tool/call'&&m.id!=null){tools++;r.send({id:m.id,result:{success:true,contentItems:[{type:'inputText',text:'Desktop fixture marker executed once.'}]}});return;}receive(line);};
    return r;
  };
  try{
    hub=new GatewayHub(service,{executable,routerOptions:{upstream:'http://127.0.0.1:'+upstream.address().port+'/',allowTestUpstream:true}});
    await hub.start('a');await hub.startDesktop({home,executable});rpc=await open();
    const thread=(await rpc.request('thread/start',{cwd:home,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only',dynamicTools:[{type:'function',name:'write_marker',description:'Write one synthetic marker.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]})).thread;
    await rpc.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Remember DESKTOP_ORIGINAL_CONTEXT, execute the marker and finish.'}]});
    await until(()=>completed===1||failed,'first desktop turn');assert.equal(failed,0);assert.equal(tools,1);assert.deepEqual(seen.map(x=>x.account),['a','a','b']);assert(seen[1].bytes.equals(seen[2].bytes));
    await until(()=>hub.desktop.profileId==='b'&&hub.shared.profileId==='b','native auth after quota switch');
    await hub.start('c');await until(()=>hub.desktop.profileId==='c'&&!hub.desktop.pendingId,'manual switch');
    await rpc.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Continue the same conversation after changing accounts.'}]});
    await until(()=>completed===2||failed,'second desktop turn');assert.equal(failed,0);assert.equal(tools,1);assert.equal(seen.at(-1).account,'c');assert(JSON.stringify(seen.at(-1).body).includes('DESKTOP_ORIGINAL_CONTEXT'));
    await rpc.close();rpc=null;await until(()=>!hub.desktop.clients.size,'close desktop transport');await hub.stopDesktop();
    await hub.startDesktop({home,executable});rpc=await open();const resumed=await rpc.request('thread/resume',{threadId:thread.id,cwd:home,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only'});assert.equal(resumed.thread.id,thread.id);assert.equal(resumed.thread.turns.length,2);
    await rpc.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Continue after reopening desktop.'}]});await until(()=>completed===3||failed,'resumed desktop turn');assert.equal(failed,0);assert(JSON.stringify(seen.at(-1).body).includes('DESKTOP_ORIGINAL_CONTEXT'));assert(seen.every(r=>r.thread===thread.id));
    try{assert.equal(await fs.readFile(marker,'utf8'),'called\n');}catch(error){console.error('Fixture tool results:',JSON.stringify(seen.at(-1).body.input.filter(x=>x.type==='function_call_output').map(x=>({call:x.call_id,output:x.output}))));throw error;}assert(JSON.stringify(seen.at(-1).body).includes('MCP_PIPE_VERIFIED'));
    assert.deepEqual(await fs.readFile(path.join(home,'auth.json')),original);
    console.log('Native desktop transport: same thread across quota A/B, exact retry, tool once, manual switching, restart/resume and current desktop MCP tools pipe: passed.');
    await rpc.close();rpc=null;await until(()=>!hub.desktop.clients.size,'close fixture client');
    if(process.env.PADSWITCHER_DESKTOP_SMOKE_APP){
      const handshakes=[];
      const fromClient=hub.desktop.fromClient.bind(hub.desktop),fromBackend=hub.desktop.fromBackend.bind(hub.desktop);
      hub.desktop.fromClient=(c,data)=>{const m=JSON.parse(data);if(['initialize','initialized'].includes(m.method))handshakes.push({direction:'client',method:m.method,id:m.id,name:m.params?.clientInfo?.name});return fromClient(c,data);};
      hub.desktop.fromBackend=(c,data)=>{const m=JSON.parse(data);if(m.id!=null&&m.id===c.initializeId)handshakes.push({direction:'backend',id:m.id,error:m.error?.code});return fromBackend(c,data);};
      const userData=path.join(root,'isolated-desktop-ui');await fs.mkdir(userData,{mode:0o700});
      const desktop=new DesktopIntegration(service,hub,{home,testEnvironment:{CODEX_ELECTRON_USER_DATA_PATH:userData},arguments:['--ozone-platform=headless','--disable-gpu','--user-data-dir='+userData,'--proxy-server=http://127.0.0.1:9'],spawn:(exe,args,opts)=>{appChild=spawn(exe,args,opts);return appChild;}});
      await desktop.init();await desktop.launch('c');
      try{await until(()=>desktop.view().connected>0,'installed desktop handshake');}catch(error){console.error({view:desktop.view(),clients:[...hub.desktop.clients].map(c=>({kind:c.kind,initialized:c.initialized,initializedReceived:c.initializedReceived,initializeAccepted:c.initializeAccepted,initializeId:c.initializeId,front:c.front.readyState,back:c.back?.readyState})),handshakes});throw error;}
      assert.equal(desktop.view().profileId,'c');assert.deepEqual(await fs.readFile(path.join(home,'auth.json')),original);
      console.log('Installed ChatGPT desktop: isolated headless app connected to the verified native account and original history store: passed.');
    }
  }finally{
    if(appChild?.pid&&appChild.exitCode===null){try{process.kill(-appChild.pid,'SIGTERM');}catch{}await pause(1000);if(appChild.exitCode===null)try{process.kill(-appChild.pid,'SIGKILL');}catch{}}
    await rpc?.close();await hub?.stop(true);upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await fs.rm(root,{recursive:true,force:true});
  }
})().catch(e=>{console.error('Desktop protocol fixture failed:',e.code||e.name,e.stack||e.message);process.exitCode=1;});
