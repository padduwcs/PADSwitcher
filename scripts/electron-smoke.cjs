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
        const data = await win.webContents.executeJavaScript("(async()=>({title:document.title,hasApi:typeof window.pad?.action==='function',hasNode:typeof require!=='undefined',servicesVisible:!document.querySelector('#services-page').classList.contains('hidden'),serviceCount:document.querySelectorAll('.service-card').length,csp:document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content,bridgeResponse:await window.pad.action('state')}))()");
        assert.equal(data.title,'PADSwitcher'); assert.ok(data.hasApi); assert.equal(data.hasNode,false); assert.ok(data.servicesVisible);assert.equal(data.serviceCount,2); assert.ok(data.csp.includes("connect-src 'none'")); assert.ok(data.bridgeResponse.ok);
        await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
        const image = await win.webContents.capturePage(); await fs.writeFile(path.join(root,'startup.png'),image.toPNG());
        console.log('Actual Electron startup, preload bridge, sandbox and CSP: passed.');
        assert.deepEqual(data.bridgeResponse.result.kaggle.accounts,[]);
        const kagglePython=path.resolve('artifacts/kaggle-sdk-probe/Scripts/python.exe');
        if(await fs.stat(kagglePython).then(()=>true,()=>false)){
          const configured=await win.webContents.executeJavaScript('window.pad.action("kaggleSettings",'+JSON.stringify({pythonPath:kagglePython,autoRefresh:false})+')');assert(configured.ok);
          const tools=await win.webContents.executeJavaScript('window.pad.action("kaggleTools")');assert(tools.ok);assert(tools.result.supported);console.log('Actual Kaggle Python bridge and official CLI dependency probe: passed.');
        }
        const fixtureRoot = path.join(root,'renderer-fixture'); await fs.mkdir(fixtureRoot,{recursive:true});
        await fs.mkdir(path.join(root,'assets'),{recursive:true});
        await fs.mkdir(path.join(root,'assets/fonts'),{recursive:true});
        for(const file of ['BeVietnamPro-Regular.ttf','BeVietnamPro-Medium.ttf','BeVietnamPro-SemiBold.ttf','OFL.txt'])await fs.copyFile(path.join(__dirname,'../src/assets/fonts',file),path.join(root,'assets/fonts',file));
        for (const file of ['padswitcher-symbol.png','padswitcher-logo.png','padswitcher-emblem.png']) await fs.copyFile(path.join(__dirname,'../src/assets',file),path.join(root,'assets',file));
        for (const file of ['index.html','styles.css','branding.css','themes.css','i18n.js','services.css','services.js','kaggle.css','kaggle.js','app.js']) {
          let content = await fs.readFile(path.join(__dirname,'../src/renderer',file),'utf8');
          if (file === 'index.html') content = content.replace('<script src="app.js" defer></script>','<script src="preview.js" defer></script><script src="app.js" defer></script>');
          await fs.writeFile(path.join(fixtureRoot,file),content);
        }
        await fs.writeFile(path.join(fixtureRoot,'preview.js'),require('./preview-data.cjs'));
        const preview = new BrowserWindow({width:1260,height:900,show:false,webPreferences:{partition:'ui-fixture-'+Date.now(),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
        await preview.loadFile(path.join(fixtureRoot,'index.html'),{search:'demo=1'});
        await preview.webContents.executeJavaScript("document.fonts.ready.then(()=>{for(const weight of [400,500,600])if(!document.fonts.check(weight+' 14px \"Be Vietnam Pro\"','Tài khoản'))throw Error('Local font missing');return true;})");
        await preview.webContents.executeJavaScript("document.querySelector('[data-service=codex]').click()");
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
          await preview.webContents.executeJavaScript(`document.querySelector('[data-page=${page}]').click()`);
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
        if(!compactAccounts.actionVisible){await fs.writeFile(path.join(root,'compact-failure.png'),(await preview.webContents.capturePage()).toPNG());}
        assert.equal(compactAccounts.actionVisible,true,'Codex primary action must fit at 1000x680');
        const compactReset=await preview.webContents.executeJavaScript("({bottom:document.querySelector('.reset-panel').getBoundingClientRect().bottom,height:innerHeight})");
        if(compactReset.bottom>compactReset.height){await fs.writeFile(path.join(root,'compact-failure.png'),(await preview.webContents.capturePage()).toPNG());}
        assert(compactReset.bottom<=compactReset.height,'Codex reset must fit at 1000x680: '+JSON.stringify(compactReset));
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
        await preview.webContents.executeJavaScript("document.querySelector('.nav[data-page=services]').click();document.querySelector('[data-service=codex]').click();document.querySelectorAll('.account-card')[1].click()");
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
        for(const variant of ['light-vi','dark-en']){
          await preview.webContents.executeJavaScript("window.padUI.setTheme('"+(variant.startsWith('dark')?'dark':'light')+"');window.padUI.setLanguage('"+(variant.endsWith('en')?'en':'vi')+"');render();document.querySelector('[data-page=kaggle]').click();document.querySelector('#toasts').replaceChildren();");
          for(const width of [1260,1000]){
            preview.setSize(width,width===1000?680:900);
            const metrics=await preview.webContents.executeJavaScript("(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,accounts:document.querySelectorAll('.kg-account').length,launchVisible:document.querySelector('#kg-launch').getBoundingClientRect().bottom<=innerHeight,quota:document.querySelector('.kg-quota>b').textContent,runs:document.querySelectorAll('.kg-notebook').length};})()");
            assert.equal(metrics.overflow,false);assert.equal(metrics.accounts,3);assert.equal(metrics.launchVisible,true);assert.equal(metrics.runs,3);assert(metrics.quota.includes(variant.endsWith('en')?'18.5':'18,5'));
            await new Promise(resolve=>setTimeout(resolve,100));
            const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'kaggle-'+variant+'-'+width+'.png'),frame);
          }
          preview.setSize(1260,900);
          await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#kg-add').click();await new Promise(r=>setTimeout(r,100));return true;})()");
          const modal=await preview.webContents.executeJavaScript("({hasToken:document.querySelector('#kg-token-input')?.type==='password',overflow:document.querySelector('#modal').getBoundingClientRect().bottom>innerHeight})");assert(modal.hasToken);assert.equal(modal.overflow,false);
          const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'kaggle-add-'+variant+'.png'),frame);
          await preview.webContents.executeJavaScript("document.querySelector('#modal-cancel').click()");
          await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#kg-terminal-setup').click();await new Promise(r=>setTimeout(r,100));return true;})()");
          const shellModal=await preview.webContents.executeJavaScript("({commands:document.querySelector('#modal-body').textContent.includes('padkaggle off'),overflow:document.querySelector('#modal').getBoundingClientRect().bottom>innerHeight})");assert(shellModal.commands);assert.equal(shellModal.overflow,false);
          const shellFrame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'kaggle-shell-'+variant+'.png'),shellFrame);
          await preview.webContents.executeJavaScript("document.querySelector('#modal-cancel').click()");
        }
        for(const variant of ['light-vi','dark-en']){
          await preview.webContents.executeJavaScript("window.padUI.setTheme('"+(variant.startsWith('dark')?'dark':'light')+"');window.padUI.setLanguage('"+(variant.endsWith('en')?'en':'vi')+"');render();document.querySelector('#toasts').replaceChildren();");
          for(const page of ['services','settings','codex-settings','help']){
            await preview.webContents.executeJavaScript("navigate('"+page+"');"+(page==='help'?"document.querySelector('[data-help-service=kaggle]').click();":""));
            const metrics=await preview.webContents.executeJavaScript("({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,page:document.querySelector('.page:not(.hidden)').id,active:document.querySelector('.nav.active').dataset.page,cards:document.querySelectorAll('.service-card').length})");
            assert.equal(metrics.overflow,false);assert.equal(metrics.page,page+'-page');assert.equal(metrics.active,page==='codex-settings'?'services':page);assert.equal(metrics.cards,2);
            await new Promise(resolve=>setTimeout(resolve,100));
            const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,page+'-'+variant+'.png'),frame);
          }
          preview.setSize(1000,680);
          for(const page of ['services','settings','codex-settings','help']){
            const metrics=await preview.webContents.executeJavaScript("(async()=>{navigate('"+page+"');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};})()");assert.equal(metrics.overflow,false);
          }
          preview.setSize(1260,900);
        }
        // Dense notebook fixtures exercise actual scroll geometry without Kaggle requests.
        for(const variant of ['light-vi','dark-en']){
          await preview.loadFile(path.join(fixtureRoot,'index.html'),{search:'demo=1&kgmany=1'});
          await preview.webContents.executeJavaScript("document.fonts.ready.then(()=>true)");
          await preview.webContents.executeJavaScript("window.padUI.setTheme('"+(variant.startsWith('dark')?'dark':'light')+"');window.padUI.setLanguage('"+(variant.endsWith('en')?'en':'vi')+"');render();navigate('kaggle');window.kgPageCalls=0;const originalKgAction=window.pad.action;window.pad.action=(command,args)=>{if(command==='kaggleNotebooksMore')window.kgPageCalls++;return originalKgAction(command,args);};true;");
          for(const width of [1920,1260,1000]){
            preview.setSize(width,width===1920?1080:width===1000?680:900);
            const metrics=await preview.webContents.executeJavaScript("(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,bodyOverflow:getComputedStyle(document.querySelector('#kg-detail-body')).overflowY,regions:['pinned','recent'].map(name=>{const el=document.querySelector('#kg-notebooks-'+name);return {height:el.clientHeight,content:el.scrollHeight,count:el.querySelectorAll('.kg-notebook').length};}),width:document.querySelector('#kg-layout').clientWidth};})()");
            assert.equal(metrics.overflow,false);assert.equal(metrics.bodyOverflow,'visible');if(width===1920)assert(metrics.width>1700,'Kaggle uses the wide viewport');
            assert.equal(metrics.regions[0].count,20);assert(metrics.regions.every(r=>r.content>r.height&&r.height>=250),'Roomy responsive lists: '+JSON.stringify(metrics));
            await preview.webContents.executeJavaScript("window.scrollTo(0,document.querySelector('#kg-notebooks-pinned').closest('section').getBoundingClientRect().top+scrollY-110);document.querySelector('#kg-notebooks-pinned').scrollTop=40;");
            await new Promise(resolve=>setTimeout(resolve,100));
            const frame=await new Promise(resolve=>{preview.webContents.once('paint',(_event,_rect,image)=>resolve(image.toPNG()));preview.webContents.invalidate();});await fs.writeFile(path.join(root,'kaggle-scroll-'+variant+'-'+width+'.png'),frame);
          }
          const paging=await preview.webContents.executeJavaScript("(async()=>{const recent=document.querySelector('#kg-notebooks-recent');recent.scrollTop=recent.scrollHeight;await new Promise(r=>setTimeout(r,180));const expanded=document.querySelector('#kg-notebooks-recent');const top=expanded.scrollTop;document.querySelector('#kg-refresh-one').click();await new Promise(r=>setTimeout(r,60));return {calls:window.kgPageCalls,recent:document.querySelectorAll('#kg-notebooks-recent .kg-notebook').length,pinned:document.querySelectorAll('#kg-notebooks-pinned .kg-notebook').length,pinnedTop:document.querySelector('#kg-notebooks-pinned').scrollTop,top,after:document.querySelector('#kg-notebooks-recent').scrollTop};})()");
          assert.equal(paging.calls,1);assert.equal(paging.recent,24);assert.equal(paging.pinned,20);assert.equal(paging.pinnedTop,40);assert.equal(paging.after,paging.top);
          // Send real Chromium mouse input, including pointer capture across a refresh.
          const handle=await preview.webContents.executeJavaScript("(()=>{const el=document.querySelector('[data-kg-resize=recent]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),height:document.querySelector('#kg-notebooks-recent').clientHeight};})()");
          preview.webContents.sendInputEvent({type:'mouseMove',x:handle.x,y:handle.y});preview.webContents.sendInputEvent({type:'mouseDown',x:handle.x,y:handle.y,button:'left',clickCount:1});
          preview.webContents.sendInputEvent({type:'mouseMove',x:handle.x,y:handle.y+120,button:'left'});
          await preview.webContents.executeJavaScript("(async()=>{document.querySelector('#kg-refresh-one').click();await new Promise(r=>setTimeout(r,60));return true;})()");
          preview.webContents.sendInputEvent({type:'mouseMove',x:handle.x,y:handle.y+140,button:'left'});preview.webContents.sendInputEvent({type:'mouseUp',x:handle.x,y:handle.y+140,button:'left',clickCount:1});
          const resized=await preview.webContents.executeJavaScript("({height:document.querySelector('#kg-notebooks-recent').clientHeight,saved:JSON.parse(localStorage.getItem('pad-kaggle-layout')),cursor:document.body.classList.contains('kg-resizing-height')})");
          assert.equal(resized.height,handle.height+140);assert(Math.abs(resized.saved.recent-resized.height)<=1);assert.equal(resized.cursor,false);
          const column=await preview.webContents.executeJavaScript("(()=>{window.scrollTo(0,0);const r=document.querySelector('[data-kg-resize=width]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),width:document.querySelector('#kg-list').clientWidth};})()");
          preview.webContents.sendInputEvent({type:'mouseMove',x:column.x,y:column.y});preview.webContents.sendInputEvent({type:'mouseDown',x:column.x,y:column.y,button:'left',clickCount:1});preview.webContents.sendInputEvent({type:'mouseMove',x:column.x+80,y:column.y,button:'left'});preview.webContents.sendInputEvent({type:'mouseUp',x:column.x+80,y:column.y,button:'left',clickCount:1});
          const columnWidth=await preview.webContents.executeJavaScript("document.querySelector('#kg-list').clientWidth");assert(Math.abs(columnWidth-column.width-80)<=1);
          await preview.loadFile(path.join(fixtureRoot,'index.html'),{search:'demo=1&kgmany=1'});await preview.webContents.executeJavaScript("navigate('kaggle')");
          assert.equal(await preview.webContents.executeJavaScript("document.querySelector('#kg-notebooks-recent').clientHeight"),resized.height);
          assert.equal(await preview.webContents.executeJavaScript("document.querySelector('#kg-list').clientWidth"),columnWidth);
          await preview.webContents.executeJavaScript("document.querySelector('#kg-layout-reset').click()");
          assert.equal(await preview.webContents.executeJavaScript("localStorage.getItem('pad-kaggle-layout')"),null);
          const tallList=await preview.webContents.executeJavaScript("(async()=>{window.scrollTo(0,0);const grip=document.querySelector('[data-kg-resize=recent]');grip.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));const recent=document.querySelector('#kg-notebooks-recent');const fits=recent.scrollHeight<=recent.clientHeight;window.scrollTo(0,recent.getBoundingClientRect().bottom+scrollY-innerHeight+20);await new Promise(r=>setTimeout(r,160));return {fits,rows:document.querySelectorAll('#kg-notebooks-recent .kg-notebook').length};})()");
          assert(tallList.fits);assert.equal(tallList.rows,24,'Page scrolling also loads more when the list is tall enough to fit its current rows');
          await preview.webContents.executeJavaScript("document.querySelector('#kg-layout-reset').click()");
          preview.setSize(1260,900);
        }
        preview.destroy(); console.log('Sample UI: services, Codex, Kaggle, settings and help; light/dark, VI/EN at 1920/1260/1000px; scrolling, pagination, native drag resizing and persisted layout: passed.');
        clearTimeout(timeout); app.exit(0);
      } catch(error) { clearTimeout(timeout); console.error('Electron UI verification failed:',error.stack); app.exit(1); }
    });
  });
  require('../src/main.cjs');
})().catch(() => {clearTimeout(timeout);console.error('Electron QA could not initialize.');app.exit(1);});
