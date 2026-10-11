'use strict';
// Synthetic accounts only. This fixture never authenticates with Kaggle.
module.exports=String.raw`
  const kgStamp=new Date(now).toISOString();
  const kgAccounts=[
    {id:'11111111-1111-4111-8111-111111111111',username:'padresearch',label:'Nhóm nghiên cứu',workspace:'D:\Projects\Research',watch:['padresearch/keyframe-embeddings'],status:'ready',verifiedAt:kgStamp,quotaAt:kgStamp,notebooksAt:kgStamp,quota:[{resource:'GPU',used:11.5,remaining:18.5,total:30,reserved:2,refreshAt:new Date(now+86400000).toISOString()},{resource:'TPU',used:0,remaining:20,total:20,reserved:0,refreshAt:new Date(now+86400000).toISOString()}],notebooks:[{ref:'padresearch/keyframe-embeddings',title:'Keyframe embeddings · Batch 01',status:'running',accelerator:'GPU',lastRunAt:kgStamp},{ref:'padresearch/feature-index',title:'Feature index · Batch 02',status:'queued',accelerator:'GPU',lastRunAt:kgStamp},{ref:'padresearch/data-preparation',title:'Data preparation',status:'complete',accelerator:'CPU',lastRunAt:kgStamp}]},
    {id:'22222222-2222-4222-8222-222222222222',username:'padvision',label:'Nhóm thị giác',workspace:'D:\Projects\Vision',watch:[],status:'ready',quotaAt:kgStamp,notebooksAt:kgStamp,quota:[{resource:'GPU',used:4,remaining:26,total:30,reserved:1},{resource:'TPU',used:0,remaining:20,total:20,reserved:0}],notebooks:[{ref:'padvision/batch-03',title:'Image features · Batch 03',status:'running',accelerator:'GPU'}]},
    {id:'33333333-3333-4333-8333-333333333333',username:'padarchive',label:'Tài khoản lưu trữ',workspace:'D:\Projects\Archive',watch:[],status:'reauth',lastError:'Token Kaggle đã hết hạn hoặc bị thu hồi. Cập nhật token của tài khoản này.',quotaAt:new Date(now-1800000).toISOString(),notebooksAt:new Date(now-1800000).toISOString(),quota:[{resource:'GPU',used:30,remaining:0,total:30,reserved:0}],notebooks:[]}
  ];
  state.kaggle={accounts:new URLSearchParams(location.search).has('demo')?clone(kgAccounts):[],settings:{pythonPath:'',autoRefresh:true},tool:{python:'3.12.10',kaggle:'2.2.4',kagglesdk:'0.1.37',executable:'C:\Python312\python.exe',supported:true},editing:false};
  for(const p of state.kaggle.accounts)p.notebookList={hasMore:false,loading:false,error:null};
  if(new URLSearchParams(location.search).has('kgquiet')&&state.kaggle.accounts.length){
    for(const [i,p] of state.kaggle.accounts.entries()){
      p.label=['researchteam07062006','vision766','notebookacademy'][i];
      if(i===2)p.username=p.label;
      p.watch=[];p.notebooks=[];p.status='ready';p.lastError=null;p.quotaAt=p.notebooksAt=kgStamp;
      p.quota=[{resource:'GPU',remaining:30,total:30,used:0,reserved:0},{resource:'TPU',remaining:20,total:20,used:0,reserved:0}];
    }
  }
  if(new URLSearchParams(location.search).has('kgmany')&&state.kaggle.accounts.length){
    const p=state.kaggle.accounts[0];
    p.watch=Array.from({length:20},(_,i)=>p.username+'/pinned-'+i);
    p.notebooks=[...p.watch,...Array.from({length:12},(_,i)=>p.username+'/recent-'+i)].map((ref,i)=>({ref,title:(i<20?'Pinned notebook ':'Recent notebook ')+(i<20?i+1:i-19),status:i===0?'running':'complete',accelerator:'GPU',readAt:kgStamp}));
    p.notebookList.hasMore=true;
  }
  async function kaggleAction(command,args){
    let result;const k=state.kaggle,p=k.accounts.find(p=>p.id===args.id);
    k.terminal||={scriptPath:'C:\\Users\\Sample\\AppData\\Roaming\\PADSwitcher\\data\\kaggle\\terminal\\padkaggle.ps1',configured:false,profiles:[{path:'C:\\Users\\Sample\\Documents\\WindowsPowerShell\\profile.ps1',configured:false},{path:'C:\\Users\\Sample\\Documents\\PowerShell\\profile.ps1',configured:false}]};
    if(command==='kaggleTerminalStatus')result=clone(k.terminal);
    if(command==='kaggleTerminalConfigure'){k.terminal.configured=args.enabled;k.terminal.profiles.forEach(p=>p.configured=args.enabled);result=clone(k.terminal);}
    if(command==='kaggleTools')result=clone(k.tool);
    if(command==='kaggleAdd'){
      const account=p||{id:'44444444-4444-4444-8444-444444444444',username:'padnew',watch:[],quota:[],notebooks:[]};
      Object.assign(account,{label:args.label||account.username,workspace:args.workspace,status:'ready',lastError:null,verifiedAt:new Date().toISOString()});
      if(!p)k.accounts.push(account);result=account.id;
    }
    if(command==='kaggleEdit')Object.assign(p,{label:args.label||p.username,workspace:args.workspace});
    if(command==='kaggleRemove')k.accounts=k.accounts.filter(p=>p.id!==args.id);
    if(command==='kaggleSettings')k.settings={pythonPath:args.pythonPath,autoRefresh:args.autoRefresh};
    if(command==='kaggleWatch'){
      const ref=args.ref.replace('https://www.kaggle.com/code/','');
      p.watch=args.remove?p.watch.filter(r=>r!==ref):[...new Set([...p.watch,ref])];
      if(!args.remove&&!p.notebooks.some(n=>n.ref===ref))p.notebooks.push({ref,title:ref,status:'unknown',accelerator:null});
    }
    if(command==='kaggleNotebooksMore'){
      p.notebookList.loading=true;p.refreshing=true;publish();
      await new Promise(resolve=>setTimeout(resolve,30));
      const offset=p.notebooks.length;
      for(let i=0;i<12;i++)p.notebooks.push({ref:p.username+'/older-'+(offset+i),title:'Earlier notebook '+(offset+i+1),status:'complete',accelerator:'CPU',readAt:new Date().toISOString()});
      p.notebookList={hasMore:offset<44,loading:false,error:null};p.refreshing=false;
    }
    if(command==='kaggleRefresh'||command==='kaggleRefreshAll'){
      for(const account of k.accounts)if(command==='kaggleRefreshAll'||account.id===args.id){account.quotaAt=account.notebooksAt=new Date().toISOString();}
    }
    if(command==='kaggleLaunch')p.lastTerminalAt=new Date().toISOString();
    publish();return {ok:true,result,state:clone(state)};
  }
`;
