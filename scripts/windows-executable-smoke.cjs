'use strict';
// Launch the actual unpacked and portable executables with disposable app data.
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process'),{WebSocket}=require('ws');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const parent=path.resolve('artifacts/executable-qa');await fs.mkdir(parent,{recursive:true});
  const output=path.resolve(process.env.PADSWITCHER_BUILD_OUTPUT||'dist'),version=require('../package.json').version;
  for(const [kind,binary]of [['unpacked',path.join(output,'win-unpacked/PADSwitcher.exe')],['portable',path.join(output,`PADSwitcher-${version}-Windows.exe`)]]){
    await fs.access(binary);const root=await fs.mkdtemp(path.join(parent,kind+'-'));await fs.mkdir(path.join(root,'codex'));
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env,PADSWITCHER_APPDATA_DIR:root,CODEX_HOME:path.join(root,'codex')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;delete env.PADSWITCHER_CONNECTION_FILE;
    const child=spawn(binary,[`--remote-debugging-port=${port}`],{env,stdio:'ignore',windowsHide:true});let launchError,socket;child.on('error',e=>launchError=e);
    try{
      let page;for(let i=0;i<400;i++){if(launchError)throw launchError;try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;}catch{}await pause(100);}
      assert(page,kind+' renderer did not become available');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
      let sequence=0;const pending=new Map();socket.on('message',raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
      socket.on('close',()=>{for(const p of pending.values())p.reject(Error('Packaged debug connection closed'));pending.clear();});
      const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Packaged debug request timed out'));},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
      const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,'Packaged renderer exception');return r.result.value;};
      let ready;for(let i=0;i<100;i++){ready=await evaluate('typeof window.pad === "object" && document.readyState === "complete"');if(ready)break;await pause(100);}assert(ready);
      const response=await evaluate("window.pad.action('state')");assert(response.ok,'Packaged state IPC rejected: '+response.error?.code);assert.equal(response.result.version,version);assert.equal(response.result.profiles.length,0);assert.equal(response.result.platform,'windows');assert.equal(await evaluate('typeof require'),'undefined');
      assert.equal(path.resolve(response.result.settings.desktopHome),path.join(root,'codex'));
      await evaluate("document.querySelector('[data-service=codex]').click();document.querySelector('[data-page=connections]').click()");assert.equal(await evaluate("document.querySelectorAll('.integration-card').length"),4);assert.equal(await evaluate("document.querySelector('.desktop-card').classList.contains('hidden')"),false);
      await evaluate("window.padUI.setLanguage('en');window.padUI.setTheme('dark');render();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
      const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(parent,kind+'.png'),Buffer.from(shot.data,'base64'));
      console.log(`Actual ${kind} executable ${version}: sandboxed renderer, IPC, desktop UI and isolated storage passed.`);
      await evaluate('window.close()').catch(()=>{});
    }finally{
      socket?.terminate();for(let i=0;i<60&&child.exitCode===null;i++)await pause(100);
      if(child.exitCode===null){try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
      // Keep the disposable directory and screenshot for inspection.
    }
  }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
