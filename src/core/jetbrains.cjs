'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {parse,modify,applyEdits}=require('jsonc-parser');
const {atomicWrite,readLimited,assertDirectory,exists}=require('./files.cjs');
const {UserError}=require('./errors.cjs');
const AGENT='Codex · PADSwitcher';
const equal=require('node:util').isDeepStrictEqual;
function settings(text){
  const errors=[],v=parse(text.replace(/^\uFEFF/,''),errors,{allowTrailingComma:false});
  if(errors.length||!v||typeof v!=='object'||Array.isArray(v)||v.agent_servers&&(typeof v.agent_servers!=='object'||Array.isArray(v.agent_servers)))throw new UserError('acp.json của JetBrains chưa hợp lệ. Sửa tệp trước khi thiết lập.', 'JETBRAINS_SETTINGS');
  return v;
}
async function dirs(root){try{await assertDirectory(root);return (await fs.readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&!x.isSymbolicLink()).map(x=>path.join(root,x.name));}catch{return [];}}
async function discover(local=process.env.LOCALAPPDATA||''){
  const roots=[];
  for(const vendor of ['Google','JetBrains'])for(const ide of await dirs(path.join(local,vendor)))if(/(?:AndroidStudio|IntelliJIdea|IdeaIC|PyCharm|WebStorm|Rider|CLion|GoLand|RustRover|PhpStorm)/i.test(path.basename(ide)))roots.push(path.join(ide,'acp-agents','.runtimes','node'));
  for(const root of roots)for(const runtime of (await dirs(root)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
    const node=path.join(runtime,'bin','node.exe');if(!await exists(node))continue;
    for(const cache of await dirs(path.join(runtime,'npm-cache','_npx'))){
      const pkg=path.join(cache,'node_modules','@agentclientprotocol','codex-acp');
      try{
        const meta=JSON.parse((await readLimited(path.join(pkg,'package.json'))).toString('utf8'));
        if(meta.name!=='@agentclientprotocol/codex-acp'||meta.version!=='2.1.1')continue;
        const script=path.join(pkg,'dist','index.js'),license=path.join(pkg,'LICENSE');
        await readLimited(script,8*1024*1024);await readLimited(license);
        return {node,script,license,version:meta.version};
      }catch{}
    }
  }
  throw new UserError('Cài Codex 2.1.1 trong AI Assistant → Agents, mở Codex một lần rồi thiết lập lại. Chưa tìm thấy adapter tương thích trên máy.', 'JETBRAINS_ADAPTER');
}
class JetBrainsIntegration{
  constructor(service,options={}){
    this.service=service;this.file=options.file||path.join(os.homedir(),'.jetbrains','acp.json');
    this.record=path.join(service.root,'jetbrains-integration.json');this.runtime=path.join(service.root,'gateway','jetbrains');
    this.discover=options.discover||discover;this.flight=null;
  }
  async text(){return await exists(this.file)?(await readLimited(this.file,4*1024*1024)).toString('utf8'):'{}';}
  async status(){
    try{
      const config=settings(await this.text()),record=await exists(this.record)?JSON.parse((await readLimited(this.record)).toString('utf8')):null;
      const configured=!!record&&record.file===this.file&&equal(config.agent_servers?.[AGENT],record.entry);
      const runtimePresent=configured&&await exists(record.entry.command)&&await exists(path.join(this.runtime,'codex-acp.mjs'))&&await exists(path.join(this.runtime,'PADJetBrains.exe'))&&await exists(path.join(this.runtime,'launcher.cjs'))&&await exists(path.join(this.runtime,'runtime.json'));
      return {configuration:configured?'configured':'notConfigured',runtimePresent};
    }catch{return {configuration:'unknown',runtimePresent:false};}
  }
  async exclusive(operation){if(this.flight)throw new UserError('Thiết lập JetBrains đang chạy. Hãy chờ hoàn tất.', 'BUSY');this.flight=Promise.resolve().then(operation);try{return await this.flight;}finally{this.flight=null;}}
  async configure(helper){return this.exclusive(async()=>{
    if(!helper||!await exists(helper)||this.service.gateway?.status!=='ready')throw new UserError('Bật kết nối Codex trước khi thiết lập JetBrains.', 'GATEWAY_STOPPED');
    if(this.service.gateway.view().connected?.jetbrains)throw new UserError('Đóng chat Codex · PADSwitcher trong JetBrains trước khi thiết lập lại.', 'JETBRAINS_ACTIVE');
    const original=await this.text(),values=settings(original),old=await exists(this.record)?JSON.parse((await readLimited(this.record)).toString('utf8')):null;
    if(old&&old.file!==this.file)throw new UserError('Tệp cấu hình JetBrains không khớp bản đã lưu.', 'JETBRAINS_SETTINGS');
    const current=values.agent_servers?.[AGENT];
    if(current&&(!old||!equal(current,old.entry)))throw new UserError('Agent Codex · PADSwitcher đã được chỉnh riêng. Giữ nguyên cấu hình hiện tại; đổi tên agent đó trước khi thiết lập.', 'JETBRAINS_CHANGED');
    const adapter=await this.discover();await fs.mkdir(this.runtime,{recursive:true});await assertDirectory(this.runtime);
    await this.service.platform.protectDirectory(this.runtime);
    await atomicWrite(path.join(this.runtime,'codex-acp.mjs'),await readLimited(adapter.script,8*1024*1024));
    await atomicWrite(path.join(this.runtime,'LICENSE-codex-acp.txt'),await readLimited(adapter.license));
    await atomicWrite(path.join(this.runtime,'PADJetBrains.exe'),await readLimited(path.join(__dirname,'../assets/PADCodex.exe'),2*1024*1024));
    await atomicWrite(path.join(this.runtime,'launcher.cjs'),await readLimited(path.join(__dirname,'jetbrains-launcher.cjs')));
    await atomicWrite(path.join(this.runtime,'runtime.json'),JSON.stringify({version:adapter.version,helper:path.join(this.runtime,'PADJetBrains.exe'),connection:path.join(this.service.root,'gateway','connection.json')}));
    const entry={command:adapter.node,args:[path.join(this.runtime,'launcher.cjs')],env:{}};
    const next=applyEdits(original,modify(original,['agent_servers',AGENT],entry,{formattingOptions:{insertSpaces:true,tabSize:2,eol:original.includes('\r\n')?'\r\n':'\n'}}));
    if(await this.text()!==original)throw new UserError('JetBrains vừa thay đổi acp.json. Hãy thiết lập lại.', 'JETBRAINS_CHANGED');
    await fs.mkdir(path.dirname(this.file),{recursive:true});await assertDirectory(path.dirname(this.file));
    await atomicWrite(this.record,JSON.stringify({file:this.file,entry}));await atomicWrite(this.file,next);
    return {agent:AGENT};
  });}
  async restore(){return this.exclusive(async()=>{
    if(!await exists(this.record))throw new UserError('Chưa có kết nối JetBrains do PADSwitcher thiết lập.', 'JETBRAINS_SETTINGS');
    const record=JSON.parse((await readLimited(this.record)).toString('utf8')),text=await this.text(),values=settings(text);
    if(record.file!==this.file||!equal(values.agent_servers?.[AGENT],record.entry))throw new UserError('Agent JetBrains đã được bạn chỉnh. PADSwitcher giữ nguyên cấu hình hiện tại.', 'JETBRAINS_CHANGED');
    const next=applyEdits(text,modify(text,['agent_servers',AGENT],undefined,{formattingOptions:{insertSpaces:true,tabSize:2}}));
    if(await this.text()!==text)throw new UserError('JetBrains vừa thay đổi acp.json. Hãy thử lại.', 'JETBRAINS_CHANGED');
    await atomicWrite(this.file,next);await fs.unlink(this.record);
  });}
}
module.exports={JetBrainsIntegration,discover,settings,AGENT};
