'use strict';
// Actual Codex with synthetic tokens, disposable workspaces and loopback responses.
// Quota reads are fixtures; this script never reads saved accounts or calls the service.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {SayHiService}=require('../src/core/say-hi.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {decodeRequest}=require('../src/core/model-router.cjs');
const windows=require('../src/core/windows.cjs');
const event=(type,value)=>'event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n';
(async()=>{
  const parent=path.resolve('artifacts/say-hi-protocol');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'run-')),seen=[],sessions=[],toolEvents=[];
  const upstream=http.createServer(async(req,res)=>{
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"models":[]}');return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=decodeRequest(Buffer.concat(chunks),req.headers['content-encoding']);seen.push({account:req.headers['chatgpt-account-id'],body});
    const output=[{type:'message',id:'msg_hi',role:'assistant',status:'completed',content:[{type:'output_text',text:'Hi',annotations:[]}]}];
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write(event('response.created',{response:{id:'resp_hi',status:'in_progress',output:[]}}));
    res.write(event('response.output_item.added',{output_index:0,item:{...output[0],content:[]}}));
    res.write(event('response.output_item.done',{output_index:0,item:output[0]}));
    res.end(event('response.completed',{response:{id:'resp_hi',status:'completed',output,usage:{input_tokens:30,output_tokens:1,total_tokens:31}}}));
  });
  upstream.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const executable=await windows.findGatewayCodex();
  const service={root,busy:false,state:{profiles:[{id:'a',label:'A',status:'ready'},{id:'b',label:'B',status:'ready'}],quotaCooldowns:{},gatewayProfileId:'kept'},platform:{protectDirectory:windows.protectDirectory},
    changed:()=>{},save:async()=>{},executable:async()=>executable,get(id){return this.state.profiles.find(p=>p.id===id);},exclusive:async operation=>operation(),
    accessBundle:async id=>({accessToken:Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'fixture-user-'+id,exp:Math.floor(Date.now()/1000)+3600,'https://api.openai.com/auth':{chatgpt_account_id:'fixture-'+id,chatgpt_plan_type:'plus',chatgpt_user_id:'fixture-user-'+id}})).toString('base64url')+'.Zml4dHVyZQ',chatgptAccountId:'fixture-'+id,chatgptPlanType:'plus'}),
    rpcFactory:(exe,home,options)=>{
      const rpc=new CodexRpc(exe,home,{...options,spawn:(exe,args,opts)=>{
        for(const name of ['OPENAI_BASE_URL','CODEX_INTERNAL_ORIGINATOR_OVERRIDE','NODE_OPTIONS'])delete opts.env[name];
        return spawn(exe,[...args,'-c','openai_base_url="http://127.0.0.1:'+upstream.address().port+'/v1/"'],opts);
      }});
      const request=rpc.request.bind(rpc);
      rpc.listeners.add((method,params)=>{if(method==='item/started'&&!['userMessage','agentMessage','reasoning'].includes(params.item?.type))toolEvents.push(params.item?.type);});
      rpc.request=(method,params,timeout)=>method==='account/rateLimits/read'?Promise.resolve({rateLimits:{primary:{usedPercent:0.1,windowDurationMins:300,resetsAt:12345678901}}}):request(method,params,timeout);
      sessions.push({home,rpc});return rpc;
    }};
  const greetings=new SayHiService(service);
  try {
    greetings.start();await greetings.flight;
    assert.deepEqual(greetings.view().rows.map(r=>r.status),['sent','sent'],JSON.stringify(greetings.view()));
    assert.equal(seen.length,2);assert.deepEqual(seen.map(r=>r.account),['fixture-a','fixture-b']);
    for(const {body} of seen){assert.equal((body.tools||[]).length,0);assert(JSON.stringify(body.input).includes('greeting assistant'));assert.equal(body.reasoning.effort,'low');assert.equal(body.service_tier,undefined);assert(body.input.some(item=>JSON.stringify(item).includes('Say hi. Reply only Hi.')));}
    assert.deepEqual(toolEvents,[],'No tools execute during either greeting');
    assert.equal(service.state.gatewayProfileId,'kept');assert(sessions.every(({rpc})=>rpc.closed));
    assert((await fs.readdir(root)).every(name=>!name.startsWith('sayhi-rpc-')));
    console.log('Native Say hi: two independent accounts, one request each, no tools executed, isolated credentials, quota refresh and cleanup passed.');
  } finally {
    await greetings.shutdown();for(const {rpc} of sessions)await rpc.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));
    if(path.dirname(root)!==parent||!path.basename(root).startsWith('run-'))throw Error('Unsafe fixture cleanup');await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error('Say hi protocol fixture failed:',error.stack);process.exitCode=1;});
