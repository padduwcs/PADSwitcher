'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../artifacts/tests');

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
