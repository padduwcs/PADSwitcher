'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {KaggleShell}=require('../src/core/kaggle-shell.cjs');
const {TERMINAL_SCRIPT}=require('../src/core/kaggle.cjs');
const windows=require('../src/core/windows.cjs');
const {fixture}=require('./helpers.cjs');

async function shellFixture(t){
  const f=await fixture(t),root=path.join(f.data,'kaggle'),profiles=['WindowsPowerShell','PowerShell'].map(name=>path.join(f.directory,'Documents',name,'profile.ps1'));
  await fs.mkdir(root,{recursive:true});
  const shell=new KaggleShell(root,{shellProfilePaths:profiles});await shell.ensure();
  return {...f,root,profiles,shell};
}

test('shell setup preserves UTF-8/UTF-16 profiles, is idempotent, and removes only its own block',async t=>{
  const f=await shellFixture(t),texts=['# Thiết lập riêng\r\nfunction prompt { "Project> " }\r\n','# PowerShell 7\n$env:TEST_OTHER="keep"\n'];
  const encodings=['utf8','utf16le'],boms=[Buffer.from([239,187,191]),Buffer.from([255,254])];
  for(let i=0;i<2;i++){await fs.mkdir(path.dirname(f.profiles[i]),{recursive:true});await fs.writeFile(f.profiles[i],Buffer.concat([boms[i],Buffer.from(texts[i],encodings[i])]));}
  assert.equal((await f.shell.status()).configured,false);
  assert.equal((await f.shell.configure(true)).configured,true);
  const installed=await Promise.all(f.profiles.map(file=>fs.readFile(file)));
  for(let i=0;i<2;i++){assert(installed[i].subarray(0,boms[i].length).equals(boms[i]));assert(installed[i].subarray(boms[i].length).toString(encodings[i]).startsWith(texts[i]));}
  await f.shell.configure(true);assert.deepEqual(await Promise.all(f.profiles.map(file=>fs.readFile(file))),installed);
  assert.equal((await f.shell.configure(false)).configured,false);
  for(let i=0;i<2;i++)assert.equal((await fs.readFile(f.profiles[i])).subarray(boms[i].length).toString(encodings[i]),texts[i]);
  assert(f.shell.command('account-a').includes('padkaggle use \'account-a\''));assert(!f.shell.command('account-a').includes('KGAT_'));
});

test('malformed profile blocks and unsafe files are preserved; a concurrent edit rolls back the other profile',async t=>{
  const f=await shellFixture(t);await fs.mkdir(path.dirname(f.profiles[0]),{recursive:true});
  const malformed='# >>> PADSwitcher Kaggle >>>\nmissing end marker';await fs.writeFile(f.profiles[0],malformed);
  await assert.rejects(f.shell.configure(true),{code:'KAGGLE_SHELL'});assert.equal(await fs.readFile(f.profiles[0],'utf8'),malformed);
  await fs.writeFile(f.profiles[0],'# existing\n');await fs.mkdir(path.dirname(f.profiles[1]),{recursive:true});await fs.writeFile(f.profiles[1],'# second\n');
  const original=f.shell.read.bind(f.shell);let reads=0;
  f.shell.read=async file=>{if(file===f.profiles[1]&&++reads===2)await fs.writeFile(file,'# edited concurrently\n');return original(file);};
  await assert.rejects(f.shell.configure(true),{code:'KAGGLE_SHELL'});
  assert.equal(await fs.readFile(f.profiles[0],'utf8'),'# existing\n');assert.equal(await fs.readFile(f.profiles[1],'utf8'),'# edited concurrently\n');
  f.shell.read=original;await fs.unlink(f.profiles[0]);await fs.link(f.profiles[1],f.profiles[0]);
  await assert.rejects(f.shell.configure(true),{code:'UNSAFE_PATH'});assert.equal(await fs.readFile(f.profiles[1],'utf8'),'# edited concurrently\n');
  await fs.unlink(f.profiles[0]);await fs.writeFile(f.profiles[0],'# SIG # Begin signature block\n');
  await assert.rejects(f.shell.configure(true),{code:'KAGGLE_SHELL_SIGNED'});assert.equal(await fs.readFile(f.profiles[0],'utf8'),'# SIG # Begin signature block\n');
});

