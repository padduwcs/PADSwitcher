'use strict';
// Portable self-update from this project's GitHub releases. The new executable is
// written beside the current one and checked against the release's SHA-256 file. The
// old file stays on disk, so going back only means opening it again.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {UserError}=require('./errors.cjs');
const REPOSITORY='padduwcs/PADSwitcher';
const LATEST='https://api.github.com/repos/'+REPOSITORY+'/releases/latest';
const RELEASE_PAGE='https://github.com/'+REPOSITORY+'/releases/latest';
const CHECK_INTERVAL=6*60*60*1000,MAX_SIZE=512*1024*1024,MAX_NOTES=6000;
const VERSION=/^v?(\d+)\.(\d+)\.(\d+)$/;
const part=(value,index)=>Number(VERSION.exec(value)[index+1]);
function newer(candidate,current){
  if(!VERSION.test(candidate)||!VERSION.test(current))return false;
  for(let i=0;i<3;i++)if(part(candidate,i)!==part(current,i))return part(candidate,i)>part(current,i);
  return false;
}
function assetUrl(value){
  let url;try{url=new URL(value);}catch{return null;}
  return url.protocol==='https:'&&url.hostname==='github.com'&&url.pathname.startsWith('/'+REPOSITORY+'/releases/download/')?url.href:null;
}
function finalHost(value){try{const {protocol,hostname}=new URL(value);return protocol==='https:'&&(hostname==='github.com'||hostname.endsWith('.githubusercontent.com'));}catch{return false;}}
// Release notes are Vietnamese, a --- line, then English.
function notes(body){
  const [vi,en]=String(body||'').split(/\r?\n---\r?\n/);
  const clean=text=>(text||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*/g,'').trim().slice(0,MAX_NOTES);
  return {vi:clean(vi),en:clean(en)||clean(vi)};
}
const REPOINT=String.raw`
$ErrorActionPreference='SilentlyContinue'
$shell=New-Object -ComObject WScript.Shell
$folders=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'),(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))
foreach($folder in $folders){
  if(!(Test-Path -LiteralPath $folder)){continue}
  foreach($file in Get-ChildItem -LiteralPath $folder -Filter *.lnk -Recurse){
    $link=$shell.CreateShortcut($file.FullName)
    if($link.TargetPath -ieq $env:PAD_UPDATE_OLD){$link.TargetPath=$env:PAD_UPDATE_NEW;$link.WorkingDirectory=Split-Path -LiteralPath $env:PAD_UPDATE_NEW;$link.Save()}
  }
}`;
const RELAUNCH="$ErrorActionPreference='SilentlyContinue'; Wait-Process -Id $env:PAD_UPDATE_PID -Timeout 120; Start-Process -FilePath $env:PAD_UPDATE_NEW";
class Updater{
  constructor({current,executable=null,root,platform,onChange=()=>{},fetch:request=fetch,spawn:start=spawn,pid=process.pid}){
    Object.assign(this,{current,executable,root,platform,onChange,request,start,pid});
    this.status='idle';this.release=null;this.progress=0;this.error=null;this.checkedAt=null;this.file=null;this.controller=null;
  }
  view(){
    const r=this.release;
    return {current:this.current,status:this.status,supported:!!this.executable,version:r?.version||null,notes:r?.notes||null,publishedAt:r?.publishedAt||null,progress:this.progress,error:this.error,checkedAt:this.checkedAt};
  }
  set(fields){Object.assign(this,fields);this.onChange();}
  async json(url,accept){
    const response=await this.request(url,{headers:{accept,'user-agent':'PADSwitcher/'+this.current},redirect:'follow',signal:AbortSignal.timeout(20000)});
    if(!response.ok||(url!==LATEST&&response.url&&!finalHost(response.url)))throw new UserError('GitHub chưa trả lời yêu cầu cập nhật. Hãy thử lại sau.','UPDATE_CHECK');
    return response;
  }
  async check(){
    if(['checking','downloading'].includes(this.status))return this.view();
    const previous=this.status;this.set({status:'checking',error:null});
    try{
      const value=await (await this.json(LATEST,'application/vnd.github+json')).json(),version=VERSION.exec(value?.tag_name||'')?.[0].replace(/^v/,'');
      this.checkedAt=new Date().toISOString();
      if(!version||value.draft||value.prerelease||!newer(version,this.current)){this.set({status:'current',release:null});return this.view();}
      const name='PADSwitcher-'+version+'-Windows.exe',find=file=>(value.assets||[]).find(a=>a.name===file);
      const binary=find(name),checksum=find(name+'.sha256'),url=assetUrl(binary?.browser_download_url),sumUrl=assetUrl(checksum?.browser_download_url);
      if(!url||!sumUrl||!Number.isSafeInteger(binary.size)||binary.size<=0||binary.size>MAX_SIZE)throw new UserError('Bản phát hành mới thiếu tệp cài đặt hoặc checksum.','UPDATE_ASSET');
      this.release={version,name,url,sumUrl,size:binary.size,notes:notes(value.body),publishedAt:typeof value.published_at==='string'?value.published_at:null};
      this.set({status:'available',progress:0});
      if(this.executable)await this.reuse();
    }catch(error){this.set({status:previous,error:error instanceof UserError?error.message:'Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.'});}
    return this.view();
  }
  // An interrupted or earlier run may already have left the verified file in place.
  async reuse(){
    const target=path.join(path.dirname(this.executable),this.release.name);
    try{if(await this.digest(target)===await this.expected())this.set({status:'ready',file:target,progress:100});}catch{}
  }
  async digest(file){const hash=crypto.createHash('sha256'),handle=await fs.open(file,'r');try{for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk);}finally{await handle.close();}return hash.digest('hex');}
  async expected(){
    const text=await (await this.json(this.release.sumUrl,'application/octet-stream')).text(),sum=/^\s*([a-f0-9]{64})\b/i.exec(text)?.[1];
    if(!sum)throw new UserError('Tệp checksum của bản cập nhật không hợp lệ.','UPDATE_ASSET');
    return sum.toLowerCase();
  }
  async folder(){
    const beside=path.dirname(this.executable),probe=path.join(beside,'.pad-update-'+crypto.randomUUID());
    try{await fs.writeFile(probe,'');await fs.unlink(probe);return beside;}
    catch{const fallback=path.join(this.root,'updates');await fs.mkdir(fallback,{recursive:true});return fallback;}
  }
  async download(){
    if(!this.executable)throw new UserError('Bản này không tự cập nhật. Tải từ trang phát hành.','UPDATE_UNSUPPORTED');
    if(this.status==='ready')return this.view();
    if(this.status!=='available'||!this.release)throw new UserError('Chưa có bản cập nhật để tải.','UPDATE_NONE');
    const release=this.release,controller=new AbortController(),directory=await this.folder(),target=path.join(directory,release.name),temp=target+'.download';
    this.controller=controller;this.set({status:'downloading',progress:0,error:null});
    let handle;
    try{
      const expected=await this.expected(),response=await this.request(release.url,{headers:{'user-agent':'PADSwitcher/'+this.current},redirect:'follow',signal:controller.signal});
      if(!response.ok||!finalHost(response.url||release.url))throw new UserError('Không tải được bản cập nhật. Hãy thử lại sau.','UPDATE_DOWNLOAD');
      const hash=crypto.createHash('sha256'),reader=response.body.getReader();let received=0;
      handle=await fs.open(temp,'w',0o600);
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        received+=value.length;if(received>MAX_SIZE||received>release.size)throw new UserError('Tệp tải về lớn hơn khai báo của bản phát hành.','UPDATE_VERIFY');
        hash.update(value);await handle.write(value);
        const progress=Math.floor(received/release.size*100);if(progress!==this.progress)this.set({progress});
      }
      await handle.sync();await handle.close();handle=null;
      if(received!==release.size||hash.digest('hex')!==expected)throw new UserError('Tệp tải về không khớp checksum nên đã bị xóa. Hãy thử tải lại.','UPDATE_VERIFY');
      await fs.rename(temp,target);this.set({status:'ready',file:target,progress:100});
    }catch(error){
      await handle?.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});
      const cancelled=controller.signal.aborted;
      this.set({status:'available',progress:0,error:cancelled?null:error instanceof UserError?error.message:'Không tải được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.'});
      if(!cancelled&&!(error instanceof UserError))throw new UserError(this.error,'UPDATE_DOWNLOAD');if(!cancelled)throw error;
    }finally{this.controller=null;}
    return this.view();
  }
  cancel(){this.controller?.abort();}
  // Shortcuts keep working after the version in the file name changes. The new app
  // starts only once this process has released the single-instance lock.
  async install(){
    if(this.status!=='ready'||!this.file)throw new UserError('Bản cập nhật chưa sẵn sàng.','UPDATE_NONE');
    const env={...process.env,PAD_UPDATE_OLD:this.executable,PAD_UPDATE_NEW:this.file,PAD_UPDATE_PID:String(this.pid)};
    for(const name of Object.keys(env))if(/^(PORTABLE_EXECUTABLE_|ELECTRON_)/.test(name))delete env[name];
    await this.platform.ps(REPOINT,{env}).catch(()=>{});
    const child=this.start(this.platform.powershell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(RELAUNCH,'utf16le').toString('base64')],{env,detached:true,stdio:'ignore',windowsHide:true});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();
  }
}
module.exports={Updater,newer,notes,assetUrl,RELEASE_PAGE,CHECK_INTERVAL};
