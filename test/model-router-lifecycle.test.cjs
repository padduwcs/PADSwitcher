'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {fixture,auth,jwt}=require('./helpers.cjs'),{ModelRouter}=require('../src/core/model-router.cjs');
test('a routed account and in-flight accounts stay protected even before native auth synchronizes',async t=>{
  const f=await fixture(t),a=await f.service.capture(auth('a')),b=await f.service.capture(auth('b')),c=await f.service.capture(auth('c'));
  const gateway={profileId:a.id,pendingId:null,status:'ready',view:()=>({status:'ready'})};
  gateway.router=new ModelRouter(gateway);gateway.router.select(b.id);gateway.router.used.set(c.id,1);f.service.gateway=gateway;
  for(const id of [a.id,b.id,c.id]){
    await assert.rejects(f.service.remove(id),{code:'PROFILE_ACTIVE'});
    await assert.rejects(f.service.addAccount('Fixture',async()=>{},false,id),{code:'PROFILE_ACTIVE'});
  }
});
test('a managed plan from either token or refreshed metadata prevents a personal bundle classification',async t=>{
  const f=await fixture(t),a=await f.service.capture(auth('a'));
  a.plan='business';assert.equal((await f.service.accessBundle(a.id)).chatgptPlanType,'business');
  const data=JSON.parse(auth('b').toString());data.tokens.id_token=jwt({sub:'fixture-user-b','https://api.openai.com/auth':{chatgpt_account_id:'fixture-account-b',chatgpt_plan_type:'enterprise'}});
  const b=await f.service.capture(Buffer.from(JSON.stringify(data)));b.plan='plus';
  assert.equal((await f.service.accessBundle(b.id)).chatgptPlanType,'enterprise');
});
