'use strict';
// Real installed ACP adapter + native Codex, with local model replies.
// --live allows read-only native workspace policy discovery using saved sessions.
// No model inference/reset consumption or actual IDE configuration changes.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {ProfileService}=require('../src/core/service.cjs'),{Gateway}=require('../src/core/gateway.cjs');
const {GatewayHub}=require('../src/core/gateway-hub.cjs');
const {JetBrainsIntegration,AGENT}=require('../src/core/jetbrains.cjs');
const {auth}=require('../test/helpers.cjs'),{decodeRequest}=require('../src/core/model-router.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function reply(res,text,tool=null){
  res.writeHead(200,{'Content-Type':'text/event-stream'});const id='resp_'+crypto.randomUUID(),item=tool||{type:'message',id:'msg_'+crypto.randomUUID(),role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
  const event=(type,data)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...data})+'\n\n');
  event('response.created',{response:{id,object:'response',status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,content:[]}});
  if(tool){event('response.function_call_arguments.delta',{item_id:item.id,output_index:0,delta:item.arguments});event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments});}
  else{event('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:text});event('response.output_text.done',{item_id:item.id,output_index:0,content_index:0,text});}
  event('response.output_item.done',{output_index:0,item});event('response.completed',{response:{id,object:'response',status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}}});res.end();
}
async function main(){
  const parent=path.resolve('artifacts/jetbrains-qa');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'run-')),home=path.join(dir,'codex');await fs.mkdir(home);
  const service=new ProfileService(path.join(dir,'data'));await service.init();service.state.settings.desktopHome=home;service.state.settings.workspace=dir;
  const bundles={};for(const name of ['a','b']){
    const bytes=JSON.parse(auth(name).toString()),id=crypto.randomUUID(),claims=JSON.parse(Buffer.from(bytes.tokens.id_token.split('.')[1],'base64url'));
    Object.assign(claims,{exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),iss:'https://auth.openai.com'});claims['https://api.openai.com/profile']={email:claims.email};claims['https://api.openai.com/auth'].chatgpt_user_id=claims.sub;
    bytes.tokens.access_token=bytes.tokens.id_token=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.Zml4dHVyZQ';
    bundles[id]={accessToken:bytes.tokens.access_token,chatgptAccountId:bytes.tokens.account_id,chatgptPlanType:'plus'};service.state.profiles.push({id,identity:(name==='a'?'a':'b').repeat(64),label:'Fixture '+name,plan:'plus'});
  }
  service.accessBundle=async id=>bundles[id];const [a,b]=service.state.profiles;let phase='normal',sourceAuth,sourceHash;const attempts=[];
  if(process.argv.includes('--live')){
    const windows=require('../src/core/windows.cjs'),source=path.join(process.env.APPDATA,'PADSwitcher','data'),meta=JSON.parse(await fs.readFile(path.join(source,'accounts.json'),'utf8'));assert(meta.profiles.length>=2);
    sourceAuth=path.join(meta.settings.desktopHome,'auth.json');sourceHash=await fs.readFile(sourceAuth).then(b=>crypto.createHash('sha256').update(b).digest('hex'),()=>null);
    for(const [index,id] of [a.id,b.id].entries()){
      const p=meta.profiles[index],bytes=await windows.dpapi(await fs.readFile(path.join(source,'profiles',p.id,'session.dpapi')),true);
      try{const auth=JSON.parse(bytes.toString());bundles[id]={accessToken:auth.tokens.access_token,chatgptAccountId:auth.tokens.account_id,chatgptPlanType:p.plan};}finally{bytes.fill(0);}
    }
  }
  const legacy=JSON.parse(await fs.readFile(path.join(require('node:os').homedir(),'.codex','models_cache.json'),'utf8')).models.find(m=>m.slug==='gpt-5.5');assert(legacy);legacy.visibility='list';legacy.supported_in_api=true;
  const model=http.createServer(async(req,res)=>{
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({models:[legacy]}));return;}
    const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),body=decodeRequest(bytes,req.headers['content-encoding']);
    if(JSON.stringify(body.input).includes('Generate a concise, single-line task title')){reply(res,'{"title":"ACP fixture"}');return;}
    attempts.push({phase,account:req.headers['chatgpt-account-id'],bytes,body});
    if(phase==='tool'&&attempts.filter(x=>x.phase==='tool').length===1){
      assert(body.tools.some(t=>t.name==='exec_command'),'Native fixture catalog must expose command execution');
      const cmd="Add-Content -LiteralPath '"+path.join(dir,'approval-marker.txt')+"' -Value 'ONCE'";
      reply(res,'',{type:'function_call',id:'fc_fixture',call_id:'call_fixture',name:'exec_command',arguments:JSON.stringify({cmd,workdir:dir,sandbox_permissions:'require_escalated',justification:'Write only the isolated PADSwitcher QA marker.'})});return;
    }
    if(['quota','tool'].includes(phase)&&req.headers['chatgpt-account-id']===bundles[a.id].chatgptAccountId){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{type:'usage_limit_reached',resets_in_seconds:900}}));return;}
    reply(res,phase==='normal'?'PAD_ACP_FIRST':'PAD_ACP_CONTINUED');
  });await new Promise(r=>model.listen(0,'127.0.0.1',r));
  const split=process.argv.includes('--split'),g=new (split?GatewayHub:Gateway)(service,{routerOptions:{upstream:'http://127.0.0.1:'+model.address().port+'/v1/',allowTestUpstream:true}});let child;const pending=new Map();let next=0,texts=[],approvals=0;
  try{
    await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});await g.start(a.id);
    if(split){await g.configure({scope:'jetbrains',mode:'private',profileId:a.id});await service.autoSwitchSettings({scope:'jetbrains',enabled:true,order:[a.id,b.id]});await g.start(b.id);assert.equal(g.view().profileId,b.id);assert.equal(g.view().scopes.jetbrains.profileId,a.id);}
    const jb=new JetBrainsIntegration(service,{file:path.join(dir,'.jetbrains','acp.json')});await jb.configure(g.helper);
    const config=JSON.parse(await fs.readFile(jb.file,'utf8')).agent_servers[AGENT];
    child=spawn(config.command,config.args,{env:{...process.env,CODEX_HOME:home},stdio:['pipe','pipe','pipe'],windowsHide:true});
    child.stderr.on('data',()=>{});let buffer='';
    child.stdout.on('data',chunk=>{buffer+=chunk.toString();let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;const m=JSON.parse(line);if(m.method==='session/update'){const update=m.params.update;if(update.sessionUpdate==='agent_message_chunk'&&update.content?.text)texts.push(update.content.text);}if(m.method==='session/request_permission'){approvals++;const option=m.params.options.find(x=>x.kind==='allow_once');assert(option);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'selected',optionId:option.optionId}}})+'\n');}if(m.id!=null&&!m.method){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('ACP request failed: '+m.error.code)):p.resolve(m.result);}}}});
    const request=(method,params)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('ACP timed out: '+method));},60000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
    await request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'jetbrains',title:'Android Studio fixture',version:'1.0.0'}});
    assert.equal(g.view().connected.jetbrains,1);assert.equal(g.view().connected.vscode,0);console.log('Actual ACP adapter + native helper initialize and JetBrains indicator: passed.');
    const session=await request('session/new',{cwd:dir,mcpServers:[]});assert(session.sessionId);
    await request('session/set_mode',{sessionId:session.sessionId,modeId:'read-only'});
    let result=await request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Report fixture done.'}]});assert.equal(result.stopReason,'end_turn');assert(texts.join('').includes('PAD_ACP_FIRST'));
    if(split){assert.equal(attempts.find(x=>x.phase==='normal').account,bundles[a.id].chatgptAccountId);assert.equal(g.view().profileId,b.id);}
    phase='quota';texts=[];result=await request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Continue with the fixture.'}]});assert.equal(result.stopReason,'end_turn');assert(texts.join('').includes('PAD_ACP_CONTINUED'));
    const calls=attempts.filter(x=>x.phase==='quota');assert.equal(calls.length,2);assert(calls[0].bytes.equals(calls[1].bytes));assert.equal(g.view().profileId,b.id);assert(JSON.stringify(calls[1].body.input).includes('PAD_ACP_FIRST'));
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);
    console.log('ACP chat + read-only mode + same-session quota fallback + exact bytes/context, no model quota or resets: passed.');
    for(let i=0;i<40&&(g.turns.size||g.router.active);i++)await pause(100);service.state.quotaCooldowns={};await g.select(a.id,split?'jetbrains':undefined);phase='tool';texts=[];
    await request('session/set_model',{sessionId:session.sessionId,modelId:'gpt-5.5[low]'});
    result=await request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Write the isolated QA marker once, then report done.'}]});assert.equal(result.stopReason,'end_turn');
    const tools=attempts.filter(x=>x.phase==='tool');assert.equal(tools.length,3);assert(tools[1].bytes.equals(tools[2].bytes));assert.equal(approvals,1);assert.equal((await fs.readFile(path.join(dir,'approval-marker.txt'),'utf8')).trim(),'ONCE');
    console.log('ACP permission approval + native file edit once + post-tool quota fallback, no replayed tool: passed.');
    if(split){assert.equal(g.view().profileId,b.id);assert.equal(g.view().scopes.jetbrains.profileId,b.id);console.log('Separate native JetBrains account and scoped fallback leave shared account unchanged: passed.');}
    child.stdin.end();for(let i=0;i<30&&g.view().connected.jetbrains;i++)await pause(100);assert.equal(g.view().connected.jetbrains,0);
    await jb.restore();assert(!JSON.parse(await fs.readFile(jb.file,'utf8')).agent_servers[AGENT]);console.log('ACP disconnect and isolated configuration removal: passed.');
  }finally{for(const p of pending.values())clearTimeout(p.timer);child?.kill();await g.stop(true);model.closeAllConnections();await new Promise(r=>model.close(r));if(sourceAuth)assert.equal(await fs.readFile(sourceAuth).then(b=>crypto.createHash('sha256').update(b).digest('hex'),()=>null),sourceHash);}
}
main().catch(e=>{console.error('JetBrains QA failed:',e.code||e.name,e.message);process.exitCode=1;});
