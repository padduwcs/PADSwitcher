'use strict';
// Packaged companion, two disposable accounts, no login and no inference.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const packaged=process.argv.includes('--packaged');
if(packaged){
  const app=require('electron').app,syncFs=require('node:fs'),parent=path.resolve(__dirname,'../artifacts/web-parent-qa');
  syncFs.mkdirSync(parent,{recursive:true});const harness=syncFs.mkdtempSync(path.join(parent,'run-'));
  app.disableHardwareAcceleration();app.setPath('userData',harness);app.setPath('appData',harness);app.setName('PADSwitcher Web Packaged QA');
}
const {WebService}=require(packaged?'../dist/win-unpacked/resources/app.asar/src/core/web-service.cjs':'../src/core/web-service.cjs');
const windows=require('../src/core/windows.cjs');
(async()=>{
  const parent=path.resolve(__dirname,'../artifacts/web-companion-smoke');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'run-')),native=path.join(root,'native');await fs.mkdir(native);
  const marker='NATIVE FIXTURE — DO NOT CHANGE';await fs.writeFile(path.join(native,'config.toml'),'model = "fixture"\n');await fs.writeFile(path.join(native,'auth.json'),marker);
  const digest=async name=>crypto.createHash('sha256').update(await fs.readFile(path.join(native,name))).digest('hex');
  const before={config:await digest('config.toml'),auth:await digest('auth.json')};
  const companion=path.resolve(__dirname,packaged?'../dist/win-unpacked/resources/gpt-web':'../artifacts/gpt-web/companion'),exe=path.join(companion,'PADGPTWeb.exe');
  const service=new WebService(path.join(root,'web'),{platform:windows,nativeHome:()=>native,available:()=>true,invocation:()=>({executable:exe,args:['--hidden'],cwd:companion})});
  const deadline=setTimeout(()=>{console.error('Companion smoke timed out.');process.exit(1);},120000);
  try{
    await service.init();const a=await service.add('Fixture A'),b=await service.add('Fixture B');
    await service.launch(a,false);await service.launch(b,false);
    const da=await service.descriptor(a),db=await service.descriptor(b);
    assert.notEqual(da.pid,db.pid);assert.notEqual(da.endpoint,db.endpoint);assert.notEqual(da.token,db.token);
    const sa=await service.refreshStatus(a),sb=await service.refreshStatus(b);
    assert.equal(sa.configured,false);assert.equal(sb.configured,false);assert.equal(service.enabled,false);
    assert.equal((await fetch(da.endpoint+'/status')).status,401);
    assert.equal((await fetch(da.endpoint+'/status',{headers:{authorization:'Bearer '+da.token,origin:'https://example.test'}})).status,401);
    const publicView=JSON.stringify(service.view());assert(!publicView.includes(da.token));assert(!publicView.includes(da.endpoint));
    assert.equal(sa.setup.supported,true);assert.equal(sb.setup.supported,true);
    const requestId=crypto.randomUUID();
    const post=(body,headers={})=>fetch(da.endpoint+'/setup',{method:'POST',headers:{authorization:'Bearer '+da.token,'content-type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await post({action:'prepare',requestId})).status,400); // no consent, no inference
    assert.equal((await post({action:'external',requestId,target:'https://example.test'})).status,400);
    assert.equal((await post({action:'login',requestId},{origin:'https://example.test'})).status,401);
    assert.equal((await post({padding:'x'.repeat(9000)})).status,413);
    // A disposable signed-out account fails at authentication before smoke/install.
    await service.setupCommand(a,{action:'prepare',requestId,consent:true});
    const setupDeadline=Date.now()+15000;let setupStatus=await service.refreshStatus(a);
    while(setupStatus.setup.job.status==='running'&&Date.now()<setupDeadline){await new Promise(r=>setTimeout(r,100));setupStatus=await service.refreshStatus(a);}
    assert.equal(setupStatus.setup.job.status,'failed');assert.equal(setupStatus.setup.job.step,'authentication');
    assert.equal(setupStatus.setup.prepared,false);assert.equal(setupStatus.setup.smokePassed,false);
    assert.equal((await post({action:'prepare',requestId,consent:true})).status,202);
    assert.equal((await service.refreshStatus(a)).setup.job.id,requestId);
    await assert.rejects(service.enable(),{code:'WEB_SETUP_REQUIRED'});
    for(const id of [a,b]){const until=Date.now()+15000;while((await service.refreshStatus(id)).operation&&Date.now()<until)await new Promise(r=>setTimeout(r,250));}
    await service.disable();assert.equal(service.children.size,0);
    assert.deepEqual({config:await digest('config.toml'),auth:await digest('auth.json')},before);
    for(const id of [a,b])assert((await fs.stat(path.join(service.home(id),'browser-data'))).isDirectory());
    console.log('Packaged Web companion: isolated accounts, private setup, authenticated owner control, idle shutdown and untouched native auth/config: passed.');
    await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:true,nativeFilesUnchanged:true,accounts:2,inferenceRequests:0}));
  }finally{clearTimeout(deadline);clearInterval(service.timer);if(service.children.size)await service.shutdown().catch(()=>{});}
})().then(()=>{if(packaged)require('electron').app.exit(0);}).catch(e=>{console.error(e);if(packaged)require('electron').app.exit(1);else process.exitCode=1;});
