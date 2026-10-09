'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {EventEmitter} = require('node:events');
const {atomicWrite,assertDirectory,readLimited,exists,profilePath} = require('./files.cjs');
const {UserError} = require('./errors.cjs');
const models = require('./web-models.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const MAX_CATALOG = 4*1024*1024;
async function freePort() {
  const s = net.createServer(); await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});
  const port = s.address().port; await new Promise(r=>s.close(r)); return port;
}
async function limitedResponse(response, max) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(),chunks=[]; let size=0;
  for (;;) {const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>max){void reader.cancel().catch(()=>{});throw Error('Response exceeds limit');}chunks.push(Buffer.from(x.value));}
  return Buffer.concat(chunks);
}
function errorResponse(res, status, code, message) {
  if(res.headersSent){res.destroy();return;}
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:{type:code,code,message}}));
}
class WebService extends EventEmitter {
  constructor(root, options={}) {
    super(); this.root=path.resolve(root);this.options=options;this.platform=options.platform;
    this.file=path.join(this.root,'accounts.json');this.bindingFile=path.join(this.root,'bindings.json');
    this.state={version:1,enabled:false,selectedId:null,profiles:[]};this.children=new Map();this.statuses=new Map();this.rows=new Map();
    this.bindings={};this.busy=false;this.active=0;this.pollFlight=null;this.lastError=null;this.closed=false;this.setupPending=new Map();
    this.fetch=options.fetch||fetch;this.spawn=options.spawn||spawn;
  }
  get enabled(){return this.state.enabled&&!this.closed;}
  get(id){const p=this.state.profiles.find(p=>p.id===id);if(!p)throw new UserError('Không tìm thấy tài khoản GPT Web.','WEB_ACCOUNT_MISSING');return p;}
  home(id){this.get(id);return profilePath(path.join(this.root,'profiles'),id);}
  view(){return {enabled:this.enabled,selectedId:this.state.selectedId,busy:this.busy,active:this.active,lastError:this.lastError,
    runtimeAvailable:this.options.available?.()===true,setupLocked:this.setupPending.size>0,
    profiles:this.state.profiles.map(p=>{const s=this.statuses.get(p.id);return {id:p.id,label:p.label,selected:p.id===this.state.selectedId,
      status:s?.ready?(s.authenticated?(s.mode==='full'&&s.setup?.toolsVerified===false?'setup':'ready'):'signedOut'):this.children.has(p.id)?'setup':'stopped',
      mode:s?.mode||null,runtimeReady:s?.ready===true,authenticated:s?.authenticated===true,operation:s?.operation||null,setup:s?.setup||null,
      modelCount:(this.rows.get(p.id)||[]).filter(r=>r.visibility==='list').length};})};}
  changed(){this.emit('change',this.view());}
  async init(){
    await fs.mkdir(path.join(this.root,'profiles'),{recursive:true});await assertDirectory(this.root);await this.platform?.protectDirectory(this.root);
    if(await exists(this.file)){
      const x=JSON.parse((await readLimited(this.file,1024*1024)).toString('utf8'));
      if(x.version!==1||typeof x.enabled!=='boolean'||!Array.isArray(x.profiles)||x.profiles.length>50)throw new UserError('Dữ liệu GPT Web không hợp lệ.','WEB_STORE_INVALID');
      const ids=new Set();for(const p of x.profiles){profilePath(path.join(this.root,'profiles'),p.id);if(ids.has(p.id)||typeof p.label!=='string'||!p.label.trim()||p.label.length>80)throw new UserError('Dữ liệu GPT Web không hợp lệ.','WEB_STORE_INVALID');ids.add(p.id);}
      if(x.selectedId!==null&&!ids.has(x.selectedId))throw new UserError('Dữ liệu GPT Web không hợp lệ.','WEB_STORE_INVALID');
      this.state={version:1,enabled:x.enabled,selectedId:x.selectedId,profiles:x.profiles.map(p=>({id:p.id,label:p.label}))};
    }else await this.save();
    if(await exists(this.bindingFile)){
      const x=JSON.parse((await readLimited(this.bindingFile,1024*1024)).toString('utf8'));
      if(x.version!==1||!x.bindings||Array.isArray(x.bindings)||typeof x.bindings!=='object'||Object.keys(x.bindings).length>5000||Object.entries(x.bindings).some(([k,v])=>!/^([a-f0-9]{64})$/.test(k)||typeof v!=='string'||!models.parse('chatgpt-web/pad-'+v+'/binding')))throw new UserError('Liên kết hội thoại GPT Web không hợp lệ.','WEB_STORE_INVALID');
      this.bindings=x.bindings;
    }
    this.startPolling();return this.view();
  }
  startPolling(){if(this.timer)return;this.timer=setInterval(()=>this.poll().catch(()=>{}),3000);this.timer.unref?.();}
  async save(){const bytes=JSON.stringify(this.state,null,2);const op=(this.saveFlight||Promise.resolve()).catch(()=>{}).then(()=>atomicWrite(this.file,bytes));this.saveFlight=op;await op;}
  async saveBindings(){const bytes=JSON.stringify({version:1,bindings:this.bindings});const op=(this.bindingsFlight||Promise.resolve()).catch(()=>{}).then(()=>atomicWrite(this.bindingFile,bytes));this.bindingsFlight=op;await op;}
  async exclusive(action){if(this.busy)throw new UserError('GPT Web đang xử lý thao tác khác.','WEB_BUSY');this.busy=true;this.changed();try{return await action();}finally{this.busy=false;this.changed();}}
  async add(label){return this.exclusive(async()=>{
    const clean=String(label||'').trim();if(!clean||clean.length>80||/[\x00-\x1f]/.test(clean))throw new UserError('Tên tài khoản cần từ 1 đến 80 ký tự.','WEB_LABEL_INVALID');
    if(this.state.profiles.length>=50)throw new UserError('Đã đạt giới hạn 50 tài khoản GPT Web.','WEB_ACCOUNT_LIMIT');
    const p={id:crypto.randomUUID(),label:clean};this.state.profiles.push(p);if(!this.state.selectedId)this.state.selectedId=p.id;
    try{await fs.mkdir(this.home(p.id),{recursive:true});await this.save();}catch(e){this.state.profiles=this.state.profiles.filter(x=>x.id!==p.id);if(this.state.selectedId===p.id)this.state.selectedId=null;throw e;}return p.id;
  });}
  async select(id){return this.exclusive(async()=>{this.get(id);const old=this.state.selectedId;this.state.selectedId=id;try{await this.save();}catch(e){this.state.selectedId=old;throw e;}this.lastError=null;if(this.enabled)await this.launch(id,true);});}
  async descriptor(id){
    const child=this.children.get(id);if(!child||child.exitCode!==null||child.signalCode!==null)throw Error('Companion not running');
    const file=path.join(this.home(id),'core','runtime','pad-control.json');
    const x=JSON.parse((await readLimited(file,8192)).toString('utf8'));
    const url=new URL(x.endpoint);
    if(x.version!==1||x.pid!==child.pid||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash||typeof x.token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(x.token))throw Error('Invalid companion descriptor');
    return x;
  }
  async control(id, endpoint, body, timeout=6000){
    const d=await this.descriptor(id);const r=await this.fetch(d.endpoint+endpoint,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+d.token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
    if(!r.ok){
      if(endpoint==='/setup'){
        const messages={WEB_SETUP_BUSY:'Chờ lượt Web hoặc thao tác thiết lập hoàn tất.',WEB_SETUP_CONSENT:'Đồng ý kiểm tra bằng một lượt ChatGPT Web trước.',WEB_SETUP_INPUT:'Thông tin thiết lập chưa hợp lệ. Kiểm tra Tunnel ID và API key.',WEB_SETUP_MODE:'Thiết lập nhanh cần With Automation. Đổi chế độ trong cửa sổ nâng cao.'};
        const error=JSON.parse((await limitedResponse(r,8192)).toString('utf8')).error;
        throw new UserError(messages[error]||'Bộ chạy chưa hỗ trợ thiết lập nhanh. Mở lại bản PADSwitcher mới khi không còn lượt chạy.',Object.hasOwn(messages,error)?error:'WEB_SETUP_UNAVAILABLE');
      }
      throw Error('Companion control failed');
    }return JSON.parse((await limitedResponse(r,MAX_CATALOG)).toString('utf8'));
  }
  async launch(id,show=true){
    if(this.closed||this.stopping)throw new UserError('GPT Web đã dừng hoặc đang dừng.','WEB_STOPPED');
    this.startPolling();
    this.get(id);
    // Chain every caller, rather than only awaiting the flight observed on entry.
    // Several waiters must not all spawn the same account after that flight ends.
    const flight=(this.launchFlight||Promise.resolve()).catch(()=>{}).then(async()=>{
      if(this.closed||this.stopping)throw new UserError('GPT Web đã dừng hoặc đang dừng.','WEB_STOPPED');
      const profile=this.get(id);
      if(this.children.has(id)){if(show)await this.control(id,'/show',{});return;}
      await this.startChild(profile,show);
    });
    this.launchFlight=flight;try{await flight;}finally{if(this.launchFlight===flight)this.launchFlight=null;}
  }
  async startChild(profile,show){
    if(!this.options.available?.())throw new UserError('Không tìm thấy bộ chạy GPT Web. Hãy thoát PADSwitcher ở khay hệ thống rồi mở lại bản mới nhất.','WEB_RUNTIME_MISSING');
    const accountRoot=this.home(profile.id),core=path.join(accountRoot,'core'),privateCodex=path.join(accountRoot,'codex');
    for(const folder of [accountRoot,core,privateCodex,path.join(accountRoot,'browser-data')]){await fs.mkdir(folder,{recursive:true});await assertDirectory(folder);await this.platform?.protectDirectory(folder);}
    const env={...process.env};
    for(const k of ['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','ACCESS_TOKEN','OPENAI_BASE_URL','CODEX_SQLITE_HOME','CODEX_CONFIG','CODEX_CHATGPT_WEB_BROWSER_HOST_DESCRIPTOR','VITE_DEV_SERVER_URL','CODEX_CHATGPT_WEB_HOME','CODEX_WEB_GPT_LAUNCHER_DATA_DIR'])delete env[k];
    Object.assign(env,{PADSWITCHER_WEB_MANAGED:'1',PADSWITCHER_WEB_LABEL:profile.label,PADSWITCHER_WEB_ACCOUNT_ID:profile.id,
      PADSWITCHER_WEB_PORT:String(await freePort()),CODEX_CHATGPT_WEB_HOME:core,CODEX_HOME:privateCodex,
      PADSWITCHER_NATIVE_CODEX_HOME:this.options.nativeHome(),CODEX_WEB_GPT_LAUNCHER_DATA_DIR:path.join(accountRoot,'browser-data')});
    const invocation=this.options.invocation(show);const child=this.spawn(invocation.executable,invocation.args,{cwd:invocation.cwd,env,stdio:'ignore',windowsHide:true});
    this.children.set(profile.id,child);
    let spawnError=false;
    child.on('error',()=>{spawnError=true;if(this.children.get(profile.id)===child)this.children.delete(profile.id);this.lastError='Không mở được bộ chạy GPT Web.';this.changed();});
    child.on('exit',()=>{if(this.children.get(profile.id)===child){this.children.delete(profile.id);this.statuses.delete(profile.id);this.rows.delete(profile.id);this.setupPending.delete(profile.id);this.changed();}});
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){if(spawnError||child.exitCode!==null||child.signalCode!==null)break;try{await this.control(profile.id,'/heartbeat',{});await this.refreshStatus(profile.id);this.changed();return;}catch{}await wait(250);}
    throw new UserError('Bộ chạy GPT Web chưa sẵn sàng. Kiểm tra cửa sổ thiết lập GPT Web.','WEB_START_FAILED');
  }
  async open(id){return this.exclusive(async()=>this.launch(id,true));}
  async setupCommand(id,input){return this.exclusive(async()=>{
    this.get(id);
    if(this.active)throw new UserError('Chờ lượt Web đang chạy hoàn tất trước khi thiết lập.','WEB_ACTIVE');
    if(!input||!['login','prepare','connect','verify','external'].includes(input.action)||typeof input.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId))throw new UserError('Thao tác thiết lập không hợp lệ.','WEB_SETUP_INPUT');
    await this.launch(id,false);
    const status=await this.refreshStatus(id);
    if(!status.setup?.supported)throw new UserError('Bộ chạy này chưa có thiết lập nhanh. Thoát PADSwitcher ở khay khi hết lượt chạy rồi mở lại bản mới.','WEB_SETUP_UNAVAILABLE');
    if(status.setup.job?.status==='running'||this.setupPending.size)throw new UserError('Chờ thao tác thiết lập hiện tại hoàn tất.','WEB_SETUP_BUSY');
    this.setupPending.set(id,input.requestId);
    try {
      const result=await this.control(id,'/setup',input);
      await this.refreshStatus(id);this.lastError=null;return result;
    }catch(error){
      // Lost acknowledgement: inspect status only, never retry or use native Codex.
      await this.refreshStatus(id).catch(()=>{});
      if(error instanceof UserError){this.setupPending.delete(id);throw error;}
      throw new UserError('Chưa nhận được kết quả thiết lập. Chờ cập nhật trạng thái; thao tác không được tự gửi lại.','WEB_SETUP_UNCERTAIN');
    }
  });}
  async refreshStatus(id){
    const s=await this.control(id,'/status');const url=s.baseUrl?new URL(s.baseUrl):null;
    if(s.version!==1||s.pid!==this.children.get(id)?.pid||(url&&(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/v1/'||url.username||url.password||url.search||url.hash)))throw Error('Invalid companion status');
    this.statuses.set(id,s);if(s.setup?.job?.id===this.setupPending.get(id)&&s.setup?.job?.status!=='running')this.setupPending.delete(id);return s;
  }
  async poll(){if(this.pollFlight||this.closed)return;this.pollFlight=(async()=>{const before=JSON.stringify(this.view());await Promise.all([...this.children.keys()].map(async id=>{try{await this.control(id,'/heartbeat',{});await this.refreshStatus(id);}catch{this.statuses.delete(id);}}));if(before!==JSON.stringify(this.view()))this.changed();})();try{await this.pollFlight;}finally{this.pollFlight=null;}}
  async enable(){return this.exclusive(async()=>{
    if(this.active||this.setupPending.size)throw new UserError('Chờ lượt Web hoặc thiết lập hoàn tất trước khi bật.','WEB_ACTIVE');
    if(!this.state.selectedId)throw new UserError('Thêm và chọn tài khoản GPT Web trước.','WEB_ACCOUNT_MISSING');
    await this.launch(this.state.selectedId,false);const s=await this.refreshStatus(this.state.selectedId);
    if(!s.ready||!s.authenticated||s.operation||s.interactionMode!=='automatic'||s.mode==='full'&&s.setup?.toolsVerified===false)throw new UserError('Đăng nhập và hoàn tất thiết lập GPT Web trước. Nếu dùng công cụ, cần xác minh kết nối thành công.','WEB_SETUP_REQUIRED');
    this.state.enabled=true;try{await this.save();}catch(e){this.state.enabled=false;throw e;}this.lastError=null;
  });}
  async stopChildren(){for(const id of [...this.children.keys()]){
    const child=this.children.get(id),result=await this.control(id,'/shutdown',{},30000);
    if(result.ok!==true)throw new UserError('Chờ thao tác GPT Web hoàn tất trước khi tắt.','WEB_BUSY');
    const deadline=Date.now()+30000;while(this.children.get(id)===child&&Date.now()<deadline)await wait(100);
    if(this.children.get(id)===child)throw new UserError('Bộ chạy GPT Web chưa dừng. Hãy chờ rồi thử lại.','WEB_STOP_FAILED');
  }}
  async disable(){return this.exclusive(async()=>{
    if(this.launchFlight)throw new UserError('Chờ bộ chạy GPT Web khởi động hoàn tất trước khi tắt.','WEB_BUSY');
    if(this.active)throw new UserError('Chờ lượt GPT Web đang chạy hoàn tất trước khi tắt.','WEB_ACTIVE');
    this.stopping=true;
    try{
    for(const id of this.children.keys()){const s=await this.refreshStatus(id);if(s.activeHttp||s.activeBrowser||s.operation&&s.operation!=='ChatGPT login')throw new UserError('Chờ lượt hoặc thiết lập GPT Web hoàn tất trước khi tắt.','WEB_ACTIVE');}
    const old=this.state.enabled;this.state.enabled=false;try{await this.save();}catch(e){this.state.enabled=old;throw e;}
    await this.stopChildren();this.rows.clear();
    }finally{this.stopping=false;}
  });}
  async remove(id){return this.exclusive(async()=>{
    this.get(id);if(this.active||this.launchFlight||this.enabled&&id===this.state.selectedId||this.children.has(id))throw new UserError('Tắt GPT Web và đóng bộ chạy của tài khoản trước khi xóa.','WEB_ACCOUNT_ACTIVE');
    // Retain private login data in trash rather than silently destroy sessions.
    const home=this.home(id),trash=path.join(this.root,'trash');await fs.mkdir(trash,{recursive:true});await assertDirectory(trash);await assertDirectory(home);
    const destination=profilePath(trash,id);await fs.rename(home,destination);
    const previous=structuredClone(this.state);this.state.profiles=this.state.profiles.filter(p=>p.id!==id);if(this.state.selectedId===id)this.state.selectedId=this.state.profiles[0]?.id||null;
    // Keep the hashed ownership tombstone: deleting a login must not make an old
    // Web conversation eligible for native inference after a restart.
    try{await this.save();}catch(e){this.state=previous;await fs.rename(destination,home);throw e;}
    this.rows.delete(id);this.statuses.delete(id);
  });}
  async augmentModels(response){
    if(!this.enabled)return response;
    // Inspect a clone so an optional Web failure (including oversized catalogs)
    // cannot consume or replace the native response.
    const headers=new Headers(response.headers);let bytes;
    try{bytes=await limitedResponse(response.clone(),MAX_CATALOG);}catch{return response;}
    const original=()=>response;
    try{
      const catalog=JSON.parse(bytes.toString('utf8'));if(!Array.isArray(catalog.models))return original();
      const extra=[];
      for(const p of this.state.profiles){
        if(p.id!==this.state.selectedId){extra.push(...(this.rows.get(p.id)||[]).map(row=>({...row,visibility:'hide'})));continue;}
        const s=this.statuses.get(p.id);if(!s?.ready||!s.authenticated||s.interactionMode!=='automatic')continue;
        const result=await this.control(p.id,'/catalog',catalog);if(!Array.isArray(result.models)||result.models.length>100)throw Error('Invalid Web catalog');
        const rows=result.models.map(row=>({...row,slug:models.qualify(p.id,row.slug),display_name:String(row.display_name||row.slug).replace(/\s*\(Web\)\s*$/,'')+' (Web · '+p.label+')',
          // This release serializes Web requests; do not advertise parallel agents.
          multi_agent_version:'disabled',
          visibility:p.id===this.state.selectedId?row.visibility:'hide'}));
        this.rows.set(p.id,rows);extra.push(...rows);
      }
      if(!extra.length)return original();
      void response.body?.cancel().catch(()=>{});
      const body=Buffer.from(JSON.stringify({...catalog,models:[...catalog.models,...extra]}));headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');headers.delete('x-models-etag');headers.set('content-type','application/json');headers.set('cache-control','no-store');
      this.changed();return new Response(body,{status:response.status,headers});
    }catch{this.lastError='Chưa thêm được model Web. Model Codex vẫn dùng bình thường.';this.changed();return original();}
  }
  async handle(route,req,res,bytes,body,signal,touch){
    // Model discovery is shared by all conversations, including resumed Web
    // threads. Ownership guards apply to turn requests, never catalog reads.
    if(route==='models')return false;
    if(!models.isWeb(body?.model)){
      if(models.hasWebArtifacts(body)||models.threadKey(req,body)&&this.bindings[models.threadKey(req,body)]){errorResponse(res,409,'web_history_requires_new_thread','Open a new conversation to switch from GPT Web to native Codex. No model request was sent.');return true;}
      return false;
    }
    const binding=models.parse(body.model);
    if(!this.enabled||this.stopping){errorResponse(res,409,'web_disabled','GPT Web is disabled or stopping. No native model fallback was performed.');return true;}
    if(!binding||!this.state.profiles.some(p=>p.id===binding.id)||!['responses','responses/compact'].includes(route)){
      errorResponse(res,400,'web_model_not_supported','Select a PADSwitcher Web model in a new conversation.');return true;
    }
    // One physical Web request at a time across accounts. No queue or automatic replay.
    if(this.active||this.setupPending.size){errorResponse(res,409,'web_busy','Another GPT Web request or setup is active. Wait for it to finish.');return true;}
    const key=models.threadKey(req,body),owner=key&&this.bindings[key];
    if(owner&&owner!==binding.id){errorResponse(res,409,'web_account_thread_mismatch','This conversation belongs to another Web account. Open a new conversation.');return true;}
    this.active++;this.changed();
    try{
      signal.throwIfAborted();await this.launch(binding.id,false);signal.throwIfAborted();const s=await this.refreshStatus(binding.id);
      if(!s.ready||!s.authenticated||s.operation||s.interactionMode!=='automatic'||s.mode==='full'&&s.setup?.toolsVerified===false){errorResponse(res,409,'web_setup_required','Open GPT Web settings and finish sign-in and setup.');return true;}
      if(key&&!owner){
        if(Object.keys(this.bindings).length>=5000){errorResponse(res,409,'web_thread_limit','The Web conversation store is full. Existing ownership is preserved; no model request was sent.');return true;}
        this.bindings[key]=binding.id;await this.saveBindings();
      }
      signal.throwIfAborted();
      // Serialize ONLY Web requests. Codex request bytes and credentials never enter this path.
      const webBody={...body,model:binding.model};
      const headers={'content-type':'application/json','accept':req.headers.accept||'text/event-stream','authorization':'Bearer padswitcher-web'};
      for(const name of ['session-id','thread-id','originator','user-agent','version','openai-beta','x-codex-turn-metadata'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
      const response=await this.fetch(new URL(route,s.baseUrl),{method:'POST',headers,body:JSON.stringify(webBody),redirect:'error',signal});touch();
      res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store'});
      if(response.body){const reader=response.body.getReader();for(;;){const x=await reader.read();if(x.done)break;touch();if(res.destroyed)throw Error('Disconnected');if(!res.write(Buffer.from(x.value)))await new Promise((resolve,reject)=>{
        const cleanup=()=>{res.off('drain',drain);res.off('close',close);};const drain=()=>{cleanup();resolve();},close=()=>{cleanup();reject(Error('Disconnected'));};res.once('drain',drain);res.once('close',close);
      });}}
      res.end();return true;
    }catch{errorResponse(res,502,'web_transport_error','GPT Web failed. No automatic replay, native fallback or account rotation was performed.');return true;}
    finally{this.active--;this.changed();}
  }
  async shutdown(){
    if(this.launchFlight)throw new UserError('Chờ bộ chạy GPT Web khởi động hoàn tất trước khi thoát.','WEB_BUSY');
    if(this.active)throw new UserError('GPT Web còn lượt đang chạy.','WEB_ACTIVE');
    this.stopping=true;try{await this.stopChildren();clearInterval(this.timer);this.timer=null;}finally{this.stopping=false;}
  }
}
module.exports={WebService,limitedResponse,errorResponse};
