'use strict';
// Manual account choices against the real native engines through the production hub.
// Synthetic accounts, loopback inference and a disposable home: no real quota is used.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {assertFixtureHome}=require('./native-fixture.cjs');
const {GatewayHub}=require('../src/core/gateway-hub.cjs');
const {defaults}=require('../src/core/client-routes.cjs');
const {createPlatform}=require('../src/core/platform.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {decodeRequest}=require('../src/core/model-router.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const event=(type,value={})=>'data: '+JSON.stringify({type,...value})+'\n\n';
const jwt=p=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.fixture';
async function until(fn,label){for(let i=0;i<400;i++){if(fn())return;await pause(50);}throw Error('Timed out: '+label);}
(async()=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(require('node:os').tmpdir(),'pad-switch-'))),home=path.join(root,'desktop'),sharedHome=path.join(root,'shared');
  for(const dir of [home,sharedHome]){await fs.mkdir(dir,{mode:0o700});await fs.writeFile(path.join(dir,'config.toml'),'model="gpt-5.4"\nmodel_reasoning_effort="low"\n[features]\napps=false\n[analytics]\nenabled=false\n');}
  const platform={...createPlatform(root),processes:async()=>[]},executable=process.env.PADSWITCHER_DESKTOP_SMOKE_CODEX||await platform.findGatewayCodex();
  const access=id=>jwt({sub:'fixture-'+id,exp:Math.floor(Date.now()/1000)+86400,'https://api.openai.com/auth':{chatgpt_account_id:id,chatgpt_user_id:id,chatgpt_plan_type:'plus'}});
  const state={profiles:['a','b'].map(id=>({id,plan:'plus',status:'ready'})),settings:{desktopHome:sharedHome,workspace:root,codexPath:executable},autoSwitch:{enabled:false,order:[]},quotaCooldowns:{},clientRoutes:defaults()};
  const service={root,platform,state,running:new Map(),get:id=>({id}),accessBundle:async id=>({accessToken:access(id),chatgptAccountId:id,chatgptPlanType:'plus'}),save:async()=>{},changed:()=>{}};
  let hub,hold=null,asyncError;const clients=[],seen=[],onTool=new Map();
  const upstream=http.createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    if(req.method==='GET'){res.end('{"models":[]}');return;}
    const body=decodeRequest(Buffer.concat(parts),req.headers['content-encoding']),text=JSON.stringify(body.input);
    if(text.includes('Generate a concise')){res.writeHead(200);res.end(event('response.completed',{response:{id:'resp_title',status:'completed',output:[],usage:{input_tokens:1,output_tokens:0,total_tokens:1}}}));return;}
    const account=req.headers['chatgpt-account-id'],label=/SWITCH_[A-Z_0-9]+/g,name=[...text.matchAll(label)].at(-1)?.[0]||'unknown',afterTool=text.includes('function_call_output');
    seen.push({name,account,afterTool});
    res.writeHead(200);res.write(event('response.created',{response:{id:'resp_'+seen.length,status:'in_progress',output:[]}}));
    if(name==='SWITCH_MID_TURN'&&!afterTool){
      const item={type:'function_call',id:'fc_1',call_id:'call_1',name:'switch_now',arguments:'{}'};
      res.write(event('response.output_item.added',{output_index:0,item:{...item,arguments:''}}));res.write(event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments}));res.write(event('response.output_item.done',{output_index:0,item}));
      res.end(event('response.completed',{response:{id:'resp_'+seen.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}));return;
    }
    const item={type:'message',id:'msg_'+seen.length,role:'assistant',status:'completed',content:[{type:'output_text',text:'DONE',annotations:[]}]};
    res.write(event('response.output_item.added',{output_index:0,item:{...item,content:[]}}));res.write(event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:'DONE'}));
    if(name==='SWITCH_HELD'&&hold){hold.arrived();await hold.gate;}
    res.write(event('response.output_item.done',{output_index:0,item}));
    res.end(event('response.completed',{response:{id:'resp_'+seen.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}));
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const open=async kind=>{
    const r=new CodexRpc(kind==='desktop'?hub.desktop.helper:hub.helper,kind==='desktop'?home:sharedHome,{spawn:(exe,args,opts)=>spawn(exe,args,{...opts,env:{...opts.env,PADSWITCHER_CLIENT_KIND:kind}}),isolated:false}),c={rpc:r,kind,turns:new Map()};clients.push(c);
    const initialized=await r.request('initialize',{clientInfo:{name:kind==='desktop'?'Codex Desktop':'codex_vscode',version:'fixture'},capabilities:{experimentalApi:true}});
    await assertFixtureHome(initialized,kind==='desktop'?home:sharedHome,root);r.send({method:'initialized',params:{}});
    r.listeners.add((m,p)=>{if(m==='turn/completed')c.turns.set(p.turn.id,p.turn.status);});
    const receive=r.receive.bind(r);r.receive=line=>{
      let m;try{m=JSON.parse(line);}catch{return;}
      if(m.method==='item/tool/call'&&m.id!=null){(async()=>{await onTool.get(m.params.tool)();r.send({id:m.id,result:{success:true,contentItems:[{type:'inputText',text:'Done once.'}]}});})().catch(e=>asyncError=e);return;}
      receive(line);
    };
    return c;
  };
  const thread=async c=>(await c.rpc.request('thread/start',{cwd:root,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only',dynamicTools:[{type:'function',name:'switch_now',description:'Fixture step.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]})).thread.id;
  const start=async(c,id,text)=>(await c.rpc.request('turn/start',{threadId:id,input:[{type:'text',text}]})).turn.id;
  const finished=async(c,turnId)=>{await until(()=>c.turns.has(turnId)||asyncError,'native completion');if(asyncError)throw asyncError;assert.equal(c.turns.get(turnId),'completed');};
  const accounts=name=>seen.filter(x=>x.name===name).map(x=>x.account);
  const settled=()=>until(()=>!hub.turns.size&&!hub.shared.router.active&&hub.shared.profileId===hub.shared.router.profileId&&hub.desktop.profileId===hub.shared.router.profileId&&!hub.shared.pendingId&&!hub.desktop.pendingId&&!hub.shared.changing&&!hub.desktop.changing,'native auth sync');
  try{
    hub=new GatewayHub(service,{executable,environment:{HTTPS_PROXY:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',NO_PROXY:'localhost,127.0.0.1'},routerOptions:{upstream:'http://127.0.0.1:'+upstream.address().port+'/',allowTestUpstream:true}});
    await hub.start('a');await hub.startDesktop({home,executable});
    const vscode=await open('vscode'),other=await open('vscode'),desktop=await open('desktop');
    await until(()=>hub.view().connected.vscode===2&&hub.view().connected.desktop===1,'native handshakes');
    const main=await thread(vscode),second=await thread(other),third=await thread(desktop);

    // A choice made between model steps of a running turn, with other sessions prompting meanwhile.
    onTool.set('switch_now',async()=>{
      await hub.start('b');assert.equal(hub.shared.router.profileId,'b');assert.equal(hub.view().pendingId,null);
      await finished(other,await start(other,second,'SWITCH_OTHER_SESSION'));await finished(desktop,await start(desktop,third,'SWITCH_DESKTOP_SESSION'));
    });
    await finished(vscode,await start(vscode,main,'SWITCH_MID_TURN'));
    assert.deepEqual(accounts('SWITCH_MID_TURN'),['a','b'],'the turn moves at its next model call');
    assert.deepEqual(accounts('SWITCH_OTHER_SESSION'),['b']);assert.deepEqual(accounts('SWITCH_DESKTOP_SESSION'),['b']);await settled();

    // A choice made during a stream leaves that step alone.
    let arrived,release;const received=new Promise(r=>arrived=r),gate=new Promise(r=>release=r);hold={arrived,gate};
    const held=await start(vscode,main,'SWITCH_HELD');await received;await hub.start('a');assert.equal(hub.shared.router.profileId,'a');
    await finished(other,await start(other,second,'SWITCH_DURING_STREAM'));release();await finished(vscode,held);hold=null;
    assert.deepEqual(accounts('SWITCH_HELD'),['b']);assert.deepEqual(accounts('SWITCH_DURING_STREAM'),['a']);await settled();

    // New turns racing the native login itself, in both directions.
    for(let i=0;i<6;i++){
      const id=i%2?'a':'b',switching=hub.start(id),racing=await start(i%3?vscode:desktop,i%3?main:third,'SWITCH_RACE_'+i);
      await switching;await finished(i%3?vscode:desktop,racing);assert.deepEqual(accounts('SWITCH_RACE_'+i),[id]);await settled();
    }
    await finished(vscode,await start(vscode,main,'SWITCH_AFTERWARDS'));assert.equal(hub.shared.router.usage.blockedReplays,0);
    for(const c of clients)for(const status of c.turns.values())assert.equal(status,'completed');
    console.log(JSON.stringify({nativeEngine:hub.shared.version.trim(),midTurnAccounts:accounts('SWITCH_MID_TURN'),racingTurns:6,failedTurns:0,upstreamRequests:seen.length}));
  }finally{await Promise.all(clients.map(c=>c.rpc.close()));await hub?.stop(true);upstream.closeAllConnections();await new Promise(r=>upstream.close(r));assert.equal((await fs.realpath(path.dirname(path.resolve(root)))).toLowerCase(),(await fs.realpath(require('node:os').tmpdir())).toLowerCase());assert(path.basename(root).startsWith('pad-switch-'));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200}).catch(()=>{});}
})().catch(e=>{console.error('Switch fixture failed:',e.code||e.name,e.stack||e.message);process.exitCode=1;});
