'use strict';
module.exports = `
(() => {
  const clone = x => JSON.parse(JSON.stringify(x));
  let callback, deviceCallback;
  const now = Date.now(), reset = Math.floor(now/1000)+14400;
  const profiles = [
    { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',label:'Cá nhân · Plus',email:'personal@example.test',plan:'plus',desktopActive:true,notes:'Tài khoản làm việc chính.',status:'ready',quotaAt:new Date(now).toISOString(),quota:[{id:'codex',name:'codex',windows:[{kind:'primary',usedPercent:100,windowDurationMins:300,resetsAt:reset},{kind:'secondary',usedPercent:82,windowDurationMins:10080,resetsAt:reset+86400}]}]},
    { id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',label:'Dự án · Pro',email:'projects@example.test',plan:'pro',desktopActive:false,notes:'Dành cho dự án cá nhân và công việc dài.',status:'ready',quotaAt:new Date(now).toISOString(),quota:[{id:'codex',name:'codex',windows:[{kind:'primary',usedPercent:24,windowDurationMins:300,resetsAt:reset},{kind:'secondary',usedPercent:38,windowDurationMins:10080,resetsAt:reset+86400}]}]},
    { id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',label:'Tài khoản dự phòng',email:'backup@example.test',plan:'plus',desktopActive:false,notes:'',status:'error',lastError:'Dữ liệu mẫu: không kết nối được dịch vụ. Hãy thử cập nhật lại.',quotaAt:new Date(now-20*60000).toISOString(),quota:[{id:'codex',name:'codex',windows:[{kind:'primary',usedPercent:17,windowDurationMins:300,resetsAt:reset}]}]}
  ];
  profiles[0].resetCredits={availableCount:2,credits:[{id:'fixture-reset-a',resetType:'codexRateLimits',status:'available',title:'Reset',expiresAt:reset+86400},{id:'fixture-reset-b',resetType:'codexRateLimits',status:'available',title:'Reset',expiresAt:null}]};
  profiles[1].resetCredits={availableCount:1,credits:null};
  let state = {version:'1.9.0',jetbrains:{configuration:'configured',runtimePresent:true},vscode:{configuration:'configured',helperPresent:true},profiles:new URLSearchParams(location.search).has('demo')?profiles:[],settings:{workspace:'D:\\\\Projects\\\\MyProject',desktopHome:'C:\\\\Users\\\\Personal\\\\.codex',codexPath:'',autoRefresh:false},busy:false,login:null,canRestore:false,recoveryPending:false,gateway:{status:'stopped',profileId:null,pendingId:null,activeTurns:0,clients:0}};
  state.autoSwitch={enabled:false,order:[]};
  state.web={enabled:false,runtimeAvailable:true,busy:false,active:0,selectedId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',profiles:new URLSearchParams(location.search).has('demo')?[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',label:'ChatGPT cá nhân',status:'ready',authenticated:true,mode:'full',selected:true},{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',label:'Tài khoản Web dự phòng',status:'stopped',selected:false}]:[]};
  state.clientRoutes=Object.fromEntries(['vscode','jetbrains','cli'].map(k=>[k,{mode:'shared',profileId:null,autoSwitch:{enabled:false,order:[]}}]));
  function scopes(){const {scopes:previous,...base}=state.gateway;state.gateway.scopes=Object.fromEntries(['vscode','jetbrains','cli'].map(k=>{const r=state.clientRoutes[k];return [k,{...base,mode:r.mode,profileId:r.mode==='private'?r.profileId:base.profileId,autoSwitch:r.mode==='private'?r.autoSwitch:state.autoSwitch}];}));}
  const publish = () => {scopes();callback?.(clone(state));};
  window.pad = {
    onState: cb => { callback = cb; },onDevice:cb => {deviceCallback=cb;},
    action:async (command,args={}) => {
      if(command==='webAdd'){const id=crypto.randomUUID();state.web.profiles.push({id,label:args.label,status:'stopped',selected:false});if(!state.web.selectedId)state.web.selectedId=id;publish();return {ok:true,result:id,state:clone(state)};}
      if(command==='webConnect'){
        const p=state.web.profiles.find(p=>p.id===args.id);
        if(!p.flow?.running){
          p.flow={running:true,step:'login',message:'Đăng nhập ChatGPT trong cửa sổ vừa mở. PADSwitcher tự tiếp tục khi bạn đăng nhập xong.',error:null};publish();
          setTimeout(()=>{if(!p.flow?.running)return;Object.assign(p,{flow:null,status:'ready',authenticated:true,connected:true,mode:p.mode||'browseronly'});
            p.setup={supported:true,prepared:true,smokePassed:true,credentialsConfigured:false,toolsVerified:false,connectorName:'CodexNative2-pad-preview',job:null};
            if(args.activate){state.web.selectedId=p.id;state.web.profiles.forEach(x=>x.selected=x.id===p.id);state.web.enabled=true;}publish();},Number(window.padPreviewConnectMs??20));
        }
      }
      if(command==='webCancelConnect'){const p=state.web.profiles.find(p=>p.id===args.id);p.flow=null;publish();}
      if(command==='webSelect'){state.web.selectedId=args.id;state.web.profiles.forEach(p=>p.selected=p.id===args.id);publish();}
      if(command==='webLaunchSetup'){
        const p=state.web.profiles.find(p=>p.id===args.id);
        p.setup||={supported:true,prepared:p.status==='ready',smokePassed:p.status==='ready',credentialsConfigured:p.mode==='full',toolsVerified:p.mode==='full',connectorName:'CodexNative2-pad-preview',job:null};
        if(p.status==='stopped')p.status='setup';publish();
      }
      if(command==='webSetup'){
        const p=state.web.profiles.find(p=>p.id===args.id);
        if(args.action==='login')p.authenticated=true;
        if(args.action==='prepare'){p.setup.prepared=true;p.setup.smokePassed=true;p.status='ready';p.mode='browseronly';}
        if(args.action==='connect'){p.setup.credentialsConfigured=true;p.setup.toolsVerified=false;p.mode='full';}
        if(args.action==='verify')p.setup.toolsVerified=true;
        p.setup.job={id:args.requestId,action:args.action,status:'completed'};publish();return {ok:true,result:{accepted:true},state:clone(state)};
      }
      if(command==='webEnable'){state.web.enabled=true;publish();}
      if(command==='webDisable'){state.web.enabled=false;state.web.profiles.forEach(p=>p.status='stopped');publish();}
      if(command==='webRemove'){state.web.profiles=state.web.profiles.filter(p=>p.id!==args.id);if(state.web.selectedId===args.id)state.web.selectedId=state.web.profiles[0]?.id||null;publish();}
      if(command==='prepareReset'){const p=state.profiles.find(p=>p.id===args.id);p.resetAttempt={key:'fixture-reset-key',creditId:args.creditId,status:'prepared'};return {ok:true,result:{...p.resetAttempt,retry:false},state:clone(state)};}
      if(command==='consumeReset'){const p=state.profiles.find(p=>p.id===args.id);if(!args.confirmed||args.key!==p.resetAttempt?.key)return {ok:false,error:{code:'RESET_STALE',message:'Xác nhận đã cũ.'},state:clone(state)};if(p.resetAttempt.status!=='completed'){p.resetCredits.availableCount--;p.resetCredits.credits=p.resetCredits.credits?.slice(1)||null;p.resetAttempt.status='completed';p.quota.forEach(b=>b.windows.forEach(w=>w.usedPercent=0));}publish();return {ok:true,result:{outcome:'reset',quotaRefreshed:true},state:clone(state)};}
      if (command==='state') {scopes();return {ok:true,result:clone(state)};}
      if(command==='clientRoute'){const r=state.clientRoutes[args.scope],reconnect=r.mode!==args.mode;r.mode=args.mode;if(args.mode==='private')r.profileId=args.profileId;if(reconnect&&state.gateway.connected)state.gateway.connected[args.scope]=0;publish();return {ok:true,result:{reconnect},state:clone(state)};}
      if (command==='pick') return {ok:true,result:'D:\\\\Projects\\\\ChosenProject',state:clone(state)};
      if (command==='diagnostics') return {ok:true,result:{version:'codex-cli 0.159.2 (mẫu)',codex:'C:\\\\Programs\\\\Codex\\\\codex.exe',blockers:['Code.exe'],storage:'C:\\\\Users\\\\Personal\\\\AppData\\\\Roaming\\\\PADSwitcher',loginRecovery:false},state:clone(state)};
      if(command==='configureVSCode'){state.vscode={configuration:'configured',helperPresent:true};publish();}
      if(command==='restoreVSCode'){state.vscode={configuration:'notConfigured',helperPresent:true};publish();}
      if(command==='configureJetBrains'){state.jetbrains={configuration:'configured',runtimePresent:true};publish();}
      if(command==='restoreJetBrains'){state.jetbrains={configuration:'notConfigured',runtimePresent:true};publish();}
      if (command==='settings') {state.settings={...state.settings,...args};publish();}
      if (command==='autoSwitchSettings') {if(args.enabled&&args.order.length<2)return {ok:false,error:{code:'INVALID_SETTINGS',message:'Chọn ít nhất hai tài khoản.'},state:clone(state)};const policy={enabled:args.enabled,order:clone(args.order)};if(state.clientRoutes[args.scope]?.mode==='private')state.clientRoutes[args.scope].autoSwitch=policy;else state.autoSwitch=policy;publish();}
      if(command==='gateway'&&state.clientRoutes[args.scope]?.mode==='private'){state.clientRoutes[args.scope].profileId=args.id;publish();return {ok:true,state:clone(state)};}
      if (command==='gateway') {state.gateway={status:'ready',connected:{vscode:1,cli:0,jetbrains:1,other:0},profileId:args.id,pendingId:null,activeTurns:0,clients:2};publish();}
      if (command==='stopGateway'||command==='forceStopGateway') {state.gateway={status:'stopped',profileId:null,pendingId:null,activeTurns:0,clients:0};publish();}
      if (command==='import') {state.profiles=clone(profiles);publish();return {ok:true,result:profiles[0].id,state:clone(state)};}
      if (command==='edit') {const p=state.profiles.find(p=>p.id===args.id);Object.assign(p,{label:args.label,notes:args.notes});publish();}
      if (command==='remove') {state.profiles=state.profiles.filter(p=>p.id!==args.id);publish();}
      if (command==='refresh'||command==='refreshAll') {state.busy=true;publish();await new Promise(resolve=>setTimeout(resolve,500));for(const p of state.profiles){if(command==='refreshAll'||p.id===args.id){p.status='ready';p.lastError=null;p.quotaAt=new Date().toISOString();}}state.busy=false;publish();}
      if (command==='add') {state.busy=true;state.login={profileId:null};publish();if(args.device) deviceCallback?.({userCode:'DEMO-1234',verificationUrl:'https://auth.openai.com/codex/device'});await new Promise(resolve=>setTimeout(resolve,3000));state.busy=false;state.login=null;publish();return {ok:false,error:{code:'CANCELLED',message:'Dữ liệu mẫu; không đăng nhập thật.'},state:clone(state)};}
      if (command==='switch') return {ok:false,error:{code:'DESKTOP_RUNNING',message:'Dữ liệu mẫu: hãy thoát Codex/ChatGPT và Code.exe trước khi chuyển desktop.'},state:clone(state)};
      if (command==='recoverLogin') return {ok:false,error:{code:'NOT_FOUND',message:'Không có phiên đăng nhập chưa lưu.'},state:clone(state)};
      return {ok:true,state:clone(state)};
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{document.querySelector('.local-badge').textContent='BẢN XEM TRƯỚC · DỮ LIỆU MẪU';});
})();
`;
