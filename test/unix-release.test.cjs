'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {prepare,installers,digest,verifyMetadata}=require('../scripts/prepare-unix-release.cjs');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-release-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const directory=path.join(root,'assets');await fs.mkdir(directory);
  for(const file of installers()){
    const target=path.join(directory,file);await fs.writeFile(target,`Fixture ${file}\n`);
    await fs.writeFile(target+'.sha256',`${await digest(target)}  ${file}\n`);
  }
  return {directory,notes:path.join(root,'notes.md')};
}
test('Unix release prepares all architectures, verified checksums and bilingual instructions',async t=>{
  const options=await fixture(t),result=await prepare(options);
  assert.equal(result.installers,8);assert.equal(result.assets,19);
  assert.equal((await fs.readdir(options.directory)).length,19);
  const sums=await fs.readFile(path.join(options.directory,'SHA256SUMS.txt'),'utf8');
  assert.equal(sums.trim().split('\n').length,10);
  for(const line of sums.trim().split('\n')){const [hash,file]=line.split('  ');assert.equal(hash,await digest(path.join(options.directory,file)));}
  const notes=await fs.readFile(options.notes,'utf8');assert(!notes.includes('{{'));assert(notes.includes('Pre-release'));assert(notes.includes('notariz'));
  await prepare(options);assert.equal((await fs.readdir(options.directory)).length,19,'Preparation can be retried');
});
test('Unix release rejects a missing architecture before publication',async t=>{
  const options=await fixture(t);await fs.unlink(path.join(options.directory,installers()[0]));
  await assert.rejects(prepare(options),/ENOENT/);
});
test('Unix release rejects a corrupt installer',async t=>{
  const options=await fixture(t);await fs.appendFile(path.join(options.directory,installers()[0]),'changed');
  await assert.rejects(prepare(options),/Checksum mismatch/);
});
test('Unix release rejects unexpected Windows assets and mismatched tags',async t=>{
  const options=await fixture(t);await fs.writeFile(path.join(options.directory,'Windows.exe'),'fixture');
  await assert.rejects(prepare(options),/Unexpected release asset/);
  await assert.rejects(prepare({...options,tag:'v1.19.1'}),/Unix tag/);
});
test('Publication requires a complete draft with matching server digests',async t=>{
  const options=await fixture(t),prepared=await prepare(options),assets=[];
  for(const name of await fs.readdir(options.directory)){
    const target=path.join(options.directory,name);assets.push({name,size:(await fs.stat(target)).size,digest:`sha256:${await digest(target)}`,state:'uploaded'});
  }
  const metadata={tag_name:prepared.tag,draft:true,prerelease:true,assets};
  assert.equal((await verifyMetadata({...options,metadata})).assets,19);
  await assert.rejects(verifyMetadata({...options,metadata:{...metadata,draft:false}}),/draft prerelease/);
  await assert.rejects(verifyMetadata({...options,metadata:{...metadata,assets:assets.slice(1)}}),/asset set differs/);
  assets[0].digest='sha256:incorrect';
  await assert.rejects(verifyMetadata({...options,metadata}),/integrity verification/);
});
