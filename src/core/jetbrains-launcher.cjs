'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
try{
  const runtime=JSON.parse(fs.readFileSync(path.join(__dirname,'runtime.json'),'utf8'));
  if(!path.isAbsolute(runtime.helper)||path.basename(runtime.helper)!=='PADJetBrains.exe'||!path.isAbsolute(runtime.connection)||path.basename(runtime.connection)!=='connection.json')throw Error('invalid bridge');
  const env={...process.env};
  for(const name of ['NODE_OPTIONS','NODE_PATH','OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','CODEX_CONFIG','DEFAULT_AUTH_REQUEST','APP_SERVER_LOGS','CODEX_ACCESS_TOKEN','ACCESS_TOKEN'])delete env[name];
  Object.assign(env,{CODEX_PATH:runtime.helper,MODEL_PROVIDER:'openai',NO_BROWSER:'1',PADSWITCHER_CLIENT_KIND:'jetbrains',PADSWITCHER_CONNECTION_FILE:runtime.connection});
  const child=spawn(process.execPath,[path.join(__dirname,'codex-acp.mjs')],{env,stdio:'inherit',windowsHide:true});
  child.on('error',()=>{console.error('Codex · PADSwitcher could not start. Open PADSwitcher and set up JetBrains again.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
}catch{console.error('Open PADSwitcher and set up JetBrains again.');process.exitCode=1;}
