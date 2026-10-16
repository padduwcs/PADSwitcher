'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const cwd=path.resolve(__dirname,'../src/helper/unix');
const call=args=>{const r=spawnSync('go',args,{cwd,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
const modules=call(['list','-m','-f','{{.Path}}|{{.Version}}|{{.Dir}}','all']).split('\n').map(line=>line.split('|'));
const included=new Set(['github.com/gorilla/websocket','github.com/zalando/go-keyring','github.com/godbus/dbus/v5','golang.org/x/sys']);
let text='PADSwitcher Unix native helper — third-party licenses\n\n';
for(const [name,version,dir] of modules){if(!included.has(name))continue;const file=['LICENSE','LICENSE.txt','COPYING'].map(f=>path.join(dir,f)).find(f=>fs.existsSync(f));if(!file)throw Error('Missing license for '+name);text+='\n=== '+name+' '+version+' ===\n\n'+fs.readFileSync(file,'utf8')+'\n';}
text+='\n=== Go runtime ===\n\n'+fs.readFileSync(path.join(call(['env','GOROOT']),'LICENSE'),'utf8');
text+='\n=== Apache-2.0 (Google-origin code in go-keyring macOS backend) ===\n\n'+fs.readFileSync(path.resolve(__dirname,'../docs/licenses/Apache-2.0.txt'),'utf8');
fs.writeFileSync(path.resolve(__dirname,'../UNIX-THIRD-PARTY-NOTICES.txt'),text);
