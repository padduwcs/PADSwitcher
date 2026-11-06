'use strict';
// Tells the VS Code helper how to open PADSwitcher when Codex starts first. Removed
// when the user turns the connection off, so a deliberate stop stays stopped.
const fs=require('node:fs/promises');
const path=require('node:path');
const {atomicWrite,assertDirectory}=require('./files.cjs');
async function syncManagerLauncher(service,executable){
  const directory=path.join(service.root,'gateway'),file=path.join(directory,'launcher.json');
  if(!executable||!service.state.gatewayEnabled){await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});return;}
  await fs.mkdir(directory,{recursive:true});await assertDirectory(directory);
  await atomicWrite(file,JSON.stringify({version:1,executable}));
}
module.exports={syncManagerLauncher};
