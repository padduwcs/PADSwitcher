'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {atomicWrite,readLimited,assertDirectory,exists}=require('./files.cjs');
const {profileBlock,decode}=require('./kaggle-shell.cjs');
const {quote}=require('./unix.cjs');
const {UserError}=require('./errors.cjs');
const START='# >>> PADSwitcher Kaggle >>>',END='# <<< PADSwitcher Kaggle <<<';
class UnixKaggleShell {
  constructor(root,adapters={}) {
    this.root=root;this.folder=path.join(root,'terminal');this.script=path.join(this.folder,'padkaggle.sh');
    this.bootstrap=path.join(this.folder,'bootstrap.sh');this.helper=path.join(this.folder,'PADCodex');this.toolsFile=path.join(this.folder,'tools.json');
    this.profilePaths=adapters.shellProfilePaths||[path.join(os.homedir(),'.bashrc'),path.join(process.env.ZDOTDIR||os.homedir(),'.zshrc')];
    this.source=adapters.helperSource||path.join(__dirname,'../assets/PADCodex').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
  }
  async ensure() {
    await fs.mkdir(this.folder,{recursive:true,mode:0o700});await assertDirectory(this.folder);await fs.chmod(this.folder,0o700);
    for(const [name,source] of [['PADCodex',this.source],['kaggle-reader.py',path.join(__dirname,'kaggle-reader.py').replace(/app\.asar([\\/])/,'app.asar.unpacked$1')]]) {
      const bytes=await readLimited(source,32*1024*1024),target=path.join(this.folder,name);
      if(!await exists(target)||!(await readLimited(target,32*1024*1024)).equals(bytes))await atomicWrite(target,bytes);
    }
    await fs.chmod(this.helper,0o700);
    const body=await readLimited(path.join(__dirname,'padkaggle.sh').replace(/app\.asar([\\/])/,'app.asar.unpacked$1'));
    await atomicWrite(this.script,`_PAD_KAGGLE_HELPER=${quote(this.helper)}\n_PAD_KAGGLE_ROOT=${quote(this.root)}\n`+body.toString('utf8'));
    await atomicWrite(this.bootstrap,`. ${quote(this.script)}\nif [ -n "\${PADSWITCHER_KAGGLE_START:-}" ]; then padkaggle use "$PADSWITCHER_KAGGLE_START"; fi\nunset PADSWITCHER_KAGGLE_START PADSWITCHER_KAGGLE_ROOT PADSWITCHER_KAGGLE_HELPER\n`);
  }
  async paths(){return this.profilePaths;}
  line(){return `[ ! -f ${quote(this.script)} ] || . ${quote(this.script)}`;}
  command(username){return `. ${quote(this.script)}; padkaggle use ${quote(username)}`;}
  async read(file){return await exists(file)?readLimited(file):null;}
  async status(){const profiles=[];for(const file of await this.paths()){const bytes=await this.read(file),text=bytes?decode(bytes).text:'',block=profileBlock(text);profiles.push({path:file,configured:!!block&&text.slice(block.start,block.end).includes(this.line())});}return {scriptPath:this.script,configured:profiles.every(p=>p.configured),profiles};}
  async configure(enabled) {
    if(typeof enabled!=='boolean')throw new UserError('Thiết lập terminal không hợp lệ.','KAGGLE_SHELL');
    await this.ensure();const plans=[],written=[];
    for(const file of await this.paths()) {
      const before=await this.read(file),document=before?decode(before):{text:'',encode:text=>Buffer.from(text,'utf8')};
      if(before&&(before.includes(0)||document.text.charCodeAt(0)===0xfeff))throw new UserError('Profile shell cần dùng UTF-8. Giữ nguyên tệp hiện tại.','KAGGLE_SHELL');
      const text=document.text,block=profileBlock(text),replacement=enabled?`${START}\n${this.line()}\n${END}\n`:'';
      const next=block?text.slice(0,block.start)+replacement+text.slice(block.end):text+(enabled?(text&&!text.endsWith('\n')?'\n':'')+replacement:'');
      if(next!==text)plans.push({file,before,after:document.encode(next)});
    }
    try {
      for(const plan of plans){await fs.mkdir(path.dirname(plan.file),{recursive:true});await assertDirectory(path.dirname(plan.file));const latest=await this.read(plan.file);if(!((!latest&&!plan.before)||(latest&&plan.before&&latest.equals(plan.before))))throw new UserError('Profile shell vừa thay đổi. Hãy thử lại.','KAGGLE_SHELL');await atomicWrite(plan.file,plan.after);written.push(plan);}
    }catch(error){for(const plan of written.reverse()){const latest=await this.read(plan.file);if(latest?.equals(plan.after)){if(plan.before)await atomicWrite(plan.file,plan.before);else await fs.unlink(plan.file);}}throw error;}
    return this.status();
  }
}
module.exports={UnixKaggleShell};
