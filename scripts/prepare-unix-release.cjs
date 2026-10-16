'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');
const pkg=require('../package.json');
const project=path.resolve(__dirname,'..');
const suffixes=['Linux-amd64.deb','Linux-arm64.deb','Linux-x86_64.AppImage','Linux-arm64.AppImage','macOS-arm64.dmg','macOS-arm64.zip','macOS-x64.dmg','macOS-x64.zip'];
function installers(version=pkg.version){return suffixes.map(suffix=>`PADSwitcher-${version}-${suffix}`).sort();}
async function digest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function prepare({directory,notes,version=pkg.version,tag=`unix-v${version}`}={}){
  if(!/^\d+\.\d+\.\d+-unix\.\d+$/.test(version)||tag!==`unix-v${version}`)throw Error('Unix tag must match the Unix package version');
  if(!directory||!notes)throw Error('Specify asset directory and release notes output');
  const expected=installers(version),allowed=new Set([...expected.flatMap(file=>[file,file+'.sha256']),'INSTALL-Unix-vi.md','INSTALL-Unix-en.md','SHA256SUMS.txt']);
  // A partial matrix or a stray Windows installer must never be published.
  const entries=await fs.readdir(directory,{withFileTypes:true});
  for(const entry of entries)if(!entry.isFile()||!allowed.has(entry.name))throw Error(`Unexpected release asset: ${entry.name}`);
  const hashes=new Map();
  for(const file of expected){
    const target=path.join(directory,file),stat=await fs.stat(target);
    if(!stat.isFile()||stat.size===0)throw Error(`Empty installer: ${file}`);
    const hash=await digest(target),checksum=await fs.readFile(target+'.sha256','utf8');
    if(checksum!==`${hash}  ${file}\n`)throw Error(`Checksum mismatch: ${file}`);
    hashes.set(file,hash);
  }
  for(const [source,name] of [['docs/UNIX-INSTALL.md','INSTALL-Unix-vi.md'],['docs/UNIX-INSTALL.en.md','INSTALL-Unix-en.md']]){
    const target=path.join(directory,name);await fs.copyFile(path.join(project,source),target);hashes.set(name,await digest(target));
  }
  await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),[...hashes].sort(([a],[b])=>a.localeCompare(b)).map(([file,hash])=>`${hash}  ${file}\n`).join(''));
  const template=await fs.readFile(path.join(project,'docs/UNIX-RELEASE-NOTES.md'),'utf8');
  const rendered=template.replaceAll('{{VERSION}}',version).replaceAll('{{TAG}}',tag);
  if(/\{\{/.test(rendered))throw Error('Unresolved release-note placeholder');
  for(const file of expected)if(!rendered.includes(file))throw Error(`Release notes omit download: ${file}`);
  await fs.writeFile(notes,rendered);
  return {tag,installers:expected.length,assets:expected.length*2+3};
}
async function verifyMetadata({directory,metadata,tag=`unix-v${pkg.version}`}={}){
  if(metadata.tag_name!==tag||metadata.draft!==true||metadata.prerelease!==true)throw Error('Expected the matching Unix draft prerelease');
  const local=(await fs.readdir(directory)).sort(),remote=metadata.assets||[];
  if(remote.length!==local.length||new Set(remote.map(asset=>asset.name)).size!==local.length||remote.some(asset=>!local.includes(asset.name)))throw Error('Uploaded release asset set differs from the verified local set');
  for(const asset of remote){
    const target=path.join(directory,asset.name),stat=await fs.stat(target);
    if(asset.state!=='uploaded'||asset.size!==stat.size||asset.digest!==`sha256:${await digest(target)}`)throw Error(`Uploaded asset failed integrity verification: ${asset.name}`);
  }
  return {assets:remote.length};
}
if(require.main===module){
  const args=process.argv.slice(2),get=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
  const options={directory:get('--assets')||'release-assets',notes:get('--notes')||'unix-release-notes.md',tag:process.env.GITHUB_REF_NAME||`unix-v${pkg.version}`};
  (async()=>{
    if(get('--verify-metadata')){
      const metadata=JSON.parse(await fs.readFile(get('--verify-metadata'),'utf8'));
      const result=await verifyMetadata({...options,metadata});console.log(`Verified all ${result.assets} uploaded asset names, sizes and GitHub SHA-256 digests.`);
    }else{
      const result=await prepare(options);console.log(`Verified ${result.installers} installers; prepared ${result.assets} Unix release assets for ${result.tag}.`);
    }
  })()
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={prepare,installers,digest,verifyMetadata};
