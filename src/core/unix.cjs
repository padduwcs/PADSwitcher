'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {UserError}=require('./errors.cjs');
const {assertDirectory}=require('./files.cjs');
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const helper=()=>path.join(__dirname,'../assets/PADCodex').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');

function run(file,args,{input,env,timeout=20000,binary=false}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{env:env||process.env,stdio:['pipe','pipe','pipe']});
    let buffers=[],size=0,settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else {const out=Buffer.concat(buffers);resolve(binary?out:out.toString('utf8').trim());}};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new UserError('Thao tác hệ thống phản hồi quá lâu.','TIMEOUT'));},timeout);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024){child.kill('SIGKILL');finish(new UserError('Phản hồi vượt giới hạn.','OUTPUT_LIMIT'));}else buffers.push(chunk);});
    child.stderr.resume();
    child.on('error',()=>finish(new UserError('Không chạy được công cụ hệ thống. Kiểm tra cài đặt và quyền thực thi.','SYSTEM_OPERATION')));
    child.on('close',code=>finish(code===0?null:new UserError(args[0]==='--vault'?'Không mở được kho khóa hệ thống. Hãy mở khóa Keychain hoặc Secret Service/GNOME Keyring.':'Không hoàn tất được thao tác hệ thống.',''+(args[0]==='--vault'?'VAULT_ERROR':'SYSTEM_OPERATION'))));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
