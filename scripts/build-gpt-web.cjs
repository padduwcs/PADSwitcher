'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'vendor/codex-chatgpt-web');
const target=path.join(root,'artifacts/gpt-web/companion');
const bunRoot=path.join(root,'artifacts/build-tools'),bun=path.join(bunRoot,'node_modules/@oven/bun-windows-x64/bin/bun.exe');
if(process.platform!=='win32'||process.arch!=='x64')throw Error('The PADSwitcher Web companion currently targets Windows x64.');
function run(exe,args,cwd){const r=spawnSync(exe,args,{cwd,stdio:'inherit',windowsHide:true,env:{...process.env,CODEX_WEB_GPT_BUN:bun}});if(r.error)throw r.error;if(r.status!==0)throw Error('Web companion build failed: '+args[0]);}
function npm(args,cwd){run(process.execPath,[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),...args],cwd);}
const hash=crypto.createHash('sha256');
function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','dist','build','release','.launcher-runtime'].includes(entry.name))continue;const file=path.join(folder,entry.name);if(entry.isDirectory())visit(file);else{hash.update(path.relative(source,file));hash.update(fs.readFileSync(file));}}}
visit(source);hash.update(fs.readFileSync(__filename));const digest=hash.digest('hex'),stamp=path.join(root,'artifacts/gpt-web/build.json');
if(!process.argv.includes('--force')&&fs.existsSync(stamp)&&fs.existsSync(path.join(target,'PADGPTWeb.exe'))){const x=JSON.parse(fs.readFileSync(stamp,'utf8'));if(x.digest===digest){console.log('GPT Web companion is up to date.');process.exit(0);}}
fs.mkdirSync(bunRoot,{recursive:true});
if(!fs.existsSync(bun))npm(['install','--prefix',bunRoot,'--ignore-scripts','--no-audit','--no-fund','@oven/bun-windows-x64@1.4.0'],root);
run(bun,['install','--frozen-lockfile','--ignore-scripts'],source);
run(bun,['install','--frozen-lockfile','--ignore-scripts'],path.join(source,'launcher'));
run(bun,['run','typecheck'],source);
run(bun,['run','build'],path.join(source,'launcher'));
run(bun,['run','build:runtime'],path.join(source,'launcher'));
const builder=require.resolve('electron-builder/out/cli/cli.js',{paths:[path.join(source,'launcher')]});
run(process.execPath,[builder,'--win','--x64','--dir','--publish','never','--config.appId=personal.pad.padswitcher.gptweb','--config.productName=PADGPTWeb','--config.win.signExecutable=false'],path.join(source,'launcher'));
const built=path.join(source,'launcher/release/win-unpacked');
// Deletion is confined to the fixed, verified build artifact directory.
if(path.resolve(target)!==path.join(root,'artifacts','gpt-web','companion'))throw Error('Unsafe Web build destination');
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});fs.cpSync(built,target,{recursive:true});
fs.copyFileSync(path.join(source,'LICENSE'),path.join(target,'LICENSE-codex-chatgpt-web.txt'));
fs.writeFileSync(stamp,JSON.stringify({version:1,upstream:'307763887a8ba61143ac12815856f4f0d92885d2',digest},null,2)+'\n');
console.log('Packaged GPT Web companion is ready.');