async function nativeFixture(t){
  const f=await shellFixture(t),tools=path.join(f.directory,"tools ' spaces"),work=path.join(f.directory,"workspace ' Việt");await fs.mkdir(tools);await fs.mkdir(work);
  // A native fixture executable emulates only the dependency probe. It never contacts Kaggle.
  const source=path.join(tools,'probe.cs'),python=path.join(tools,'python.exe');
  await fs.writeFile(source,String.raw`using System; using System.IO; public static class Probe {
    public static int Main() {
      if (Console.In.ReadToEnd() != "{\"action\":\"probe\"}" || Environment.GetEnvironmentVariable("KAGGLE_API_TOKEN") != null || Environment.GetEnvironmentVariable("PYTHONPATH") != null) return 2;
      string folder=AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\').Replace("\\", "\\\\").Replace("\"", "\\\"");
      Console.Write("{\"ok\":true,\"supported\":true,\"executable\":\""+folder+"\\\\python.exe\",\"scriptsPath\":\""+folder+"\"}"); return 0;
    }
  }`);
  await windows.run(path.join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:exe','/out:'+python,source]);
  await fs.copyFile(python,path.join(tools,'kaggle.exe'));
  const accounts=[];
  for(const username of ['account-a','account-b']){
    const id=crypto.randomUUID(),folder=path.join(f.root,id);await fs.mkdir(path.join(folder,'cli'),{recursive:true});
    await fs.writeFile(path.join(folder,'token.dpapi'),await windows.dpapi(Buffer.from('KGAT_fixture-only-'+username)));
    accounts.push({id,username,label:username==='account-a'?'Nhóm thử nghiệm':'Second account'});
  }
  await fs.writeFile(path.join(f.root,'accounts.json'),JSON.stringify({version:1,accounts,settings:{pythonPath:python,autoRefresh:false}}));
  const env={...process.env,PATH:process.env.PATH+';'+tools,PAD_SHELL_TEST_TOOLS:tools,PAD_SHELL_TEST_HELPER:f.shell.script,PAD_SHELL_TEST_WORK:work,PAD_SHELL_TEST_B_VAULT:path.join(f.root,accounts[1].id,'token.dpapi'),PYTHONPATH:'fixture-python-hook',KAGGLE_API_TOKEN:'fixture-original-token',KAGGLE_USERNAME:'original',KAGGLE_CONFIG_DIR:'fixture-original-config',KAGGLE_CUSTOM:'fixture-original-extra'};
  return {...f,tools,work,accounts,env};
}
const inspect=String.raw`$state=[ordered]@{username=$env:KAGGLE_USERNAME;tokenCorrect=($env:KAGGLE_API_TOKEN -eq ('KGAT_fixture-only-'+$env:KAGGLE_USERNAME));fallbackBlocked=($env:KAGGLE_KEY -eq 'PADSwitcher-token-only-no-legacy-key');folderUnchanged=((Get-Location).Path -eq $env:PAD_SHELL_TEST_WORK);config=$env:KAGGLE_CONFIG_DIR}; Write-Output ('PAD_RESULT:'+($state|ConvertTo-Json -Compress))`;
function result(output){assert(!output.includes('KGAT_fixture'));return JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith('PAD_RESULT:')).slice(11));}

test('native PowerShell selection switches in place, deduplicates PATH and restores prior environment without changing folder',{skip:process.platform!=='win32',timeout:45000},async t=>{
  const f=await nativeFixture(t);
  const output=await windows.ps(String.raw`$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest; Set-Location -LiteralPath $env:PAD_SHELL_TEST_WORK; $originalPath=$env:PATH
    . $env:PAD_SHELL_TEST_HELPER
    if($env:KAGGLE_USERNAME -ne 'original'){throw 'Loading must not select an account'}
    padkaggle use 'Nhóm thử nghiệm' | Out-Null
    if(($env:PATH -split ';')[0] -ne $env:PAD_SHELL_TEST_TOOLS){throw 'Selected tools must precede other installations'}
    $a=($env:KAGGLE_USERNAME -eq 'account-a' -and $env:KAGGLE_API_TOKEN -eq 'KGAT_fixture-only-account-a')
    padkaggle use account-b | Out-Null
    padkaggle use ACCOUNT-B | Out-Null
    $pathOnce=$env:PATH; padkaggle use account-b | Out-Null
    if($env:PATH -ne $pathOnce){throw 'Repeated selection changed PATH'}
    $b=($env:KAGGLE_USERNAME -eq 'account-b' -and $env:KAGGLE_API_TOKEN -eq 'KGAT_fixture-only-account-b')
    $env:PATH+=';C:\fixture-added-later'
    padkaggle off | Out-Null
    $restore=($env:KAGGLE_API_TOKEN -eq 'fixture-original-token' -and $env:KAGGLE_USERNAME -eq 'original' -and $env:KAGGLE_CONFIG_DIR -eq 'fixture-original-config' -and $env:KAGGLE_CUSTOM -eq 'fixture-original-extra' -and $env:PATH -eq ($originalPath+';C:\fixture-added-later'))
    Write-Output ('PAD_RESULT:'+(@{a=$a;b=$b;restored=$restore;folderUnchanged=((Get-Location).Path -eq $env:PAD_SHELL_TEST_WORK)}|ConvertTo-Json -Compress))`,{env:f.env,timeout:30000});
  const r=result(output);assert.equal(r.a,true);assert.equal(r.b,true);assert.equal(r.restored,true);assert.equal(r.folderUnchanged,true);
});

