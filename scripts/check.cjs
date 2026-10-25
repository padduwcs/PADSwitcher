'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let failures = 0;
function visit(folder) { for (const file of fs.readdirSync(folder,{withFileTypes:true})) { const target = path.join(folder,file.name); if (file.isDirectory()) visit(target); else if (/\.(cjs|js)$/.test(file.name)) { const result = spawnSync(process.execPath,['--check',target],{encoding:'utf8'}); if (result.status !== 0) { process.stderr.write(result.stderr); failures++; } } } }
for (const folder of ['src','scripts','test']) if (fs.existsSync(folder)) visit(folder);
if(process.platform==='win32'){
  const script="$tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseFile($env:PADSWITCHER_SYNTAX_FILE,[ref]$tokens,[ref]$errors)|Out-Null; if($errors.Count){[Console]::Error.Write('PowerShell helper syntax invalid.');exit 1}";
  const result=spawnSync(require('../src/core/windows.cjs').powershell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,env:{...process.env,PADSWITCHER_SYNTAX_FILE:path.resolve('src/core/padkaggle.ps1')}});
  if(result.status!==0){process.stderr.write(result.stderr||'PowerShell syntax check failed.');failures++;}
}
if(process.platform!=='win32'){
  for(const file of ['src/core/padkaggle.sh','scripts/wsl-dev.sh','scripts/linux-test-session.sh','scripts/setup-linux.sh','scripts/start-linux.sh']){
    const result=spawnSync('/bin/bash',['-n',file],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr||'Shell syntax check failed.');failures++;}
  }
}
if (failures) process.exitCode = 1; else console.log('Syntax checks passed.');
