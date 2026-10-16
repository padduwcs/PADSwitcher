'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const unix=require('../src/core/unix.cjs');
const {UnixKaggleShell}=require('../src/core/kaggle-shell-unix.cjs');
const {WebSocketServer}=require('ws');
const {CodexRpc}=require('../src/core/rpc.cjs');
const native=process.platform!=='win32';
const helper=path.resolve(__dirname,'../src/assets/PADCodex');
async function temporary(t){const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-unix-test-')));await fs.chmod(dir,0o700);t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function until(fn){for(let i=0;i<100;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for isolated process');}

test('Unix command quoting treats paths and shell metacharacters as data',()=>{
  assert.equal(unix.quote("space ' quote; $(touch /tmp/no)"),"'space '\\'' quote; $(touch /tmp/no)'");
});
test('Unix process blockers recognize macOS IDE app bundles without blocking unrelated Electron apps',()=>{
  const list=[{ProcessId:1234,Name:'Electron',ExecutablePath:'/Applications/Visual Studio Code.app/Contents/MacOS/Electron'},{ProcessId:1235,Name:'Electron',ExecutablePath:'/Applications/Other.app/Contents/MacOS/Electron'},{ProcessId:process.pid,Name:'codex'}];
  assert.deepEqual(unix.blockers(list).map(p=>p.ProcessId),[1234]);
});
test('Unix discovery selects executable native binaries and rejects npm shell shims',{skip:!native},async t=>{
  const root=await temporary(t),bin=path.join(root,'bin');await fs.mkdir(bin);
  await fs.writeFile(path.join(bin,'codex'),'#!/bin/sh\nexit 99\n',{mode:0o755});
  const options={env:{PATH:bin},home:root,platform:'linux',arch:'x64'};
  await assert.rejects(unix.findCodex(undefined,options),{code:'CODEX_MISSING'});
  const binary=path.join(root,'lib/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');await fs.mkdir(path.dirname(binary),{recursive:true});await fs.writeFile(binary,Buffer.from([0x7f,0x45,0x4c,0x46]),{mode:0o755});
  assert.equal(await unix.findCodex(undefined,options),binary);
  await assert.rejects(unix.findCodex(path.join(root,'missing'),options),{code:'CODEX_MISSING'});
});
test('Unix shell profiles preserve user content, install once and remove only the managed block',{skip:!native},async t=>{
  const root=await temporary(t),profiles=[path.join(root,'.bashrc'),path.join(root,'.zshrc')],shell=new UnixKaggleShell(root,{shellProfilePaths:profiles});
  await fs.writeFile(profiles[0],'# own shell config\nexport KEEP=one\n');await fs.writeFile(profiles[1],'# zsh config\n');
  assert.equal((await shell.configure(true)).configured,true);const installed=await fs.readFile(profiles[0],'utf8');assert(installed.startsWith('# own shell config'));
  await shell.configure(true);assert.equal(await fs.readFile(profiles[0],'utf8'),installed);
  await shell.configure(false);assert.equal(await fs.readFile(profiles[0],'utf8'),'# own shell config\nexport KEEP=one\n');
  assert.equal((await shell.status()).configured,false);
  await fs.writeFile(profiles[0],'# >>> PADSwitcher Kaggle >>>\nmissing end');await assert.rejects(shell.configure(true),{code:'KAGGLE_SHELL'});
  assert.equal(await fs.readFile(profiles[0],'utf8'),'# >>> PADSwitcher Kaggle >>>\nmissing end');
  assert.equal(await unix.run('/bin/bash',['--noprofile','--norc','-c',`. ${unix.quote(shell.script)}; padkaggle status`]),'No account selected');
});
test('native helper bridges authenticated JSON lines without using proxy environment',{skip:!native,timeout:15000},async t=>{
  const root=await temporary(t),token='a'.repeat(64);await fs.writeFile(path.join(root,'client-capability'),token,{mode:0o600});
  const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  let request;
  server.on('connection',(socket,req)=>{assert.equal(req.headers.authorization,'Bearer '+token);assert.equal(req.headers.origin,undefined);socket.on('message',line=>{request=JSON.parse(line);socket.send(JSON.stringify({id:request.id,result:{fixture:true}}));socket.close(1000);});});
  const connection=path.join(root,'connection.json');await fs.writeFile(connection,JSON.stringify({version:1,url:`ws://127.0.0.1:${server.address().port}`,tokenFile:path.join(root,'client-capability'),executable:'/bin/true',home:root}),{mode:0o600});
  const child=spawn(helper,['app-server'],{env:{...process.env,PADSWITCHER_CONNECTION_FILE:connection,PADSWITCHER_CLIENT_KIND:'jetbrains',HTTP_PROXY:'http://127.0.0.1:1'},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'));
  let output='',diagnostics='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>diagnostics+=b);const close=new Promise(r=>child.once('close',r));child.stdin.on('error',()=>{});child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'fixture'}}})+'\n');
  assert.equal(await close,0);assert.equal(JSON.parse(output).result.fixture,true);assert.equal(request.params._padswitcherClient,'jetbrains');assert(!diagnostics.includes(token));
});
test('native backend supervisor kills its process group when the owning manager exits',{skip:!native,timeout:15000},async t=>{
  const root=await temporary(t),pidFile=path.join(root,'backend.pid'),backend=path.join(root,'backend.sh'),owner=path.join(root,'owner.cjs');
  await fs.writeFile(backend,'#!/bin/sh\nprintf "%s" "$$" > "$1"\nsleep 60\n',{mode:0o700});
  await fs.writeFile(owner,"const fs=require('node:fs'),{spawn}=require('node:child_process');spawn(process.argv[2],['--host',String(process.pid),process.argv[3],process.argv[4]],{stdio:'ignore'});const timer=setInterval(()=>{if(fs.existsSync(process.argv[4])){clearInterval(timer);process.exit(0);}},10);");
  const child=spawn(process.execPath,[owner,helper,backend,pidFile],{stdio:'ignore'});await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
  const pid=Number(await fs.readFile(pidFile,'utf8'));assert(pid>1);
  await until(async()=>{try{process.kill(pid,0);if(process.platform==='linux'){const stat=await fs.readFile(`/proc/${pid}/stat`,'utf8');return /\) Z /.test(stat);}return false;}catch(error){if(error.code==='ESRCH'||error.code==='ENOENT')return true;throw error;}});
});
test('Unix RPC shutdown terminates a stubborn backend and descendants holding its pipes',{skip:!native,timeout:12000},async t=>{
  const root=await temporary(t),backend=path.join(root,'stubborn-backend.sh'),marker=path.join(root,'started');
  await fs.writeFile(backend,`#!/bin/sh\ntrap '' TERM\nprintf ready > ${unix.quote(marker)}\nwhile IFS= read -r line; do :; done\nsleep 60\n`,{mode:0o700});
  const rpc=new CodexRpc(backend,root);t.after(()=>rpc.child.kill('SIGKILL'));
  await until(()=>fs.stat(marker).then(()=>true,()=>false));await rpc.close();assert.equal(rpc.closed,true);assert.notEqual(rpc.child.exitCode,null);
});