test('failed account/token selection leaves the current terminal credentials intact and errors do not reveal tokens',{skip:process.platform!=='win32',timeout:30000},async t=>{
  const f=await nativeFixture(t);
  const output=await windows.ps(String.raw`$ErrorActionPreference='Stop'; . $env:PAD_SHELL_TEST_HELPER
    padkaggle use account-a | Out-Null; $originalPath=$env:PATH; $messages=@()
    foreach($name in @('missing-account','account-b')){
      if($name -eq 'account-b'){[IO.File]::WriteAllBytes($env:PAD_SHELL_TEST_B_VAULT,[byte[]]@(1,2,3))}
      try{padkaggle use $name -ErrorAction Stop | Out-Null;throw 'Selection must fail'}catch{$messages+=($_.Exception.Message)}
    }
    Write-Output ('PAD_RESULT:'+(@{unchanged=($env:KAGGLE_USERNAME -eq 'account-a' -and $env:KAGGLE_API_TOKEN -eq 'KGAT_fixture-only-account-a' -and $env:PATH -eq $originalPath);safe=(($messages -join ' ') -notlike '*KGAT*');failed=$messages.Count}|ConvertTo-Json -Compress))`,{env:f.env,timeout:20000});
  const r=result(output);assert.equal(r.unchanged,true);assert.equal(r.safe,true);assert.equal(r.failed,2);
});

test('simultaneous native shells and the app terminal bootstrap use independent account selections',{skip:process.platform!=='win32',timeout:30000},async t=>{
  const f=await nativeFixture(t);
  const outputs=await Promise.all(['account-a','account-b'].map(async username=>{
    const env={...f.env,PADSWITCHER_KAGGLE_HELPER:f.shell.script,PADSWITCHER_KAGGLE_USERNAME:username,PADSWITCHER_KAGGLE_WORKSPACE:f.work,PADSWITCHER_KAGGLE_HINT:'Fixture'};
    const output=await windows.ps(TERMINAL_SCRIPT+'\n'+inspect+'\n'+'if(@(Get-ChildItem Env: | Where-Object {$_.Name -like "PADSWITCHER_KAGGLE_*"}).Count){throw "Bootstrap variables retained"}',{env,timeout:20000});return result(output);
  }));
  assert.deepEqual(outputs.map(r=>r.username),['account-a','account-b']);assert.notEqual(outputs[0].config,outputs[1].config);
  for(const r of outputs){assert.equal(r.tokenCorrect,true);assert.equal(r.fallbackBlocked,true);assert.equal(r.folderUnchanged,true);}
});

test('PowerShell 7 loads the managed profile and selects/restores its process environment',{skip:process.platform!=='win32',timeout:30000},async t=>{
  const pwsh=path.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell','7','pwsh.exe');
  if(!await fs.stat(pwsh).then(()=>true,()=>false)){t.skip('PowerShell 7 is not installed.');return;}
  const f=await nativeFixture(t);await f.shell.configure(true);
  const script=String.raw`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest; . $env:PAD_SHELL_TEST_PROFILE
    padkaggle use account-b | Out-Null
    $selected=($env:KAGGLE_USERNAME -eq 'account-b' -and $env:KAGGLE_API_TOKEN -eq 'KGAT_fixture-only-account-b')
    padkaggle off | Out-Null
    Write-Output ('PAD_RESULT:'+(@{selected=$selected;restored=($env:KAGGLE_USERNAME -eq 'original' -and $env:KAGGLE_API_TOKEN -eq 'fixture-original-token')}|ConvertTo-Json -Compress))`;
  const output=await windows.run(pwsh,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:{...f.env,PAD_SHELL_TEST_PROFILE:f.profiles[1]}});
  const r=result(output);assert.equal(r.selected,true);assert.equal(r.restored,true);
});
