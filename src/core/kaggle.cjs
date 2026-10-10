'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const windows = require('./windows.cjs');
const { UserError } = require('./errors.cjs');
const { exists, atomicWrite, readLimited, assertDirectory, profilePath } = require('./files.cjs');

const MESSAGES = {
  KAGGLE_TOKEN:'API token không hợp lệ. Dùng token được tạo trong cài đặt Kaggle.',
  KAGGLE_AUTH:'Token Kaggle đã hết hạn hoặc bị thu hồi. Cập nhật token của tài khoản này.',
  KAGGLE_IDENTITY:'Token thuộc tài khoản Kaggle khác. Chưa thay thông tin đã lưu.',
  KAGGLE_FORBIDDEN:'Kaggle từ chối quyền truy cập thông tin này.',
  KAGGLE_NOT_FOUND:'Không tìm thấy notebook Kaggle hoặc bạn chưa có quyền xem.',
  KAGGLE_RATE_LIMIT:'Kaggle đang giới hạn yêu cầu. Chờ trước khi làm mới lại.',
  KAGGLE_NETWORK:'Không đọc được Kaggle. Kiểm tra mạng rồi thử lại.',
  KAGGLE_RESPONSE:'Kaggle trả về dữ liệu chưa hỗ trợ. Kiểm tra phiên bản công cụ.',
  KAGGLE_DEPENDENCIES:'Cần Python 3.11+, kaggle 2.2.4+ và kagglesdk 0.1.37+. Mở Thiết lập Kaggle.',
  KAGGLE_PYTHON:'Không chạy được Python. Chọn python.exe trong Thiết lập Kaggle.',
  KAGGLE_TIMEOUT:'Đọc Kaggle quá lâu. Thông tin cũ được giữ; hãy thử lại sau.',
};
const fail = code => new UserError(MESSAGES[code] || MESSAGES.KAGGLE_RESPONSE, code);
const clean = (value, max=200) => String(value || '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const REF = /^[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,150}$/;
const RUN_STATUSES=['queued','running','complete','error','stopping','cancelled','saved','unknown'];
const optionalDate=value=>value==null||(typeof value==='string'&&Number.isFinite(Date.parse(value)));
const optionalText=(value,max=500)=>value==null||(typeof value==='string'&&value.length<=max);
function validSnapshot(p){
  if(!['ready','error','reauth'].includes(p.status)||p.label.length>80||p.workspace.length>32768)return false;
  if(['quotaAt','notebooksAt','verifiedAt','lastAttemptAt','lastTerminalAt'].some(key=>!optionalDate(p[key])))return false;
  if(['lastError','quotaError','notebooksError'].some(key=>!optionalText(p[key])))return false;
  if(p.quota!=null&&(!Array.isArray(p.quota)||p.quota.length>2||p.quota.some(q=>!q||!['GPU','TPU'].includes(q.resource)||!optionalDate(q.refreshAt)||['used','remaining','total','reserved'].some(key=>q[key]!=null&&(!Number.isFinite(q[key])||q[key]<0)))))return false;
  if(p.notebooks!=null&&(!Array.isArray(p.notebooks)||p.notebooks.length>32||p.notebooks.some(n=>!n||!REF.test(n.ref)||!optionalText(n.title,200)||!RUN_STATUSES.includes(n.status)||(n.accelerator!=null&&!['GPU','TPU','CPU'].includes(n.accelerator))||!optionalText(n.machineShape,80)||!optionalDate(n.lastRunAt)||!optionalText(n.error))))return false;
  return true;
}
function notebookRef(value) {
  let ref = String(value || '').trim();
  if(ref.startsWith('https://')) {
    let url; try { url=new URL(ref); } catch { throw fail('KAGGLE_REQUEST'); }
    if(!['www.kaggle.com','kaggle.com'].includes(url.hostname)||url.port||url.username||url.password)throw new UserError('Dùng đường dẫn notebook trên kaggle.com.', 'KAGGLE_REF');
    ref=url.pathname.replace(/^\/code\//,'').replace(/\/$/,'');
  }
  if(!REF.test(ref))throw new UserError('Nhập notebook dạng username/notebook-slug hoặc URL Kaggle.', 'KAGGLE_REF');
  return ref;
}
function credentials(token) {
  if(typeof token!=='string'||!/^[A-Za-z0-9_.-]{16,8192}$/.test(token.trim()))throw fail('KAGGLE_TOKEN');
  return token.trim();
}
function safeEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^KAGGLE_|^PADSWITCHER_KAGGLE_|^PYTHON(?:PATH|STARTUP|HOME)$/i.test(key)));
}
function runBridge(python, payload, timeout=90000, signal) {
  return new Promise((resolve,reject)=>{
    const child=spawn(python,['-E','-P',path.join(__dirname,'kaggle-reader.py').replace(/app\.asar([\\/])/,'app.asar.unpacked$1')],{env:safeEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',size=0,settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(result);};
    const cancel=()=>{child.kill();finish(fail('KAGGLE_CANCELLED'));};
    const timer=setTimeout(()=>{child.kill();finish(fail('KAGGLE_TIMEOUT'));},timeout);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>512*1024){child.kill();finish(fail('KAGGLE_RESPONSE'));}else output+=chunk.toString('utf8');});
    child.stderr.resume();
    child.on('error',()=>finish(fail('KAGGLE_PYTHON')));
    child.on('close',code=>{if(settled)return;try {const data=JSON.parse(output);if(code!==0||typeof data.ok!=='boolean')throw Error();finish(null,data);}catch{finish(fail('KAGGLE_RESPONSE'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  });
}

// No token in command arguments, launcher files, renderer state, or plaintext files.
const TERMINAL_SCRIPT = String.raw`$ErrorActionPreference='Stop'
try {
  Add-Type -AssemblyName System.Security
  $padKaggleEncrypted=[IO.File]::ReadAllBytes($env:PADSWITCHER_KAGGLE_VAULT)
  $padKaggleBytes=[Security.Cryptography.ProtectedData]::Unprotect($padKaggleEncrypted,[Text.Encoding]::UTF8.GetBytes('PADSwitcher/v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $padKaggleToken=[Text.Encoding]::UTF8.GetString($padKaggleBytes)
  Get-ChildItem Env: | Where-Object { $_.Name -like 'KAGGLE_*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:'+$_.Name) }
  $env:KAGGLE_API_TOKEN=$padKaggleToken
  $env:KAGGLE_USERNAME=$env:PADSWITCHER_KAGGLE_USERNAME
  $env:KAGGLE_KEY='PADSwitcher-token-only-no-legacy-key'
  $env:KAGGLE_CONFIG_DIR=$env:PADSWITCHER_KAGGLE_CONFIG
  $env:PATH=$env:PADSWITCHER_KAGGLE_SCRIPTS+[IO.Path]::PathSeparator+$env:PADSWITCHER_KAGGLE_PYTHON+[IO.Path]::PathSeparator+$env:PATH
  $Host.UI.RawUI.WindowTitle='Kaggle - '+$env:PADSWITCHER_KAGGLE_USERNAME
  Set-Location -LiteralPath $env:PADSWITCHER_KAGGLE_WORKSPACE
  Write-Host ('Kaggle: '+$env:PADSWITCHER_KAGGLE_USERNAME) -ForegroundColor Cyan
  Write-Host $env:PADSWITCHER_KAGGLE_HINT
  Write-Host 'kaggle --help'
} catch { Write-Host 'PADSwitcher: unable to prepare Kaggle terminal.' -ForegroundColor Red }
finally {
  if($padKaggleBytes){[Array]::Clear($padKaggleBytes,0,$padKaggleBytes.Length)}
  Remove-Variable padKaggleToken,padKaggleBytes,padKaggleEncrypted -ErrorAction SilentlyContinue
  Get-ChildItem Env: | Where-Object { $_.Name -like 'PADSWITCHER_KAGGLE_*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:'+$_.Name) }
}`;
async function launchTerminal(options) {
  const env={...safeEnvironment(),PADSWITCHER_KAGGLE_VAULT:options.vault,PADSWITCHER_KAGGLE_USERNAME:options.username,
    PADSWITCHER_KAGGLE_WORKSPACE:options.workspace,PADSWITCHER_KAGGLE_SCRIPTS:options.scriptsPath,
    PADSWITCHER_KAGGLE_CONFIG:options.configPath,PADSWITCHER_KAGGLE_HINT:options.locale==='en'?'Use Kaggle CLI here. Python commands run locally.':'Dùng Kaggle CLI tại đây. Lệnh Python thông thường chạy trên máy local.'};
  env.PADSWITCHER_KAGGLE_PYTHON=path.dirname(options.python);
  env.PADSWITCHER_KAGGLE_COMMAND=Buffer.from(TERMINAL_SCRIPT,'utf16le').toString('base64');
  env.PADSWITCHER_KAGGLE_SHELL=windows.powershell;
  const outer="$ErrorActionPreference='Stop'; Start-Process -WindowStyle Normal -FilePath $env:PADSWITCHER_KAGGLE_SHELL -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-EncodedCommand',$env:PADSWITCHER_KAGGLE_COMMAND)";
  await windows.ps(outer,{env});
}

class KaggleService extends EventEmitter {
  constructor(root, adapters={}) {
    super();this.root=path.join(path.resolve(root),'kaggle');this.file=path.join(this.root,'accounts.json');
    this.platform={...windows,...adapters};this.bridge=adapters.bridge||runBridge;this.launcher=adapters.launchTerminal||launchTerminal;
    this.state={version:1,accounts:[],settings:{pythonPath:'',autoRefresh:true}};
    this.tool=null;this.flights=new Map();this.editing=false;this.controllers=new Set();this.stopping=false;
  }
  async init() {
    await fs.mkdir(this.root,{recursive:true});await assertDirectory(this.root);await this.platform.protectDirectory(this.root);
    if(await exists(this.file)) {
      try { const parsed=JSON.parse((await readLimited(this.file,1024*1024)).toString('utf8'));
        if(parsed.version!==1||!Array.isArray(parsed.accounts)||parsed.accounts.length>100||typeof parsed.settings?.pythonPath!=='string'||typeof parsed.settings.autoRefresh!=='boolean')throw Error();
        const ids=new Set(),users=new Set();
        for(const p of parsed.accounts){profilePath(this.root,p.id);if(ids.has(p.id)||!/^\w[\w-]{0,79}$/.test(p.username)||users.has(p.username.toLowerCase())||typeof p.label!=='string'||typeof p.workspace!=='string'||!path.isAbsolute(p.workspace)||!Array.isArray(p.watch)||p.watch.length>20||p.watch.some(r=>!REF.test(r))||!validSnapshot(p))throw Error();ids.add(p.id);users.add(p.username.toLowerCase());}
        this.state=parsed;
      } catch {throw new UserError('Dữ liệu Kaggle bị lỗi. Giữ thư mục dữ liệu để kiểm tra.', 'KAGGLE_STORE');}
    }
    return this.view();
  }
  view() {
    return {settings:{pythonPath:this.state.settings.pythonPath,autoRefresh:this.state.settings.autoRefresh},tool:this.tool,editing:this.editing,storeError:this.initError||null,
      accounts:this.state.accounts.map(p=>({id:p.id,username:p.username,label:p.label,workspace:p.workspace,watch:[...p.watch],
        status:p.status,quota:p.quota||[],quotaAt:p.quotaAt||null,notebooks:p.notebooks||[],notebooksAt:p.notebooksAt||null,
        verifiedAt:p.verifiedAt||null,lastAttemptAt:p.lastAttemptAt||null,lastTerminalAt:p.lastTerminalAt||null,
        lastError:p.lastError||null,quotaError:p.quotaError||null,notebooksError:p.notebooksError||null,refreshing:this.flights.has(p.id)}))};
  }
  changed(){this.emit('change',this.view());}
  save(){const snapshot=JSON.stringify(this.state,null,2);const write=(this.saveFlight||Promise.resolve()).catch(()=>{}).then(()=>atomicWrite(this.file,snapshot));this.saveFlight=write;return write;}
  get(id){profilePath(this.root,id);const p=this.state.accounts.find(a=>a.id===id);if(!p)throw new UserError('Không tìm thấy tài khoản Kaggle.', 'KAGGLE_ACCOUNT');return p;}
  vault(id){return path.join(profilePath(this.root,id),'token.dpapi');}
  requireStore(){if(this.initError)throw new UserError(this.initError.message,this.initError.code);}
  async exclusive(fn){this.requireStore();if(this.stopping||this.editing)throw new UserError('Một thao tác Kaggle khác đang chạy.', 'BUSY');this.editing=true;this.changed();try{return await fn();}finally{this.editing=false;this.changed();}}
  async checkTools(force=false) {
    this.requireStore();
    if(this.stopping)throw fail('KAGGLE_CANCELLED');
    if(!force&&this.tool?.supported)return this.tool;
    if(this.toolFlight)return this.toolFlight;
    this.toolFlight=(async()=>{
      const candidates=this.state.settings.pythonPath?[this.state.settings.pythonPath]:['python.exe','python3.exe'];
      let found;
      for(const candidate of candidates){if(this.stopping)throw fail('KAGGLE_CANCELLED');try{const info=await this.executeBridge(candidate,{action:'probe'},15000);if(info.ok&&typeof info.executable==='string'&&path.isAbsolute(info.executable)){found||=info;if(info.supported===true&&typeof info.scriptsPath==='string'&&path.isAbsolute(info.scriptsPath)){found=info;break;}}}catch{}}
      if(this.stopping)throw fail('KAGGLE_CANCELLED');
      this.tool=found?{python:clean(found.python,40),kaggle:clean(found.kaggle,40)||null,kagglesdk:clean(found.kagglesdk,40)||null,executable:found.executable,scriptsPath:found.scriptsPath,supported:found.supported===true&&typeof found.scriptsPath==='string'&&path.isAbsolute(found.scriptsPath)}:{supported:false,code:'KAGGLE_PYTHON'};
      this.changed();return this.tool;
    })().finally(()=>{this.toolFlight=null;});return this.toolFlight;
  }
  async executeBridge(python,payload,timeout){if(this.stopping)throw fail('KAGGLE_CANCELLED');const controller=new AbortController();this.controllers.add(controller);try{return await this.bridge(python,payload,timeout,controller.signal);}finally{this.controllers.delete(controller);}}
  async request(payload) {const tool=await this.checkTools();if(!tool.supported)throw fail(tool.code||'KAGGLE_DEPENDENCIES');const r=await this.executeBridge(tool.executable,payload);if(!r.ok)throw fail(Object.hasOwn(MESSAGES,r.code)?r.code:'KAGGLE_RESPONSE');return r;}
  async loadToken(id){const bytes=await this.platform.dpapi(await readLimited(this.vault(id),32768),true);try{return credentials(bytes.toString('utf8'));}finally{bytes.fill(0);}}
  async add({id=null,token,label='',workspace}) {return this.exclusive(async()=>{
    token=credentials(token);await assertDirectory(workspace);if(!path.isAbsolute(workspace))throw new UserError('Chọn thư mục làm việc tuyệt đối.', 'KAGGLE_WORKSPACE');
    const previous=id?this.get(id):null;if(previous&&this.flights.has(id))throw new UserError('Chờ cập nhật Kaggle hoàn tất.', 'BUSY');
    const identity=await this.request({action:'verify',token,username:previous?.username});
    if(!/^\w[\w-]{0,79}$/.test(identity.username||''))throw fail('KAGGLE_RESPONSE');
    if(previous&&previous.username.toLowerCase()!==identity.username.toLowerCase())throw fail('KAGGLE_IDENTITY');
    if(!previous&&this.state.accounts.some(p=>p.username.toLowerCase()===identity.username.toLowerCase()))throw new UserError('Tài khoản Kaggle này đã được thêm. Dùng Cập nhật token.', 'KAGGLE_DUPLICATE');
    if(!previous&&this.state.accounts.length>=100)throw new UserError('Đã đạt giới hạn 100 tài khoản đã lưu.', 'KAGGLE_LIMIT');
    const p=previous||{id:crypto.randomUUID(),username:identity.username,watch:[],quota:[],notebooks:[]};
    const folder=profilePath(this.root,p.id);await fs.mkdir(folder,{recursive:true});await assertDirectory(folder);
    await fs.mkdir(path.join(folder,'cli'),{recursive:true});await assertDirectory(path.join(folder,'cli'));
    const backup=previous?await readLimited(this.vault(p.id),32768).catch(error=>{if(error.code==='ENOENT')return null;throw error;}):null,old=previous?{...p}:null;
    const plaintext=Buffer.from(token);let encrypted;try{encrypted=await this.platform.dpapi(plaintext);}finally{plaintext.fill(0);}
    try{await atomicWrite(this.vault(p.id),encrypted);}finally{encrypted.fill(0);}
    Object.assign(p,{label:clean(label,80)||identity.username,workspace:path.resolve(workspace),status:'ready',lastError:null,verifiedAt:new Date().toISOString()});
    if(!previous)this.state.accounts.push(p);
    try{await this.save();}catch(error){if(previous){Object.assign(p,old);if(backup)await atomicWrite(this.vault(p.id),backup);else await fs.unlink(this.vault(p.id));}else{this.state.accounts=this.state.accounts.filter(a=>a.id!==p.id);await fs.unlink(this.vault(p.id));}throw error;}finally{backup?.fill(0);}
    return p.id;
  });}
  async edit({id,label,workspace}){return this.exclusive(async()=>{const p=this.get(id);if(this.flights.has(id))throw new UserError('Chờ cập nhật Kaggle hoàn tất.', 'BUSY');await assertDirectory(workspace);if(!path.isAbsolute(workspace))throw new UserError('Chọn thư mục làm việc tuyệt đối.', 'KAGGLE_WORKSPACE');const old={label:p.label,workspace:p.workspace};p.label=clean(label,80)||p.username;p.workspace=path.resolve(workspace);try{await this.save();}catch(error){Object.assign(p,old);throw error;}});}
  async remove(id){return this.exclusive(async()=>{const p=this.get(id),index=this.state.accounts.indexOf(p);if(this.flights.has(id))throw new UserError('Chờ cập nhật Kaggle hoàn tất.', 'BUSY');this.state.accounts.splice(index,1);try{await this.save();}catch(error){this.state.accounts.splice(index,0,p);throw error;}try{await fs.unlink(this.vault(id));}catch(error){if(error.code!=='ENOENT'){this.state.accounts.splice(index,0,p);await this.save();throw error;}}});}
  async settings({pythonPath,autoRefresh}){return this.exclusive(async()=>{if(typeof pythonPath!=='string'||(pythonPath&&(!path.isAbsolute(pythonPath)||path.basename(pythonPath).toLowerCase()!=='python.exe'))||typeof autoRefresh!=='boolean')throw new UserError('Cấu hình Kaggle không hợp lệ.', 'KAGGLE_SETTINGS');if(this.toolFlight)throw new UserError('Một thao tác Kaggle khác đang chạy.','BUSY');const old=this.state.settings;this.state.settings={pythonPath,autoRefresh};try{await this.save();this.tool=null;}catch(error){this.state.settings=old;throw error;}});}
  async watch(id,value,remove=false){return this.exclusive(async()=>{const p=this.get(id),ref=notebookRef(value),old=[...p.watch];if(this.flights.has(id))throw new UserError('Chờ cập nhật Kaggle hoàn tất.', 'BUSY');if(remove)p.watch=p.watch.filter(r=>r!==ref);else if(!p.watch.includes(ref)){if(p.watch.length>=20)throw new UserError('Theo dõi tối đa 20 notebook ghim cho mỗi tài khoản.', 'KAGGLE_LIMIT');p.watch.push(ref);}try{await this.save();}catch(error){p.watch=old;throw error;}});}
  refresh(id) {
    const p=this.get(id);if(this.flights.has(id))return this.flights.get(id);if(this.editing||this.stopping)return Promise.resolve();
    const work=(async()=>{
      p.lastAttemptAt=new Date().toISOString();
      try {const token=await this.loadToken(id);const data=await this.request({action:'refresh',token,username:p.username,watch:p.watch});
        if(typeof data.username!=='string'||data.username.toLowerCase()!==p.username.toLowerCase())throw fail('KAGGLE_IDENTITY');
        const now=new Date().toISOString();p.status='ready';p.lastError=null;p.verifiedAt=now;
        if(Array.isArray(data.quota)){p.quota=data.quota.filter(q=>['GPU','TPU'].includes(q.resource)).slice(0,2).map(q=>({resource:q.resource,...Object.fromEntries(['used','remaining','total','reserved'].map(k=>[k,Number.isFinite(q[k])&&q[k]>=0?q[k]:null])),refreshAt:Number.isFinite(Date.parse(q.refreshAt))?q.refreshAt:null}));p.quotaAt=now;}
        p.quotaError=data.quotaError?MESSAGES[data.quotaError]||MESSAGES.KAGGLE_RESPONSE:null;
        if(Array.isArray(data.notebooks)){const rows=data.notebooks.filter(n=>n&&REF.test(n.ref)).slice(0,32).map(n=>({ref:n.ref,title:clean(n.title).replaceAll(token,'[redacted]'),status:['queued','running','complete','error','stopping','cancelled','saved'].includes(n.status)?n.status:'unknown',accelerator:['CPU','GPU','TPU'].includes(n.accelerator)?n.accelerator:null,machineShape:clean(n.machineShape,80).replaceAll(token,'[redacted]'),lastRunAt:Number.isFinite(Date.parse(n.lastRunAt))?n.lastRunAt:null,error:n.errorCode?MESSAGES[n.errorCode]||MESSAGES.KAGGLE_RESPONSE:null}));p.notebooks=data.notebooksError?[...rows,...(p.notebooks||[]).filter(n=>!rows.some(r=>r.ref===n.ref)).map(n=>({...n,status:'unknown'}))].slice(0,32):rows;if(!data.notebooksError)p.notebooksAt=now;}
        p.notebooksError=data.notebooksError?MESSAGES[data.notebooksError]||MESSAGES.KAGGLE_RESPONSE:null;
      } catch(error){if(error.code!=='KAGGLE_CANCELLED'){p.status=['KAGGLE_AUTH','KAGGLE_IDENTITY','KAGGLE_TOKEN'].includes(error.code)?'reauth':'error';p.lastError=MESSAGES[error.code]||MESSAGES.KAGGLE_NETWORK;}}
      await this.save();
    })();this.flights.set(id,work);this.changed();return work.finally(()=>{this.flights.delete(id);this.changed();});
  }
  async refreshAll(dueOnly=false) {
    if(this.refreshFlight)return this.refreshFlight;
    this.refreshFlight=(async()=>{const ids=this.state.accounts.filter(p=>{const age=Date.now()-Date.parse(p.lastAttemptAt);return !dueOnly||!Number.isFinite(age)||age<0||age>=120000;}).map(p=>p.id);let index=0;await Promise.all([0,1].map(async()=>{while(index<ids.length&&!this.stopping){const id=ids[index++];if(this.state.accounts.some(p=>p.id===id))await this.refresh(id);}}));})().finally(()=>{this.refreshFlight=null;});return this.refreshFlight;
  }
  async launch(id,locale='vi') {
    return this.exclusive(async()=>{const p=this.get(id);await assertDirectory(p.workspace);try{const token=await this.loadToken(id);const identity=await this.request({action:'verify',token,username:p.username});if(identity.username?.toLowerCase()!==p.username.toLowerCase())throw fail('KAGGLE_IDENTITY');}catch(error){if(['KAGGLE_AUTH','KAGGLE_IDENTITY','KAGGLE_TOKEN'].includes(error.code)){p.status='reauth';p.lastError=MESSAGES[error.code];await this.save();}throw error;}
      const tool=this.tool;const cli=path.join(tool.scriptsPath,'kaggle.exe');if(!await exists(cli))throw fail('KAGGLE_DEPENDENCIES');
      const configPath=path.join(profilePath(this.root,id),'cli');await assertDirectory(configPath);
      await this.launcher({vault:this.vault(id),username:p.username,workspace:p.workspace,python:tool.executable,scriptsPath:tool.scriptsPath,configPath,locale});
      p.lastTerminalAt=new Date().toISOString();await this.save();return true;});
  }
  async shutdown(){this.stopping=true;for(const controller of this.controllers)controller.abort();await Promise.allSettled([...this.flights.values(),this.refreshFlight,this.toolFlight,this.saveFlight].filter(Boolean));}
}
module.exports={KaggleService,notebookRef,runBridge,safeEnvironment,TERMINAL_SCRIPT,MESSAGES};
