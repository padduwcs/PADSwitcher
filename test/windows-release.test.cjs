'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {verify}=require('../scripts/verify-windows-release.cjs');
test('Windows release verification rejects corrupt, incomplete and already published assets',async t=>{
  const parent=path.resolve('artifacts/tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const version=require('../package.json').version,name=`PADSwitcher-${version}-Windows.exe`,bytes=Buffer.from('Disposable executable fixture'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');await fs.writeFile(path.join(root,name),bytes);const checksum=Buffer.from(hash(bytes)+'  '+name+'\n');await fs.writeFile(path.join(root,name+'.sha256'),checksum);
  const metadata={draft:true,tag_name:'v'+version,assets:[[name,bytes],[name+'.sha256',checksum]].map(([name,b])=>({name,size:b.length,digest:'sha256:'+hash(b),state:'uploaded'}))};await verify(metadata,root);
  for(const mutate of [m=>m.draft=false,m=>m.tag_name='unix-v'+version,m=>m.assets.pop(),m=>m.assets[0].digest='sha256:bad',m=>m.assets[0].size++,m=>m.assets[0].state='new']){const copy=structuredClone(metadata);mutate(copy);await assert.rejects(verify(copy,root));}
  await fs.writeFile(path.join(root,name),Buffer.from('corrupt'));await assert.rejects(verify(metadata,root));
});
