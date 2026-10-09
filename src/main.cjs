'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ProfileService } = require('./core/service.cjs');
const { createQuotaRefresher } = require('./core/quota-refresh.cjs');
const { WebService } = require('./core/web-service.cjs');
const { GatewayHub } = require('./core/gateway-hub.cjs');
const { Integration } = require('./core/integration.cjs');
const { JetBrainsIntegration } = require('./core/jetbrains.cjs');
const { UserError, publicError } = require('./core/errors.cjs');
let window, service, gateway, integration, jetbrains, web, tray, timer, integrationTimer, integrationFlight, quitting = false, shutdown = false;
let uiLocale='vi';
const text=(vi,en)=>uiLocale==='en'?en:vi;
function updateTray() {
  if(!tray)return;
  tray.setToolTip(text('PADSwitcher — quản lý phiên Codex','PADSwitcher — Codex account manager'));
  tray.setContextMenu(Menu.buildFromTemplate([{label:text('Mở PADSwitcher','Open PADSwitcher'),click:()=>{if(window.isMinimized())window.restore();window.show();window.focus();}},{type:'separator'},{label:text('Thoát PADSwitcher','Quit PADSwitcher'),click:()=>app.quit()}]));
}
const rendererFile = path.join(__dirname,'renderer','index.html');
const rendererUrl = pathToFileURL(rendererFile).href;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',() => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(start).catch(() => { dialog.showErrorBox('PADSwitcher','Không thể khởi động an toàn. Giữ nguyên thư mục dữ liệu và kiểm tra quyền truy cập Windows.'); app.quit(); });
}
async function openAuth(url) {
  let parsed; try { parsed = new URL(url); } catch { throw new UserError('Đường dẫn đăng nhập không hợp lệ.', 'LOGIN_URL'); }
  if (parsed.protocol !== 'https:' || !['auth.openai.com','chatgpt.com'].includes(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new UserError('Chỉ mở trang đăng nhập chính thức của OpenAI.', 'LOGIN_URL');
  await shell.openExternal(parsed.href);
}
async function start() {
  service = new ProfileService(path.join(app.getPath('appData'),'PADSwitcher','data'));
  await service.init();
  const companionRoot=app.isPackaged?path.join(process.resourcesPath,'gpt-web'):path.join(__dirname,'../artifacts/gpt-web/companion');
  const companionExe=path.join(companionRoot,'PADGPTWeb.exe');
  web=new WebService(path.join(service.root,'gpt-web'),{platform:service.platform,
    nativeHome:()=>service.state.settings.desktopHome,available:()=>require('node:fs').existsSync(companionExe),
    invocation:show=>({executable:companionExe,args:show?[]:['--hidden'],cwd:companionRoot})});
  service.web=web;web.on('change',()=>service.changed());
  // Optional Web data failure must never prevent native Codex from starting.
  let webInitError=null;
  try{await web.init();}catch{webInitError=new UserError('Không đọc được dữ liệu GPT Web. Các kết nối Codex vẫn hoạt động. Giữ thư mục dữ liệu để kiểm tra.','WEB_STORE_INVALID');web.state.enabled=false;web.lastError=webInitError.message;}
  gateway=new GatewayHub(service,{routerOptions:{webTransport:web}});integration=new Integration(service);jetbrains=new JetBrainsIntegration(service);
  const checkIntegration=()=>integrationFlight||(integrationFlight=(async()=>{const [next,jb]=await Promise.all([integration.status(),jetbrains.status()]);if(JSON.stringify(service.vscode)!==JSON.stringify(next)||JSON.stringify(service.jetbrains)!==JSON.stringify(jb)){service.vscode=next;service.jetbrains=jb;service.changed();}})().finally(()=>{integrationFlight=null;}));
  await checkIntegration();
  window = new BrowserWindow({ width: 1260, height: 840, minWidth: 1000, minHeight: 680, title: 'PADSwitcher', icon:path.join(__dirname,'assets','padswitcher.ico'), backgroundColor:'#F6F8FB', autoHideMenuBar:true, show:false, webPreferences: { preload:path.join(__dirname,'preload.cjs'), nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true, devTools:!app.isPackaged } });
  window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  window.webContents.on('will-navigate',(event,url) => { if (url !== rendererUrl) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.webRequest.onBeforeRequest({ urls:['http://*/*','https://*/*','ws://*/*','wss://*/*'] },(_details,callback) => callback({cancel:true}));
  const publish = state => { if (!window?.isDestroyed()) window.webContents.send('pad:state',state); };
  service.on('change',publish);
  ipcMain.handle('pad:action',async (event,command,args = {}) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== rendererUrl) return { ok:false,error:{message:'Nguồn yêu cầu không hợp lệ.',code:'INVALID_ORIGIN'} };
    try {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new UserError('Yêu cầu không hợp lệ.', 'INVALID_REQUEST');
      if(['vi','en'].includes(args.locale)&&uiLocale!==args.locale){uiLocale=args.locale;updateTray();}
      let result;
      if(command.startsWith('web')&&webInitError)throw webInitError;
      switch(command) {
        case 'state': result = service.view(); break;
        case 'webAdd': result=await web.add(args.label);break;
        case 'webSelect': await web.select(args.id);break;
        case 'webOpen': await web.open(args.id);break;
        case 'webLaunchSetup': await web.exclusive(()=>web.launch(args.id,false));break;
        case 'webSetup': result=await web.setupCommand(args.id,{action:args.action,requestId:args.requestId,consent:args.consent,reuse:args.reuse,tunnelId:args.tunnelId,runtimeKey:args.runtimeKey,target:args.target});break;
        case 'webCopyConnector': {
          const s=await web.refreshStatus(args.id);const name=s.setup?.connectorName;
          if(typeof name!=='string'||!name)throw new UserError('Mở thiết lập GPT Web trước.','WEB_SETUP_REQUIRED');
          clipboard.writeText(name);break;
        }
        case 'webEnable': await web.enable();break;
        case 'webDisable': await web.disable();break;
        case 'webRemove': await web.remove(args.id);break;
        case 'webRefresh': await web.poll();break;
        case 'import': result = await service.importCurrent(args.label); break;
        case 'add': result = await service.addAccount(args.label,openAuth,args.device === true,args.id || null,device => window.webContents.send('pad:device',device)); break;
        case 'cancelLogin': service.cancelLogin(); break;
        case 'recoverLogin': result = await service.recoverLogin(); break;
        case 'refresh': result = await service.refresh(args.id); break;
        case 'refreshAll': result = await service.refreshAll(); break;
        case 'prepareReset': result = await service.prepareReset(args.id,args.creditId ?? null); break;
        case 'consumeReset': result = await service.consumeReset(args.id,args.key,args.confirmed); break;
        case 'switch': result = await service.switchDesktop(args.id); break;
        case 'restore': result = await service.restoreDesktop(); break;
        case 'launch': result = await service.launchCli(args.id,args.resume === true); break;
        case 'gateway': await gateway.start(args.id,args.scope); break;
        case 'clientRoute': result=await gateway.configure(args);break;
        case 'autoSwitchSettings': await service.autoSwitchSettings(args);break;
        case 'cancelRecovery': gateway.route(args.scope)?.recovery.cancel('Đã hủy các lượt tự tiếp tục đang chờ.');gateway.changed();break;
        case 'stopGateway': await gateway.stop();service.state.gatewayEnabled=false;await service.save();break;
        case 'forceStopGateway': {
          const answer=await dialog.showMessageBox(window,{type:'warning',buttons:[text('Giữ gateway','Keep connected'),text('Dừng và ngắt các lượt đang chạy','Disconnect and interrupt active turns')],defaultId:0,cancelId:0,message:text('Dừng toàn bộ gateway?','Disconnect all Codex sessions?'),detail:text('Các kết nối CLI/extension và lượt Codex đang chạy qua PADSwitcher sẽ bị ngắt. Thao tác này không đóng VS Code.','CLI/extension connections and Codex turns through PADSwitcher will be interrupted. VS Code stays open.')});
          if(answer.response===1){await gateway.stop(true);service.state.gatewayEnabled=false;await service.save();}break;
        }
        case 'configureVSCode': await integration.configure(gateway.helper);await checkIntegration();break;
        case 'restoreVSCode': await integration.restore();await checkIntegration();break;
        case 'configureJetBrains': result=await service.exclusive(()=>jetbrains.configure(gateway.helper));await checkIntegration();break;
        case 'restoreJetBrains': await service.exclusive(()=>jetbrains.restore());await checkIntegration();break;
        case 'copyCLI': {
          if(gateway.status!=='ready')throw new UserError('Bật gateway trước.', 'GATEWAY_STOPPED');
          clipboard.writeText('& "'+gateway.helper.replace(/"/g,'""')+'"');break;
        }
        case 'launchGateway': {
          if(gateway.status!=='ready')throw new UserError('Bật gateway trước.', 'GATEWAY_STOPPED');
          const {spawn}=require('node:child_process');
          const script='Set-Location -LiteralPath $env:PADSWITCHER_WORKSPACE; & $env:PADSWITCHER_HELPER';
          const env={...process.env,PADSWITCHER_HELPER:gateway.helper,PADSWITCHER_WORKSPACE:service.state.settings.workspace};
          const outer="Start-Process -WindowStyle Normal -FilePath $env:PADSWITCHER_POWERSHELL -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-EncodedCommand',$env:PADSWITCHER_SCRIPT)";
          env.PADSWITCHER_SCRIPT=Buffer.from(script,'utf16le').toString('base64');env.PADSWITCHER_POWERSHELL=service.platform.powershell;
          const child=spawn(service.platform.powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(outer,'utf16le').toString('base64')],{env,stdio:'ignore',windowsHide:true});
          await new Promise((r,j)=>{child.once('error',j);child.once('close',code=>code===0?r():j(new UserError('Không mở được terminal.', 'CLI_START')));});break;
        }
        case 'edit': result = await service.edit(args.id,args.label,args.notes); break;
        case 'remove': result = await service.remove(args.id); break;
        case 'listTrash': result = await service.listTrash(); break;
        case 'restoreProfile': result = await service.restoreProfile(args.id); break;
        case 'settings': result = await service.settings(args); break;
        case 'diagnostics': result = await service.diagnostics(); break;
        case 'pick': {
          if (!['codexPath','workspace','desktopHome'].includes(args.kind)) throw new UserError('Loại đường dẫn không hợp lệ.');
          const selected = await dialog.showOpenDialog(window,{ title: args.kind === 'codexPath' ? text('Chọn codex.exe chính thức','Choose official codex.exe') : text('Chọn thư mục','Choose folder'), properties: args.kind === 'codexPath' ? ['openFile'] : ['openDirectory'], ...(args.kind === 'codexPath' ? { filters:[{name:'Codex',extensions:['exe']}] } : {}) });
          result = selected.canceled ? null : selected.filePaths[0]; break;
        }
        case 'openData': await shell.openPath(service.root); break;
        case 'openDesktop': {
          const executable = await service.executable();
          // Invoke the supported launcher, without credentials or environment overrides.
          const { spawn } = require('node:child_process');
          const child = spawn(executable,['app',service.state.settings.workspace],{ windowsHide:true,stdio:'ignore',detached:true });
          await new Promise((resolve,reject) => { child.once('spawn',resolve); child.once('error',reject); }); child.unref(); break;
        }
        default: throw new UserError('Thao tác chưa được hỗ trợ.', 'UNKNOWN_ACTION');
      }
      return { ok:true,result,state:service.view() };
    } catch(error) { return { ok:false,error:publicError(error),state:service.view() }; }
  });
  await window.loadFile(rendererFile); window.show();
  tray=new Tray(path.join(__dirname,'assets','padswitcher.ico'));tray.setToolTip('PADSwitcher — quản lý phiên Codex');
  const showWindow=()=>{if(window.isMinimized())window.restore();window.show();window.focus();};
  tray.on('double-click',showWindow);
  updateTray();
  if(web.enabled&&web.state.selectedId)void web.launch(web.state.selectedId,false).catch(()=>{web.lastError='Mở GPT Web để hoàn tất đăng nhập hoặc thiết lập.';web.changed();});
  if(service.state.gatewayEnabled&&service.state.profiles.some(p=>p.id===service.state.gatewayProfileId)){
    await gateway.start(service.state.gatewayProfileId).catch(error=>{if(!window.isDestroyed())window.webContents.send('pad:refresh-error',publicError(error));});
  }
  const refreshQuota = createQuotaRefresher(service);
  const refresh = reason => { refreshQuota(reason).catch(error => {
    if (!window?.isDestroyed()) window.webContents.send('pad:refresh-error',publicError(error));
  }); };
  refresh('startup');
  window.on('focus',() => refresh('focus'));
  window.on('focus',()=>checkIntegration());
  integrationTimer=setInterval(()=>checkIntegration(),3000);
  timer = setInterval(() => refresh('periodic'), 60 * 1000);
  window.on('close',event => {
    if (quitting) return;
    if(['ready','starting'].includes(gateway.status)||web.enabled||web.children.size){event.preventDefault();window.hide();return;}
    if (service.busy && !service.login) { event.preventDefault(); dialog.showMessageBox(window,{type:'info',message:'Thao tác đang hoàn tất',detail:'Hãy chờ lưu phiên xong trước khi đóng PADSwitcher.'}); return; }
    if (service.running.size) {
      const response = dialog.showMessageBoxSync(window,{type:'question',buttons:['Giữ PADSwitcher mở','Đóng trình quản lý'],defaultId:0,cancelId:0,message:'CLI vẫn đang chạy',detail:'Nếu đóng trình quản lý, các cửa sổ CLI tiếp tục chạy. Phiên riêng sẽ được mã hóa lại khi đóng CLI bình thường; mở PADSwitcher lại để kiểm tra trạng thái sau đó.'});
      if (response === 0) { event.preventDefault(); return; }
    }
    if (service.login) { event.preventDefault(); service.cancelLogin(); const wait = setInterval(() => { if (!service.busy) { clearInterval(wait); quitting = true; window.close(); } },100); }
  });
  app.on('window-all-closed',() => { clearInterval(timer); clearInterval(integrationTimer); app.quit(); });
  app.on('before-quit',event => {
    if(quitting)return;
    if(service?.busy||web?.busy||web?.launchFlight){event.preventDefault();if(service.login)service.cancelLogin();return;}
    if(gateway.turns.size||web?.active){event.preventDefault();window.show();dialog.showMessageBox(window,{type:'info',message:text('Codex hoặc GPT Web còn lượt đang chạy','Codex or GPT Web has active turns'),detail:text('Chờ hoàn tất hoặc dừng tác vụ trước khi thoát.','Wait for completion or stop the task before quitting.')});return;}
    if(gateway.status!=='stopped'||web?.children.size){
      event.preventDefault();if(shutdown)return;shutdown=true;
      (async()=>{await web.shutdown();await gateway.stop();})().then(()=>{quitting=true;clearInterval(timer);tray?.destroy();app.quit();},error=>{shutdown=false;window.show();dialog.showMessageBox(window,{type:'info',message:publicError(error).message});});
    }else{quitting=true;clearInterval(timer);tray?.destroy();}
  });
}
