'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const windows=require('./windows.cjs');
const {atomicWrite,readLimited,assertDirectory,exists}=require('./files.cjs');
const {UserError}=require('./errors.cjs');

const START='# >>> PADSwitcher Kaggle >>>',END='# <<< PADSwitcher Kaggle <<<';
const shellError=()=>new UserError('Chưa cập nhật được profile PowerShell. Giữ nguyên profile và kiểm tra quyền / nội dung tệp.','KAGGLE_SHELL');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function decode(bytes){
  let encoding='utf8',bom=Buffer.alloc(0),body=bytes;
  if(bytes.subarray(0,3).equals(Buffer.from([239,187,191]))){bom=bytes.subarray(0,3);body=bytes.subarray(3);}
  else if(bytes.subarray(0,2).equals(Buffer.from([255,254]))){encoding='utf16le';bom=bytes.subarray(0,2);body=bytes.subarray(2);}
  const text=body.toString(encoding);
  if(!Buffer.from(text,encoding).equals(body)||text.includes('\0'))throw shellError();
  return {text,encode:next=>Buffer.concat([bom,Buffer.from(next,encoding)])};
}
function profileBlock(text){
  const start=text.indexOf(START),end=text.indexOf(END);
  if(start<0&&end<0)return null;
  if(start<0||end<start||text.indexOf(START,start+START.length)>=0||text.indexOf(END,end+END.length)>=0||
    (start>0&&text[start-1]!=='\n')||(end>0&&text[end-1]!=='\n'))throw shellError();
  const finish=end+END.length;
  if(finish<text.length&&!['\r','\n'].includes(text[finish]))throw shellError();
  return {start,end:finish+(text.slice(finish,finish+2)==='\r\n'?2:text[finish]==='\n'?1:0)};
}

class KaggleShell {
  constructor(root,adapters={}){this.root=root;this.folder=path.join(root,'terminal');this.script=path.join(this.folder,'padkaggle.ps1');this.profilePaths=adapters.shellProfilePaths;this.ps=adapters.ps||windows.ps;}
  async ensure(){
    await fs.mkdir(this.folder,{recursive:true});await assertDirectory(this.folder);
    for(const name of ['padkaggle.ps1','kaggle-reader.py']){
      const source=path.join(__dirname,name).replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
      const bytes=await readLimited(source),target=path.join(this.folder,name);
      if(!await exists(target)||!(await readLimited(target)).equals(bytes))await atomicWrite(target,bytes);
    }
  }
  async paths(){
    if(!this.profilePaths){const docs=JSON.parse(await this.ps("[Console]::Write((ConvertTo-Json -Compress -InputObject ([Environment]::GetFolderPath('MyDocuments'))))"));if(typeof docs!=='string'||!path.isAbsolute(docs))throw shellError();this.profilePaths=['WindowsPowerShell','PowerShell'].map(folder=>path.join(docs,folder,'profile.ps1'));}
    return this.profilePaths;
  }
  line(){return `if (Test-Path -LiteralPath ${quote(this.script)}) { . ${quote(this.script)} }`;}
  command(username){return `. ${quote(this.script)}; padkaggle use ${quote(username)}`;}
  async read(file){return await exists(file)?await readLimited(file):null;}
  async status(){
    const profiles=[];
    for(const file of await this.paths()){const bytes=await this.read(file),text=bytes?decode(bytes).text:'';const block=profileBlock(text);profiles.push({path:file,configured:!!block&&text.slice(block.start,block.end).includes(this.line())});}
    return {scriptPath:this.script,configured:profiles.every(p=>p.configured),profiles};
  }
  async configure(enabled){
    if(typeof enabled!=='boolean')throw shellError();
    await this.ensure();const plans=[];
    for(const file of await this.paths()){
      const before=await this.read(file),document=before?decode(before):{text:'',encode:text=>Buffer.from('\uFEFF'+text,'utf8')};
      if(document.text.includes('# SIG # Begin signature block'))throw new UserError('Profile PowerShell có chữ ký. Giữ nguyên tệp; dùng lệnh sao chép trong terminal hiện tại.','KAGGLE_SHELL_SIGNED');
      const {text}=document,block=profileBlock(text),eol=text.includes('\r\n')?'\r\n':'\n';
      const replacement=enabled?`${START}${eol}${this.line()}${eol}${END}${eol}`:'';
      const next=block?text.slice(0,block.start)+replacement+text.slice(block.end):text+(enabled?(text&&!text.endsWith('\n')?eol:'')+replacement:'');
      if(next!==text)plans.push({file,before,after:document.encode(next)});
    }
    const written=[];
    try{
      for(const plan of plans){
        await fs.mkdir(path.dirname(plan.file),{recursive:true});await assertDirectory(path.dirname(plan.file));
        const latest=await this.read(plan.file);if(!((!latest&&!plan.before)||(latest&&plan.before&&latest.equals(plan.before))))throw shellError();
        await atomicWrite(plan.file,plan.after);written.push(plan);
      }
    }catch(error){
      for(const plan of written.reverse()){const latest=await this.read(plan.file);if(latest?.equals(plan.after)){if(plan.before)await atomicWrite(plan.file,plan.before);else await fs.unlink(plan.file);}}
      throw shellError();
    }
    return this.status();
  }
}
module.exports={KaggleShell,decode,profileBlock};
