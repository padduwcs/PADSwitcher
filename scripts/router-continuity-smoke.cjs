'use strict';
// Production desktop + VS Code routes, native engines, synthetic accounts and
// loopback inference only. Marker files are real, disposable tool side effects.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {GatewayHub}=require('../src/core/gateway-hub.cjs');
const {defaults}=require('../src/core/client-routes.cjs');
const {createUnixPlatform}=require('../src/core/unix.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {decodeRequest}=require('../src/core/model-router.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const event=(type,value={})=>'data: '+JSON.stringify({type,...value})+'\n\n';
const jwt=p=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.fixture';
async function until(fn,label){for(let i=0;i<400;i++){if(fn())return;await pause(50);}throw Error('Timed out: '+label);}
(async()=>{
  const root=await fs.realpath(await fs.mkdtemp('/tmp/pad-continuity-')),home=path.join(root,'desktop'),sharedHome=path.join(root,'shared'),marker=path.join(root,'tool-markers');
  for(const dir of [home,sharedHome]){await fs.mkdir(dir,{mode:0o700});await fs.writeFile(path.join(dir,'config.toml'),'model="gpt-5.4"\nmodel_reasoning_effort="low"\n[features]\napps=false\n[analytics]\nenabled=false\n');}
  const platform={...createUnixPlatform(root),processes:async()=>[]},executable=process.env.PADSWITCHER_DESKTOP_SMOKE_CODEX||await platform.findGatewayCodex();
  const access=id=>jwt({sub:'fixture-'+id,exp:Math.floor(Date.now()/1000)+86400,'https://api.openai.com/auth':{chatgpt_account_id:id,chatgpt_user_id:id,chatgpt_plan_type:'plus'}});
  const state={profiles:['a','b'].map(id=>({id,plan:'plus',status:'ready'})),settings:{desktopHome:sharedHome,workspace:root,codexPath:executable},autoSwitch:{enabled:true,order:['a','b']},quotaCooldowns:{},clientRoutes:defaults()};
  const service={root,platform,state,running:new Map(),get:id=>({id}),accessBundle:async id=>({accessToken:access(id),chatgptAccountId:id,chatgptPlanType:'plus'}),save:async()=>{},changed:()=>{}};
  let hub,round=-1,quotaEnabled=true,toolCount=0,steers=0,asyncError;const clients=[],steps=new Map(),seen=[];
  const upstream=http.createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    if(req.method==='GET'){res.end('{"models":[]}');return;}
    const bytes=Buffer.concat(parts),body=decodeRequest(bytes,req.headers['content-encoding']),metadata=JSON.parse(req.headers['x-codex-turn-metadata']||'{}'),key=req.headers['thread-id']+':'+metadata.turn_id;
    let step=steps.get(key);if(!step){step={number:steps.size,phase:0,quota:false,round};steps.set(key,step);}
    const account=req.headers['chatgpt-account-id'];seen.push({key,account,round:step.round,previousResponse:!!body.previous_response_id,conversation:!!body.conversation,itemReferences:body.input?.filter?.(x=>typeof x==='string'||x?.type==='item_reference').length||0});
    const quotaPhase=step.round%2;
    if(quotaEnabled&&step.phase===quotaPhase&&!step.quota){step.quota=true;step.rejected=bytes;step.rejectedAccount=account;res.writeHead(429);res.end('{"error":{"type":"usage_limit_reached","resets_in_seconds":900}}');return;}
    if(step.rejected){assert(step.rejected.equals(bytes),'quota retry must preserve the entire request');assert.notEqual(account,step.rejectedAccount);step.rejected=null;}
    res.writeHead(200); // Real backend also accepts data-only SSE without MIME.
    res.write(event('response.created',{response:{id:'resp_'+step.number,status:'in_progress',output:[]}}));
    let output;
    if(step.phase++===0){
      const item={type:'function_call',id:'fc_'+step.number,call_id:'call_'+step.number,name:'write_marker',arguments:JSON.stringify({marker:step.number})};output=[item];
      res.write(event('response.output_item.added',{output_index:0,item:{...item,arguments:''}}));res.write(event('response.function_call_arguments.delta',{item_id:item.id,output_index:0,delta:item.arguments}));res.write(event('response.output_item.done',{output_index:0,item}));
    }else{
      assert(JSON.stringify(body).includes('CONTINUITY_ORIGINAL_CONTEXT'),'keep the original conversation context');
      if(step.round%3===0&&step.round>=0)assert(JSON.stringify(body).includes('STEERING_'+step.round),'include the accepted new instruction');
      const item={type:'message',id:'msg_'+step.number,role:'assistant',status:'completed',content:[{type:'output_text',text:'CONTINUITY_DONE',annotations:[]}]};output=[item];res.write(event('response.output_item.done',{output_index:0,item}));
    }
    const terminal=event('response.completed',{response:{id:'resp_'+step.number,status:'completed',output,usage:{input_tokens:100,output_tokens:10,total_tokens:110},...([2,9].includes(step.round)?{fixture_padding:'x'.repeat(2*1024*1024)}:{})}});
    res.end(terminal);
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const open=async(kind)=>{
    const r=new CodexRpc(kind==='desktop'?hub.desktop.helper:hub.helper,kind==='desktop'?home:sharedHome,{spawn:(exe,args,opts)=>spawn(exe,args,{...opts,env:{...opts.env,PADSWITCHER_CLIENT_KIND:kind}})});
    const c={rpc:r,kind,status:null,turnId:null};clients.push(c);
    await r.request('initialize',{clientInfo:{name:kind==='desktop'?'Codex Desktop':'codex_vscode',version:'fixture'},capabilities:{experimentalApi:true}});r.send({method:'initialized',params:{}});
    r.listeners.add((m,p)=>{if(m==='turn/started')c.turnId=p.turn.id;if(m==='error')c.lastError=p.error;if(m==='turn/completed'){c.status=p.turn.status;c.lastError=p.turn.error||c.lastError;}});
    const receive=r.receive.bind(r);r.receive=line=>{
      let m;try{m=JSON.parse(line);}catch{return;}
      if(m.method==='item/tool/call'&&m.id!=null){
        (async()=>{
          const value=typeof m.params.arguments==='string'?JSON.parse(m.params.arguments):m.params.arguments;await fs.appendFile(marker,value.marker+'\n');toolCount++;
          if(round>=0&&round%3===0){await r.request('turn/steer',{threadId:c.threadId,expectedTurnId:c.turnId,input:[{type:'text',text:'STEERING_'+round}]});steers++;}
          r.send({id:m.id,result:{success:true,contentItems:[{type:'inputText',text:'Marker '+value.marker+' committed once.'}]}});
        })().catch(e=>asyncError=e);return;
      }
      receive(line);
    };
    c.threadId=(await r.request('thread/start',{cwd:root,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only',dynamicTools:[{type:'function',name:'write_marker',description:'Write a disposable verification marker once.',inputSchema:{type:'object',properties:{marker:{type:'number'}},required:['marker'],additionalProperties:false}}]})).thread.id;
    return c;
  };
  const turn=async(c,text)=>{c.status=null;c.lastError=null;const result=await c.rpc.request('turn/start',{threadId:c.threadId,input:[{type:'text',text}]});c.turnId=result.turn.id;await until(()=>c.status||asyncError,'native completion');if(asyncError)throw asyncError;assert.equal(c.status,'completed',JSON.stringify({round,kind:c.kind,error:c.lastError,requests:seen.length,lastRequests:seen.slice(-3),events:hub.shared.recovery.events.slice(-4),pending:hub.shared.pendingId,changing:hub.shared.changing,desktopPending:hub.desktop.pendingId,cooldowns:state.quotaCooldowns}));};
  try{
    hub=new GatewayHub(service,{executable,environment:{HTTPS_PROXY:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',NO_PROXY:'localhost,127.0.0.1'},routerOptions:{upstream:'http://127.0.0.1:'+upstream.address().port+'/',allowTestUpstream:true}});
    await hub.start('a');await hub.startDesktop({home,executable});const vscode=await open('vscode'),desktop=await open('desktop');
    assert.equal(hub.view().connected.vscode,1);assert.equal(hub.view().connected.desktop,1);
    for(round=0;round<12;round++){
      state.quotaCooldowns={}; // Simulate a fresh quota window without real accounts.
      await turn(round%2?desktop:vscode,'CONTINUITY_ORIGINAL_CONTEXT — fixture round '+round);
      await until(()=>!hub.turns.size&&!hub.shared.changing&&!hub.desktop.changing&&!hub.shared.pendingId&&!hub.desktop.pendingId,'account synchronization');
    }
    quotaEnabled=false;round=-1;state.quotaCooldowns={};
    await Promise.all([turn(vscode,'CONTINUITY_ORIGINAL_CONTEXT — parallel extension'),turn(desktop,'CONTINUITY_ORIGINAL_CONTEXT — parallel desktop')]);
    const markers=(await fs.readFile(marker,'utf8')).trim().split('\n');assert.equal(markers.length,14);assert.equal(new Set(markers).size,14);assert.equal(toolCount,14);assert.equal(steers,4);
    assert.equal(steps.size,14);assert.equal(seen.length,40);assert.equal(hub.shared.router.usage.quotaRetries,12);assert.equal(hub.shared.router.usage.blockedReplays,0);assert.equal(hub.shared.router.usage.completed,28);
    for(const c of clients){const read=await c.rpc.request('thread/read',{threadId:c.threadId,includeTurns:true});assert.equal(read.thread.turns.length,7);}
    console.log(JSON.stringify({nativeEngine:hub.shared.version.trim(),clients:['desktop','vscode'],completedTurns:14,quotaSwitches:12,acceptedSteers:steers,realMarkerWrites:toolCount,duplicateWrites:0,upstreamRequests:seen.length,blockedLegitimateSteps:0}));
  }finally{await Promise.all(clients.map(c=>c.rpc.close()));await hub?.stop(true);upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error('Continuity fixture failed:',e.code||e.name,e.stack||e.message);process.exitCode=1;});
