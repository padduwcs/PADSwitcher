'use strict';
const path=require('node:path');

function createPlatform(root,adapters={}) {
  const windows=(adapters.kind|| (process.platform==='win32'?'windows':'unix'))==='windows';
  const base=windows?require('./windows.cjs'):require('./unix.cjs').createUnixPlatform(root);
  return {kind:windows?'windows':'unix',helperName:windows?'PADCodex.exe':'PADCodex',jetbrainsHelperName:windows?'PADJetBrains.exe':'PADJetBrains',...base,...adapters};
}
function helperSource(platform) {
  return platform.helperSource||path.join(__dirname,'../assets',platform.helperName).replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
}
module.exports={createPlatform,helperSource};
