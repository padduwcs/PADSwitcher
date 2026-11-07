'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuotaRefresher } = require('../src/core/quota-refresh.cjs');
function fixture() {
  let clock = 0, calls = 0;
  const passes = [], service = {busy:false,state:{profiles:[{}],settings:{autoRefresh:false}},refreshBackground:async options => { calls++; passes.push(options); }};
  return {service,passes,refresh:createQuotaRefresher(service,() => clock),advance:ms => {clock+=ms;},calls:() => calls};
}
test('startup fetches fresh quota even when periodic polling is disabled',async () => {
  const f = fixture(); assert.equal(await f.refresh('startup'),true); assert.equal(f.calls(),1);
  f.advance(300000); assert.equal(await f.refresh('periodic'),false); assert.equal(f.calls(),1);
  assert.equal(await f.refresh('focus'),true); assert.equal(f.calls(),2);
});
test('focus events are throttled',async () => {
  const f = fixture(); await f.refresh('startup');
  f.advance(59000); assert.equal(await f.refresh('focus'),false);
  f.advance(1000); assert.equal(await f.refresh('focus'),true); assert.equal(f.calls(),2);
});
test('periodic refresh respects preference and empty lists do not invoke Codex',async () => {
  const f = fixture(); f.service.state.settings.autoRefresh=true;
  assert.equal(await f.refresh('periodic'),true);
  f.advance(300000); f.service.state.profiles=[];
  assert.equal(await f.refresh('startup'),false); assert.equal(await f.refresh('focus'),false); assert.equal(f.calls(),1);
});
test('a failed background attempt exposes its error and can retry after the cooldown',async () => {
  const f = fixture(); f.service.refreshBackground=async () => {throw Object.assign(new Error('Offline'),{code:'RPC_TIMEOUT'});};
  await assert.rejects(f.refresh('startup'),{code:'RPC_TIMEOUT'});
  assert.equal(await f.refresh('focus'),false); f.advance(60000);
  f.service.refreshBackground=async () => {}; assert.equal(await f.refresh('focus'),true);
});

test('one-minute periodic refresh tolerates timer jitter and skips overlapping long reads',async()=>{
  const f=fixture();f.service.state.settings.autoRefresh=true;await f.refresh('startup');f.advance(59990);
  let release;f.service.refreshBackground=()=>new Promise(resolve=>release=resolve);
  const pending=f.refresh('periodic');f.advance(120000);assert.equal(await f.refresh('periodic'),false);assert.equal(await f.refresh('focus'),false);
  release();assert.equal(await pending,true);f.service.refreshBackground=async()=>{};assert.equal(await f.refresh('periodic'),true);
});

test('only the periodic pass limits itself to accounts that are due',async()=>{
  const f=fixture();f.service.state.settings.autoRefresh=true;await f.refresh('startup');f.advance(60000);await f.refresh('periodic');f.advance(60000);await f.refresh('focus');
  assert.deepEqual(f.passes,[{dueOnly:false},{dueOnly:true},{dueOnly:false}]);
});

test('changing the system clock backwards does not suspend quota polling indefinitely',async()=>{
  const f=fixture();f.service.state.settings.autoRefresh=true;f.advance(120000);await f.refresh('periodic');f.advance(-120000);assert.equal(await f.refresh('periodic'),true);
});
