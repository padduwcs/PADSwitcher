'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createUsage,observeUsage}=require('../src/core/model-usage.cjs');
const complete=()=> 'event: response.completed\r\ndata: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:100,cached_secret:'do-not-retain',input_tokens_details:{cached_tokens:80},output_tokens:5},output:[{text:'private answer'}]}})+'\r\n\r\n';
test('usage observer accepts split UTF-8/CRLF and counts completion once without retaining content',()=>{
 const usage=createUsage(),observe=observeUsage(usage);for(const byte of Buffer.from(complete()))observe(Buffer.from([byte]));observe(Buffer.from(complete()));
 assert.equal(usage.completed,1);assert.equal(usage.inputTokens,100);assert.equal(usage.cachedInputTokens,80);assert.equal(usage.outputTokens,5);
 assert(!JSON.stringify(usage).includes('private'));assert(!JSON.stringify(usage).includes('secret'));
});
test('invalid or oversized telemetry cannot reject the response stream or fabricate usage',()=>{
 const usage=createUsage(),observe=observeUsage(usage);
 observe(Buffer.from('data: {malformed response.completed}\n\n'));
 observe(Buffer.from('data: '+ 'x'.repeat(1024*1024+20)));observe(Buffer.from('\n\n'+complete()));
 assert.equal(usage.completed,1);assert.equal(usage.inputTokens,100);
 const second=createUsage();observeUsage(second)(Buffer.from('data: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:-1,output_tokens:'100',input_tokens_details:{cached_tokens:100}}}})+'\n\n'));
 assert.equal(second.inputTokens,0);assert.equal(second.cachedInputTokens,0);assert.equal(second.outputTokens,0);
});
