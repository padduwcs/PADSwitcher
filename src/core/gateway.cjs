'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {WebSocketServer,WebSocket}=require('ws');
const {connect,WsRpc,MAX_FRAME}=require('./ws-rpc.cjs');
const {atomicWrite,assertDirectory,assertRegular}=require('./files.cjs');
const {UserError,publicError}=require('./errors.cjs');
const {Recovery,continuation}=require('./recovery.cjs');
const START_METHODS=new Set(['turn/start','review/start']);
const AUTH_METHODS=new Set(['account/login/start','account/login/cancel','account/logout']);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const port=s.address().port;await new Promise(r=>s.close(r));return port;}
function validBearer(value,token){const bytes=Buffer.from(String(value||''));const expected=Buffer.from('Bearer '+token);return bytes.length===expected.length&&crypto.timingSafeEqual(bytes,expected);}
class Gateway {
  constructor(service,options={}) {
    this.service=service;this.root=path.join(service.root,'gateway');this.options=options;
    this.status='stopped';this.profileId=null;this.pendingId=null;this.changing=false;this.clients=new Set();this.turns=new Map();this.error=null;this.refreshFlight=null;this.generation=0;
    service.gateway=this;
    this.recovery=new Recovery(this);
    this.knownTurns=new Map();
  }
  view(){return {status:this.status,profileId:this.profileId,pendingId:this.pendingId,activeTurns:this.turns.size,clients:this.clients.size,lastError:this.error,helper:this.helper||null,version:this.version||null,recovery:this.recovery.view()};}
  changed(){this.service.changed();}
  async start(id){
    this.service.get(id);
    if(this.status==='ready'){await this.select(id);return;}
    if(!['stopped','error'].includes(this.status))throw new UserError('Gateway đang khởi động.', 'GATEWAY_BUSY');
    if(this.status==='error')await this.stop(true);
    this.status='starting';this.error=null;this.changed();
    try {
      await fs.mkdir(this.root,{recursive:true});await assertDirectory(this.root);await this.service.platform.protectDirectory(this.root);
      this.executable=this.options.executable||await this.service.platform.findGatewayCodex?.(this.service.state.settings.codexPath)||await this.service.executable();
      this.version=await this.service.platform.run(this.executable,['--version']);
      this.helper=path.join(this.root,'PADCodex.exe');
      const helperBytes=await fs.readFile(this.options.helperSource||path.join(__dirname,'../assets/PADCodex.exe'));
      const oldHelper=await (async()=>{try{await assertRegular(this.helper);return await fs.readFile(this.helper);}catch(e){if(e.code==='ENOENT')return null;throw e;}})();
      if(!oldHelper?.equals(helperBytes))await atomicWrite(this.helper,helperBytes);
      this.frontToken=crypto.randomBytes(32).toString('hex');this.backToken=crypto.randomBytes(32).toString('hex');
      await atomicWrite(path.join(this.root,'backend-capability'),this.backToken);
      await atomicWrite(path.join(this.root,'client-capability'),this.frontToken);
      const port=await freePort();this.backendUrl=`ws://127.0.0.1:${port}`;
      const env={...process.env,CODEX_HOME:this.service.state.settings.desktopHome};
      for(const name of ['CODEX_SQLITE_HOME','OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','ACCESS_TOKEN','OPENAI_BASE_URL','CODEX_INTERNAL_ORIGINATOR_OVERRIDE'])delete env[name];
      const backendArgs=['app-server','--listen',this.backendUrl,'--ws-auth','capability-token','--ws-token-file',path.join(this.root,'backend-capability'),'-c','cli_auth_credentials_store="ephemeral"','-c','features.code_mode_host=true','-c','analytics.enabled=false',...(this.options.backendArgs||[])];
      const spawnOptions={env,cwd:this.service.state.settings.workspace,stdio:'ignore',windowsHide:true};
      this.backend=this.options.spawn?this.options.spawn(this.executable,backendArgs,spawnOptions):spawn(this.helper,['--host',String(process.pid),this.executable,...backendArgs],spawnOptions);
      this.backend.on('error',()=>this.backendFailed());this.backend.on('close',()=>{if(this.status!=='stopping'&&this.status!=='stopped')this.backendFailed();});
      let socket;
      for(let attempt=0;attempt<50;attempt++){try{socket=await connect(this.backendUrl,this.backToken);break;}catch{if(this.backend.exitCode!==null)break;await pause(100);}}
      if(!socket)throw new UserError('Không khởi động được Codex gateway. Kiểm tra phiên bản Codex.', 'GATEWAY_START');
      this.control=new WsRpc(socket);this.control.serverRequest=(m,p)=>this.serverRequest(m,p);
      this.control.on('notification',(m,p)=>this.observe(m,p));
      await this.control.initialize();
      this.control.on('closed',()=>{if(!['stopping','stopped'].includes(this.status))this.backendFailed();});
      this.pendingId=id;await this.applyPending();
      this.http=http.createServer((_req,res)=>{res.writeHead(404,{'Cache-Control':'no-store'});res.end();});
      this.wss=new WebSocketServer({noServer:true,maxPayload:MAX_FRAME,perMessageDeflate:false});
      this.http.on('upgrade',(req,socket,head)=>{
        if(this.status!=='ready'||req.headers.origin||!validBearer(req.headers.authorization,this.frontToken)||this.clients.size>=16){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
        this.wss.handleUpgrade(req,socket,head,client=>this.attach(client));
      });
      await new Promise((r,j)=>{this.http.once('error',j);this.http.listen(0,'127.0.0.1',r);});
      this.url=`ws://127.0.0.1:${this.http.address().port}`;
      await atomicWrite(path.join(this.root,'connection.json'),JSON.stringify({version:1,url:this.url,tokenFile:path.join(this.root,'client-capability'),executable:this.executable,home:this.service.state.settings.desktopHome}));
      this.status='ready';this.service.state.gatewayEnabled=true;await this.service.save();this.changed();
      this.pollTimer=setInterval(()=>{
        this.recovery.tick();
        if(this.status==='ready'&&(this.pendingId||this.turns.size)&&!this.changing)this.reconcile().then(()=>this.applyPending()).catch(e=>{if(this.status==='ready'){this.error=publicError(e).message;this.changed();}});
      },1000);
    } catch(e){await this.stop(true);this.status='error';this.error=publicError(e).message;this.changed();throw e;}
  }
  backendFailed(){this.recovery.cancel();this.status='error';this.error='Codex gateway đã dừng. Mở lại gateway để kết nối.';for(const c of this.clients)c.front.close(1011,'Codex backend stopped');this.changed();}
  async select(id){
    this.service.get(id);if(this.status!=='ready')throw new UserError('Hãy bật gateway trước.', 'GATEWAY_STOPPED');
    this.recovery.cancel(this.recovery.busy?'Bạn đã chọn tài khoản thủ công; đã hủy tự tiếp tục.':null);
    this.pendingId=id;this.error=null;this.changed();await this.applyPending();
  }
  async applyPending(){
    if(!['ready','starting'].includes(this.status)||this.changing||this.refreshFlight||this.turns.size||!this.pendingId)return;
    this.changing=true;this.changed();const id=this.pendingId,generation=this.generation,control=this.control;
    try {
      await this.reconcile();
      if(this.generation!==generation||this.turns.size)return;
      const bundle=await this.bundle(id);
      if(this.generation!==generation||this.pendingId!==id||!['ready','starting'].includes(this.status))return;
      await control.request('account/login/start',{type:'chatgptAuthTokens',...bundle});
      if(this.generation!==generation)return;
      this.profileId=id;if(this.pendingId===id)this.pendingId=null;
      this.service.state.gatewayProfileId=id;await this.service.save();this.error=null;
    }catch(e){if(this.generation===generation){this.pendingId=null;this.error=publicError(e).message;}throw e;}
    finally{if(this.generation===generation){this.changing=false;this.changed();}}
    if(this.pendingId)await this.applyPending();
  }
  async reconcile(){
    if(this.reconcileFlight)return this.reconcileFlight;
    const generation=this.generation,control=this.control;
    this.reconcileFlight=(async()=>{
      const loaded=await control.request('thread/loaded/list',{limit:500});
      if(!Array.isArray(loaded.data)||loaded.nextCursor)throw new UserError('Chưa kiểm tra được toàn bộ tác vụ Codex. Giữ phiên hiện tại.', 'GATEWAY_TASK_CHECK');
      const status=new Map();
      for(const id of loaded.data){const result=await control.request('thread/read',{threadId:id,includeTurns:false});status.set(id,result.thread?.status?.type);}
      if(this.generation!==generation)return;
      for(const [id,type]of status){
        if(!['idle','active','notLoaded','systemError'].includes(type))throw new UserError('Codex trả về trạng thái tác vụ chưa hỗ trợ.', 'GATEWAY_TASK_CHECK');
        if(type==='active'&&![...this.turns.values()].some(t=>t.threadId===id))this.turns.set('native:'+id,{client:null,threadId:id,turnId:null});
      }
      for(const [key,t]of this.turns){
        if(t.client===null&&status.get(t.threadId)!=='active')this.turns.delete(key);
        else if(t.turnId&&status.get(t.threadId)==='idle')this.turns.delete(key);
      }
      this.changed();
    })().finally(()=>{this.reconcileFlight=null;});
    return this.reconcileFlight;
  }
  async bundle(id,force=false){
    // Quota refresh/login use the same credential lock. Never refresh two copies concurrently.
    for(let i=0;this.service.busy&&i<600;i++)await pause(100);
    return this.service.accessBundle(id,force);
  }
  async serverRequest(method,params){
    if(method!=='account/chatgptAuthTokens/refresh')throw new UserError('Yêu cầu không thuộc bộ quản lý phiên.', 'GATEWAY_REQUEST');
    if(!this.refreshFlight)this.refreshFlight=(async()=>{
      const bundle=await this.bundle(this.profileId,true);
      if(params?.previousAccountId&&params.previousAccountId!==bundle.chatgptAccountId)throw new UserError('Tài khoản làm mới không khớp.', 'IDENTITY_MISMATCH');
      return bundle;
    })().finally(()=>{this.refreshFlight=null;setImmediate(()=>this.applyPending().catch(()=>{}));});
    return this.refreshFlight;
  }
  observe(method,params){
    if(method==='error'){const known=this.knownTurns.get(params.turnId);if(known)known.lastError=params.error;for(const t of this.turns.values())if(t.turnId===params.turnId)t.lastError=params.error;}
    if(method==='turn/completed'){
      const finished=this.knownTurns.get(params.turn?.id)||[...this.turns.values()].find(t=>t.turnId===params.turn?.id);
      for(const [key,t]of this.turns)if(t.turnId===params.turn?.id)this.turns.delete(key);
      this.knownTurns.delete(params.turn?.id);
      if(finished&&!finished.completedObserved){finished.completedObserved=true;this.recovery.complete(finished,params.turn);}
      this.changed();this.applyPending().catch(()=>{});
    }
  }
  async attach(front){
    const c={front,back:null,pending:new Map(),startContexts:new Map(),threadPending:new Map(),auxThreads:new Set(),internal:new Map(),approvals:new Map(),sequence:0};this.clients.add(c);this.changed();
    // Register immediately: extension initialize may arrive while connecting upstream.
    const queue=[];let forwarding=false,queuedBytes=0;
    front.on('message',data=>{queuedBytes+=data.length;if(queue.length>=100||queuedBytes>MAX_FRAME){front.close(1009);return;}queue.push(data);drain();});
    const drain=()=>{if(!c.back||forwarding)return;forwarding=true;try{while(queue.length){const data=queue.shift();queuedBytes-=data.length;this.fromClient(c,data);}}finally{forwarding=false;}};
    front.on('close',()=>{this.clients.delete(c);for(const p of c.internal.values())p.reject(new UserError('Client đã ngắt.', 'RECOVERY_DISCONNECTED'));c.internal.clear();if(this.recovery.active?.client===c||this.recovery.queue.some(j=>j.client===c))this.recovery.cancel('Codex đã ngắt kết nối; đã hủy tự tiếp tục.');for(const t of this.turns.values())if(t.client===c)t.disconnected=true;c.back?.terminate();if(this.status==='ready')this.interruptDisconnected(c).catch(()=>{});this.changed();});
    front.on('error',()=>{});
    try{
      c.back=await connect(this.backendUrl,this.backToken);
      if(front.readyState!==WebSocket.OPEN){c.back.terminate();return;}
      c.back.on('message',data=>this.fromBackend(c,data));
      c.back.on('close',()=>front.close(1011,'Codex connection ended'));drain();
    }catch{front.close(1011,'Codex connection failed');}
  }
  clientError(c,id,message){if(id!=null&&c.front.readyState===WebSocket.OPEN)c.front.send(JSON.stringify({id,error:{code:-32000,message}}));}
  fromClient(c,data){
    let m;try{m=JSON.parse(data.toString());}catch{c.front.close(1007);return;}
    if(!m||typeof m!=='object'||Array.isArray(m)||(m.id!=null&&!['string','number'].includes(typeof m.id))||(m.method!=null&&typeof m.method!=='string')){c.front.close(1007);return;}
    if(AUTH_METHODS.has(m.method)){this.clientError(c,m.id,'Manage accounts in PADSwitcher.');return;}
    if(typeof m.id==='string'&&m.id.startsWith('pad-auto-')){this.clientError(c,m.id,'Reserved request ID.');return;}
    if(!m.method&&m.id!=null)c.approvals.delete(m.id);
    if(['turn/start','review/start','turn/steer','turn/interrupt','thread/archive','thread/rollback','thread/resume','thread/compact/start'].includes(m.method))this.recovery.cancelThread(m.params?.threadId);
    if(/^thread\/(realtime|goal|background)\//.test(m.method||'')){this.clientError(c,m.id,'Background and realtime sessions are not supported by PADSwitcher gateway.');return;}
    if(m.method==='initialize')m.params={...m.params,capabilities:{...m.params?.capabilities,experimentalApi:true}};
    if(['thread/start','thread/resume','thread/fork'].includes(m.method)&&m.id!=null)c.threadPending.set(m.id,m.params?.ephemeral===true||m.params?.threadSource==='thread_title');
    if(START_METHODS.has(m.method)){
      if(this.pendingId||this.changing||this.recovery.busy||this.status!=='ready'){this.clientError(c,m.id,'PADSwitcher is switching accounts. Wait for the current turn to finish, then retry.');return;}
      if(m.id==null){c.front.close(1007);return;}
      if(c.pending.has(m.id)){this.clientError(c,m.id,'Duplicate active request ID.');return;}
      if(this.knownTurns.size>=256){this.clientError(c,m.id,'Too many tracked turns. Stop and restart the gateway.');return;}
      const key=crypto.randomUUID(),context={client:c,threadId:m.params?.threadId,turnId:null,method:m.method,startParams:continuation(m.params||{}),profileId:this.profileId,auxiliary:c.auxThreads.has(m.params?.threadId)};c.pending.set(m.id,key);c.startContexts.set(m.id,context);this.turns.set(key,context);this.changed();
    }
    if(c.back.readyState===WebSocket.OPEN)c.back.send(JSON.stringify(m));
  }
  fromBackend(c,data){
    let m;try{m=JSON.parse(data.toString());}catch{c.front.close(1007);return;}
    if(m.id!=null&&!m.method&&c.threadPending.has(m.id)){const auxiliary=c.threadPending.get(m.id);c.threadPending.delete(m.id);if(m.result?.thread?.id&&auxiliary)c.auxThreads.add(m.result.thread.id);}
    if(m.id!=null&&!m.method&&c.internal.has(m.id)){const p=c.internal.get(m.id);c.internal.delete(m.id);if(m.error)p.reject(new UserError('Codex chưa nhận lượt tiếp tục.', 'RECOVERY_START'));else p.resolve(m.result);this.trackStart(c,m);return;}
    if(m.id!=null&&!m.method&&typeof m.id==='string'&&m.id.startsWith('pad-auto-')){this.trackStart(c,m);return;}
    if(m.id!=null&&m.method&&m.method!=='account/chatgptAuthTokens/refresh')c.approvals.set(m.id,m.params?.threadId||null);
    if(m.method==='serverRequest/resolved')c.approvals.delete(m.params?.requestId);
    if(m.method==='account/chatgptAuthTokens/refresh'&&m.id!=null){this.serverRequest(m.method,m.params).then(result=>{if(c.back.readyState===WebSocket.OPEN)c.back.send(JSON.stringify({id:m.id,result}));},()=>{if(c.back.readyState===WebSocket.OPEN)c.back.send(JSON.stringify({id:m.id,error:{code:-32000,message:'Reauthenticate this profile in PADSwitcher.'}}));});return;}
    this.trackStart(c,m);
    if(m.method==='turn/started'){
      const id=m.params?.turn?.id;
      const pending=[...this.turns.values()].find(t=>t.client===c&&!t.turnId&&(t.threadId===m.params?.threadId||!t.threadId));
      if(pending){pending.turnId=id;pending.threadId=m.params?.threadId;this.knownTurns.set(id,pending);}
      else if(id&&![...this.turns.values()].some(t=>t.turnId===id))this.turns.set(crypto.randomUUID(),this.knownTurns.get(id)||{client:c,threadId:m.params?.threadId,turnId:id});
      this.changed();
    }
    this.observe(m.method,m.params||{});
    if(c.front.readyState===WebSocket.OPEN)c.front.send(data.toString());
  }
  trackStart(c,m){
    if(m.id!=null&&!m.method&&c.pending.has(m.id)){
      const key=c.pending.get(m.id);c.pending.delete(m.id);const t=c.startContexts.get(m.id)||this.turns.get(key);c.startContexts.delete(m.id);
      if(m.error){this.turns.delete(key);this.changed();this.applyPending().catch(()=>{});}
      else if(t){t.turnId=m.result?.turn?.id||t.turnId;t.threadId=m.result?.reviewThreadId||m.result?.threadId||t.threadId;if(t.turnId)this.knownTurns.set(t.turnId,t);}
    }
  }
  startContinuation(job,params){
    const c=job.client,id='pad-auto-'+crypto.randomUUID(),key=crypto.randomUUID();
    const context={client:c,threadId:params.threadId,turnId:null,method:'turn/start',startParams:params,profileId:this.profileId,attempted:job.attempted};c.pending.set(id,key);c.startContexts.set(id,context);this.turns.set(key,context);this.changed();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{c.internal.delete(id);context.noAutoRecovery=true;reject(new UserError('Chưa xác định được lượt tiếp tục. Không gửi lại tự động.', 'RECOVERY_TIMEOUT'));},25000);
      c.internal.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
      c.back.send(JSON.stringify({id,method:'turn/start',params}));
    });
  }
  async interruptDisconnected(c){
    const lost=[...this.turns.entries()].filter(([,t])=>t.client===c);
    for(const [key,t]of lost){
      if(!t.threadId||!t.turnId){this.error='Một kết nối mất khi yêu cầu chưa xác định trạng thái. Dừng gateway trước khi chuyển tài khoản.';this.changed();continue;}
      try{
        await this.control.request('turn/interrupt',{threadId:t.threadId,turnId:t.turnId});
        for(let i=0;i<40;i++){
          const result=await this.control.request('thread/read',{threadId:t.threadId,includeTurns:true});
          const turn=result.thread?.turns?.find(x=>x.id===t.turnId);
          if(turn&&turn.status!=='inProgress'){this.turns.delete(key);break;}await pause(250);
        }
      }catch{this.error='Chưa xác định được trạng thái yêu cầu sau khi mất kết nối.';}
    }
    this.changed();await this.applyPending();
  }
  async stop(force=false){
    if(!force&&this.status==='ready')await this.reconcile();
    if(this.turns.size&&!force)throw new UserError('Codex còn yêu cầu đang chạy. Dừng hoặc chờ hoàn tất trước khi tắt gateway.', 'GATEWAY_ACTIVE');
    clearInterval(this.pollTimer);this.pollTimer=null;
    this.recovery.cancel();
    this.generation++;this.status='stopping';this.pendingId=null;this.changed();
    for(const c of this.clients){c.front.terminate();c.back?.terminate();}this.clients.clear();this.control?.close();this.control=null;
    if(this.wss)await new Promise(r=>this.wss.close(r));this.wss=null;
    if(this.http)await new Promise(r=>this.http.close(r));this.http=null;
    if(this.backend&&this.backend.exitCode===null){const ended=new Promise(r=>this.backend.once('close',r));this.backend.kill();await Promise.race([ended,pause(3000)]);}this.backend=null;
    this.turns.clear();this.knownTurns.clear();this.profileId=null;this.pendingId=null;this.changing=false;this.status='stopped';
    for(const file of ['connection.json','client-capability','backend-capability'])await fs.unlink(path.join(this.root,file)).catch(()=>{});
    this.changed();
  }
}
module.exports={Gateway,validBearer,START_METHODS};
