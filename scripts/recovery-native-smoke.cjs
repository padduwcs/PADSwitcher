'use strict';
// Official Codex + isolated local Responses fixture. Real account policy discovery,
// but every model request is served locally; no real model inference or forced quota exhaustion.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {Gateway}=require('../src/core/gateway.cjs'),{ProfileService}=require('../src/core/service.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs');
const windows=require('../src/core/windows.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function bundle(name){const claims={exp:Math.floor(Date.now()/1000)+3600,sub:'fixture-'+name,'https://api.openai.com/auth':{chatgpt_account_id:'fixture-'+name,chatgpt_plan_type:'plus'}};return {accessToken:Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.Zml4dHVyZQ',chatgptAccountId:'fixture-'+name,chatgptPlanType:'plus'};}
function sse(res,output){
  res.writeHead(200,{'Content-Type':'text/event-stream'});const id='resp_fixture_'+Date.now();const event=(type,data)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...data})+'\n\n');
  event('response.created',{response:{id,object:'response',status:'in_progress',output:[]}});
  output.forEach((item,index)=>{
    event('response.output_item.added',{output_index:index,item:{...item,...(item.type==='message'?{content:[]}:{arguments:''})}});
    if(item.type==='message'){event('response.content_part.added',{item_id:item.id,output_index:index,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:item.id,output_index:index,content_index:0,delta:item.content[0].text});event('response.output_text.done',{item_id:item.id,output_index:index,content_index:0,text:item.content[0].text});}
    else {event('response.function_call_arguments.delta',{item_id:item.id,output_index:index,delta:item.arguments});event('response.function_call_arguments.done',{item_id:item.id,output_index:index,arguments:item.arguments});}
    event('response.output_item.done',{output_index:index,item});
  });
  event('response.completed',{response:{id,object:'response',status:'completed',output,usage:{input_tokens:10,output_tokens:5,total_tokens:15}}});res.end();
}
async function main(){
  if(!process.argv.includes('--live'))throw Error('Use --live: native Codex requires real account policy discovery; all model requests go to the local fixture.');
  const parent=path.resolve('artifacts/recovery-native');await fs.mkdir(parent,{recursive:true});await windows.protectDirectory(parent);
  const dir=await fs.mkdtemp(path.join(parent,'run-')),home=path.join(dir,'codex');await fs.mkdir(home);
  let writes=0,requests=0;const seen=[];
  let accountA='fixture-a',accountB='fixture-b';
  const server=http.createServer(async(req,res)=>{
    try{
      const parts=[];for await(const p of req)parts.push(p);const body=JSON.parse(Buffer.concat(parts).toString());
      if(JSON.stringify(body.input).includes('Generate a concise, single-line task title')){sse(res,[{type:'message',id:'msg_title',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"title":"Continue fixture"}',annotations:[]}]}]);return;}
      requests++;
      const account=req.headers['chatgpt-account-id'];seen.push({account,body});
      console.log('Local model request:',requests,account===accountA?'A':account===accountB?'B':'unknown');
      if(requests===1){sse(res,process.argv.includes('--cli-hold')?[{type:'message',id:'msg_initial',role:'assistant',status:'completed',content:[{type:'output_text',text:'PAD_INITIAL_DONE',annotations:[]}]}]:[{type:'function_call',id:'fc_fixture',call_id:'call_fixture',name:'write_marker',arguments:'{}'}]);return;}
      if(account===accountA){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{type:'usage_limit_reached',message:'Fixture usage limit',plan_type:'plus',resets_at:Math.floor(Date.now()/1000)+900}}));return;}
      sse(res,[{type:'message',id:'msg_fixture',role:'assistant',status:'completed',content:[{type:'output_text',text:'PAD_AUTO_CONTINUED',annotations:[]}]}]);
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/v1';
  const service=new ProfileService(path.join(dir,'data'));await service.init();service.state.settings.desktopHome=home;service.state.settings.workspace=dir;
  const a={id:require('node:crypto').randomUUID(),identity:'a'.repeat(64),label:'Fixture A',plan:'plus'},b={id:require('node:crypto').randomUUID(),identity:'b'.repeat(64),label:'Fixture B',plan:'plus'};
  service.state.profiles=[a,b];service.accessBundle=async id=>bundle(id===a.id?'a':'b');await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
  let originalAuthFile,originalHash;
  if(process.argv.includes('--live')){
    const original=path.join(process.env.APPDATA,'PADSwitcher','data'),meta=JSON.parse(await fs.readFile(path.join(original,'accounts.json'),'utf8'));assert(meta.profiles.length>=2);
    originalAuthFile=path.join(meta.settings.desktopHome,'auth.json');originalHash=require('node:crypto').createHash('sha256').update(await fs.readFile(originalAuthFile)).digest('hex');
    service.accessBundle=async id=>{
      const p=meta.profiles[id===a.id?0:1],bytes=await windows.dpapi(await fs.readFile(path.join(original,'profiles',p.id,'session.dpapi')),true);
      try{const auth=JSON.parse(bytes.toString());const claims=JSON.parse(Buffer.from(auth.tokens.access_token.split('.')[1],'base64url'));assert(!claims.exp||claims.exp*1000>Date.now()+60000,'Refresh the account in PADSwitcher first.');return {accessToken:auth.tokens.access_token,chatgptAccountId:auth.tokens.account_id,chatgptPlanType:p.plan||null};}finally{bytes.fill(0);}
    };
    accountA=(await service.accessBundle(a.id)).chatgptAccountId;accountB=(await service.accessBundle(b.id)).chatgptAccountId;
  }
  const g=new Gateway(service,{disableRouter:true,backendArgs:['-c','model_provider="padswitcher_fixture"','-c','model="gpt-5.4"','-c','model_providers.padswitcher_fixture.name="PADSwitcher local QA"','-c','model_providers.padswitcher_fixture.base_url="'+base+'"','-c','model_providers.padswitcher_fixture.wire_api="responses"','-c','model_providers.padswitcher_fixture.requires_openai_auth=true','-c','model_providers.padswitcher_fixture.supports_websockets=false']});let c;
  try{
    await g.start(a.id);console.log('Official Codex fixture started:',g.version);c=new WsRpc(await connect(g.url,g.frontToken));await c.initialize();let text='',failed=0,done=0;
    if(process.argv.includes('--cli-hold')){
      console.log('CLI fixture connection: '+path.join(g.root,'connection.json'));
      for(let i=0;i<180&&!(g.recovery.events.some(e=>e.type==='continued')&&seen.some(x=>x.account===accountB)&&!g.turns.size);i++)await pause(1000);
      assert(g.recovery.events.some(e=>e.type==='continued'));assert.equal(g.profileId,b.id);assert(seen.some(x=>x.account===accountB));assert.equal(g.turns.size,0);console.log('Native interactive CLI automatic recovery passed.');await pause(15000);return;
    }
    c.serverRequest=async(method)=>{assert.equal(method,'item/tool/call');writes++;await fs.appendFile(path.join(dir,'marker.txt'),'ONCE\n');return {success:true,contentItems:[{type:'inputText',text:'Marker was written once.'}]};};
    c.on('notification',(method,params)=>{if(method==='item/agentMessage/delta')text+=params.delta||'';if(method==='turn/completed'){if(params.turn.status==='failed'){failed++;console.log('Fixture native failure:',JSON.stringify(params.turn.error?.codexErrorInfo));}if(params.turn.status==='completed')done++;}});
    const thread=await c.request('thread/start',{cwd:dir,model:'gpt-5.4',modelProvider:'padswitcher_fixture',approvalPolicy:'never',sandbox:'read-only',environments:[{environmentId:'local',cwd:dir,runtimeWorkspaceRoots:[dir]}],dynamicTools:[{type:'function',name:'write_marker',description:'Write a marker to the isolated QA fixture.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
    await c.request('turn/start',{threadId:thread.thread.id,input:[{type:'text',text:'Write marker then report finished. Do not repeat a completed tool call.'}]});
    for(let i=0;i<240&&done===0&&!(failed&&!g.recovery.busy&&!g.recovery.flight&&requests===0);i++)await pause(250);
    if(!done)console.log('Fixture diagnostic:',JSON.stringify({requests,writes,failed,recovery:g.recovery.view(),active:g.turns.size,accounts:seen.map(x=>x.account===accountA?'A':'B')}));
    assert.equal(failed,1);assert.equal(done,1);assert.equal(writes,1);assert.equal(await fs.readFile(path.join(dir,'marker.txt'),'utf8'),'ONCE\n');assert(text.includes('PAD_AUTO_CONTINUED'));assert.equal(g.profileId,b.id);
    assert(seen.some(x=>x.account===accountB&&JSON.stringify(x.body.input).includes('Marker was written once.')));
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);
    console.log('Official Codex: completed tool -> native quota error -> automatic A/B switch -> same-thread continuation; tool executed once, original history present, no auth.json: passed.');
    if(process.argv.includes('--hold')){console.log('CLI fixture connection: '+path.join(g.root,'connection.json'));await pause(60000);}
  }finally{c?.close();await g.stop(true);server.closeAllConnections();await new Promise(r=>server.close(r));if(originalAuthFile)assert.equal(require('node:crypto').createHash('sha256').update(await fs.readFile(originalAuthFile)).digest('hex'),originalHash);}
}
main().catch(e=>{console.error('Native recovery QA failed:',e.code||e.name,e.message);process.exitCode=1;});
