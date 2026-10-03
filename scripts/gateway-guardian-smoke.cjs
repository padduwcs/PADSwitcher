'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const windows=require('../src/core/windows.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const parent=path.resolve('artifacts/guardian-qa');await fs.mkdir(parent,{recursive:true});
  const dir=await fs.mkdtemp(path.join(parent,'run-'));await windows.protectDirectory(dir);
  const executable=await windows.findGatewayCodex(),helper=path.resolve('src/assets/PADCodex.exe');
  const manager=spawn(process.execPath,[path.resolve('scripts/gateway-owner-fixture.cjs'),helper,executable],{env:{...process.env,CODEX_HOME:dir},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  const exited=new Promise(r=>manager.once('close',r));
  try{
    const info=await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('Guardian fixture did not start.')),10000);manager.once('message',m=>{clearTimeout(timer);r(m);});manager.once('error',j);});
    let codex;
    for(let i=0;i<10;i++){codex=(await windows.processes()).find(p=>p.ParentProcessId===info.pid&&p.Name.toLowerCase()==='codex.exe');if(codex)break;await pause(100);}
    assert(codex,'Native Codex child must be running before crash simulation.');
    manager.kill();await exited;
    for(let i=0;i<10;i++){const all=await windows.processes();if(!all.some(p=>p.ProcessId===info.pid||p.ProcessId===codex.ProcessId)){console.log('Windows Job Object and owner-crash guardian: helper and native Codex both exited.');return;}await pause(100);}
    throw Error('Guardian did not close the isolated Codex process.');
  }finally{if(manager.exitCode===null)manager.kill();await exited;assert.equal(path.dirname(path.resolve(dir)),parent);await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
