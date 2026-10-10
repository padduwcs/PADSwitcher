'use strict';
// Real native Codex, isolated home, synthetic credentials and loopback-only model
// responses. No saved account, login, quota reset or real model inference.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {ModelRouter,decodeRequest}=require('../src/core/model-router.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const windows=require('../src/core/windows.cjs');
const event=(type,value={})=>'event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n';
function respond(res,output,token){
  const id='resp_fixture';res.writeHead(200,{'Content-Type':'text/event-stream','x-codex-turn-state':token});
  res.write(event('response.created',{response:{id,status:'in_progress',output:[]}}));
  output.forEach((item,index)=>{
    res.write(event('response.output_item.added',{output_index:index,item:{...item,...(item.type==='message'?{content:[]}:{arguments:''})}}));
    if(item.type==='function_call')res.write(event('response.function_call_arguments.delta',{item_id:item.id,output_index:index,delta:item.arguments}));
    res.write(event('response.output_item.done',{output_index:index,item}));
  });
  res.end(event('response.completed',{response:{id,status:'completed',output,usage:{input_tokens:100,output_tokens:5,total_tokens:105,input_tokens_details:{cached_tokens:80}}}}));
}
(async()=>{
  const parent=path.resolve('artifacts/router-protocol');await fs.mkdir(parent,{recursive:true});
  const home=await fs.mkdtemp(path.join(parent,'run-'));let rpc,router;const seen=[];let writes=0,completed=0,failed=0;
  const upstream=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"models":[]}');return;}
    const bytes=Buffer.concat(chunks),body=decodeRequest(bytes,req.headers['content-encoding']);seen.push({account:req.headers['chatgpt-account-id'],headers:req.headers,bytes,body});
    if(seen.length===1){respond(res,[{type:'function_call',id:'fc_one',call_id:'call_one',name:'write_marker',arguments:'{}'}],'state-a');return;}
    if(seen.length===2){res.writeHead(429,{'Content-Type':'application/json'});res.end('{"error":{"type":"usage_limit_reached","resets_in_seconds":900}}');return;}
    if(seen.length===3){respond(res,[{type:'function_call',id:'fc_two',call_id:'call_two',name:'write_marker',arguments:'{}'}],'state-b');return;}
    respond(res,[{type:'message',id:'msg_done',role:'assistant',status:'completed',content:[{type:'output_text',text:'FIXTURE_DONE',annotations:[]}]}],'state-b');
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try{
    const state={profiles:[{id:'a',plan:'plus',status:'ready'},{id:'b',plan:'plus',status:'ready'}],autoSwitch:{enabled:true,order:['a','b']},quotaCooldowns:{}};
    router=new ModelRouter({profileId:'a',service:{state,running:new Map(),save:async()=>{}},changed:()=>{},recovery:{note:()=>{}},bundle:async id=>({accessToken:'fixture-'+id,chatgptAccountId:id,chatgptPlanType:'plus'})},{upstream:'http://127.0.0.1:'+upstream.address().port+'/v1/',allowTestUpstream:true});
    await router.start();router.select('a');
    await fs.writeFile(path.join(home,'config.toml'),'model = "gpt-5.4"\nmodel_provider = "fixture"\nmodel_reasoning_effort = "low"\n[analytics]\nenabled = false\n[model_providers.fixture]\nname = "Loopback protocol fixture"\nbase_url = '+JSON.stringify(router.baseUrl)+'\nwire_api = "responses"\nrequires_openai_auth = false\nhttp_headers = { Authorization = "Bearer native-fixture" }\n');
    const executable=await windows.findGatewayCodex();
    rpc=new CodexRpc(executable,home,{spawn:(exe,args,options)=>{
      for(const key of ['OPENAI_BASE_URL','CODEX_INTERNAL_ORIGINATOR_OVERRIDE','NODE_OPTIONS'])delete options.env[key];
      return spawn(exe,args,options);
    }});
    await rpc.initialize({experimentalApi:true});
    rpc.listeners.add((method,params)=>{if(method==='turn/completed'){if(params.turn.status==='completed')completed++;else failed++;}});
    const receive=rpc.receive.bind(rpc);rpc.receive=line=>{
      let message;try{message=JSON.parse(line);}catch{return;}
      if(message.method==='item/tool/call'&&message.id!=null){writes++;rpc.send({id:message.id,result:{success:true,contentItems:[{type:'inputText',text:'Fixture marker '+writes+' written once.'}]}});return;}
      receive(line);
    };
    const started=await rpc.request('thread/start',{cwd:home,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only',dynamicTools:[{type:'function',name:'write_marker',description:'A synthetic marker tool.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
    await rpc.request('turn/start',{threadId:started.thread.id,input:[{type:'text',text:'Run the fixture marker tools then finish.'}]});
    for(let i=0;i<200&&!completed&&!failed;i++)await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(failed,0);assert.equal(completed,1);assert.equal(writes,2);assert.equal(seen.length,4);
    assert.deepEqual(seen.map(x=>x.account),['a','a','b','b']);
    assert.deepEqual(seen.map(x=>x.headers['x-codex-turn-state']),[undefined,'state-a',undefined,'state-b']);
    assert(seen[1].bytes.equals(seen[2].bytes));
    const sessionId=seen[0].headers['session-id'];assert(sessionId);
    for(const request of seen){assert.equal(request.headers['session-id'],sessionId);assert.equal(request.headers['thread-id'],started.thread.id);}
    const thread=await rpc.request('thread/read',{threadId:started.thread.id,includeTurns:true});assert.equal(thread.thread.turns.length,1);
    assert.deepEqual([router.usage.requests,router.usage.attempts,router.usage.quotaRetries,router.usage.completed],[3,4,1,3]);
    assert.deepEqual([router.usage.inputTokens,router.usage.cachedInputTokens,router.usage.outputTokens],[300,240,15]);
    assert.equal(router.usage.lastModel,'gpt-5.4');assert.equal(router.usage.lastEffort,'low');
    // Read-only account/thread inspection and an idle connection must not infer.
    await rpc.request('account/read',{refreshToken:false});await new Promise(resolve=>setTimeout(resolve,1500));assert.equal(seen.length,4);
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);
    console.log('Native loopback cache headers, same-turn A/B routing, per-account sticky state, exact retry and two tools executed once: passed.');
  }finally{await rpc?.close();await router?.stop();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
})().catch(error=>{console.error('Native protocol fixture failed:',error.code||error.name,error.message);process.exitCode=1;});
