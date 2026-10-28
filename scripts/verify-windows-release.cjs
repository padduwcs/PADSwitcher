'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function verify(metadata,root=path.resolve('dist')){
  const name=`PADSwitcher-${require('../package.json').version}-Windows.exe`,expected=[name,name+'.sha256'];
  if(metadata.draft!==true)throw Error('Only a draft release can be verified for publication.');
  if(metadata.tag_name!=='v'+require('../package.json').version)throw Error('Release tag/version mismatch.');
  if(metadata.assets.length!==expected.length)throw Error('Unexpected or missing Windows release assets.');
  for(const file of expected){const bytes=await fs.readFile(path.join(root,file)),digest=crypto.createHash('sha256').update(bytes).digest('hex'),asset=metadata.assets.find(a=>a.name===file);if(!asset||asset.state!=='uploaded'||asset.size!==bytes.length||asset.digest!=='sha256:'+digest)throw Error('Release asset verification failed: '+file);}
  const checksum=await fs.readFile(path.join(root,name+'.sha256'),'utf8'),digest=crypto.createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex');
  if(checksum.trim()!==digest+'  '+name)throw Error('Checksum content does not match the executable.');
  console.log('Draft Windows assets match local names, sizes and SHA-256 digests.');
}
if(require.main===module)verify(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verify};
