'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),net=require('node:net'),path=require('node:path');
const {DesktopToolsPipe}=require('../src/core/desktop-tools.cjs');
test('desktop tools alias connects to the current GUI socket, rejects invalid targets and cannot change during active work',{skip:process.platform==='win32'},async t=>{
  const root=await fs.mkdtemp('/tmp/pad-tools-fixture-'),pipe=new DesktopToolsPipe(),servers=[];
  t.after(async()=>{pipe.stop();for(const s of servers)await new Promise(r=>s.close(r));await fs.rm(root,{recursive:true,force:true});});
  const socket=async label=>{const file=path.join(root,label+'.sock'),server=net.createServer(c=>c.end(label));servers.push(server);await new Promise(r=>server.listen(file,r));return file;};
  const a=await socket('a'),b=await socket('b'),alias=pipe.start(),directory=pipe.directory;
  assert.equal((await fs.stat(directory)).mode&0o777,0o700);assert.equal(pipe.bind(a),true);
  const read=()=>new Promise((resolve,reject)=>{const c=net.connect(alias);let text='';c.on('data',b=>text+=b);c.on('end',()=>resolve(text));c.on('error',reject);});
  assert.equal(await read(),'a');assert.equal(pipe.bind(b,false),false);assert.equal(await read(),'a');
  const regular=path.join(root,'regular');await fs.writeFile(regular,'keep');assert.equal(pipe.bind(regular),false);assert.equal(pipe.bind(alias),false);assert.equal(await read(),'a');
  assert.equal(pipe.bind(b),true);assert.equal(await read(),'b');pipe.stop();assert.equal(await fs.stat(directory).then(()=>true,()=>false),false);assert((await fs.stat(b)).isSocket());
});
