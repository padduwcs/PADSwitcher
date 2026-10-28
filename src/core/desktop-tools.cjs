'use strict';
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {helperSource}=require('./platform.cjs');
const validPipe=value=>typeof value==='string'&&/^\\\\\.\\pipe\\[A-Za-z0-9_.{}-]{1,200}$/.test(value);
// The helper restricts the pipe ACL and verifies the destination server's user.
class DesktopToolsPipe {
  start(){
    this.path='\\\\.\\pipe\\PADSwitcher-tools-'+crypto.randomUUID();
    this.child=spawn(helperSource(),['--tools-pipe',String(process.pid),this.path],{stdio:['pipe','ignore','ignore'],windowsHide:true});
    this.child.on('error',()=>{this.failed=true;});this.child.on('close',()=>{this.failed=true;});this.child.stdin.on('error',()=>{this.failed=true;});
    return this.path;
  }
  bind(target,allowChange=true){
    if(!this.child||this.failed||!validPipe(target)||target===this.path||this.target&&target!==this.target&&!allowChange)return false;
    this.child.stdin.write(target+'\n');this.target=target;return true;
  }
  stop(){this.child?.stdin.end();this.child?.kill();this.child=null;this.path=null;this.target=null;}
}
module.exports={DesktopToolsPipe,validPipe};
