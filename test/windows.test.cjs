'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../artifacts/tests');

test('gateway discovery finds local Insiders, Cursor and Windsurf extensions without a PATH shim',async t=>{
  await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'ide-discovery-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
  for(const ide of ['.vscode-insiders','.cursor','.windsurf']){
    const exe=path.join(home,ide,'extensions','openai.chatgpt-26.1021.1-win32-x64','bin','windows-x86_64','codex.exe');await fs.mkdir(path.dirname(exe),{recursive:true});await fs.writeFile(exe,'fixture executable');
    assert.equal(await require('../src/core/windows.cjs').findGatewayCodex('',{home,arch:'x64'}),exe);await fs.unlink(exe);
  }
});

test('desktop discovery requires a GUI with a bundled native engine and ignores incomplete installs',async t=>{
  await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'desktop-discovery-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const exe=path.join(folder,'ChatGPT.exe'),engine=path.join(folder,'resources','codex.exe'),w=require('../src/core/windows.cjs');await fs.writeFile(exe,'MZfixture');
  await assert.rejects(w.findDesktop({candidates:[exe]}),{code:'DESKTOP_MISSING'});await fs.mkdir(path.dirname(engine));await fs.writeFile(engine,'MZfixture');
  assert.deepEqual(await w.findDesktop({candidates:[exe]}),{executable:exe,engine,resources:path.dirname(engine)});
});

test('Codex discovery finds native binary in npm layouts without invoking a command shim',async t=>{
  await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'discovery-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const vendor=path.join('vendor','x86_64-pc-windows-msvc','bin','codex.exe');
  const locations=[
    path.join(dir,'npm','node_modules','@openai','codex','node_modules','@openai','codex-win32-x64',vendor),
    path.join(dir,'npm','node_modules','@openai','codex-win32-x64',vendor),
    path.join(dir,'npm','node_modules','@openai','codex',vendor),
    path.join(dir,'npm','node_modules','@openai','codex','vendor','x86_64-pc-windows-msvc','codex','codex.exe')
  ];
  await fs.mkdir(path.join(dir,'npm'),{recursive:true});
  await fs.writeFile(path.join(dir,'npm','codex.cmd'),'exit /b 99');
  const script="require('./src/core/windows.cjs').findCodex(process.argv[1]||undefined).then(p=>process.stdout.write(p)).catch(e=>{process.stdout.write(e.code);process.exitCode=1;});";
  const run=custom=>spawnSync(process.execPath,['-e',script,...(custom?[custom]:[])],{
    cwd:path.resolve(__dirname,'..'),encoding:'utf8',windowsHide:true,
    env:{...process.env,PATH:path.join(dir,'npm'),LOCALAPPDATA:dir,APPDATA:dir}
  });
  assert.equal(run().stdout,'CODEX_MISSING');
  for(const location of locations){
    await fs.mkdir(path.dirname(location),{recursive:true});await fs.writeFile(location,'fixture binary');
    const result=run();assert.equal(result.status,0);assert.equal(result.stdout,location);
    assert.equal(run(path.join(dir,'missing.exe')).stdout,'CODEX_MISSING','explicit path must not fall back');
    await fs.unlink(location);
  }
});
