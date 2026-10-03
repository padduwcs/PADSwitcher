'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuotaRefresher } = require('../src/core/quota-refresh.cjs');
function fixture() {
  let clock = 0, calls = 0;
  const service = {busy:false,state:{profiles:[{}],settings:{autoRefresh:false}},refreshAll:async () => { calls++; }};
  return {service,refresh:createQuotaRefresher(service,() => clock),advance:ms => {clock+=ms;},calls:() => calls};
}
test('startup fetches fresh quota even when periodic polling is disabled',async () => {
  const f = fixture(); assert.equal(await f.refresh('startup'),true); assert.equal(f.calls(),1);
  f.advance(300000); assert.equal(await f.refresh('periodic'),false); assert.equal(f.calls(),1);
  assert.equal(await f.refresh('focus'),true); assert.equal(f.calls(),2);
});
test('focus events are throttled and refresh never overlaps another operation',async () => {
  const f = fixture(); await f.refresh('startup');
  f.advance(59000); assert.equal(await f.refresh('focus'),false);
  f.advance(1000); f.service.busy=true; assert.equal(await f.refresh('focus'),false);
  f.service.busy=false; assert.equal(await f.refresh('focus'),true); assert.equal(f.calls(),2);
});
test('periodic refresh respects preference and empty lists do not invoke Codex',async () => {
  const f = fixture(); f.service.state.settings.autoRefresh=true;
  assert.equal(await f.refresh('periodic'),true);
  f.advance(300000); f.service.state.profiles=[];
  assert.equal(await f.refresh('startup'),false); assert.equal(await f.refresh('focus'),false); assert.equal(f.calls(),1);
});
test('a failed background attempt exposes its error and can retry after the cooldown',async () => {
  const f = fixture(); f.service.refreshAll=async () => {throw Object.assign(new Error('Offline'),{code:'RPC_TIMEOUT'});};
  await assert.rejects(f.refresh('startup'),{code:'RPC_TIMEOUT'});
  assert.equal(await f.refresh('focus'),false); f.advance(60000);
  f.service.refreshAll=async () => {}; assert.equal(await f.refresh('focus'),true);
});
