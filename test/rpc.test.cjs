'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { CodexRpc } = require('../src/core/rpc.cjs');
function fakeSpawn(handler) {
  let child, options;
  const spawn = (_exe,_args,opts) => {
    options = opts; child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.exitCode = null;
    child.kill = () => { child.exitCode=0;child.emit('close',0); };
    child.stdin.on('data',chunk => { const message = JSON.parse(chunk.toString().trim()); handler?.(message,value => child.stdout.write(JSON.stringify(value)+'\n')); });
    child.stdin.on('finish',() => { child.exitCode=0; child.emit('close',0); });
    return child;
  };
  return { spawn,get child(){return child;},get options(){return options;} };
}
test('RPC matches response ids, handles notifications and initializes supported protocol',async () => {
  const fake = fakeSpawn((m,reply) => {if(m.id) reply({id:m.id,result:m.method==='initialize'?{userAgent:'fixture'}:{account:null}});});
  const rpc = new CodexRpc('fixture.exe','C:/fixture',{spawn:fake.spawn,fileStore:true});
  await rpc.initialize(); assert.deepEqual(await rpc.request('account/read',{refreshToken:false}),{account:null});
  let notified; rpc.listeners.add((method,params) => {notified={method,params};});
  fake.child.stdout.write('{"method":"account/updated","params":{"authMode":"chatgpt"}}\n');
  assert.equal(notified.method,'account/updated'); await rpc.close(); assert.equal(rpc.closed,true);
  assert.equal(fake.options.env.CODEX_HOME,'C:/fixture'); assert.equal(fake.options.env.CODEX_SQLITE_HOME,undefined); assert.equal(fake.options.env.OPENAI_API_KEY,undefined);
});
test('RPC redacts raw server error messages that might contain tokens',async () => {
  const fake=fakeSpawn((m,reply)=>reply({id:m.id,error:{code:401,message:'access_token=SECRET'}}));
  const rpc=new CodexRpc('fixture.exe','C:/fixture',{spawn:fake.spawn});
  await assert.rejects(rpc.request('account/read'),e=>e.code==='CODEX_RPC_ERROR'&&!e.message.includes('SECRET')); await rpc.close();
});
test('RPC timeout releases request entries and allows orderly shutdown',async () => {
  const fake=fakeSpawn();const rpc=new CodexRpc('fixture.exe','C:/fixture',{spawn:fake.spawn});
  await assert.rejects(rpc.request('account/read',{},10),{code:'RPC_TIMEOUT'});assert.equal(rpc.pending.size,0);await rpc.close();
});
test('unexpected process closure rejects all pending requests',async () => {
  const fake=fakeSpawn();const rpc=new CodexRpc('fixture.exe','C:/fixture',{spawn:fake.spawn});
  const promise=rpc.request('account/read');fake.child.emit('close',1);await assert.rejects(promise,{code:'RPC_CLOSED'});assert.equal(rpc.pending.size,0);
});
