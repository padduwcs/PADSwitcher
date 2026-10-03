'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {Integration,settingsValue}=require('../src/core/integration.cjs');
test('connection settings status is read-only, handles external edits, missing helper and malformed config',async t=>{
  const f=await fixture(t),file=path.join(f.directory,'settings.json'),helper=path.join(f.service.root,'gateway','PADCodex.exe');
  await fs.mkdir(path.dirname(helper));await fs.writeFile(file,'{}');const integration=new Integration(f.service,file);
  assert.equal((await integration.status()).configuration,'notConfigured');
  const configured=JSON.stringify({'chatgpt.cliExecutable':helper});await fs.writeFile(file,configured);
  assert.deepEqual(await integration.status(),{configuration:'configured',helperPresent:false});await fs.writeFile(helper,'fixture');
  assert.deepEqual(await integration.status(),{configuration:'configured',helperPresent:true});assert.equal(await fs.readFile(file,'utf8'),configured);
  await fs.writeFile(file,JSON.stringify({'chatgpt.cliExecutable':'another.exe'}));assert.equal((await integration.status()).configuration,'notConfigured');
  await fs.writeFile(file,'{broken');assert.equal((await integration.status()).configuration,'unknown');
});
test('VS Code setup and restore preserve comments and unrelated later changes',async t=>{
  const f=await fixture(t),file=path.join(f.directory,'settings.json'),helper=path.join(f.directory,'PADCodex.exe');await fs.writeFile(helper,'fixture');
  await fs.writeFile(file,'{\n // Keep this comment\n "editor.fontSize": 14,\n "chatgpt.cliExecutable": "old.exe",\n}');
  const integration=new Integration(f.service,file);await integration.configure(helper);
  let text=await fs.readFile(file,'utf8');assert(text.includes('// Keep this comment'));assert.equal(settingsValue(text)['chatgpt.cliExecutable'],helper);
  await fs.writeFile(file,text.replace('14','18'));await integration.restore();text=await fs.readFile(file,'utf8');
  assert.equal(settingsValue(text)['editor.fontSize'],18);assert.equal(settingsValue(text)['chatgpt.cliExecutable'],'old.exe');assert(text.includes('// Keep this comment'));
});
test('restore removes newly added setting and refuses overwriting a user override',async t=>{
  const f=await fixture(t),file=path.join(f.directory,'settings.json'),helper=path.join(f.directory,'PADCodex.exe');await fs.writeFile(helper,'fixture');await fs.writeFile(file,'{}');
  const integration=new Integration(f.service,file);await integration.configure(helper);await integration.configure(helper);await integration.restore();assert(!Object.hasOwn(settingsValue(await fs.readFile(file,'utf8')),'chatgpt.cliExecutable'));
  await integration.configure(helper);await fs.writeFile(file,'{"chatgpt.cliExecutable":"user.exe"}');await assert.rejects(integration.restore(),{code:'VSCODE_CHANGED'});
  assert.equal(settingsValue(await fs.readFile(file,'utf8'))['chatgpt.cliExecutable'],'user.exe');
});
test('invalid JSONC refuses setup before any setting is written',async t=>{
  const f=await fixture(t),file=path.join(f.directory,'settings.json'),helper=path.join(f.directory,'PADCodex.exe');await fs.writeFile(helper,'fixture');await fs.writeFile(file,'{ broken');
  await assert.rejects(new Integration(f.service,file).configure(helper),{code:'VSCODE_SETTINGS'});assert.equal(await fs.readFile(file,'utf8'),'{ broken');
});
