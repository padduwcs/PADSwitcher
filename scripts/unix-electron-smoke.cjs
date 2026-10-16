'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
let root,window;
app.whenReady().then(async()=>{
  root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-electron-')));await fs.chmod(root,0o700);
  app.setPath('appData',root);app.setPath('userData',path.join(root,'browser'));
  // The entry point keeps its normal isolated data namespace. This script uses
  // no existing Codex homes, IDE settings, accounts or inference.
  require(process.env.PADSWITCHER_PACKAGED_ASAR?path.join(process.env.PADSWITCHER_PACKAGED_ASAR,'src/main.cjs'):'../src/main.cjs');
  for(let i=0;i<100;i++){window=BrowserWindow.getAllWindows()[0];if(window&&!window.webContents.isLoading()&&window.webContents.getURL().endsWith('/renderer/index.html'))break;await new Promise(r=>setTimeout(r,100));}
  assert(window,'Application did not create a window');await new Promise(r=>setTimeout(r,400));
  const state=await window.webContents.executeJavaScript("window.pad.action('state')");assert.equal(state.ok,true);assert.equal(state.state.profiles.length,0);assert(state.state.settings.desktopHome.startsWith(root));
  const check=await window.webContents.executeJavaScript("({services:document.querySelectorAll('.service-card').length,node:typeof require,overflow:document.documentElement.scrollWidth>innerWidth})");assert.equal(check.services,2);assert.equal(check.node,'undefined');assert.equal(check.overflow,false);
  await window.webContents.executeJavaScript("document.querySelector('[data-service=kaggle]').click()");
  const tools=await window.webContents.executeJavaScript("window.pad.action('kaggleTools')");assert.equal(tools.ok,true);
  await window.webContents.executeJavaScript("window.padUI.setLanguage('en');window.padUI.setTheme('dark');render();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  await fs.mkdir(path.resolve('artifacts'),{recursive:true});const screenshot=await window.webContents.capturePage();await fs.writeFile(path.resolve('artifacts/unix-ui.png'),screenshot.toPNG());
  assert.equal(await fs.stat(path.join(root,'PADSwitcher','data')).then(()=>true,()=>false),false);
  console.log('Electron startup, sandbox, service navigation, Python probe and isolated data: passed.');
  app.quit();
}).catch(error=>{console.error(error.stack);app.exit(1);});
app.on('will-quit',()=>{if(root)require('node:fs').rmSync(root,{recursive:true,force:true});});
setTimeout(()=>{console.error('Electron smoke timeout');app.exit(1);},25000).unref();
