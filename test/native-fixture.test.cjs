'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {assertFixtureHome}=require('../scripts/native-fixture.cjs');
test('native fixture isolation checks the server-reported home before any mutation',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pad-home-guard-'))),home=path.join(root,'home'),other=path.join(root,'other');await fs.mkdir(home);await fs.mkdir(other);
  t.after(async()=>{assert.equal((await fs.realpath(path.dirname(root))).toLowerCase(),(await fs.realpath(os.tmpdir())).toLowerCase());assert(path.basename(root).startsWith('pad-home-guard-'));await fs.rm(root,{recursive:true,force:true});});
  await assertFixtureHome({codexHome:home},home,root);
  await assert.rejects(assertFixtureHome({codexHome:other},home,root),/outside the expected/);
  await assert.rejects(assertFixtureHome({},home,root),/outside the expected/);
  await assert.rejects(assertFixtureHome({codexHome:root},root,home),/outside its disposable/);
});
