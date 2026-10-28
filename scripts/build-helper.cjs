'use strict';
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
if(!fs.existsSync(compiler))throw Error('Windows .NET Framework 4.8 compiler is required.');
const target=path.resolve('src/assets/PADCodex.exe');
const source=path.resolve('src/helper/PADCodex.cs'),crypto=require('node:crypto');
const stamp=path.resolve('artifacts/native-helper-build.json'),digest=crypto.createHash('sha256').update(fs.readFileSync(__filename)).update(fs.readFileSync(source)).update(fs.readFileSync('src/assets/padswitcher.ico')).digest('hex');
try{const saved=JSON.parse(fs.readFileSync(stamp,'utf8'));if(saved.source===digest&&saved.binary===crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')){console.log('Native PADCodex transport is current.');process.exit(0);}}catch{}
const result=spawnSync(compiler,['/nologo','/optimize+','/target:exe','/reference:System.Web.Extensions.dll',`/win32icon:${path.resolve('src/assets/padswitcher.ico')}`,`/out:${target}`,source],{encoding:'utf8',windowsHide:true});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);
if(result.status!==0)process.exit(result.status||1);
fs.mkdirSync(path.dirname(stamp),{recursive:true});fs.writeFileSync(stamp,JSON.stringify({source:digest,binary:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')}));
console.log('Native PADCodex transport built.');
