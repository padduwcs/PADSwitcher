'use strict';
// Every consume request in this file goes to this mock. No live service is used.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {fixture,auth}=require('./helpers.cjs');
const {normalizeResets}=require('../src/core/resets.cjs');
const {exists}=require('../src/core/files.cjs');
const credit={id:'fixture-credit',resetType:'codexRateLimits',status:'available',expiresAt:Math.floor(Date.now()/1000)+86400,title:'Fixture reset'};
async function resetFixture(t) {
  const f=await fixture(t),p=await f.service.capture(auth('b'),'B');
  const base=f.service.rpcFactory,log=[];
  let count=2,loseReply=false,outcome='reset',failAfter=false;
  f.service.rpcFactory=(exe,home,opts)=> {
    if(!opts?.ephemeralStore){const rpc=base(exe,home);const request=rpc.request;rpc.request=async(method,params)=>{const response=await request(method,params);if(method==='account/rateLimits/read')response.rateLimitResetCredits={availableCount:count,credits:[credit]};return response;};return rpc;}
    let consumed=false;
    return {initialize:async()=>{},close:async()=>{},request:async(method,params)=>{
      log.push({method,params,home});
      if(method==='account/login/start'){assert.equal(params.chatgptAccountId,'fixture-account-b');return {};}
      if(method==='account/rateLimits/read'){
        if(consumed&&failAfter)throw Error('fixture read failed');
        return {rateLimits:{primary:{usedPercent:count===2?100:0,windowDurationMins:300}},rateLimitResetCredits:{availableCount:count,credits:count?[credit]:[]}};
      }
      if(method==='account/rateLimitResetCredit/consume'){
        const saved=JSON.parse(await fs.readFile(f.service.metadataFile,'utf8')).profiles.find(x=>x.id===p.id);
        assert.equal(saved.resetAttempt.key,params.idempotencyKey);assert.equal(saved.resetAttempt.status,'pending');
        assert.equal(await exists(path.join(home,'auth.json')),false);
        consumed=true;if(count===2&&outcome==='reset')count--;
        if(loseReply){loseReply=false;throw Error('fixture lost reply');}
        return {outcome};
      }
      throw Error('Unexpected mock request');
    }};
  };
  return {...f,p,log,setCount:v=>count=v,setLostReply:()=>loseReply=true,setOutcome:v=>outcome=v,setFailAfter:()=>failAfter=true};
}
test('reset summary preserves authoritative count, missing details and unknown availability',()=>{
  assert.equal(normalizeResets({}),null);assert.equal(normalizeResets({rateLimitResetCredits:{availableCount:-1}}),null);
  assert.deepEqual(normalizeResets({rateLimitResetCredits:{availableCount:3,credits:null}}),{availableCount:3,credits:null});
  assert.equal(normalizeResets({rateLimitResetCredits:{availableCount:3,credits:[credit]}}).availableCount,3);
  assert.deepEqual(normalizeResets({rateLimitResetCredits:{availableCount:0,credits:[]}}).credits,[]);
});
test('preparing and cancelling a reset never consumes one; a stale credit is refused',async t=>{
  const f=await resetFixture(t);const attempt=await f.service.prepareReset(f.p.id,credit.id);
  assert.equal(attempt.status,'prepared');assert.equal(f.log.length,0);
  await assert.rejects(f.service.prepareReset(f.p.id,'missing'),{code:'RESET_STALE'});
  await assert.rejects(f.service.consumeReset(f.p.id,attempt.key,false),{code:'RESET_CONFIRMATION'});
  assert.equal(f.log.length,0);
});
test('explicit redemption uses the named account, persists its key first, refreshes quota and rejects replay',async t=>{
  const f=await resetFixture(t);await fs.writeFile(path.join(f.desktop,'auth.json'),auth('a'));
  const before=await fs.readFile(path.join(f.desktop,'auth.json'));
  const a=await f.service.prepareReset(f.p.id,credit.id),result=await f.service.consumeReset(f.p.id,a.key,true);
  assert.deepEqual(result,{outcome:'reset',quotaRefreshed:true});assert.equal(f.p.resetCredits.availableCount,1);assert.equal(f.p.quota[0].windows[0].usedPercent,0);
  await f.service.consumeReset(f.p.id,a.key,true);
  assert.equal(f.log.filter(x=>x.method==='account/rateLimitResetCredit/consume').length,1);
  assert.deepEqual(await fs.readFile(path.join(f.desktop,'auth.json')),before);
  assert(!JSON.stringify(f.service.view()).includes('fixture-only'));
  assert.equal((await fs.readdir(f.data)).filter(x=>x.startsWith('reset-rpc-')).length,0);
});
test('a lost response survives restart and retry reuses the original key',async t=>{
  const f=await resetFixture(t),a=await f.service.prepareReset(f.p.id);f.setLostReply();
  await assert.rejects(f.service.consumeReset(f.p.id,a.key,true),{code:'RESET_UNCERTAIN'});
  assert.equal(f.p.resetAttempt.status,'pending');
  const next=await f.create();next.rpcFactory=f.service.rpcFactory;f.service=next;
  const retry=await next.prepareReset(f.p.id);assert.equal(retry.key,a.key);assert.equal(retry.retry,true);
  f.setOutcome('alreadyRedeemed');const result=await next.consumeReset(f.p.id,retry.key,true);assert.equal(result.outcome,'alreadyRedeemed');
  const calls=f.log.filter(x=>x.method==='account/rateLimitResetCredit/consume');assert.equal(calls.length,2);assert.equal(calls[0].params.idempotencyKey,calls[1].params.idempotencyKey);
});
test('an expired confirmation or depleted balance never reaches consume',async t=>{
  const f=await resetFixture(t),a=await f.service.prepareReset(f.p.id);f.p.resetAttempt.at=new Date(Date.now()-6*60000).toISOString();
  await assert.rejects(f.service.consumeReset(f.p.id,a.key,true),{code:'RESET_STALE'});
  const b=await f.service.prepareReset(f.p.id);f.setCount(0);
  await assert.rejects(f.service.consumeReset(f.p.id,b.key,true),{code:'RESET_NO_CREDIT'});
  assert.equal(f.log.filter(x=>x.method==='account/rateLimitResetCredit/consume').length,0);
});
test('nothingToReset and noCredit are reported without fabricating refreshed limits',async t=>{
  for(const outcome of ['nothingToReset','noCredit']){
    const f=await resetFixture(t),a=await f.service.prepareReset(f.p.id);f.setOutcome(outcome);
    const result=await f.service.consumeReset(f.p.id,a.key,true);assert.equal(result.outcome,outcome);assert.equal(f.p.quota[0].windows[0].usedPercent,100);
  }
});
test('successful consume with a failed follow-up read remains completed and marks quota stale',async t=>{
  const f=await resetFixture(t),a=await f.service.prepareReset(f.p.id);f.setFailAfter();
  const result=await f.service.consumeReset(f.p.id,a.key,true);assert.equal(result.outcome,'reset');assert.equal(result.quotaRefreshed,false);assert.equal(f.p.quotaAt,null);assert.equal(f.p.resetAttempt.status,'completed');
});
test('keys cannot be applied to another account or superseded confirmations',async t=>{
  const f=await resetFixture(t),other=await f.service.capture(auth('a'),'A'),a=await f.service.prepareReset(f.p.id);
  await assert.rejects(f.service.consumeReset(other.id,a.key,true),{code:'RESET_STALE'});
  await f.service.prepareReset(f.p.id);await assert.rejects(f.service.consumeReset(f.p.id,a.key,true),{code:'RESET_STALE'});
  assert.equal(f.log.length,0);
});