async function nativeExecutable(file) {
  try {
    const real=await fs.realpath(file),stat=await fs.stat(real);if(!stat.isFile()||!(stat.mode&0o111))return null;
    const h=await fs.open(real,'r');const b=Buffer.alloc(4);try{await h.read(b,0,4,0);}finally{await h.close();}
    if(![0x7f454c46,0xcffaedfe,0xcefaedfe,0xfeedfacf,0xfeedface,0xcafebabe,0xbebafeca].includes(b.readUInt32BE(0)))return null;
    return real;
  }catch{return null;}
}
function discoveryCandidates({env=process.env,home=os.homedir(),platform=process.platform,arch=process.arch}={}) {
  const dirs=(env.PATH||'').split(path.delimiter).filter(Boolean),cpu=arch==='arm64'?'aarch64':'x86_64';
  const triples=platform==='darwin'?[`${cpu}-apple-darwin`]:[`${cpu}-unknown-linux-musl`,`${cpu}-unknown-linux-gnu`];
  const pkg=`codex-${platform==='darwin'?'darwin':'linux'}-${arch==='arm64'?'arm64':'x64'}`;
  const roots=[...dirs.map(d=>path.resolve(d,'../lib/node_modules')),path.join(home,'.npm-global/lib/node_modules'),'/usr/local/lib/node_modules','/usr/lib/node_modules','/opt/homebrew/lib/node_modules'];
  return [...dirs.map(d=>path.join(d,'codex')),...roots.flatMap(r=>[path.join(r,'@openai/codex'),path.join(r,'@openai',pkg),path.join(r,'@openai/codex/node_modules/@openai',pkg)].flatMap(p=>triples.flatMap(t=>['bin','codex'].map(b=>path.join(p,'vendor',t,b,'codex')))))];
}
async function findCodex(custom,options) {
  for(const candidate of custom?[custom]:discoveryCandidates(options)){if(!path.isAbsolute(candidate))continue;const real=await nativeExecutable(candidate);if(real)return real;}
  throw new UserError('Chưa tìm thấy Codex CLI native. Cài Codex hoặc chọn executable codex trong Cài đặt.','CODEX_MISSING');
}
async function findGatewayCodex(custom) {
  if(custom)return findCodex(custom);
  const cpu=process.arch==='arm64'?'aarch64':'x86_64',target=process.platform==='darwin'?`macos-${cpu}`:`linux-${cpu}`;
  for(const folder of ['.vscode','.vscode-insiders','.vscode-server','.vscode-server-insiders','.cursor','.cursor-server','.windsurf']){
    const root=path.join(os.homedir(),folder,'extensions');
    const entries=await fs.readdir(root).catch(()=>[]);
    for(const name of entries.filter(n=>/^openai\.chatgpt-\d+\./.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
      const real=await nativeExecutable(path.join(root,name,'bin',target,'codex'));if(real)return real;
    }
  }
  return findCodex();
}
async function protectDirectory(root) {
  await assertDirectory(root);const stat=await fs.stat(root);
  if(stat.uid!==process.getuid())throw new UserError('Thư mục dữ liệu không thuộc người dùng hiện tại.','UNSAFE_PATH');
  await fs.chmod(root,0o700);
}
async function processes() {
  const output=await run('/bin/ps',['-u',String(process.getuid()),'-o','pid=,ppid=,comm=']);
  return output.split('\n').filter(Boolean).map(line=>{
    const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);if(!match)throw new UserError('Không đọc được danh sách tiến trình.','PROCESS_CHECK_FAILED');
    return {ProcessId:Number(match[1]),ParentProcessId:Number(match[2]),Name:path.basename(match[3]),ExecutablePath:match[3]};
  });
}
function blockers(list,ownPids=[]) {
  const own=new Set([process.pid,...ownPids]);
  return list.filter(p=>!own.has(p.ProcessId)&&(/^(codex(?:[-_].*)?|ChatGPT|Code|Code - Insiders|code|code-insiders|Cursor|cursor|Windsurf|windsurf)$/i.test(p.Name)||/\/(?:Visual Studio Code(?: - Insiders)?|Cursor|Windsurf|ChatGPT|Codex)\.app\//i.test(p.ExecutablePath||'')));
}
function terminal(command,args=[],{cwd=os.homedir(),env={}}={}) {
  // Only the launch settings below go into a private descriptor. Never persist the
  // complete app environment: it can contain unrelated credentials.
  const allowed=new Set(['PATH','CODEX_HOME','PADSWITCHER_CONNECTION_FILE','PADSWITCHER_VAULT_ROOT','PADSWITCHER_PRIVATE_SESSION','PADSWITCHER_SESSION_IDENTITY','PADSWITCHER_KAGGLE_ROOT','PADSWITCHER_KAGGLE_START','PADSWITCHER_KAGGLE_HELPER']);
  const selected=Object.fromEntries(Object.entries(env).filter(([key])=>allowed.has(key)));
  const child=spawn(helper(),['--terminal'],{env:process.env,stdio:['pipe','ignore','ignore']});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({command,args,cwd,env:selected}));
  return child;
}
function createUnixPlatform(root) {
  return {kind:'unix',helperName:'PADCodex',jetbrainsHelperName:'PADJetBrains',run,protectDirectory,processes,blockers,findCodex,findGatewayCodex,
    helperSource:helper(),pythonCandidates:['python3','python'],kaggleExecutable:'kaggle',
    validPython:file=>/^python(?:\d+(?:\.\d+)*)?$/.test(path.basename(file)),
    isSessionProcess:p=>p.Name==='PADCodex',
    vscodeSettings:()=>path.join(process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support'):(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config')),'Code','User','settings.json'),
    dpapi:(bytes,decrypt=false)=>run(helper(),['--vault',decrypt?'decrypt':'encrypt'],{input:bytes,binary:true,env:{...process.env,PADSWITCHER_VAULT_ROOT:root},timeout:60000}),
    launchCli:({executable,home,workspace,identity,desktop,resume})=>terminal(helper(),['--session',executable,...(resume?['resume']:[])],{cwd:workspace,env:{CODEX_HOME:home,PADSWITCHER_VAULT_ROOT:root,PADSWITCHER_PRIVATE_SESSION:desktop?'0':'1',PADSWITCHER_SESSION_IDENTITY:identity}}),
    terminal,quote,
  };
}
module.exports={createUnixPlatform,run,quote,nativeExecutable,discoveryCandidates,findCodex,findGatewayCodex,protectDirectory,processes,blockers,terminal};
