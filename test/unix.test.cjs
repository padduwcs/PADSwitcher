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
test('Linux test session preserves desktop sockets while isolating keyring storage',{skip:process.platform!=='linux'},async t=>{
  const root=await temporary(t),bin=path.join(root,'bin'),runtime=path.join(root,'desktop-runtime'),log=path.join(root,'keyring-args');
  await fs.mkdir(bin);await fs.mkdir(runtime,{mode:0o700});
  const socket=path.join(runtime,'wayland-test'),server=require('node:net').createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await fs.writeFile(path.join(bin,'gnome-keyring-daemon'),'#!/bin/sh\n/bin/cat >/dev/null\nprintf "%s\\n" "$@" > "$PAD_TEST_KEYRING_LOG"\n',{mode:0o700});
  const inspect=`const fs=require('node:fs'),path=require('node:path'),e=process.env;console.log(JSON.stringify({runtime:e.XDG_RUNTIME_DIR,display:e.WAYLAND_DISPLAY,config:e.XDG_CONFIG_HOME,data:e.XDG_DATA_HOME,cache:e.XDG_CACHE_HOME,privateRuntime:(fs.statSync(e.XDG_RUNTIME_DIR).mode&0o777)===0o700,socket:e.WAYLAND_DISPLAY?fs.statSync(path.join(e.XDG_RUNTIME_DIR,e.WAYLAND_DISPLAY)).isSocket():null,control:e.GNOME_KEYRING_CONTROL||null,agent:e.SSH_AUTH_SOCK||null}));`;
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,PAD_TEST_KEYRING_LOG:log,XDG_RUNTIME_DIR:runtime,WAYLAND_DISPLAY:'wayland-test',GNOME_KEYRING_CONTROL:'/fixture/desktop-keyring',SSH_AUTH_SOCK:'/fixture/desktop-agent'};
  const run=()=>unix.run('/bin/sh',[path.resolve(__dirname,'../scripts/linux-test-session.sh'),process.execPath,'-e',inspect],{env});
  const desktop=JSON.parse(await run());
  assert.equal(desktop.runtime,runtime);assert.equal(desktop.display,'wayland-test');assert.equal(desktop.socket,true);assert.equal(desktop.control,null);assert.equal(desktop.agent,null);
  assert.equal(path.dirname(desktop.config),path.dirname(desktop.data));assert.equal(path.dirname(desktop.cache),path.dirname(desktop.data));
  const args=await fs.readFile(log,'utf8');assert(args.includes('--control-directory='+path.join(path.dirname(desktop.data),'runtime/keyring')));assert(!args.includes(runtime));
  assert.equal(await fs.stat(desktop.data).then(()=>true,()=>false),false,'temporary data is removed');
  delete env.XDG_RUNTIME_DIR;delete env.WAYLAND_DISPLAY;
  const headless=JSON.parse(await run());assert.equal(headless.privateRuntime,true);assert.equal(headless.runtime,path.join(path.dirname(headless.data),'runtime'));
  assert.equal(await fs.stat(headless.runtime).then(()=>true,()=>false),false,'headless fallback is removed');
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
  const copied=path.join(root,'PADCodex');await fs.copyFile(helper,copied);await fs.chmod(copied,0o700);
  const child=spawn(copied,['app-server'],{env:{...process.env,PADSWITCHER_CONNECTION_FILE:'',PADSWITCHER_CLIENT_KIND:'jetbrains',HTTP_PROXY:'http://127.0.0.1:1'},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'));
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
test('Unix discovery finds Homebrew, ~/.local/bin and nvm installs when a GUI PATH omits them',{skip:!native},async t=>{
  const root=await temporary(t),elf=Buffer.from([0x7f,0x45,0x4c,0x46]);
  const local=path.join(root,'.local/bin/codex');await fs.mkdir(path.dirname(local),{recursive:true});await fs.writeFile(local,elf,{mode:0o755});
  assert.equal(await unix.findCodex(undefined,{env:{PATH:'/usr/bin:/bin'},home:root,platform:'linux',arch:'x64'}),local);
  await fs.unlink(local);
  const nvm=path.join(root,'.nvm/versions/node/v24.18.1/lib/node_modules/@openai/codex/vendor/x86_64-unknown-linux-musl/codex/codex');
  await fs.mkdir(path.dirname(nvm),{recursive:true});await fs.writeFile(nvm,elf,{mode:0o755});
  assert.deepEqual(await unix.nvmRoots(root),[path.join(root,'.nvm/versions/node/v24.18.1/lib/node_modules')]);
  assert.equal(await unix.findCodex(undefined,{env:{PATH:''},home:root,platform:'linux',arch:'x64'}),nvm);
  const candidates=unix.discoveryCandidates({env:{PATH:''},home:root,platform:'darwin',arch:'arm64'});
  assert(candidates.includes('/opt/homebrew/bin/codex')&&candidates.includes('/usr/local/bin/codex'));
});
test('Unix shell setup writes only profiles the user shell reads and never replaces dotfile links',{skip:!native},async t=>{
  const root=await temporary(t),saved={HOME:process.env.HOME,SHELL:process.env.SHELL,ZDOTDIR:process.env.ZDOTDIR};
  t.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  process.env.HOME=root;process.env.SHELL='/bin/zsh';delete process.env.ZDOTDIR;
  const data=path.join(root,'data');await fs.mkdir(data,{mode:0o700});
  const shell=new UnixKaggleShell(data);
  assert.deepEqual(await shell.paths(),[path.join(root,'.zshrc')],'a zsh user without ~/.bashrc must not get one');
  process.env.SHELL='/bin/bash';await fs.writeFile(path.join(root,'.zshrc'),`# >>> PADSwitcher Kaggle >>>\n${shell.line()}\n# <<< PADSwitcher Kaggle <<<\n`);
  assert.deepEqual(await shell.paths(),[path.join(root,'.bashrc'),path.join(root,'.zshrc')],'a profile configured earlier stays covered');
  const target=path.join(root,'dotfiles-bashrc');await fs.writeFile(target,'# managed elsewhere\n');await fs.symlink(target,path.join(root,'.bashrc'));
  assert.equal((await shell.status()).configured,false);assert(String((await shell.status()).line).includes('padkaggle.sh'));
  await assert.rejects(shell.configure(true),{code:'KAGGLE_SHELL_LINK'});
  assert((await fs.lstat(path.join(root,'.bashrc'))).isSymbolicLink());assert.equal(await fs.readFile(target,'utf8'),'# managed elsewhere\n');
  await shell.ensure();assert((await fs.readFile(shell.bootstrap,'utf8')).startsWith('[ ! -f "$HOME/.bashrc" ] || . "$HOME/.bashrc"\n'));
});
test('Unix desktop switching asks to close IDEs only when they can share the desktop folder',async t=>{
  const {ProfileService}=require('../src/core/service.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-blockers-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const service=new ProfileService(root,{kind:'unix',processes:async()=>[{ProcessId:4242,Name:'code',ExecutablePath:'code'}]});
  assert.equal(service.state.settings.desktopHome,path.join(path.resolve(root),'codex-home'));
  assert.equal(service.state.settings.workspace,os.homedir(),'Finder/menu launches must not default to the process folder');
  assert.deepEqual(await service.desktopBlockers(),[]);
  service.state.settings.desktopHome=path.join(os.homedir(),'.codex');
  assert.deepEqual((await service.desktopBlockers()).map(p=>p.ProcessId),[4242]);
});
test('Unix store from 1.19.1-unix.1 moves a root launch folder to the home folder',{skip:!native},async t=>{
  const {fixture}=require('./helpers.cjs');
  const {data,adapter,service}=await fixture(t);await service.close();
  const file=path.join(data,'accounts.json'),stored=JSON.parse(await fs.readFile(file,'utf8'));stored.settings.workspace='/';await fs.writeFile(file,JSON.stringify(stored));
  const {ProfileService}=require('../src/core/service.cjs');
  const migrated=new ProfileService(data,{...adapter,kind:'unix'});await migrated.init();t.after(()=>migrated.close());
  assert.equal(migrated.state.settings.workspace,os.homedir());
});
