'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {fixture,auth}=require('./helpers.cjs');
const {SayHiService,selectModel,PROMPT}=require('../src/core/say-hi.cjs');

async function setup(t,behavior={}) {
  const f=await fixture(t),a=await f.service.capture(auth('a'),'A'),b=await f.service.capture(auth('b'),'B');
  const sessions=[];let count=0,max=0;
  f.service.rpcFactory=(exe,home,options)=>{
    const rpc={home,options,child:new EventEmitter(),listeners:new Set(),calls:[],reads:0,closed:false};sessions.push(rpc);count++;max=Math.max(max,count);
    rpc.initialize=async options=>{rpc.initialized=options;};
    rpc.request=async(method,params)=>{
      rpc.calls.push({method,params});
      if(behavior.request){const value=await behavior.request(method,params,rpc);if(value!==undefined)return value;}
      if(method==='account/login/start'){rpc.account=params.chatgptAccountId;return {};}
      if(method==='account/rateLimits/read'){rpc.reads++;return {rateLimits:{primary:{usedPercent:1,windowDurationMins:300,resetsAt:12345678901}}};}
      if(method==='model/list')return {data:[{model:'fixture-model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]}]};
      if(method==='thread/start'){rpc.thread=params;return {thread:{id:rpc.account}};}
      if(method==='turn/start'){
        if(!behavior.hang){for(const listener of rpc.listeners)listener('turn/completed',{threadId:params.threadId,turn:{id:'turn-fixture',status:'completed'}});}
        return {turn:{id:'turn-fixture',status:'inProgress'}};
      }
      if(method==='turn/interrupt')return {};
      throw Error('Unexpected fixture request '+method);
    };
    rpc.close=async()=>{if(!rpc.closed){rpc.closed=true;count--;rpc.child.emit('close');}};
    return rpc;
  };
  f.service.sayHi=new SayHiService(f.service,{turnTimeout:behavior.timeout||200});
  return {...f,a,b,sessions,max:()=>max};
}

test('one greeting uses exactly the named account, a fresh isolated thread and the lowest supported effort',async t=>{
  const f=await setup(t);await fs.writeFile(path.join(f.desktop,'auth.json'),auth('a'));
  const original=await fs.readFile(path.join(f.desktop,'auth.json'));
  f.service.state.gatewayProfileId=f.a.id;f.service.state.autoSwitch={enabled:true,order:[f.a.id,f.b.id]};
  f.service.gateway={profileId:f.a.id,flight:null,view:()=>({status:'ready',profileId:f.a.id,activeTurns:1})};
  f.service.sayHi.start(f.b.id);await f.service.sayHi.flight;
  const [rpc]=f.sessions,row=f.service.sayHi.view().rows[0];
  assert.equal(rpc.account,'fixture-account-b');assert.equal(row.status,'sent');assert.equal(row.quotaRefreshed,true);
  assert.equal(rpc.options.ephemeralStore,true);assert.equal(rpc.thread.ephemeral,true);assert.deepEqual(rpc.thread.environments,[]);
  assert.equal(rpc.thread.cwd,rpc.home);assert.equal(rpc.thread.sandbox,'read-only');assert.equal(rpc.thread.config.web_search,'disabled');
  const turns=rpc.calls.filter(c=>c.method==='turn/start');assert.equal(turns.length,1);assert.equal(turns[0].params.effort,'low');
  assert.equal(turns[0].params.serviceTierForTurn,'default');assert.equal(turns[0].params.input[0].text,PROMPT);
  assert.equal(f.service.state.gatewayProfileId,f.a.id);assert.equal(f.service.gateway.profileId,f.a.id);
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),original);assert(!await fs.stat(rpc.home).then(()=>true,()=>false));
  assert.equal(f.service.get(f.b.id).quota[0].windows[0].resetsAt,12345678901);assert.equal(f.service.busy,false);
});

test('all greetings run sequentially and continue after one account fails without fallback or reset consumption',async t=>{
  const f=await setup(t,{request:(method,params,rpc)=>{if(method==='turn/start'&&rpc.account==='fixture-account-a')throw Error('secret raw upstream error');}});
  f.service.sayHi.start();await f.service.sayHi.flight;
  assert.deepEqual(f.service.sayHi.view().rows.map(r=>r.status),['failed','sent']);assert.equal(f.max(),1);
  assert.deepEqual(f.sessions.map(r=>r.account),['fixture-account-a','fixture-account-b']);
  assert.equal(f.sessions.reduce((n,r)=>n+r.calls.filter(c=>c.method==='turn/start').length,0),2);
  assert(!JSON.stringify(f.service.view()).includes('secret raw upstream'));
  assert(!f.sessions.some(r=>r.calls.some(c=>c.method.includes('consume'))));
});

test('successful greeting with failed quota refresh stays sent and is never retried',async t=>{
  const f=await setup(t,{request:(method,params,rpc)=>{if(method==='account/rateLimits/read'&&rpc.reads===1)throw Error('offline');}});
  f.service.sayHi.start(f.a.id);await f.service.sayHi.flight;const row=f.service.sayHi.view().rows[0];
  assert.equal(row.status,'sent');assert.equal(row.quotaRefreshed,false);assert.equal(row.error.code,'SAY_HI_REFRESH');
  assert.equal(f.sessions[0].calls.filter(c=>c.method==='turn/start').length,1);
});

test('timeout is uncertain, interrupts only the private thread, cleans up and never resubmits',async t=>{
  const f=await setup(t,{hang:true,timeout:15});f.service.sayHi.start(f.a.id);await f.service.sayHi.flight;
  const row=f.service.sayHi.view().rows[0],rpc=f.sessions[0];assert.equal(row.status,'uncertain');assert(row.submitted);
  assert.equal(rpc.calls.filter(c=>c.method==='turn/start').length,1);assert.equal(rpc.calls.filter(c=>c.method==='turn/interrupt').length,1);assert(rpc.closed);
  assert(!await fs.stat(rpc.home).then(()=>true,()=>false));
});

test('stop finishes the current account and leaves all queued accounts unsent',async t=>{
  let release,started;const ready=new Promise(r=>started=r);
  const f=await setup(t,{request:async(method)=>{if(method==='turn/start'){started();await new Promise(r=>release=r);}}});
  f.service.sayHi.start();await ready;f.service.sayHi.stop();release();await f.service.sayHi.flight;
  assert.deepEqual(f.service.sayHi.view().rows.map(r=>r.status),['sent','cancelled']);assert.equal(f.sessions.length,1);
});

test('queued and in-flight account sessions are protected while gateway credential reads and ordinary edits still work',async t=>{
  const f=await setup(t,{hang:true,timeout:80});f.service.sayHi.start();
  assert.throws(()=>f.service.sayHi.start(),{code:'SAY_HI_BUSY'});
  await assert.rejects(f.service.remove(f.b.id),{code:'SAY_HI_PROFILE'});
  await assert.rejects(f.service.capture(auth('b','new')),{code:'SAY_HI_PROFILE'});
  await assert.rejects(f.service.addAccount('',()=>{},false,f.b.id),{code:'SAY_HI_PROFILE'});
  assert.equal((await f.service.accessBundle(f.b.id)).chatgptAccountId,'fixture-account-b');
  await f.service.edit(f.b.id,'Renamed','kept');assert.equal(f.service.get(f.b.id).label,'Renamed');
  await f.service.sayHi.shutdown();assert(!f.service.sayHi.isUsing(f.b.id));
});

test('exhausted and signed-out accounts are skipped with no generation',async t=>{
  const f=await setup(t,{request:(method)=>{if(method==='account/rateLimits/read')return {rateLimits:{primary:{usedPercent:100,resetsAt:12345678901,windowDurationMins:300}}};}});
  f.service.get(f.b.id).status='reauth';f.service.sayHi.start();await f.service.sayHi.flight;
  assert.deepEqual(f.service.sayHi.view().rows.map(r=>r.status),['skipped','skipped']);assert.equal(f.sessions.length,1);
  assert(!f.sessions[0].calls.some(c=>c.method==='turn/start'));
});

test('unrelated notifications cannot complete a greeting, and shutdown cancels the private session',async t=>{
  let started;const ready=new Promise(r=>started=r);
  const f=await setup(t,{hang:true,request:(method,params,rpc)=>{if(method==='turn/start'){for(const l of rpc.listeners)l('turn/completed',{threadId:'other-thread',turn:{status:'completed'}});started();}}});
  f.service.sayHi.start();await ready;assert(f.service.sayHi.view().active);await f.service.close();
  assert.deepEqual(f.service.sayHi.view().rows.map(r=>r.status),['uncertain','cancelled']);assert(f.sessions[0].closed);
  assert.throws(()=>f.service.sayHi.start(),{code:'CANCELLED'});
});
test('model selection follows the native catalog across pages and uses supported effort without a hard-coded model',async()=>{
  let page=0;
  const choice=await selectModel({request:async(_method,params)=>{
    page++;if(page===1)return {data:[{model:'other',isDefault:false}],nextCursor:'next'};
    assert.equal(params.cursor,'next');return {data:[{model:'catalog-default',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'none'}]}]};
  }});
  assert.deepEqual(choice,{model:'catalog-default',effort:'none'});
  await assert.rejects(selectModel({request:async()=>({data:[]})}),{code:'SAY_HI_MODEL'});
});
test('completed notifications remain authoritative if the turn acknowledgement never arrives',async t=>{
  const f=await setup(t,{request:(method,params,rpc)=>{if(method==='turn/start'){for(const l of rpc.listeners)l('turn/completed',{threadId:params.threadId,turn:{id:'fast-turn',status:'completed'}});return new Promise(()=>{});}}});
  f.service.sayHi.start(f.a.id);await f.service.sayHi.flight;assert.equal(f.service.sayHi.view().rows[0].status,'sent');assert(f.sessions[0].closed);
});
