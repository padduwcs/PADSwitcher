'use strict';
// Opt-in live verification: credentials are read in memory; only the isolated fixture is written.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {ProfileService}=require('../src/core/service.cjs');
const {Gateway}=require('../src/core/gateway.cjs');
const {connect,WsRpc}=require('../src/core/ws-rpc.cjs');
const windows=require('../src/core/windows.cjs');
const {parseAuth}=require('../src/core/auth.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  if(!process.argv.includes('--live'))throw Error('Use --live for local account verification.');
  const original=path.join(process.env.APPDATA,'PADSwitcher','data');
  const metadata=JSON.parse(await fs.readFile(path.join(original,'accounts.json'),'utf8'));
  assert(metadata.profiles.length>=2,'Add two accounts before live verification.');
  const parent=path.resolve('artifacts/gateway-live');await fs.mkdir(parent,{recursive:true});await windows.protectDirectory(parent);
  const dir=await fs.mkdtemp(path.join(parent,'run-'));const home=path.join(dir,'codex-home');await fs.mkdir(home);
  const authFile=path.join(metadata.settings.desktopHome,'auth.json');
  const before=crypto.createHash('sha256').update(await fs.readFile(authFile)).digest('hex');
  const service=new ProfileService(path.join(dir,'data'));await service.init();
  service.state.profiles=metadata.profiles;service.state.settings={...metadata.settings,desktopHome:home,workspace:dir};
  service.accessBundle=async id=>{
    const bytes=await windows.dpapi(await fs.readFile(path.join(original,'profiles',id,'session.dpapi')),true);
    try {
      assert.equal(parseAuth(bytes).identity,service.get(id).identity);
      const auth=JSON.parse(bytes.toString('utf8'));const claims=JSON.parse(Buffer.from(auth.tokens.access_token.split('.')[1],'base64url'));
      assert(!claims.exp||claims.exp*1000>Date.now()+60000,'Token expired. Refresh the account in PADSwitcher first.');
      return {accessToken:auth.tokens.access_token,chatgptAccountId:auth.tokens.account_id,chatgptPlanType:service.get(id).plan||null};
    }finally{bytes.fill(0);}
  };
  const gateway=new Gateway(service);let client,extension;
  if(process.argv.includes('--hold')){
    const forward=gateway.fromClient.bind(gateway);gateway.fromClient=(c,data)=>{
      const m=JSON.parse(data.toString());if(['initialize','thread/start','turn/start'].includes(m.method))console.log('Native client protocol:',m.method,JSON.stringify(Object.keys(m.params||{})));
      return forward(c,data);
    };
  }
  try {
    const [a,b]=metadata.profiles;await gateway.start(a.id);const pid=gateway.backend.pid;
    client=new WsRpc(await connect(gateway.url,gateway.frontToken));await client.initialize();
    const connection=path.join(gateway.root,'connection.json');
    extension=new CodexRpc(gateway.helper,home,{spawn:(file,args,opts)=>spawn(file,args,{...opts,env:{...opts.env,PADSWITCHER_CONNECTION_FILE:connection}})});
    await extension.initialize({experimentalApi:true});
    assert.equal((await extension.request('account/read',{refreshToken:false})).account.email,a.email);
    assert.equal((await client.request('account/read',{refreshToken:false})).account.email,a.email);
    assert((await client.request('account/rateLimits/read')).rateLimits);
    await gateway.select(b.id);
    assert.equal((await client.request('account/read',{refreshToken:false})).account.email,b.email);
    assert.equal((await extension.request('account/read',{refreshToken:false})).account.email,b.email);
    assert((await client.request('account/rateLimits/read')).rateLimits);
    assert.equal(gateway.backend.pid,pid);assert.equal(gateway.clients.size,2);
    const helperVersion=await windows.run(gateway.helper,['--version'],{env:{...process.env,PADSWITCHER_CONNECTION_FILE:connection}});assert(/^codex-cli /.test(helperVersion));
    console.log('Native PADCodex.exe stdio bridge, extension initialize/account protocol and CLI remote flags passed.');
    console.log('Two real accounts A -> B: same Codex process and WebSocket, fresh quota reads passed.');
    if(process.argv.includes('--inference')){
      await gateway.select(a.id);
      const thread=await client.request('thread/start',{cwd:dir,environments:[{environmentId:'local',cwd:dir,runtimeWorkspaceRoots:[dir]}],approvalPolicy:'never',sandbox:'read-only'});
      const completed=[];let text='';
      client.on('notification',(method,params)=>{
        if(method==='turn/completed')completed.push(params.turn);
        if(method==='item/agentMessage/delta')text+=params.delta||'';
      });
      await client.request('turn/start',{threadId:thread.thread.id,input:[{type:'text',text:'Remember the marker PAD_SWITCH_CONTEXT. Reply only PAD_A. Do not use any tools.'}]});
      assert(gateway.turns.size>0);await gateway.select(b.id);assert.equal(gateway.profileId,a.id);assert.equal(gateway.pendingId,b.id);
      for(let i=0;i<240&&(completed.length<1||gateway.pendingId);i++)await pause(250);
      assert.equal(completed[0]?.status,'completed');assert.equal(gateway.profileId,b.id);assert.equal(gateway.turns.size,0);
      text='';
      await client.request('turn/start',{threadId:thread.thread.id,input:[{type:'text',text:'What is the marker I asked you to remember? Reply only that marker. Do not use tools.'}]});
      for(let i=0;i<240&&completed.length<2;i++)await pause(250);
      assert.equal(completed[1]?.status,'completed');assert(text.includes('PAD_SWITCH_CONTEXT'));
      assert.equal(gateway.backend.pid,pid);
      console.log('Live inference A -> B: deferred switch, two completed turns, same thread and remembered context passed.');
    }
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(authFile)).digest('hex'),before);
    console.log('Ephemeral backend wrote no auth.json; original login file hash unchanged.');
    if(process.argv.includes('--hold')){await fs.writeFile(path.join(dir,'MARKER.txt'),'PAD_FILE_READ_OK');console.log('Isolated CLI fixture: '+path.join(gateway.root,'connection.json'));await pause(60000);}
  }finally{client?.close();await extension?.close();await gateway.stop(true);assert.equal(path.dirname(path.resolve(dir)),parent);await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
main().catch(e=>{console.error('Gateway live verification failed:',e.code||e.message.replace(/[^a-zA-Z0-9 .:>_-]/g,'').slice(0,160));process.exitCode=1;});
