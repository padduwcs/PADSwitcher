'use strict';
// Native Codex through the production gateway, synthetic sign-in, loopback only.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {Gateway}=require('../src/core/gateway.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {createPlatform}=require('../src/core/platform.cjs');
const {assertFixtureHome}=require('./native-fixture.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const event=(type,value={})=>'event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n';
const jwt=p=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.fixture';
(async()=>{
  const root=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'pad-router-faults-')),home=path.join(root,'home');await fs.mkdir(home);
  await fs.writeFile(path.join(home,'config.toml'),'model="gpt-5.4"\nmodel_reasoning_effort="low"\n[features]\napps=false\n[analytics]\nenabled=false\n');
  const counts=new Map();let scenario='idle',gateway,rpc,status=null,turnId;
  const upstream=http.createServer(async(req,res)=>{
    for await(const chunk of req){} // Deliberately never log request content.
    if(req.method==='GET'){res.end('{"models":[]}');return;}
    counts.set(scenario,(counts.get(scenario)||0)+1);
    if(scenario==='status503'&&counts.get(scenario)===1){res.writeHead(503);res.end('{"error":{"type":"server_error"}}');return;}
    if(scenario==='status429'&&counts.get(scenario)===1){res.writeHead(429);res.end('{"error":{"type":"rate_limit_exceeded"}}');return;}
    if(scenario==='drop'){req.socket.destroy();return;}
    res.writeHead(200); // Omitted MIME header must not hide either completion or a broken stream.
    res.write(event('response.created',{response:{id:'resp_fixture',status:'in_progress',output:[]}}));
    if(scenario==='partial'){
      res.write(event('response.output_item.added',{output_index:0,item:{type:'message',id:'msg_fixture',role:'assistant',content:[]}}));
      res.write(event('response.output_text.delta',{item_id:'msg_fixture',output_index:0,content_index:0,delta:'PARTIAL_FIXTURE'}));
      setTimeout(()=>res.destroy(),40);return;
    }
    if(scenario==='idle-timeout')return;
    if(scenario==='eof'){res.end();return;}
    if(scenario==='failed-sse'&&counts.get(scenario)===1){res.end(event('response.failed',{response:{error:{type:'server_error',message:'Synthetic error'}}}));return;}
    res.end(event('response.completed',{response:{id:'resp_fixture',status:'completed',output:[],usage:{input_tokens:1,output_tokens:0,total_tokens:1}}}));
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const platform={...createPlatform(root),processes:async()=>[]};
  const executable=process.env.PADSWITCHER_DESKTOP_SMOKE_CODEX||await platform.findGatewayCodex();
  const accessToken=jwt({sub:'fixture',exp:Math.floor(Date.now()/1000)+86400,'https://api.openai.com/auth':{chatgpt_account_id:'a',chatgpt_user_id:'fixture',chatgpt_plan_type:'plus'}});
  const service={root,platform,state:{profiles:[{id:'a',plan:'plus',status:'ready'}],settings:{desktopHome:home,codexPath:executable},autoSwitch:{enabled:false,order:[]},quotaCooldowns:{}},running:new Map(),get:()=>({id:'a'}),accessBundle:async()=>({accessToken,chatgptAccountId:'a',chatgptPlanType:'plus'}),save:async()=>{},changed:()=>{}};
  try{
    gateway=new Gateway(service,{executable,environment:{HTTPS_PROXY:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',NO_PROXY:'localhost,127.0.0.1'},routerOptions:{upstream:'http://127.0.0.1:'+upstream.address().port+'/',allowTestUpstream:true,idleTimeoutMs:250}});
    await gateway.start('a');rpc=new CodexRpc(gateway.helper,home,{isolated:true});
    const initialized=await rpc.request('initialize',{clientInfo:{name:'padswitcher',title:'PADSwitcher',version:require('../package.json').version},capabilities:{experimentalApi:true}});
    await assertFixtureHome(initialized,home,root);rpc.send({method:'initialized',params:{}});
    rpc.listeners.add((method,p)=>{if(method==='turn/completed')status=p.turn.status;});
    const thread=(await rpc.request('thread/start',{cwd:home,approvalPolicy:'never',sandbox:'read-only'})).thread;
    for(scenario of ['success','status503','status429','drop','partial','eof','failed-sse','idle-timeout','success-after-errors']){
      status=null;
      turnId=(await rpc.request('turn/start',{threadId:thread.id,input:[{type:'text',text:'Offline synthetic fixture.'}]})).turn.id;
      for(let i=0;i<450&&!status;i++)await pause(100);
      if(!status){await rpc.request('turn/interrupt',{threadId:thread.id,turnId});await pause(200);}
      const count=counts.get(scenario)||0;console.log(JSON.stringify({scenario,requests:count,status}));
      const retryable=['status503','failed-sse'].includes(scenario);
      assert.equal(count,retryable?2:1,scenario+' must preserve native retry for definite rejection and stop uncertain replay');assert.equal(status,scenario.startsWith('success')||retryable?'completed':'failed');
      await pause(200);
    }
    assert.equal(counts.get('idle')||0,0);await pause(500);console.log('Native fault checks completed without real model inference.');
  }finally{await rpc?.close();await gateway?.stop(true);upstream.closeAllConnections();await new Promise(r=>upstream.close(r));assert.equal((await fs.realpath(path.dirname(path.resolve(root)))).toLowerCase(),(await fs.realpath(require('node:os').tmpdir())).toLowerCase());assert(path.basename(root).startsWith('pad-router-faults-'));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error('Native fault fixture failed:',e.code||e.name,e.message);process.exitCode=1;});
