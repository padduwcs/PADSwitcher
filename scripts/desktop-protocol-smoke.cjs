'use strict';
// Native Codex + the installed desktop (optional), synthetic accounts, isolated
// history and loopback inference only. Never reads the user's auth or app data.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {GatewayHub}=require('../src/core/gateway-hub.cjs');
const {defaults}=require('../src/core/client-routes.cjs');
const {createPlatform}=require('../src/core/platform.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {DesktopIntegration,installedDesktop}=require('../src/core/desktop.cjs');
const {decodeRequest}=require('../src/core/model-router.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const jwt=p=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.fixture-signature';
const fixtureExpiry=Math.floor(Date.now()/1000)+86400;
function token(id){return jwt({sub:'fixture-user-'+id,email:id+'@example.test',exp:fixtureExpiry,'https://api.openai.com/auth':{chatgpt_account_id:id,chatgpt_user_id:'fixture-user-'+id,chatgpt_plan_type:'plus'}});}
function respond(res,output){
  const event=(type,value={})=>'event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n';
  const id='resp_fixture';res.writeHead(200); // The real Codex backend may omit Content-Type on valid SSE.
  res.write(event('response.created',{response:{id,status:'in_progress',output:[]}}));
  output.forEach((item,index)=>{res.write(event('response.output_item.added',{output_index:index,item:{...item,...(item.type==='message'?{content:[]}:{arguments:''})}}));if(item.type==='function_call')res.write(event('response.function_call_arguments.delta',{item_id:item.id,output_index:index,delta:item.arguments}));res.write(event('response.output_item.done',{output_index:index,item}));});
  res.end(event('response.completed',{response:{id,status:'completed',output,usage:{input_tokens:100,output_tokens:5,total_tokens:105}}}));
}
async function until(fn,label){for(let i=0;i<1200;i++){const value=await fn();if(value)return value;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{

  const root=await fs.realpath(await fs.mkdtemp(path.join(require('node:os').tmpdir(),'pad-desktop-smoke-'))),home=path.join(root,'existing-codex'),privateHome=path.join(root,'pad-private');
  for(const p of [home,privateHome])await fs.mkdir(p,{mode:0o700});
  const original=Buffer.from('Original sign-in sentinel; never import this.');await fs.writeFile(path.join(home,'auth.json'),original,{mode:0o600});
  const mcp=path.join(root,'mcp-fixture.cjs'),marketplace=path.join(root,'marketplace'),plugin=path.join(marketplace,'plugins/codex-app-tools');
  await fs.writeFile(mcp,`const readline=require('node:readline'),net=require('node:net');readline.createInterface({input:process.stdin}).on('line',async line=>{const m=JSON.parse(line);if(m.id==null)return;let result={};if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'desktop-fixture',version:'1'}};if(m.method==='tools/list')result={tools:[{name:'desktop_fixture',description:'Verify the current desktop tools pipe.',inputSchema:{type:'object',properties:{}}}]};if(m.method==='tools/call'){const text=await new Promise((resolve,reject)=>{const c=net.connect(process.env.CODEX_APP_TOOLS_PIPE_PATH,()=>c.write('fixture'));let text='';c.on('data',b=>text+=b);c.on('end',()=>resolve(text));c.on('error',reject);});result={content:[{type:'text',text}]};}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`);
  await fs.mkdir(path.join(plugin,'.codex-plugin'),{recursive:true});await fs.mkdir(path.join(marketplace,'.agents/plugins'),{recursive:true});
  await fs.writeFile(path.join(plugin,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-app-tools',version:'0.0.1',mcpServers:'./.mcp.json',description:'Offline fixture only.'}));
  await fs.writeFile(path.join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{codex_app:{command:process.execPath,args:[mcp],env_vars:['CODEX_APP_TOOLS_PIPE_PATH'],enabled:true,default_tools_approval_mode:'approve'}}}));
  await fs.writeFile(path.join(marketplace,'.agents/plugins/marketplace.json'),JSON.stringify({name:'desktop-fixture',plugins:[{name:'codex-app-tools',source:{source:'local',path:'./plugins/codex-app-tools'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Developer Tools'}]}));
  const config='model = "gpt-5.4"\nmodel_reasoning_effort = "low"\nmcp_optional_startup_grace_ms = 0\n[features]\napps = false\n[analytics]\nenabled = false\n';await fs.writeFile(path.join(home,'config.toml'),config,{mode:0o600});await fs.writeFile(path.join(privateHome,'config.toml'),config,{mode:0o600});
  const pipeCalls=[],pipeServers=[],sockets=['first','second'].map(n=>'\\\\.\\pipe\\PADSwitcher-fixture-'+require('node:crypto').randomUUID()+'-'+n);let generation=0;
  for(const socket of sockets){const server=net.createServer(c=>c.once('data',()=>{pipeCalls.push(socket);c.end('MCP_PIPE_VERIFIED');}));pipeServers.push(server);await new Promise(r=>server.listen(socket,r));}
  const seen=[];let tools=0,completed=0,failed=0,rpc,hub,appChild;
  const upstream=http.createServer(async(req,res)=>{
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"models":[]}');return;}
    const parts=[];for await(const p of req)parts.push(p);const bytes=Buffer.concat(parts),body=decodeRequest(bytes,req.headers['content-encoding']);seen.push({bytes,body,account:req.headers['chatgpt-account-id'],thread:req.headers['thread-id']});
    if(seen.length===1){respond(res,[{type:'function_call',id:'fc_first',call_id:'call_first',name:'write_marker',arguments:'{}'}]);return;}
    if(seen.length===2){res.writeHead(429,{'Content-Type':'application/json'});res.end('{"error":{"type":"usage_limit_reached","resets_in_seconds":900}}');return;}
    if(seen.length===5){assert(JSON.stringify(body.tools).includes('desktop_fixture'),'MCP tool must be visible after desktop restart');respond(res,[{type:'function_call',id:'fc_mcp',call_id:'call_mcp',namespace:'mcp__codex_app',name:'desktop_fixture',arguments:'{}'}]);return;}
    respond(res,[{type:'message',id:'msg_'+seen.length,role:'assistant',status:'completed',content:[{type:'output_text',text:'DESKTOP_CONTEXT_PRESERVED_'+seen.length,annotations:[]}]}]);
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const platform={...createPlatform(root),processes:async()=>[]};
  const executable=process.env.PADSWITCHER_DESKTOP_SMOKE_CODEX||(process.env.PADSWITCHER_DESKTOP_SMOKE_APP?(await installedDesktop()).engine:await platform.findGatewayCodex());
  const service={root,platform,state:{profiles:['a','b','c'].map(id=>({id,plan:'plus',status:'ready'})),settings:{desktopHome:privateHome,workspace:home,codexPath:executable},autoSwitch:{enabled:true,order:['a','b']},quotaCooldowns:{},clientRoutes:defaults()},running:new Map(),get:id=>({id,email:id+'@example.test'}),accessBundle:async id=>({accessToken:token(id),chatgptAccountId:id,chatgptPlanType:'plus'}),save:async()=>{},changed:()=>{}};
  const open=async()=>{
    const pipe=sockets[Math.min(generation++,1)];
    const r=new CodexRpc(hub.desktop.helper,home,{spawn:(exe,args,opts)=>spawn(exe,args,{...opts,env:{...opts.env,PADSWITCHER_CLIENT_KIND:'desktop',CODEX_APP_TOOLS_PIPE_PATH:pipe,CODEX_MCP_NODE_PATH:process.execPath}})});
    await r.initialize({experimentalApi:true});
    r.listeners.add((method,p)=>{if(method==='turn/completed'){if(p.turn.status==='completed')completed++;else failed++;}});
    const receive=r.receive.bind(r);r.receive=line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.error)console.error('Synthetic fixture RPC error:',m.error.code,String(m.error.message).slice(0,500));if(m.method==='item/tool/call'&&m.id!=null){tools++;r.send({id:m.id,result:{success:true,contentItems:[{type:'inputText',text:'Desktop fixture marker executed once.'}]}});return;}receive(line);};
    return r;
  };
  try{
    hub=new GatewayHub(service,{executable,environment:{HTTPS_PROXY:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',NO_PROXY:'localhost,127.0.0.1'},routerOptions:{upstream:'http://127.0.0.1:'+upstream.address().port+'/',allowTestUpstream:true}});
    await hub.start('a');await hub.startDesktop({home,executable});rpc=await open();
    // The user's real setup has plugin-provided MCP, with no standalone
    // mcp_servers.codex_app command. This failed in Unix.4 before inference.
    const empty=await rpc.request('thread/start',{cwd:home,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only'});assert(empty.thread.id);assert.equal(seen.length,0);
    await rpc.request('plugin/install',{marketplacePath:path.join(marketplace,'.agents/plugins/marketplace.json'),pluginName:'codex-app-tools'});
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
    assert.deepEqual(pipeCalls,[sockets[1]]);assert(JSON.stringify(seen.at(-1).body).includes('MCP_PIPE_VERIFIED'));
    assert(!(await fs.readFile(path.join(home,'config.toml'),'utf8')).includes('[mcp_servers.codex_app]'));
    assert.deepEqual(await fs.readFile(path.join(home,'auth.json')),original);
    console.log('Native desktop transport: same thread across quota A/B, exact retry, tool once, manual switching, restart/resume and current desktop MCP tools pipe: passed.');
    await rpc.close();rpc=null;await until(()=>!hub.desktop.clients.size,'close fixture client');
    if(process.env.PADSWITCHER_DESKTOP_SMOKE_APP){
      const handshakes=[],resumes=new Map(),resumedByGui=[];
      const fromClient=hub.desktop.fromClient.bind(hub.desktop),fromBackend=hub.desktop.fromBackend.bind(hub.desktop);
      hub.desktop.fromClient=(c,data)=>{const m=JSON.parse(data);if(m.method==='thread/resume'&&m.params?.threadId===thread.id)resumes.set(m.id,true);if(['initialize','initialized'].includes(m.method))handshakes.push({direction:'client',method:m.method,id:m.id,name:m.params?.clientInfo?.name});return fromClient(c,data);};
      hub.desktop.fromBackend=(c,data)=>{const m=JSON.parse(data);if(m.id!=null&&resumes.has(m.id)){assert(!m.error,'Installed desktop must resume the fixture without configuration errors');resumedByGui.push(m.result?.thread?.id);}if(m.id!=null&&m.id===c.initializeId)handshakes.push({direction:'backend',id:m.id,error:m.error?.code});return fromBackend(c,data);};
      const userData=path.join(root,'isolated-desktop-ui');await fs.mkdir(userData,{mode:0o700});
      const desktop=new DesktopIntegration(service,hub,{home,testEnvironment:{CODEX_ELECTRON_USER_DATA_PATH:userData},arguments:['--remote-debugging-port=0','--disable-gpu','--user-data-dir='+userData,'--proxy-server=http://127.0.0.1:9','codex://threads/'+thread.id],spawn:(exe,args,opts)=>{appChild=spawn(exe,args,opts);return appChild;}});
      await desktop.init();await desktop.launch('c');
      try{await until(()=>desktop.view().connected>0,'installed desktop handshake');}catch(error){console.error({view:desktop.view(),clients:[...hub.desktop.clients].map(c=>({kind:c.kind,initialized:c.initialized,initializedReceived:c.initializedReceived,initializeAccepted:c.initializeAccepted,initializeId:c.initializeId,front:c.front.readyState,back:c.back?.readyState})),handshakes});throw error;}
      // A fresh isolated app profile has onboarding; dismiss it only in this
      // disposable fixture, then open the existing synthetic conversation.
      const debugPort=Number((await fs.readFile(path.join(userData,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      const targets=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
      const target=targets.find(t=>t.type==='page'&&t.url.endsWith('/index.html'));assert(target);
      const {WebSocket}=require('ws'),cdp=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>cdp.once('open',r));
      let sequence=0;const evaluate=expression=>new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{cdp.off('message',receive);reject(Error('Isolated desktop UI did not respond'));},10000);
        const receive=b=>{const m=JSON.parse(b);if(m.id!==id)return;clearTimeout(timer);cdp.off('message',receive);if(m.error)reject(Error('Isolated desktop UI evaluation failed'));else resolve(m.result?.result?.value);};
        cdp.on('message',receive);cdp.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
      });
      try{
        await until(async()=>{
          const body=await evaluate('document.body.innerText');
          if(body.includes('What type of work do you do?'))await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Skip")?.click()');
          return body.includes('Remember DESKTOP_ORIGINAL_CONTEXT, execute the marker and finish.');
        },'isolated desktop onboarding and recent history');
        await evaluate('Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Remember DESKTOP_ORIGINAL_CONTEXT, execute the marker and finish."&&!Array.from(e.children).some(c=>c.textContent.trim()===e.textContent.trim()))?.click()');
        await until(()=>resumedByGui.includes(thread.id),'installed desktop opens the existing conversation');
        await until(async()=>{const body=await evaluate('document.body.innerText');return body.includes('DESKTOP_CONTEXT_PRESERVED_6')&&!body.includes("can’t load config.toml")&&!body.includes("invalid transport");},'installed desktop displays the existing conversation');
      }finally{cdp.close();}
      assert.equal(desktop.view().profileId,'c');assert.deepEqual(await fs.readFile(path.join(home,'auth.json')),original);
      console.log('Installed ChatGPT desktop: isolated headless app resumed the existing conversation through the verified native account: passed.');
    }
  }catch(error){console.error("Desktop primary error:",error.stack);throw error;}finally{
    if(appChild?.pid&&appChild.exitCode===null){try{require('node:child_process').execFileSync('taskkill.exe',['/PID',String(appChild.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}await pause(500);}
    await rpc?.close();await hub?.stop(true);upstream.closeAllConnections();await new Promise(r=>upstream.close(r));for(const s of pipeServers)await new Promise(r=>s.close(r));assert.equal((await fs.realpath(path.dirname(path.resolve(root)))).toLowerCase(),(await fs.realpath(require('node:os').tmpdir())).toLowerCase());assert(path.basename(root).startsWith('pad-desktop-smoke-'));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(e=>{console.error('Desktop protocol fixture failed:',e.code||e.name,e.stack||e.message);process.exitCode=1;});
