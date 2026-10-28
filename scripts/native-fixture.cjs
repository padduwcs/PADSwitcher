'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
// Check the real native server's identity before any fixture mutates plugins or
// starts a turn. A launcher environment alone does not prove RPC isolation.
async function assertFixtureHome(initialized,expectedHome,fixtureRoot){
  const normalize=p=>process.platform==='win32'?p.toLowerCase():p;
  const root=await fs.realpath(fixtureRoot),expected=await fs.realpath(expectedHome),relative=path.relative(normalize(root),normalize(expected));
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Fixture Codex home is outside its disposable root.');
  if(typeof initialized?.codexHome!=='string'||normalize(await fs.realpath(initialized.codexHome))!==normalize(expected))throw Error('Native RPC connected outside the expected disposable Codex home.');
}
module.exports={assertFixtureHome};
