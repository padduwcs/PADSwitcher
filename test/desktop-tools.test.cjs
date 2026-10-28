'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),crypto=require('node:crypto');
const {DesktopToolsPipe}=require('../src/core/desktop-tools.cjs');
const windows=require('../src/core/windows.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('Windows desktop tools proxy keeps current-user ACL, relays bytes and changes target only while idle',{timeout:20000},async t=>{
  const pipe=new DesktopToolsPipe(),servers=[];
  t.after(async()=>{pipe.stop();for(const server of servers)await new Promise(r=>server.close(r));});
  const socket=async label=>{const name='\\\\.\\pipe\\PADSwitcher-fixture-'+crypto.randomUUID(),server=net.createServer(c=>c.once('data',bytes=>c.end(label+':'+bytes)));servers.push(server);await new Promise((r,j)=>{server.once('error',j);server.listen(name,r);});return name;};
  const a=await socket('a'),b=await socket('b'),alias=pipe.start();assert(pipe.bind(a));
  const read=()=>new Promise((resolve,reject)=>{const c=net.connect(alias,()=>c.write('payload'));let bytes='';c.on('data',b=>bytes+=b);c.on('end',()=>resolve(bytes));c.on('error',reject);});
  let value;for(let i=0;i<80;i++){try{value=await read();break;}catch(e){if(e.code!=='ENOENT')throw e;await pause(50);}}
  assert.equal(value,'a:payload');assert.equal(pipe.bind(b,false),false);assert.equal(await read(),'a:payload');
  for(const invalid of [alias,'C:\\regular','\\\\remote\\pipe\\anything','\\\\.\\pipe\\bad\\nested'])assert.equal(pipe.bind(invalid),false);
  assert(pipe.bind(b));assert.equal(await read(),'b:payload');
  const acl=JSON.parse(await windows.ps("$p=New-Object IO.Pipes.NamedPipeClientStream('.', $env:PAD_TEST_PIPE, [IO.Pipes.PipeDirection]::InOut);try{$p.Connect(5000);$a=$p.GetAccessControl();ConvertTo-Json -Compress -InputObject @{protected=$a.AreAccessRulesProtected;owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|ForEach-Object {$_.IdentityReference.Value})}}finally{$p.Dispose()}",{env:{...process.env,PAD_TEST_PIPE:alias.slice(9)}}));
  assert.equal(acl.protected,true);assert(acl.rules.includes(acl.owner));assert.deepEqual([...new Set(acl.rules)].sort(),[acl.owner,'S-1-5-18'].sort());
});
