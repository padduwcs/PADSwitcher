'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ProfileService } = require('./core/service.cjs');
const { createQuotaRefresher } = require('./core/quota-refresh.cjs');
const { Gateway } = require('./core/gateway.cjs');
const { Integration } = require('./core/integration.cjs');
const { UserError, publicError } = require('./core/errors.cjs');
let window, service, gateway, integration, tray, timer, quitting = false, shutdown = false;
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
  gateway=new Gateway(service);integration=new Integration(service);
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
      let result;
      switch(command) {
        case 'state': result = service.view(); break;
        case 'import': result = await service.importCurrent(args.label); break;
        case 'add': result = await service.addAccount(args.label,openAuth,args.device === true,args.id || null,device => window.webContents.send('pad:device',device)); break;
        case 'cancelLogin': service.cancelLogin(); break;
        case 'recoverLogin': result = await service.recoverLogin(); break;
        case 'refresh': result = await service.refresh(args.id); break;
        case 'refreshAll': result = await service.refreshAll(); break;
        case 'switch': result = await service.switchDesktop(args.id); break;
        case 'restore': result = await service.restoreDesktop(); break;
        case 'launch': result = await service.launchCli(args.id,args.resume === true); break;
        case 'gateway': await gateway.start(args.id); break;
        case 'autoSwitchSettings': await service.autoSwitchSettings(args);break;
        case 'cancelRecovery': gateway.recovery.cancel('Đã hủy các lượt tự tiếp tục đang chờ.');gateway.changed();break;
        case 'stopGateway': await gateway.stop();service.state.gatewayEnabled=false;await service.save();break;
        case 'forceStopGateway': {
          const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['Giữ gateway','Dừng và ngắt các lượt đang chạy'],defaultId:0,cancelId:0,message:'Dừng toàn bộ gateway?',detail:'Các kết nối CLI/extension và lượt Codex đang chạy qua PADSwitcher sẽ bị ngắt. Thao tác này không đóng VS Code.'});
          if(answer.response===1){await gateway.stop(true);service.state.gatewayEnabled=false;await service.save();}break;
        }
        case 'configureVSCode': await integration.configure(gateway.helper);break;
        case 'restoreVSCode': await integration.restore();break;
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
          const selected = await dialog.showOpenDialog(window,{ title: args.kind === 'codexPath' ? 'Chọn codex.exe chính thức' : 'Chọn thư mục', properties: args.kind === 'codexPath' ? ['openFile'] : ['openDirectory'], ...(args.kind === 'codexPath' ? { filters:[{name:'Codex',extensions:['exe']}] } : {}) });
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
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Mở PADSwitcher',click:showWindow},{type:'separator'},{label:'Thoát PADSwitcher',click:()=>app.quit()}]));
  if(service.state.gatewayEnabled&&service.state.profiles.some(p=>p.id===service.state.gatewayProfileId)){
    await gateway.start(service.state.gatewayProfileId).catch(error=>{if(!window.isDestroyed())window.webContents.send('pad:refresh-error',publicError(error));});
  }
  const refreshQuota = createQuotaRefresher(service);
  const refresh = reason => { refreshQuota(reason).catch(error => {
    if (!window?.isDestroyed()) window.webContents.send('pad:refresh-error',publicError(error));
  }); };
  refresh('startup');
  window.on('focus',() => refresh('focus'));
  timer = setInterval(() => refresh('periodic'), 5 * 60 * 1000);
  window.on('close',event => {
    if (quitting) return;
    if(['ready','starting'].includes(gateway.status)){event.preventDefault();window.hide();return;}
    if (service.busy && !service.login) { event.preventDefault(); dialog.showMessageBox(window,{type:'info',message:'Thao tác đang hoàn tất',detail:'Hãy chờ lưu phiên xong trước khi đóng PADSwitcher.'}); return; }
    if (service.running.size) {
      const response = dialog.showMessageBoxSync(window,{type:'question',buttons:['Giữ PADSwitcher mở','Đóng trình quản lý'],defaultId:0,cancelId:0,message:'CLI vẫn đang chạy',detail:'Nếu đóng trình quản lý, các cửa sổ CLI tiếp tục chạy. Phiên riêng sẽ được mã hóa lại khi đóng CLI bình thường; mở PADSwitcher lại để kiểm tra trạng thái sau đó.'});
      if (response === 0) { event.preventDefault(); return; }
    }
    if (service.login) { event.preventDefault(); service.cancelLogin(); const wait = setInterval(() => { if (!service.busy) { clearInterval(wait); quitting = true; window.close(); } },100); }
  });
  app.on('window-all-closed',() => { clearInterval(timer); app.quit(); });
  app.on('before-quit',event => {
    if(quitting)return;
    if(service?.busy){event.preventDefault();if(service.login)service.cancelLogin();return;}
    if(gateway.turns.size){event.preventDefault();window.show();dialog.showMessageBox(window,{type:'info',message:'Codex còn lượt đang chạy',detail:'Chờ hoàn tất hoặc chọn Dừng gateway trong PADSwitcher trước khi thoát.'});return;}
    if(gateway.status!=='stopped'){
      event.preventDefault();if(shutdown)return;shutdown=true;
      gateway.stop().then(()=>{quitting=true;clearInterval(timer);tray?.destroy();app.quit();},error=>{shutdown=false;window.show();dialog.showMessageBox(window,{type:'info',message:publicError(error).message});});
    }else{quitting=true;clearInterval(timer);tray?.destroy();}
  });
}
