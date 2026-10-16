'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{WebSocket}=require('ws');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const output=path.resolve(__dirname,'../dist-unix'),dirs=(await fs.readdir(output,{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>path.join(output,d.name));
  let asar,binary;
  for(const dir of dirs){const candidate=process.platform==='darwin'?path.join(dir,'PADSwitcher Unix.app','Contents','Resources','app.asar'):path.join(dir,'resources','app.asar');if(await fs.stat(candidate).then(s=>s.isFile(),()=>false)){asar=candidate;binary=process.platform==='darwin'?path.join(dir,'PADSwitcher Unix.app','Contents','MacOS','PADSwitcher Unix'):path.join(dir,'padswitcher-unix');break;}}
  if(!asar)throw Error('Packaged application was not found. Run npm run dist first.');
  for(const file of ['src/assets/PADCodex','src/core/padkaggle.sh','src/core/kaggle-reader.py']){const stat=await fs.stat(path.join(asar+'.unpacked',file));assert(stat.isFile());if(file.endsWith('/PADCodex'))assert(stat.mode&0o111,'Packaged helper is not executable');}
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-packaged-')));await fs.chmod(root,0o700);
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const env={...process.env,PADSWITCHER_APPDATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=spawn(binary,[`--remote-debugging-port=${port}`],{env,stdio:'ignore',detached:true});let launchError;child.on('error',e=>launchError=e);let socket;
  try {
    let page;for(let i=0;i<150;i++){if(launchError)throw launchError;if(child.exitCode!==null)throw Error('Packaged app exited before creating a window');try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;}catch{}await pause(100);}
    assert(page,'Packaged renderer was not available');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});let sequence=0;const pending=new Map();socket.on('message',raw=>{const message=JSON.parse(raw);if(pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}});
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Packaged renderer evaluation failed');return result.result.value;};
    let ready=false;for(let i=0;i<100;i++){ready=await evaluate('typeof window.pad === "object" && typeof window.pad.action === "function" && document.readyState === "complete"');if(ready)break;await pause(50);}assert(ready,'Packaged preload did not become ready');
    const response=await evaluate("window.pad.action('state')");assert.equal(response.ok,true);assert.equal(response.state.profiles.length,0);assert(response.state.settings.desktopHome.startsWith(root));assert.equal(await evaluate('typeof require'),'undefined');
    await evaluate("document.querySelector('[data-service=kaggle]').click()");assert.equal((await evaluate("window.pad.action('kaggleTools')")).ok,true);
    await evaluate("window.padUI.setLanguage('en');window.padUI.setTheme('dark');render();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const screenshot=await call('Page.captureScreenshot',{format:'png'});await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/unix-packaged-ui.png',Buffer.from(screenshot.data,'base64'));
    console.log('Actual packaged executable: startup, sandbox, IPC, service navigation and isolated storage passed.');
  }finally{socket?.terminate();if(child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<50&&child.exitCode===null;i++)await pause(100);}try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
