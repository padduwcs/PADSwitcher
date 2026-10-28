'use strict';
const path=require('node:path');
function createPlatform(_root,adapters={}) {
  return {kind:'windows',helperName:'PADCodex.exe',jetbrainsHelperName:'PADJetBrains.exe',...require('./windows.cjs'),...adapters};
}
function helperSource(platform={}) {
  return platform.helperSource||path.join(__dirname,'../assets',platform.helperName||'PADCodex.exe').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
}
module.exports={createPlatform,helperSource};
