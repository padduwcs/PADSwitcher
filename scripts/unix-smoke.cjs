'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createUnixPlatform}=require('../src/core/unix.cjs');
const {ProfileService}=require('../src/core/service.cjs');
const {KaggleService}=require('../src/core/kaggle.cjs');
const {auth}=require('../test/helpers.cjs');
(async()=>{
  if(!['linux','darwin'].includes(process.platform))throw Error('Run the Unix smoke check in Linux/macOS.');
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-smoke-')));await fs.chmod(root,0o700);
  try {
    const platform=createUnixPlatform(root),check=JSON.parse(await platform.run(platform.helperSource,['--selftest'],{timeout:60000}));
    assert.deepEqual(check,{encryption:true,keyring:true,tamperRejected:true});
    console.log('System keyring and authenticated vault: passed.');
    const service=new ProfileService(root);await service.init();assert.equal(service.view().profiles.length,0);assert.equal(service.state.settings.desktopHome,path.join(root,'codex-home'));
    assert.equal((await fs.stat(root)).mode&0o777,0o700);assert((await platform.processes()).some(p=>p.ProcessId===process.pid));
    console.log('Private service startup and process inspection: passed.');
    const fixture=auth('unix-native-smoke'),profile=await service.capture(fixture,'Fixture');assert.deepEqual(await service.loadAuth(profile.id),fixture);
    if(process.platform==='linux')await assert.rejects(platform.run(platform.helperSource,['--vault','encrypt'],{input:fixture,env:{...process.env,PADSWITCHER_VAULT_ROOT:root,DBUS_SESSION_BUS_ADDRESS:'unix:path=/nonexistent-padswitcher-fixture'}}),{code:'VAULT_ERROR'});
    const home=await service.runtime(profile.id);
    await platform.run(platform.helperSource,['--session','/usr/bin/true'],{env:{...process.env,CODEX_HOME:home,PADSWITCHER_VAULT_ROOT:root,PADSWITCHER_PRIVATE_SESSION:'1',PADSWITCHER_SESSION_IDENTITY:profile.identity},timeout:60000});
    assert.equal(await fs.stat(path.join(home,'auth.json')).then(()=>true,()=>false),false);assert.deepEqual(await service.loadAuth(profile.id),fixture);
    console.log('Independent native session guardian: passed.');
    const tools=path.join(root,'tools');await fs.mkdir(tools,{mode:0o700});await fs.writeFile(path.join(tools,'kaggle'),'#!/bin/sh\nexit 0\n',{mode:0o700});
    const python=await platform.run('python3',['-c','import sys; print(sys.executable)']);
    const kaggle=new KaggleService(root,{bridge:async(_python,payload)=>payload.action==='probe'?{ok:true,supported:true,executable:python,scriptsPath:tools}:{ok:true,username:payload.token.endsWith('account-b')?'account-b':'account-a'}});await kaggle.init();
    for(const name of ['account-a','account-b'])await kaggle.add({token:'KGAT_fixture-only-'+name,label:name,workspace:root});
    await fs.writeFile(path.join(kaggle.shell.folder,'kaggle-reader.py'),'import json, os\nassert not os.environ.get("KAGGLE_API_TOKEN")\nassert not os.environ.get("PYTHONPATH")\nprint('+JSON.stringify(JSON.stringify({ok:true,supported:true,executable:python,scriptsPath:tools}))+')\n',{mode:0o600});
    const script=`. ${platform.quote(kaggle.shell.script)}\npadkaggle use account-a >/dev/null\n[ "$KAGGLE_API_TOKEN" = 'KGAT_fixture-only-account-a' ] || exit 10\npadkaggle use account-b >/dev/null\n[ "$KAGGLE_API_TOKEN" = 'KGAT_fixture-only-account-b' ] || exit 11\nif padkaggle use missing >/dev/null 2>&1; then exit 12; fi\n[ "$KAGGLE_USERNAME" = account-b ] || exit 13\nPATH="$PATH:/tmp/pad-added-after-selection"\npadkaggle off\n[ "$KAGGLE_API_TOKEN" = fixture-original ] || exit 14\n[ "$KAGGLE_CUSTOM" = keep ] || exit 15\ncase "$PATH" in */tmp/pad-added-after-selection) ;; *) exit 16 ;; esac\nprintf fixture-shell-ok`;
    for(const shell of ['/bin/bash','/bin/zsh']){if(!await fs.stat(shell).then(()=>true,()=>false))continue;assert.equal(await platform.run(shell,['-c',script],{env:{...process.env,KAGGLE_API_TOKEN:'fixture-original',KAGGLE_CUSTOM:'keep',PYTHONPATH:'fixture-invalid-hook'},timeout:60000}),'fixture-shell-ok');}
    if(process.platform==='linux'&&process.env.DISPLAY){const marker=path.join(root,'terminal-marker');const child=platform.terminal('/bin/sh',['-c',`printf fixture-terminal-ok > ${platform.quote(marker)}`],{cwd:root});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Native terminal supervisor failed')));});assert.equal(await fs.readFile(marker,'utf8'),'fixture-terminal-ok');}
    await kaggle.shutdown();await service.close();console.log('System keyring, real vault/guardian, Bash/Zsh account selection, terminal supervisor and isolated storage: passed.');
  } finally {await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
