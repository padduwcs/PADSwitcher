'use strict';
// Two short real model replies. Quota rejection is injected locally, never
// forced on an account. Read-only sandbox; no reset consume or project edits.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ProfileService}=require('../src/core/service.cjs'),{Gateway}=require('../src/core/gateway.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs'),{decodeRequest}=require('../src/core/model-router.cjs');
const windows=require('../src/core/windows.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  if(!process.argv.includes('--live')||!process.argv.includes('--inference'))throw Error('Use --live --inference: this uses up to three short real model requests.');
  const parent=path.resolve('artifacts/router-live');await fs.mkdir(parent,{recursive:true});await windows.protectDirectory(parent);const dir=await fs.mkdtemp(path.join(parent,'run-')),home=path.join(dir,'codex');await fs.mkdir(home);
  const source=path.join(process.env.APPDATA,'PADSwitcher','data'),meta=JSON.parse(await fs.readFile(path.join(source,'accounts.json'),'utf8'));assert(meta.profiles.length>=2);
  const sourceAuth=path.join(meta.settings.desktopHome,'auth.json'),hash=await fs.readFile(sourceAuth).then(b=>crypto.createHash('sha256').update(b).digest('hex'),()=>null);
  const service=new ProfileService(path.join(dir,'data'));await service.init();service.state.settings.desktopHome=home;service.state.settings.workspace=dir;
  const a={id:crypto.randomUUID(),identity:'a'.repeat(64),label:'QA A',plan:'plus'},b={id:crypto.randomUUID(),identity:'b'.repeat(64),label:'QA B',plan:'plus'};
  service.state.profiles=[a,b];service.accessBundle=async id=>{
    const profile=meta.profiles[id===a.id?0:1],bytes=await windows.dpapi(await fs.readFile(path.join(source,'profiles',profile.id,'session.dpapi')),true);
    try{const auth=JSON.parse(bytes.toString()),claims=JSON.parse(Buffer.from(auth.tokens.access_token.split('.')[1],'base64url'));assert(!claims.exp||claims.exp*1000>Date.now()+60000,'Refresh account tokens in PADSwitcher first.');return {accessToken:auth.tokens.access_token,chatgptAccountId:auth.tokens.account_id,chatgptPlanType:profile.plan||null};}finally{bytes.fill(0);}
  };
  const accountA=(await service.accessBundle(a.id)).chatgptAccountId,accountB=(await service.accessBundle(b.id)).chatgptAccountId;
  let phase=1,actual=0,injected=false,failedBytes=null,retryEqual=false,secondAccount=false;const marker='PAD_ROUTER_'+crypto.randomBytes(5).toString('hex');
  const relayFetch=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://chatgpt.com');
    if(new URL(url).pathname.endsWith('/responses')){
      const body=decodeRequest(options.body,options.headers['content-encoding']);
      if(JSON.stringify(body.input).includes('Generate a concise, single-line task title'))throw Error('Auxiliary inference disabled in live QA');
      if(phase===2&&!injected&&options.headers['chatgpt-account-id']===accountA){injected=true;failedBytes=Buffer.from(options.body);return new Response(JSON.stringify({error:{type:'usage_limit_reached',message:'Locally injected QA quota rejection',resets_in_seconds:900}}),{status:429,headers:{'Content-Type':'application/json'}});}
      actual++;assert(actual<=3,'Live request budget exceeded');
      if(phase===2){retryEqual=failedBytes?.equals(options.body)||false;secondAccount=options.headers['chatgpt-account-id']===accountB;}
    }
    const response=await fetch(url,options);
    if(!response.ok){let code='unparsed',detail='';try{const value=await response.clone().json();code=value.error?.type||value.error?.code||'unknown';detail=String(value.detail||value.error?.message||'').replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_.-]+/g,'[redacted]').replaceAll(accountA,'[account]').replaceAll(accountB,'[account]').slice(0,250);}catch{}console.log('Live upstream status:',response.status,'code:',String(code).slice(0,100),'detail:',detail);if(options.body)console.log('Request field names:',Object.keys(decodeRequest(options.body,options.headers['content-encoding'])).join(','));console.log('Request header names:',Object.keys(options.headers).join(','));}
    return response;
  };
  const g=new Gateway(service,{routerOptions:{fetch:relayFetch}});let client;
  try{
    await service.autoSwitchSettings({enabled:false,order:[a.id,b.id]});await g.start(a.id);client=new WsRpc(await connect(g.url,g.frontToken));await client.initialize();
    client.serverRequest=async()=>{throw Error('Live QA must not execute tools');};let completed=0,failed=0,text='';
    const models=await client.request('model/list',{limit:100});const model=models.data.find(m=>m.isDefault)?.model||models.data[0]?.model;assert(model);console.log('Native default model for live QA:',model);
    client.on('notification',(method,params)=>{if(method==='item/agentMessage/delta')text+=params.delta||'';if(method==='turn/completed'){if(params.turn.status==='completed')completed++;else {failed++;console.log('Live turn failed:',JSON.stringify(params.turn.error?.codexErrorInfo));}}});
    const thread=(await client.request('thread/start',{cwd:dir,model,approvalPolicy:'never',sandbox:'read-only',environments:[{environmentId:'local',cwd:dir,runtimeWorkspaceRoots:[dir]}]})).thread;
    await client.request('turn/start',{threadId:thread.id,model,effort:'low',input:[{type:'text',text:'This is a read-only connectivity check. Do not use any tools. Reply with exactly this marker and nothing else: '+marker}]});
    for(let i=0;i<240&&completed<1&&!failed;i++)await pause(250);assert.equal(failed,0);assert.equal(completed,1);assert(text.includes(marker));
    phase=2;text='';await service.autoSwitchSettings({enabled:true,order:[a.id,b.id]});
    await client.request('turn/start',{threadId:thread.id,model,effort:'low',input:[{type:'text',text:'Do not use tools. Repeat exactly the marker from my previous message, and nothing else.'}]});
    for(let i=0;i<240&&completed<2&&!failed;i++)await pause(250);assert.equal(failed,0);assert.equal(completed,2);assert(text.includes(marker));assert(injected&&retryEqual&&secondAccount);
    const result=await client.request('thread/read',{threadId:thread.id,includeTurns:true});assert.equal(result.thread.turns.length,2);assert(result.thread.turns.every(t=>t.status==='completed'));assert.equal(g.recovery.events.filter(e=>e.type==='continued').length,0);
    console.log('Real short inference A -> locally injected quota -> exact same request on B; same thread, remembered marker, no continuation, no failed turn: passed. Real model requests:',actual);
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);
  }finally{client?.close();await g.stop(true);const after=await fs.readFile(sourceAuth).then(b=>crypto.createHash('sha256').update(b).digest('hex'),()=>null);assert.equal(after,hash);}
}
main().catch(e=>{console.error('Live router QA failed:',e.code||e.name,e.message);process.exitCode=1;});
