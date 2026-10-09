'use strict';
// Exercise the actual NSIS portable wrapper twice, using a tiny isolated app.
// No PADSwitcher services, native accounts, model calls or credentials are loaded.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..'),pkg=require('../package.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=120000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await wait(200);}throw Error('Portable smoke timed out');}
async function run(exe,args,options){await new Promise((resolve,reject)=>{const child=spawn(exe,args,{...options,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Portable fixture build failed')));});}
const fixtureMain=String.raw`
'use strict';
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=process.env.PAD_PORTABLE_QA_ROOT,token=process.env.PAD_PORTABLE_QA_TOKEN;
if(!root||!token)app.exit(1);
app.disableHardwareAcceleration();app.setName('PADSwitcher Portable QA');
app.setPath('userData',path.join(root,'browser'));app.setPath('appData',root);
let secondInstances=0;
if(!app.requestSingleInstanceLock())app.exit(0);
else{
  app.on('second-instance',()=>{secondInstances++;});
  app.whenReady().then(()=>{
    const server=http.createServer((req,res)=>{
      if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end();return;}
      if(req.method==='POST'&&req.url==='/quit'){res.end('{}');setTimeout(()=>app.exit(0),50);return;}
      const present=['app.asar','app.asar.unpacked/src/assets/PADCodex.exe','gpt-web/PADGPTWeb.exe','gpt-web/resources/runtime/manifest.json'].map(file=>({file,present:fs.existsSync(path.join(process.resourcesPath,file))}));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pid:process.pid,secondInstances,resources:process.resourcesPath,present}));
    });
    server.listen(0,'127.0.0.1',()=>fs.writeFileSync(path.join(root,'owner.json'),JSON.stringify({port:server.address().port,pid:process.pid,resources:process.resourcesPath})));
  }).catch(()=>app.exit(1));
}
`;
(async()=>{
  const parent=path.join(project,'artifacts/portable-qa');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'run-')),unpacked=path.join(root,'unpacked'),appSource=path.join(root,'app');
  const electronDist=path.dirname(require('electron'));
  await fs.cp(electronDist,unpacked,{recursive:true,filter:file=>!file.startsWith(path.join(electronDist,'resources'))});
  await fs.rename(path.join(unpacked,'electron.exe'),path.join(unpacked,'PADSwitcherPortableQA.exe'));
  await fs.mkdir(appSource);await fs.writeFile(path.join(appSource,'package.json'),JSON.stringify({name:'pad-portable-qa',version:pkg.version,main:'main.cjs'}));
  await fs.writeFile(path.join(appSource,'main.cjs'),fixtureMain);
  const resources=path.join(unpacked,'resources');await fs.mkdir(resources,{recursive:true});
  await require('@electron/asar').createPackage(appSource,path.join(resources,'app.asar'));
  for(const file of ['app.asar.unpacked/src/assets/PADCodex.exe','gpt-web/PADGPTWeb.exe','gpt-web/resources/runtime/manifest.json']){
    const target=path.join(resources,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'PORTABLE QA MARKER');
  }
  const portable={...pkg.build.portable,artifactName:'Portable-QA.exe'};
  // --legacy demonstrates the regression using the old shared extraction folder.
  if(process.argv.includes('--legacy'))delete portable.unpackDirName;
  const config={electronVersion:pkg.devDependencies.electron,appId:'personal.pad.portable.qa',productName:'PADSwitcherPortableQA',directories:{output:path.join(root,'output')},win:{target:'portable',signExecutable:false},portable};
  const configFile=path.join(root,'builder.json');await fs.writeFile(configFile,JSON.stringify(config));
  await run(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),'--win','portable','--x64','--prepackaged',unpacked,'--config',configFile,'--publish','never'],{cwd:project});
  const executable=path.join(root,'output/Portable-QA.exe'),env={...process.env,PAD_PORTABLE_QA_ROOT:root,PAD_PORTABLE_QA_TOKEN:crypto.randomBytes(32).toString('hex')};
  delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  let owner,first,second;const exited=new Map();
  function launch(){const child=spawn(executable,[],{env,stdio:'ignore',windowsHide:true});child.once('exit',code=>exited.set(child,code));child.once('error',error=>exited.set(child,error));return child;}
  async function control(endpoint='/status',method='GET'){
    const result=await fetch('http://127.0.0.1:'+owner.port+endpoint,{method,headers:{authorization:'Bearer '+env.PAD_PORTABLE_QA_TOKEN},signal:AbortSignal.timeout(3000)});
    assert.equal(result.status,200);return result.json();
  }
  try{
    first=launch();owner=await until(async()=>{if(exited.has(first))throw Error('First portable launch exited early');try{return JSON.parse(await fs.readFile(path.join(root,'owner.json'),'utf8'));}catch{return null;}});
    const before=await control();assert(before.present.every(file=>file.present));
    second=launch();await until(()=>exited.has(second));assert.equal(exited.get(second),0);
    const after=await until(async()=>{const state=await control();return state.secondInstances===1?state:null;},15000);
    assert.equal(after.pid,before.pid);assert.equal(after.resources,before.resources);
    assert(after.present.every(file=>file.present),'Reopening the portable must not delete the running app, helper or Web companion');
    await control('/quit','POST');await until(()=>exited.has(first));assert.equal(exited.get(first),0);
    assert.equal(require('node:fs').existsSync(owner.resources),false,'The first launcher cleans only its own temporary resources');
    console.log('Portable double launch: same active instance; native helper and Web resources preserved; isolated temporary cleanup: passed.');
  }finally{
    if(owner&&first&&!exited.has(first)){await control('/quit','POST').catch(()=>{});await until(()=>exited.has(first),10000).catch(()=>first.kill());}
    if(second&&!exited.has(second))second.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
