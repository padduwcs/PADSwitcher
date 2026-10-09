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
  timeout = setTimeout(() => {console.error('Electron UI verification timed out.'); app.exit(1);},45000);
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
        for (const file of ['index.html','styles.css','branding.css','themes.css','web-setup.css','i18n.js','web.js','web-setup.js','app.js']) {
          let content = await fs.readFile(path.join(__dirname,'../src/renderer',file),'utf8');
          if (file === 'index.html') content = content.replace('<script src="app.js" defer></script>','<script src="preview.js" defer></script><script src="app.js" defer></script>');
          await fs.writeFile(path.join(fixtureRoot,file),content);
        }
        await fs.writeFile(path.join(fixtureRoot,'preview.js'),require('./preview-data.cjs'));
        const preview = new BrowserWindow({width:1260,height:900,show:false,webPreferences:{partition:'ui-fixture-'+Date.now(),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
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
        for(const page of ['connections','web','settings']) {
          await preview.webContents.executeJavaScript(`document.querySelector('.nav[data-page=${page}]').click()`);
          await new Promise(resolve=>setTimeout(resolve,250));
          const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,page+'-sample.png'),frame);
          const overflow=await preview.webContents.executeJavaScript('document.documentElement.scrollWidth>document.documentElement.clientWidth');assert.equal(overflow,false);
        }
        await preview.webContents.executeJavaScript("(async()=>{document.querySelector('[data-page=web]').click();document.querySelector('#web-add').click();document.querySelector('#web-label').value='GPT Web · Setup preview';document.querySelector('#modal-form').dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,100));})()");
        const wizardLogin=await preview.webContents.executeJavaScript("({open:document.querySelector('#web-wizard').open,disabled:document.querySelector('#web-wizard-auto').disabled,overflow:document.querySelector('#web-wizard').scrollWidth>document.querySelector('#web-wizard').clientWidth})");
        assert.equal(wizardLogin.open,true);assert.equal(wizardLogin.disabled,true);assert.equal(wizardLogin.overflow,false);
        await new Promise(resolve=>setTimeout(resolve,200));
        const loginFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,frame)=>resolve(frame.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'web-wizard-login.png'),loginFrame);
        await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#web-wizard-signin').click();await new Promise(r=>setTimeout(r,100));document.querySelector('#web-smoke-consent').click();document.querySelector('#web-wizard-auto').click();await new Promise(r=>setTimeout(r,100));})()");
        const wizardTools=await preview.webContents.executeJavaScript("({tools:!document.querySelector('#web-wizard-tools').classList.contains('hidden'),finish:!document.querySelector('#web-wizard-finish').classList.contains('hidden')})");assert.equal(wizardTools.tools,true);assert.equal(wizardTools.finish,false);
        preview.setSize(1000,680);await new Promise(resolve=>setTimeout(resolve,200));
        const toolsFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,frame)=>resolve(frame.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'web-wizard-tools.png'),toolsFrame);
        const compactWizard=await preview.webContents.executeJavaScript("({overflow:document.querySelector('#web-wizard').scrollWidth>document.querySelector('#web-wizard').clientWidth,viewport:document.querySelector('#web-wizard').getBoundingClientRect().bottom<=innerHeight})");assert.equal(compactWizard.overflow,false);assert.equal(compactWizard.viewport,true);
        await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#web-wizard-later').click();const rows=document.querySelectorAll('[data-web-open]');await window.pad.action('webRemove',{id:rows[rows.length-1].dataset.webOpen});})()");preview.setSize(1260,840);
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
        const compactReset=await preview.webContents.executeJavaScript("document.querySelector('.reset-panel').getBoundingClientRect().bottom<=innerHeight");assert.equal(compactReset,true);
        await new Promise(resolve=>setTimeout(resolve,250));
        const compactFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
        await fs.writeFile(path.join(root,'accounts-compact.png'),compactFrame);
        // Presentation checks and reset dialog below use preview.js fixtures only.
        preview.setSize(1260,900);
        await preview.webContents.executeJavaScript("document.querySelector('#language-select').value='vi';document.querySelector('#language-select').dispatchEvent(new Event('change'));document.querySelector('#theme-select').value='light';document.querySelector('#theme-select').dispatchEvent(new Event('change'));document.querySelectorAll('.account-card')[0].click();document.querySelector('#reset-list').open=true");
        for(const variant of ['light-vi','dark-en']) {
          if(variant==='dark-en')await preview.webContents.executeJavaScript("document.querySelector('#theme-toggle').click();document.querySelector('#language-toggle').click()");
          await new Promise(resolve=>setTimeout(resolve,200));
          const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,'accounts-'+variant+'.png'),frame);
          const dimensions=await preview.webContents.executeJavaScript("({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,stacked:[...document.querySelectorAll('.detail-quotas .quota-window')].map(el=>el.getBoundingClientRect().top),theme:document.documentElement.dataset.theme,lang:document.documentElement.lang})");
          assert.equal(dimensions.overflow,false);assert(dimensions.stacked[1]>dimensions.stacked[0]);assert.equal(dimensions.theme,variant.startsWith('dark')?'dark':'light');assert.equal(dimensions.lang,variant.endsWith('en')?'en':'vi');
          const refresh=await preview.webContents.executeJavaScript("(()=>{const b=document.querySelector('#refresh-all'),icon=b.querySelector('svg').getBoundingClientRect(),label=b.querySelector('span').getBoundingClientRect(),s=getComputedStyle(b);return {centerDelta:Math.abs(icon.top+icon.height/2-label.top-label.height/2),left:s.paddingLeft,right:s.paddingRight,label:b.querySelector('span').textContent};})()");
          assert(refresh.centerDelta<=1);assert.equal(refresh.left,refresh.right);assert.equal(refresh.label,variant.endsWith('en')?'Refresh':'Làm mới');
          await preview.webContents.executeJavaScript("document.querySelector('[data-page=connections]').click()");
          await new Promise(resolve=>setTimeout(resolve,200));
          const connections=await preview.webContents.executeJavaScript("({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,count:document.querySelectorAll('.integration-card').length,live:document.querySelector('#jetbrains-live').textContent})");
          assert.equal(connections.overflow,false);assert.equal(connections.count,3);assert(connections.live.includes(variant.endsWith('en')?'Connected':'Đang kết nối'));
          const connectionsFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,'connections-'+variant+'.png'),connectionsFrame);
          await preview.webContents.executeJavaScript("document.querySelector('[data-page=web]').click()");
          preview.setSize(1000,680);
          await new Promise(resolve=>setTimeout(resolve,200));
          const webLayout=await preview.webContents.executeJavaScript("({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,count:document.querySelectorAll('.web-account').length,enabled:!document.querySelector('#web-disable').disabled})");
          assert.equal(webLayout.overflow,false);assert.equal(webLayout.count,2);assert.equal(webLayout.enabled,true);
          const webFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,'web-compact-'+variant+'.png'),webFrame);
          preview.setSize(1260,900);
          await preview.webContents.executeJavaScript("document.querySelector('[data-page=accounts]').click()");
          const client=await preview.webContents.executeJavaScript("({active:document.querySelector('#vscode-pill').classList.contains('connected'),text:document.querySelector('#vscode-status').textContent})");assert.equal(client.active,true);assert(client.text.includes(variant.endsWith('en')?'Connected':'Đang kết nối'));
        }
        await preview.webContents.executeJavaScript("(async()=>{document.querySelector('.reset-row button').click();await new Promise(r=>setTimeout(r,80));return true;})()");
        const confirm=await preview.webContents.executeJavaScript("({open:document.querySelector('#modal').open,label:document.querySelector('#modal-submit').textContent,count:document.querySelector('.reset-heading b').textContent})");
        assert.equal(confirm.open,true);assert.equal(confirm.label,'Confirm reset');assert.equal(confirm.count,'2');
        await new Promise(resolve=>setTimeout(resolve,300));
        const resetFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
        await fs.writeFile(path.join(root,'reset-confirmation-sample.png'),resetFrame);
        await preview.webContents.executeJavaScript("document.querySelector('#modal-cancel').click();document.querySelector('.nav[data-page=settings]').click()");
        await new Promise(resolve=>setTimeout(resolve,300));
        const settingsFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
        await fs.writeFile(path.join(root,'settings-dark-en.png'),settingsFrame);
        // Compare both backgrounds with the same selected account and layout.
        await preview.webContents.executeJavaScript("document.querySelector('.nav[data-page=accounts]').click();document.querySelectorAll('.account-card')[1].click()");
        for(const variant of ['dark','light']){
          if(variant==='light')await preview.webContents.executeJavaScript("document.querySelector('#theme-toggle').click();document.querySelector('#language-toggle').click()");
          await new Promise(resolve=>setTimeout(resolve,200));
          const backgroundFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,'background-'+variant+'.png'),backgroundFrame);
          const background=await preview.webContents.executeJavaScript("({paint:getComputedStyle(document.body).backgroundImage,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})");
          assert(background.paint.includes('linear-gradient'));assert.equal(background.overflow,false);
        }
        // Scoped routing presentation uses fixtures and cannot change real IDE settings.
        await preview.webContents.executeJavaScript("(async()=>{document.querySelector('[data-page=connections]').click();document.querySelector('[data-route=jetbrains]').click();document.querySelector('#route-mode').value='private';document.querySelector('#route-mode').dispatchEvent(new Event('change'));document.querySelector('#route-profile').selectedIndex=1;document.querySelector('#modal-form').dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,100));document.querySelector('#toasts').replaceChildren();return true;})()");
        for(const variant of ['light-vi','dark-en']){
          if(variant==='dark-en')await preview.webContents.executeJavaScript("document.querySelector('#theme-toggle').click();document.querySelector('#language-toggle').click()");
          await preview.webContents.executeJavaScript("document.querySelector('[data-page=connections]').click()");
          await new Promise(resolve=>setTimeout(resolve,200));
          const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});
          await fs.writeFile(path.join(root,'separate-connections-'+variant+'.png'),frame);
          const route=await preview.webContents.executeJavaScript("({text:document.querySelector('#route-jetbrains').textContent,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})");assert(route.text.includes(variant.endsWith('en')?'Separate account':'Tài khoản riêng'));assert.equal(route.overflow,false);
          await preview.webContents.executeJavaScript("document.querySelector('[data-page=accounts]').click();document.querySelectorAll('.account-card')[1].click()");
          preview.setSize(1000,680);
          const compactRoute=await preview.webContents.executeJavaScript("(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {scope:document.querySelector('#account-scope').value,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,action:document.querySelector('#use-gateway').getBoundingClientRect().bottom<=innerHeight};})()");assert.equal(compactRoute.scope,'jetbrains');assert.equal(compactRoute.overflow,false);assert.equal(compactRoute.action,true);
          await new Promise(resolve=>setTimeout(resolve,200));
          const account=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'separate-accounts-'+variant+'.png'),account);
          preview.setSize(1260,900);
        }
        preview.destroy(); console.log('Sample UI: light/dark, Vietnamese/English, quotas, reset cancellation and separate account controls: passed.');
        clearTimeout(timeout); app.exit(0);
      } catch(error) { clearTimeout(timeout); console.error('Electron UI verification failed:',error.message); app.exit(1); }
    });
  });
  require('../src/main.cjs');
})().catch(() => {clearTimeout(timeout);console.error('Electron QA could not initialize.');app.exit(1);});
