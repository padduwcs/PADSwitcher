'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {JetBrainsIntegration,discover,settings,AGENT}=require('../src/core/jetbrains.cjs');
async function setup(t){
  const f=await fixture(t),file=path.join(f.directory,'.jetbrains','acp.json'),helper=path.join(f.directory,'PADCodex.exe');
  await fs.writeFile(helper,'fixture');f.service.gateway={status:'ready',view:()=>({connected:{jetbrains:0}})};
  const script=path.join(f.directory,'adapter.js'),license=path.join(f.directory,'LICENSE');await fs.writeFile(script,'fixture adapter');await fs.writeFile(license,'Apache-2.0 fixture');
  const options={file,discover:async()=>({node:process.execPath,script,license,version:'2.1.1'})};
  return {...f,file,helper,options,jb:new JetBrainsIntegration(f.service,options)};
}
test('JetBrains setup adds only its agent, copies adapter/license and preserves unrelated settings on removal',async t=>{
  const f=await setup(t);await fs.mkdir(path.dirname(f.file));
  const text='{\n // user comment\n "default_mcp_settings":{"use_idea_mcp":true},"agent_servers":{"Other":{"command":"own","env":{"API_KEY":"fixture-private"}}}}';
  await fs.writeFile(f.file,text);await f.jb.configure(f.helper);
  let value=settings(await fs.readFile(f.file,'utf8'));assert(value.agent_servers[AGENT]);assert.equal(value.agent_servers.Other.env.API_KEY,'fixture-private');
  assert.deepEqual(await f.jb.status(),{configuration:'configured',runtimePresent:true});
  assert(!(await fs.readFile(f.jb.record,'utf8')).includes('fixture-private'),'record must never copy unrelated credentials');
  assert.equal(await fs.readFile(path.join(f.jb.runtime,'LICENSE-codex-acp.txt'),'utf8'),'Apache-2.0 fixture');
  await f.jb.configure(f.helper);value.agent_servers.Other.command='changed';
  value.agent_servers[AGENT]=Object.fromEntries(Object.entries(value.agent_servers[AGENT]).reverse());
  await fs.writeFile(f.file,JSON.stringify(value));assert.equal((await f.jb.status()).configuration,'configured');
  await f.jb.restore();value=settings(await fs.readFile(f.file,'utf8'));assert(!value.agent_servers[AGENT]);assert.equal(value.agent_servers.Other.command,'changed');
});
test('JetBrains status is read-only and setup refuses malformed or conflicting configurations',async t=>{
  const f=await setup(t);assert.equal((await f.jb.status()).configuration,'notConfigured');assert.equal(await fs.stat(path.dirname(f.file)).then(()=>true,()=>false),false);
  await fs.mkdir(path.dirname(f.file));await fs.writeFile(f.file,'{broken');await assert.rejects(f.jb.configure(f.helper),{code:'JETBRAINS_SETTINGS'});assert.equal(await fs.readFile(f.file,'utf8'),'{broken');
  const original=JSON.stringify({agent_servers:{[AGENT]:{command:'user-custom'}}});await fs.writeFile(f.file,original);await assert.rejects(f.jb.configure(f.helper),{code:'JETBRAINS_CHANGED'});assert.equal(await fs.readFile(f.file,'utf8'),original);
});
test('JetBrains removal preserves user overrides and detects missing runtime without claiming a live connection',async t=>{
  const f=await setup(t);await f.jb.configure(f.helper);await fs.unlink(path.join(f.jb.runtime,'codex-acp.mjs'));assert.deepEqual(await f.jb.status(),{configuration:'configured',runtimePresent:false});
  const value=settings(await fs.readFile(f.file,'utf8'));value.agent_servers[AGENT].command='other';await fs.writeFile(f.file,JSON.stringify(value));
  assert.equal((await f.jb.status()).configuration,'notConfigured');await assert.rejects(f.jb.restore(),{code:'JETBRAINS_CHANGED'});assert.equal(settings(await fs.readFile(f.file,'utf8')).agent_servers[AGENT].command,'other');
});
test('JetBrains setup refuses missing adapters, stopped gateways and active JetBrains clients',async t=>{
  const f=await setup(t);f.service.gateway.status='stopped';await assert.rejects(f.jb.configure(f.helper),{code:'GATEWAY_STOPPED'});
  f.service.gateway.status='ready';f.service.gateway.view=()=>({connected:{jetbrains:1}});await assert.rejects(f.jb.configure(f.helper),{code:'JETBRAINS_ACTIVE'});
  f.service.gateway.view=()=>({connected:{jetbrains:0}});f.jb.discover=()=>discover(f.directory);await assert.rejects(f.jb.configure(f.helper),{code:'JETBRAINS_ADAPTER'});assert.equal(await fs.stat(f.file).then(()=>true,()=>false),false);
});
test('JetBrains discovery selects the inspected adapter and managed Node runtime without inspecting auth',async t=>{
  const f=await setup(t),runtime=path.join(f.directory,'Google','AndroidStudio2026.1.4','acp-agents','.runtimes','node','24.13.0');
  const pkg=path.join(runtime,'npm-cache','_npx','fixture','node_modules','@agentclientprotocol','codex-acp');
  await fs.mkdir(path.join(pkg,'dist'),{recursive:true});await fs.mkdir(path.join(runtime,'bin'));await fs.writeFile(path.join(runtime,'bin','node.exe'),'fixture');await fs.writeFile(path.join(pkg,'dist','index.js'),'fixture');await fs.writeFile(path.join(pkg,'LICENSE'),'fixture');
  await fs.writeFile(path.join(pkg,'package.json'),JSON.stringify({name:'@agentclientprotocol/codex-acp',version:'2.1.1'}));
  const found=await discover(f.directory);assert.equal(found.version,'2.1.1');assert.equal(found.node,path.join(runtime,'bin','node.exe'));
  await fs.writeFile(path.join(pkg,'package.json'),JSON.stringify({name:'@agentclientprotocol/codex-acp',version:'9.0.0'}));await assert.rejects(discover(f.directory),{code:'JETBRAINS_ADAPTER'});
});
