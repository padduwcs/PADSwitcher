'use strict';
// Native Codex + a local Responses service. Only read-only account policy
// discovery uses real credentials; no real model inference and no reset consume.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ProfileService}=require('../src/core/service.cjs'),{Gateway}=require('../src/core/gateway.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs'),{decodeRequest}=require('../src/core/model-router.cjs');
const windows=require('../src/core/windows.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function sse(res,output){
  res.writeHead(200,{'Content-Type':'text/event-stream'});const id='resp_fixture_'+crypto.randomUUID(),event=(type,data)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...data})+'\n\n');
  event('response.created',{response:{id,object:'response',status:'in_progress',output:[]}});
  output.forEach((item,index)=>{
    event('response.output_item.added',{output_index:index,item:{...item,...(item.type==='message'?{content:[]}:{arguments:''})}});
    if(item.type==='message'){event('response.content_part.added',{item_id:item.id,output_index:index,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:item.id,output_index:index,content_index:0,delta:item.content[0].text});event('response.output_text.done',{item_id:item.id,output_index:index,content_index:0,text:item.content[0].text});}
    else {event('response.function_call_arguments.delta',{item_id:item.id,output_index:index,delta:item.arguments});event('response.function_call_arguments.done',{item_id:item.id,output_index:index,arguments:item.arguments});}
    event('response.output_item.done',{output_index:index,item});
  });
  event('response.completed',{response:{id,object:'response',status:'completed',output,usage:{input_tokens:10,output_tokens:5,total_tokens:15}}});res.end();
}
const message=text=>[{type:'message',id:'msg_fixture_'+crypto.randomUUID(),role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}];
async function main(){
  if(!process.argv.includes('--live'))throw Error('Use --live for read-only account policy discovery; model traffic remains local.');
  const parent=path.resolve('artifacts/router-native');await fs.mkdir(parent,{recursive:true});await windows.protectDirectory(parent);
  const dir=await fs.mkdtemp(path.join(parent,'run-')),home=path.join(dir,'codex');await fs.mkdir(home);
  const source=path.join(process.env.APPDATA,'PADSwitcher','data'),meta=JSON.parse(await fs.readFile(path.join(source,'accounts.json'),'utf8'));assert(meta.profiles.length>=2);
  const sourceAuth=path.join(meta.settings.desktopHome,'auth.json'),hash=await fs.readFile(sourceAuth).then(b=>crypto.createHash('sha256').update(b).digest('hex'),()=>null);
  const service=new ProfileService(path.join(dir,'data'));await service.init();service.state.settings.desktopHome=home;service.state.settings.workspace=dir;
  const a={id:crypto.randomUUID(),identity:'a'.repeat(64),label:'Fixture A',plan:'plus'},b={id:crypto.randomUUID(),identity:'b'.repeat(64),label:'Fixture B',plan:'plus'};
  service.state.profiles=[a,b];service.accessBundle=async id=>{
    const profile=meta.profiles[id===a.id?0:1],bytes=await windows.dpapi(await fs.readFile(path.join(source,'profiles',profile.id,'session.dpapi')),true);
    try{const auth=JSON.parse(bytes.toString()),claims=JSON.parse(Buffer.from(auth.tokens.access_token.split('.')[1],'base64url'));assert(!claims.exp||claims.exp*1000>Date.now()+60000,'Refresh account tokens in PADSwitcher first.');return {accessToken:auth.tokens.access_token,chatgptAccountId:auth.tokens.account_id,chatgptPlanType:profile.plan||null};}finally{bytes.fill(0);}
  };
  const accountA=(await service.accessBundle(a.id)).chatgptAccountId,accountB=(await service.accessBundle(b.id)).chatgptAccountId;
  let phase='initial',writes=0;const seen=[];
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({models:[]}));return;}
      const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),body=decodeRequest(bytes,req.headers['content-encoding']);
      if(JSON.stringify(body.input).includes('Generate a concise, single-line task title')){sse(res,message('{"title":"Router fixture"}'));return;}
      const account=req.headers['chatgpt-account-id'];seen.push({phase,account,bytes,body});console.log('Local model request:',phase,account===accountA?'A':account===accountB?'B':'unknown');
      if(phase==='after-tool'&&seen.filter(x=>x.phase===phase).length===1){sse(res,[{type:'function_call',id:'fc_fixture',call_id:'call_fixture',name:'write_marker',arguments:'{}'}]);return;}
      if(account===accountA){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{type:'usage_limit_reached',message:'Local fixture quota',resets_in_seconds:900}}));return;}
      sse(res,message('PAD_ROUTER_COMPLETED'));
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const g=new Gateway(service,{routerOptions:{upstream:'http://127.0.0.1:'+server.address().port+'/v1/',allowTestUpstream:true}});let client;
  try{
    await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});await g.start(a.id);console.log('Native Codex:',g.version);
    client=new WsRpc(await connect(g.url,g.frontToken));await client.initialize();let completed=0,failed=0;
    client.on('notification',(method,params)=>{if(method==='turn/completed'){if(params.turn.status==='completed')completed++;else failed++;}});
    client.serverRequest=async method=>{assert.equal(method,'item/tool/call');writes++;await fs.appendFile(path.join(dir,'marker.txt'),'ONCE\n');return {success:true,contentItems:[{type:'inputText',text:'Marker written once.'}]};};
    for(const name of ['initial','after-tool']){
      phase=name;service.state.quotaCooldowns={};await g.select(a.id);
      const result=await client.request('thread/start',{cwd:dir,model:'gpt-5.4',approvalPolicy:'never',sandbox:'read-only',environments:[{environmentId:'local',cwd:dir,runtimeWorkspaceRoots:[dir]}],...(phase==='after-tool'?{dynamicTools:[{type:'function',name:'write_marker',description:'Write a marker in the isolated fixture.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}:{})});
      await client.request('turn/start',{threadId:result.thread.id,input:[{type:'text',text:phase==='initial'?'Report done.':'Write marker then report done.'}]});
      for(let i=0;i<180&&completed<(name==='initial'?1:2)&&!failed;i++)await pause(250);
      assert.equal(failed,0);assert.equal(completed,name==='initial'?1:2);
      const attempts=seen.filter(x=>x.phase===phase),aFailed=attempts.findLast(x=>x.account===accountA),bRetry=attempts.find(x=>x.account===accountB);
      assert(aFailed&&bRetry);assert(aFailed.bytes.equals(bRetry.bytes),'Retry must preserve exact native request bytes');
      assert(!JSON.stringify(bRetry.body.input).includes('PADSwitcher:'));
      if(phase==='after-tool')assert(JSON.stringify(bRetry.body.input).includes('Marker written once.'));
      const thread=await client.request('thread/read',{threadId:result.thread.id,includeTurns:true});assert.equal(thread.thread.turns.length,1);assert.equal(thread.thread.turns[0].status,'completed');
      assert.equal(g.view().profileId,b.id);assert.equal(g.recovery.events.filter(x=>x.type==='continued').length,0);
      console.log('Native same-turn quota routing:',phase,'passed.');
      for(let i=0;i<40&&(g.turns.size||g.router.active||g.profileId!==b.id);i++){g.syncRoute();await pause(100);}
      assert.equal(g.profileId,b.id);
    }
    assert.equal(writes,1);assert.equal(await fs.readFile(path.join(dir,'marker.txt'),'utf8'),'ONCE\n');
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);
    console.log('Native HTTP fallback, initial and post-tool same-turn A/B retry, exact payload, no duplicate tool or continuation, ephemeral auth: passed.');
  }finally{
    client?.close();await g.stop(true);server.closeAllConnections();await new Promise(r=>server.close(r));
    const after=await fs.readFile(sourceAuth).then(b=>crypto.createHash('sha256').update(b).digest('hex'),()=>null);assert.equal(after,hash);
  }
}
main().catch(error=>{console.error('Router native QA failed:',error.code||error.name,error.message);process.exitCode=1;});
