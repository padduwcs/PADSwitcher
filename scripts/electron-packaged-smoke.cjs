'use strict';
// Exercise packaged ASAR code/helper in disposable app data, using fixture credentials only.
const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {auth}=require('../test/helpers.cjs');
const {CodexRpc}=require('../src/core/rpc.cjs');
const windows=require('../src/core/windows.cjs');
const root=path.resolve('artifacts/packaged-qa');let timer,rpc;
app.disableHardwareAcceleration();
// Set isolated paths before the first await: Chromium initializes caches on ready.
require('node:fs').mkdirSync(root,{recursive:true});
const dir=require('node:fs').mkdtempSync(path.join(root,'run-'));
app.setPath('appData',dir);app.setPath('userData',path.join(dir,'browser'));app.setName('PADSwitcher Packaged QA');
(async()=>{
  await fs.mkdir(root,{recursive:true});await windows.protectDirectory(root);
  const home=path.join(dir,'codex');await fs.mkdir(home);
  process.env.CODEX_HOME=home;
  const fixtureAuth=JSON.parse(auth('packaged').toString());
  const claims=JSON.parse(Buffer.from(fixtureAuth.tokens.id_token.split('.')[1],'base64url'));
  claims.exp=Math.floor(Date.now()/1000)+3600;claims.iat=Math.floor(Date.now()/1000);claims.iss='https://auth.openai.com';
  claims['https://api.openai.com/profile']={email:claims.email};claims['https://api.openai.com/auth'].chatgpt_user_id=claims.sub;
  fixtureAuth.tokens.id_token=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.Zml4dHVyZQ';
  fixtureAuth.tokens.access_token=fixtureAuth.tokens.id_token;
  await fs.writeFile(path.join(home,'auth.json'),JSON.stringify(fixtureAuth));const before=await fs.readFile(path.join(home,'auth.json'));
  timer=setTimeout(()=>{console.error('Packaged verification timed out.');app.exit(1);},45000);
  app.once('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',async()=>{
    try {
      const loadedFonts=await win.webContents.executeJavaScript("document.fonts.ready.then(()=>Array.from(document.fonts).filter(f=>f.family.includes('Be Vietnam Pro')).map(f=>({weight:f.weight,status:f.status})))");
      for(const weight of ['400','500','600'])assert(loadedFonts.some(f=>f.weight===weight&&f.status==='loaded'));
      console.log('Packaged local font loading: passed.');
      const action=async(command,args={})=>{
        // Startup quota refresh may still own the credential lock on a clean CI
        // machine. BUSY rejects before performing these fixture-only operations.
        const retryable=new Set(['import','gateway','autoSwitchSettings','clientRoute','stopGateway']);
        for(let attempt=0;;attempt++){
          const response=await win.webContents.executeJavaScript('window.pad.action('+JSON.stringify(command)+','+JSON.stringify(args)+')');
          if(response.ok||response.error?.code!=='BUSY'||!retryable.has(command)||attempt>=100)return response;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
      };
      const imported=await action('import');assert(imported.ok);const started=await action('gateway',{id:imported.result});assert(started.ok);console.log('Packaged gateway startup passed.');
      assert.equal(started.state.web.enabled,false);assert.deepEqual(started.state.web.profiles,[]);
      const webAdded=await action('webAdd',{label:'Packaged account fixture'});assert(webAdded.ok);
      const webSelected=await action('webSelect',{id:webAdded.result});assert(webSelected.ok);
      assert.equal(webSelected.state.web.selectedId,webAdded.result);assert.equal(webSelected.state.web.enabled,false);
      const webRemoved=await action('webRemove',{id:webAdded.result});assert(webRemoved.ok);
      assert.deepEqual(webRemoved.state.web.profiles,[]);assert.equal(webRemoved.state.gateway.status,'ready');
      console.log('Packaged Web account IPC is separate; native gateway stays ready: passed.');
      assert.equal(started.state.version,require('../package.json').version);assert.equal(started.state.gateway.status,'ready');
      assert.equal(started.state.gateway.modelRouting,'request');
      assert.equal(started.state.gateway.recovery.enabled,false);
      const policy=await action('autoSwitchSettings',{enabled:false,order:[imported.result]});assert(policy.ok);assert.deepEqual(policy.state.autoSwitch,{enabled:false,order:[imported.result]});
      assert.equal((await action('autoSwitchSettings',{enabled:true,order:[imported.result]})).ok,false);
      const helper=started.state.gateway.helper;assert((await fs.stat(helper)).isFile());
      const connection=path.join(path.dirname(helper),'connection.json');
      rpc=new CodexRpc(helper,home,{spawn:(exe,args,opts)=>spawn(exe,args,{...opts,env:{...opts.env,PADSWITCHER_CONNECTION_FILE:connection}})});
      await rpc.request('initialize',{clientInfo:{name:'codex_vscode',title:'Fixture extension',version:'1.0.0'},capabilities:{experimentalApi:true}});rpc.send({method:'initialized',params:{}});
      await new Promise(resolve=>setTimeout(resolve,80));
      const live=(await action('state')).result;assert.equal(live.gateway.connected.vscode,1);assert.equal(live.gateway.connected.cli,0);
      console.log('Packaged stdio bridge and successful extension handshake indicator passed.');assert.deepEqual((await rpc.request('thread/loaded/list')).data,[]);
      const separated=await action('clientRoute',{scope:'jetbrains',mode:'private',profileId:imported.result});assert(separated.ok,'Separate route setup: '+(separated.error?.code||'unknown'));assert.equal(separated.state.gateway.scopes.jetbrains.mode,'private');
      assert.equal(separated.state.gateway.scopes.jetbrains.profileId,imported.result);assert.equal(separated.state.gateway.connected.vscode,1);
      const scopedPolicy=await action('autoSwitchSettings',{scope:'jetbrains',enabled:false,order:[imported.result]});assert(scopedPolicy.ok);
      assert.deepEqual(scopedPolicy.state.clientRoutes.jetbrains.autoSwitch,{enabled:false,order:[imported.result]});
      const joined=await action('clientRoute',{scope:'jetbrains',mode:'shared'});assert(joined.ok,'Rejoin route: '+(joined.error?.code||'unknown'));assert.equal(joined.state.gateway.scopes.jetbrains.mode,'shared');assert.equal(joined.state.gateway.connected.vscode,1);
      console.log('Packaged separate native route setup, policy IPC and rejoining preserve the connected extension: passed.');
      win.close();assert.equal(win.isDestroyed(),false);assert.equal(win.isVisible(),false);
      assert.equal((await action('state')).result.gateway.status,'ready');
      await rpc.close();rpc=null;const stopped=await action('stopGateway');assert(stopped.ok);
      assert.deepEqual(await fs.readFile(path.join(home,'auth.json')),before);
      console.log('Packaged ASAR, native helper extraction/host, stdio bridge, tray close and preserved fixture login: passed.');
      clearTimeout(timer);app.exit(0);
    }catch(e){clearTimeout(timer);await rpc?.close();const location=String(e.stack||'').split('\n').find(line=>line.includes('electron-packaged-smoke.cjs:'));console.error('Packaged verification failed:',e.code||e.name,e.code==='ERR_ASSERTION'?e.message:'',location?.trim()||'');app.exit(1);}
  }));
  require('../dist/win-unpacked/resources/app.asar/src/main.cjs');
})().catch(e=>{clearTimeout(timer);console.error('Packaged QA could not initialize:',e.code||e.name,e.message);app.exit(1);});
