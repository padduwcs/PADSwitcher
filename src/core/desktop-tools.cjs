'use strict';
const fs=require('node:fs');
const path=require('node:path');

// The native server starts before the GUI creates its tools socket. Give the
// server a stable private socket alias, then bind it when the GUI initializes.
// Plugin manifests retain their transport, environment and approval policy.
class DesktopToolsPipe {
  start(){
    this.directory=fs.mkdtempSync('/tmp/pad-desktop-tools-');
    fs.chmodSync(this.directory,0o700);
    this.path=path.join(this.directory,'app.sock');
    return this.path;
  }
  bind(target,allowChange=true){
    if(!this.path||typeof target!=='string'||!path.isAbsolute(target)||target===this.path)return false;
    if(this.target&&target!==this.target&&!allowChange)return false;
    try{
      const stat=fs.statSync(target);
      if(!stat.isSocket()||stat.uid!==process.getuid())return false;
      if(this.target===target)return true;
      const temporary=path.join(this.directory,'next.sock');
      fs.symlinkSync(target,temporary);
      try{fs.renameSync(temporary,this.path);}finally{fs.rmSync(temporary,{force:true});}
      this.target=target;return true;
    }catch{return false;}
  }
  stop(){if(this.directory)fs.rmSync(this.directory,{recursive:true,force:true});this.directory=null;this.path=null;this.target=null;}
}
module.exports={DesktopToolsPipe};
