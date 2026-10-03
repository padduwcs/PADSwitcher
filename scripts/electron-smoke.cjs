'use strict';
// Starts the actual app in a disposable app-data root and captures read-only render output.
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../artifacts/electron-qa');
app.disableHardwareAcceleration();
let timeout;
(async () => {
  await fs.mkdir(root,{recursive:true}); app.setPath('appData',root); app.setPath('userData',path.join(root,'browser')); app.setName('PADSwitcher QA');
  timeout = setTimeout(() => {console.error('Electron startup timed out.'); app.exit(1);},30000);
  app.once('browser-window-created',(_event,win) => {
    win.webContents.once('did-finish-load',async () => {
      try {
        const data = await win.webContents.executeJavaScript("(async()=>({title:document.title,hasApi:typeof window.pad?.action==='function',hasNode:typeof require!=='undefined',emptyVisible:!document.querySelector('#empty').classList.contains('hidden'),csp:document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content,bridgeResponse:await window.pad.action('state')}))()");
        assert.equal(data.title,'PADSwitcher'); assert.ok(data.hasApi); assert.equal(data.hasNode,false); assert.ok(data.emptyVisible); assert.ok(data.csp.includes("connect-src 'none'")); assert.ok(data.bridgeResponse.ok);
        await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
        const image = await win.webContents.capturePage(); await fs.writeFile(path.join(root,'startup.png'),image.toPNG());
        console.log('Actual Electron startup, preload bridge, sandbox and CSP: passed.');
        const fixtureRoot = path.join(root,'renderer-fixture'); await fs.mkdir(fixtureRoot,{recursive:true});
        await fs.mkdir(path.join(root,'assets'),{recursive:true});
        await fs.mkdir(path.join(root,'assets/fonts'),{recursive:true});
        for(const file of ['BeVietnamPro-Regular.ttf','BeVietnamPro-Medium.ttf','BeVietnamPro-SemiBold.ttf','OFL.txt'])await fs.copyFile(path.join(__dirname,'../src/assets/fonts',file),path.join(root,'assets/fonts',file));
        for (const file of ['padswitcher-symbol.png','padswitcher-logo.png','padswitcher-emblem.png']) await fs.copyFile(path.join(__dirname,'../src/assets',file),path.join(root,'assets',file));
        for (const file of ['index.html','styles.css','branding.css','app.js']) {
          let content = await fs.readFile(path.join(__dirname,'../src/renderer',file),'utf8');
          if (file === 'index.html') content = content.replace('<script src="app.js" defer></script>','<script src="preview.js" defer></script><script src="app.js" defer></script>');
          await fs.writeFile(path.join(fixtureRoot,file),content);
        }
        await fs.writeFile(path.join(fixtureRoot,'preview.js'),require('./preview-data.cjs'));
        const preview = new BrowserWindow({width:1260,height:900,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
        await preview.loadFile(path.join(fixtureRoot,'index.html'),{search:'demo=1'});
        await preview.webContents.executeJavaScript("document.fonts.ready.then(()=>{for(const weight of [400,500,600])if(!document.fonts.check(weight+' 14px \"Be Vietnam Pro\"','Tài khoản'))throw Error('Local font missing');return true;})");
        const layout = await preview.webContents.executeJavaScript("({count:document.querySelectorAll('.account-card').length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,imagesLoaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0)})");
        assert.equal(layout.count,3); assert.equal(layout.overflow,false);
        assert.equal(layout.imagesLoaded,true);
        await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#use-gateway').click();await new Promise(r=>setTimeout(r,100));document.querySelectorAll('.account-card')[1].click();return document.querySelector('#gateway-status').textContent;})()");
        await preview.webContents.executeJavaScript("document.querySelector('#toasts').replaceChildren()");
        await new Promise(resolve=>setTimeout(resolve,250));
        const accountImage=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,frame)=>resolve(frame.toPNG()));preview.webContents.invalidate();});
        await fs.writeFile(path.join(root,'accounts-sample.png'),accountImage);
        const autoSetup=await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#configure-auto').click();document.querySelector('#auto-enabled').checked=true;document.querySelector('#modal-form').dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,100));document.querySelector('#configure-auto').click();return {enabled:document.querySelector('#auto-enabled').checked,rows:document.querySelectorAll('[data-auto-id]').length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};})()");
        assert.equal(autoSetup.enabled,true);assert.equal(autoSetup.rows,3);assert.equal(autoSetup.overflow,false);
        await new Promise(resolve=>setTimeout(resolve,200));
        const autoImage=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,frame)=>resolve(frame.toPNG()));preview.webContents.invalidate();});
        await fs.writeFile(path.join(root,'automatic-switch-setup.png'),autoImage);
        await preview.webContents.executeJavaScript("document.querySelector('#modal-cancel').click()");
        await preview.webContents.executeJavaScript("document.querySelector('#toasts').replaceChildren()");
        for(const page of ['connections','settings']) {
          await preview.webContents.executeJavaScript(`document.querySelector('.nav[data-page=${page}]').click()`);
          await new Promise(resolve=>setTimeout(resolve,250));
          const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,page+'-sample.png'),frame);
          const overflow=await preview.webContents.executeJavaScript('document.documentElement.scrollWidth>document.documentElement.clientWidth');assert.equal(overflow,false);
        }
        const help = await preview.webContents.executeJavaScript("(async()=>{document.querySelector('[data-page=help]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {visible:!document.querySelector('#help-page').classList.contains('hidden'),active:document.querySelector('.nav.active').dataset.page};})()");
        assert.equal(help.visible,true); assert.equal(help.active,'help');
        await new Promise(resolve => setTimeout(resolve,200));
        // capturePage can return the hidden window's old compositor surface;
        // capture the new offscreen paint after navigation instead.
        const helpImage = await new Promise(resolve => { preview.webContents.once('paint',(_event,_rect,frame) => resolve(frame.toPNG())); preview.webContents.invalidate(); });
        await fs.writeFile(path.join(root,'help-logo.png'),helpImage);
        preview.setSize(1000,680);
        const compact = await preview.webContents.executeJavaScript("(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,imagesLoaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0)};})()");
        assert.equal(compact.overflow,false); assert.equal(compact.imagesLoaded,true);
        const compactAccounts=await preview.webContents.executeJavaScript("(async()=>{document.querySelector('[data-page=accounts]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,ready:document.querySelector('#gateway-status').textContent.includes('Đã kết nối'),enabled:!document.querySelector('#connect-vscode').disabled,actionVisible:document.querySelector('#use-gateway').getBoundingClientRect().bottom<=innerHeight};})()");
        assert.equal(compactAccounts.overflow,false);assert.equal(compactAccounts.ready,true);assert.equal(compactAccounts.enabled,true);
        assert.equal(compactAccounts.actionVisible,true);
        await new Promise(resolve=>setTimeout(resolve,250));
        const compactFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
        await fs.writeFile(path.join(root,'accounts-compact.png'),compactFrame);
        preview.destroy(); console.log('Populated renderer with sample accounts and quota: passed.');
        clearTimeout(timeout); app.exit(0);
      } catch { clearTimeout(timeout); console.error('Electron startup verification failed.'); app.exit(1); }
    });
  });
  require('../src/main.cjs');
})().catch(() => {clearTimeout(timeout);console.error('Electron QA could not initialize.');app.exit(1);});
