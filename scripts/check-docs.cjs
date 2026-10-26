'use strict';
// Offline documentation checks: read source files only, never accounts or URLs.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0'))].filter(f=>f.endsWith('.md')&&fs.existsSync(path.join(root,f)));
const errors=[],cache=new Map();let links=0;
const currentPrefix='https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/';
const activeDownloads=new Set(['README.md','README.en.md','docs/README.md','docs/UNIX-INSTALL.md','docs/UNIX-INSTALL.en.md']);
const outside=file=>{const relative=path.relative(root,file);return relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative);};
function content(file){
  if(cache.has(file))return cache.get(file);
  const original=fs.readFileSync(file,'utf8'),lines=original.split(/\r?\n/);let fence=null;
  const plain=lines.map(line=>{const m=/^\s*(`{3,}|~{3,})/.exec(line);if(m){if(!fence)fence=m[1][0];else if(fence===m[1][0])fence=null;return '';}return fence?'':line;}).join('\n');
  const anchors=new Set(),seen=new Map();
  for(const m of plain.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)){
    const slug=m[1].replace(/<[^>]*>/g,'').toLowerCase().replace(/[\p{P}\p{S}]/gu,c=>c==='-'||c==='_'?c:'').replace(/\s/g,'-');
    const count=seen.get(slug)||0;seen.set(slug,count+1);anchors.add(slug+(count?'-'+count:''));
  }
  for(const m of plain.matchAll(/\b(?:id|name)=["']([^"']+)["']/g))anchors.add(m[1]);
  const result={original,plain,anchors};cache.set(file,result);return result;
}
function checkLink(source,link){
  if(link.startsWith(currentPrefix))link='/'+link.slice(currentPrefix.length);
  else if(/^[a-z][a-z\d+.-]*:/i.test(link)||link.startsWith('//'))return;
  links++;
  let target,fragment;try{const parts=link.replace(/^<|>$/g,'').split('#');target=decodeURIComponent(parts[0].split('?')[0]);fragment=parts[1]?decodeURIComponent(parts[1]):'';}catch{errors.push(source+': invalid encoded link '+link);return;}
  const absolute=target.startsWith('/')?path.resolve(root,'.'+target):target?path.resolve(root,path.dirname(source),target):path.join(root,source);
  if(outside(absolute)||!fs.existsSync(absolute)){errors.push(source+': missing target '+link);return;}
  if(fragment&&absolute.endsWith('.md')&&!content(absolute).anchors.has(fragment))errors.push(source+': missing anchor '+link);
}
for(const file of files){
  const {original,plain}=content(path.join(root,file));
  for(const m of plain.matchAll(/!?\[[^\]\n]*\]\((<?[^\s)]+>?)(?:\s+["'][^\n]*?["'])?\)/g))checkLink(file,m[1]);
  for(const m of plain.matchAll(/^\[[^\]\n]+\]:\s+(\S+)/gm))checkLink(file,m[1]);
  for(const m of plain.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)=["']([^"']+)["']/g))checkLink(file,m[1]);
  if(activeDownloads.has(file))for(const m of original.matchAll(/\/releases\/(?:tag|download)\/unix-v(\d+\.\d+\.\d+-unix\.\d+)/g))if(m[1]!==pkg.version)errors.push(file+': stale Unix download '+m[1]+'; expected '+pkg.version);
  if(!file.startsWith('docs/archive/'))for(const m of original.matchAll(/\bnpm run ([a-z][a-z\d:_-]*)/g))if(!Object.hasOwn(pkg.scripts,m[1]))errors.push(file+': unknown Unix npm script '+m[1]);
}
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}
else console.log(`Documentation passed: ${files.length} Markdown files, ${links} local links/anchors and current Unix downloads/npm commands.`);
