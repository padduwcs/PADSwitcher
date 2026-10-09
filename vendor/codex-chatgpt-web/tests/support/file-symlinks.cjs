'use strict';
// Capability probe: Windows without Developer Mode cannot create file symlinks.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function fileSymlinksSupported(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pad-web-symlink-probe-'));
  const target=path.join(dir,'target'),link=path.join(dir,'link');
  try{fs.writeFileSync(target,'fixture');fs.symlinkSync(target,link);return true;}
  catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return false;throw e;}
  finally{for(const p of [link,target])try{fs.unlinkSync(p);}catch{}fs.rmdirSync(dir);}
}
module.exports={fileSymlinksSupported};
