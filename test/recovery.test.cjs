'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quotaError,exhaustedSnapshot,continuation,terminalTools}=require('../src/core/recovery.cjs');
const {fixture,auth}=require('./helpers.cjs');
test('quota classification relies on the structured native error only',()=>{
  assert(quotaError({codexErrorInfo:'usageLimitExceeded'}));
  for(const error of [null,{}, {message:'usageLimitExceeded'}, {codexErrorInfo:'rateLimitExceeded'}, {codexErrorInfo:{httpConnectionFailed:{httpStatusCode:429}}}])assert(!quotaError(error));
});
test('only current exhausted Codex quota snapshots exclude a candidate',()=>{
  const now=Date.now(),p={status:'ready',quotaAt:new Date(now).toISOString(),quota:[{id:'codex',windows:[{usedPercent:100,resetsAt:now/1000+60}]}]};
  assert(exhaustedSnapshot(p,now));p.quotaAt=new Date(now-700000).toISOString();assert(!exhaustedSnapshot(p,now));p.quotaAt=new Date(now).toISOString();p.quota[0].windows[0].resetsAt=now/1000-1;assert(!exhaustedSnapshot(p,now));
});
test('automatic account settings validate, persist and follow profile removal',async t=>{
  const {service,create}=await fixture(t),a=await service.capture(auth('a')),b=await service.capture(auth('b'));
  assert.equal(service.state.autoSwitch.enabled,false);
  for(const input of [{enabled:true,order:[a.id]},{enabled:true,order:[a.id,a.id]},{enabled:true,order:[a.id,'unknown']},{enabled:'yes',order:[a.id,b.id]}])await assert.rejects(service.autoSwitchSettings(input));
  await service.autoSwitchSettings({enabled:true,order:[b.id,a.id]});assert.deepEqual((await create()).state.autoSwitch,{enabled:true,order:[b.id,a.id]});
  await service.remove(b.id);const reopened=await create();assert.deepEqual(reopened.state.autoSwitch,{enabled:false,order:[a.id]});
});
test('continuation preserves security settings but replaces input and transient IDs',()=>{
  const params={threadId:'thread',input:[{type:'text',text:'secret'}],approvalPolicy:'untrusted',permissions:'read-only',clientUserMessageId:'old',toolOutput:{},model:'chosen'};
  const next=continuation(params);assert.equal(params.input[0].text,'secret');assert.equal(next.approvalPolicy,'untrusted');assert.equal(next.permissions,'read-only');assert.equal(next.clientUserMessageId,undefined);assert.equal(next.toolOutput,undefined);assert(!next.input[0].text.includes('secret'));
});
test('unknown or unfinished tool statuses block recovery',()=>{
  for(const item of [{type:'commandExecution'},{type:'dynamicToolCall',status:'inProgress'},{type:'imageGeneration',status:'unknown'},{type:'newFutureTool',status:'running'}])assert(!terminalTools({items:[item]}));
  assert(terminalTools({items:[{type:'userMessage'},{type:'imageGeneration',status:'completed'},{type:'fileChange',status:'completed'}]}));
});
