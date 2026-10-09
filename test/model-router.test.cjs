'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net'),zlib=require('node:zlib');
const {ModelRouter}=require('../src/core/model-router.cjs');
const {WebService}=require('../src/core/web-service.cjs');
const quota={error:{type:'usage_limit_reached',message:'Fixture quota',resets_in_seconds:900}};
const event=(type,value={})=>'event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n';
const completed=event('response.completed',{response:{id:'resp_ok',status:'completed',output:[]}});
async function fixture(t,handler,enabled=true,options={}){
  const seen=[],events=[],state={profiles:[{id:'a',plan:'plus',status:'ready'},{id:'b',plan:'pro',status:'ready'},{id:'c',plan:'free',status:'ready'}],autoSwitch:{enabled,order:['a','b','c']},quotaCooldowns:{}};
  const upstream=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);const entry={account:req.headers['chatgpt-account-id'],headers:req.headers,bytes,url:req.url};seen.push(entry);await handler(req,res,entry,seen);});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const g={profileId:'a',service:{state,running:new Map(),save:async()=>{}},recovery:{note:(type,message,from,to)=>events.push({type,message,from,to})},changed:()=>{},bundle:async(id,force)=>({accessToken:'token-'+id+(force?'-fresh':''),chatgptAccountId:id,chatgptPlanType:state.profiles.find(p=>p.id===id)?.plan})};
  let web;
  if(['enabled','disabled'].includes(process.env.PAD_TEST_WEB_BRANCH)){
    web=new WebService('artifacts/unused-native-router-fixture',{fetch:()=>assert.fail('Native tests must not call a Web runtime')});
    web.state.enabled=process.env.PAD_TEST_WEB_BRANCH==='enabled';
    web.launch=web.control=()=>assert.fail('Native tests must not start or control a Web runtime');
  }
  const r=new ModelRouter(g,{webTransport:web,...options,upstream:'http://127.0.0.1:'+upstream.address().port+'/v1/',allowTestUpstream:true});await r.start();r.select('a');
  t.after(async()=>{await r.stop();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));});
  const call=(body,headers={},path='responses')=>fetch(r.baseUrl+'/'+path,{method:'POST',headers:{authorization:'Bearer native-fixture','content-type':'application/json',...headers},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  return {r,g,seen,events,call};
}
test('initial and post-tool quota retry exactly the same request bytes, without a continuation message',async t=>{
  for(const input of [[{role:'user',content:'Start project'}],[{role:'user',content:'Finish project'},{type:'function_call',call_id:'call_1',name:'write_file',arguments:'{}'},{type:'function_call_output',call_id:'call_1',output:'File written once'}]]){
    const f=await fixture(t,(req,res,entry)=>{if(entry.account==='a'){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));}else {res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(completed);}});
    const body={model:'fixture-model',input,tools:[{type:'function',name:'write_file',parameters:{type:'object'}}],reasoning:{effort:'high'},store:false,stream:true};
    const response=await f.call(body);assert.equal(response.status,200);assert.equal(await response.text(),completed);
    assert.deepEqual(f.seen.map(x=>x.account),['a','b']);assert(f.seen[0].bytes.equals(f.seen[1].bytes));assert.deepEqual(JSON.parse(f.seen[1].bytes),body);
    assert.equal(f.seen[1].headers.authorization,'Bearer token-b');assert.equal(f.r.profileId,'b');assert.equal(f.g.service.state.gatewayProfileId,'b');
    assert(f.events.some(x=>x.type==='routed'));assert(!JSON.stringify(f.events).includes('Finish project'));assert(!JSON.stringify(f.events).includes('token-'));
  }
});
test('split CRLF SSE quota prelude is hidden and retried before committing any output',async t=>{
  const f=await fixture(t,(req,res,entry)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    if(entry.account==='a'){const s=(event('response.created',{response:{id:'failed-a'}})+event('response.failed',{response:{error:quota.error}})).replaceAll('\n','\r\n');for(const byte of Buffer.from(s))res.write(Buffer.from([byte]));res.end();}
    else res.end(completed);
  });
  assert.equal(await (await f.call({input:[],stream:true})).text(),completed);assert.deepEqual(f.seen.map(x=>x.account),['a','b']);
});
test('disabled switching or an account reference forwards early SSE quota intact',async t=>{
  const payload=event('response.created')+event('response.failed',{response:{error:quota.error}});
  for(const [enabled,body]of [[false,{input:[]}],[true,{input:[],previous_response_id:'resp_private'}]]){
    const f=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(payload);},enabled);
    assert.equal(await (await f.call(body)).text(),payload);assert.equal(f.seen.length,1);assert.equal(f.r.active,0);
  }
});
test('disabling switching or selecting manually during a quota response prevents a late automatic retry',async t=>{
  for(const action of ['disable','manual']){
    let release,arrived;const gate=new Promise(r=>release=r),received=new Promise(r=>arrived=r);
    const f=await fixture(t,async(req,res)=>{arrived();await gate;res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));});
    const pending=f.call({input:[]});await received;
    if(action==='disable')f.g.service.state.autoSwitch.enabled=false;else f.g.pendingId='c';release();
    assert.equal((await pending).status,429);assert.equal(f.seen.length,1);
  }
});
test('after a text delta or a tool item is committed, quota is forwarded and never retried',async t=>{
  for(const type of ['response.output_text.delta','response.output_item.added']){
    const payload=event('response.created')+event(type,{delta:'Already delivered'})+event('response.failed',{response:{error:quota.error}});
    const f=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(payload);});
    assert.equal(await (await f.call({input:[],stream:true})).text(),payload);assert.equal(f.seen.length,1);assert.equal(f.r.profileId,'a');
  }
});
test('bare 429, non-quota 403, network errors and disabled auto-switch do not rotate',async t=>{
  for(const [status,body,enabled] of [[429,{error:{type:'rate_limit_exceeded'}},true],[403,quota,true],[429,quota,false]]){
    const f=await fixture(t,(req,res)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));},enabled);
    const response=await f.call({input:[]});assert.equal(response.status,status);assert.deepEqual(await response.json(),body);assert.equal(f.seen.length,1);
  }
  const f=await fixture(t,(req,res)=>req.socket.destroy());assert.equal((await f.call({input:[]})).status,502);assert.equal(f.seen.length,1);
});
test('an account-bound server reference prevents cross-account replay',async t=>{
  for(const body of [{previous_response_id:'resp_private',input:[]},{input:[{type:'item_reference',id:'msg_private'}]},{conversation:'conv_private',input:[]}]){
    const f=await fixture(t,(req,res)=>{res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));});
    assert.equal((await f.call(body)).status,429);assert.equal(f.seen.length,1);assert(f.events.some(x=>x.type==='blocked'));
  }
});
test('managed or unknown plans do not auto-rotate across account policies',async t=>{
  for(const plan of ['business','enterprise',null]){
    const f=await fixture(t,(req,res)=>{res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));});
    f.g.service.state.profiles[0].plan=plan;assert.equal((await f.call({input:[]})).status,409);assert.equal(f.seen.length,0);assert(f.events.some(x=>x.type==='blocked'));
  }
  const f=await fixture(t,(req,res)=>{res.writeHead(req.headers['chatgpt-account-id']==='a'?429:200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.headers['chatgpt-account-id']==='a'?quota:{}));});
  const bundle=f.g.bundle;f.g.bundle=async id=>({...await bundle(id),...(id==='b'?{chatgptPlanType:'enterprise'}:{})});
  assert.equal((await f.call({input:[]})).status,200);assert.deepEqual(f.seen.map(x=>x.account),['a','c']);assert(f.events.some(x=>x.type==='skipped'));
});
test('compressed full-history request is replayed byte-for-byte, compact stays a compact request',async t=>{
  const f=await fixture(t,(req,res,entry)=>{res.writeHead(entry.account==='a'?429:200,{'Content-Type':'application/json'});res.end(JSON.stringify(entry.account==='a'?quota:{output:[]}));});
  const bytes=zlib.zstdCompressSync(Buffer.from(JSON.stringify({input:[{role:'user',content:'Long history'}]})));
  assert.equal((await f.call(bytes,{'content-encoding':'zstd'},'responses/compact')).status,200);
  assert(f.seen[0].bytes.equals(f.seen[1].bytes));assert.equal(f.seen[1].headers['content-encoding'],'zstd');assert.equal(f.seen[1].url,'/v1/responses/compact');
});
test('refresh a rejected credential once, do not rotate accounts for authentication failures',async t=>{
  const f=await fixture(t,(req,res,entry)=>{if(entry.headers.authorization==='Bearer token-a'){res.writeHead(401);res.end('{}');}else {res.writeHead(200);res.end('{}');}});
  assert.equal((await f.call({input:[]})).status,200);assert.deepEqual(f.seen.map(x=>x.account),['a','a']);assert.equal(f.seen[1].headers.authorization,'Bearer token-a-fresh');
});
test('all exhausted accounts are tried at most once and the caller receives a quota error',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));});
  const response=await f.call({input:[]});assert.equal(response.status,429);assert.equal((await response.json()).error.type,'usage_limit_reached');assert.deepEqual(f.seen.map(x=>x.account),['a','b','c']);assert(f.events.some(x=>x.type==='exhausted'));
});
test('loopback relay rejects browsers, missing capability, redirects and unsupported endpoints',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(302,{Location:'http://example.test/steal'});res.end();});
  assert.equal((await f.call({input:[]},{Origin:'https://example.test'})).status,401);
  assert.equal((await fetch('http://'+f.r.host+'/responses',{headers:{authorization:'Bearer test'}})).status,401);
  assert.equal((await f.call({}, {}, 'oauth/token')).status,404);assert.equal(f.seen.length,0);
  assert.equal((await f.call({input:[]})).status,502);assert.equal(f.seen.length,1);
  assert(!JSON.stringify(f.g.service.state).includes(f.r.capability));
});
test('WebSocket attempts receive 426 for native full-input HTTP fallback',async t=>{
  const f=await fixture(t,()=>{});
  const reply=await new Promise((resolve,reject)=>{const socket=net.connect(Number(f.r.host.split(':')[1]),'127.0.0.1',()=>socket.write('GET /'+f.r.capability+'/responses HTTP/1.1\r\nHost: '+f.r.host+'\r\nAuthorization: Bearer test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));let text='';socket.on('data',x=>text+=x);socket.on('end',()=>resolve(text));socket.on('error',reject);});
  assert(reply.startsWith('HTTP/1.1 426'));assert.equal(f.seen.length,0);
});
test('disconnect aborts upstream and never sends another account request',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(event('response.output_text.delta',{delta:'partial'}));});
  const abort=new AbortController();const response=await fetch(f.r.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:'{"input":[]}',signal:abort.signal});
  await response.body.getReader().read();abort.abort();await new Promise(r=>setTimeout(r,50));assert.equal(f.seen.length,1);
});

test('preserve native cache affinity, lite/subagent headers and response metadata, without leaking auth or cookies',async t=>{
  const f=await fixture(t,(req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream','x-codex-turn-state':'state-a','x-codex-primary-used-percent':'12.5','x-codex-bengalfox-primary-used-percent':'30','x-codex-bengalfox-limit-name':'fixture-model','openai-model':'fixture-model','x-models-etag':'catalog-1','x-reasoning-included':'true','x-codex-safety-buffering-enabled':'true','Set-Cookie':'secret=private','Authorization':'Bearer private'});res.end(completed);
  });
  const headers={'session-id':'stable-cache-affinity','thread-id':'stable-thread','x-client-request-id':'stable-thread','x-openai-subagent':'collab_spawn','x-openai-internal-codex-responses-lite':'true','x-responsesapi-include-timing-metrics':'true','cookie':'do-not-forward','chatgpt-account-id':'do-not-trust','x-unrecognized-secret':'do-not-forward'};
  const body={input:[],prompt_cache_key:'unchanged-cache-key',stream:true};
  const response=await f.call(body,headers);assert.equal(await response.text(),completed);
  for(const key of ['session-id','thread-id','x-client-request-id','x-openai-subagent','x-openai-internal-codex-responses-lite','x-responsesapi-include-timing-metrics'])assert.equal(f.seen[0].headers[key],headers[key]);
  assert.deepEqual(JSON.parse(f.seen[0].bytes),body);
  assert.equal(f.seen[0].headers.authorization,'Bearer token-a');assert.equal(f.seen[0].headers['chatgpt-account-id'],'a');
  for(const key of ['cookie','x-unrecognized-secret'])assert.equal(f.seen[0].headers[key],undefined);
  for(const [key,value]of Object.entries({'x-codex-turn-state':'state-a','x-codex-primary-used-percent':'12.5','x-codex-bengalfox-primary-used-percent':'30','x-codex-bengalfox-limit-name':'fixture-model','openai-model':'fixture-model','x-models-etag':'catalog-1','x-reasoning-included':'true','x-codex-safety-buffering-enabled':'true'}))assert.equal(response.headers.get(key),value);
  assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('authorization'),null);
});

test('native first-token lock keeps per-account sticky state across two mid-turn rotations',async t=>{
  const f=await fixture(t,(req,res,entry,seen)=>{
    const index=seen.length;
    if([2,5].includes(index)){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));return;}
    res.writeHead(200,{'Content-Type':'text/event-stream','x-codex-turn-state':'state-'+entry.account+(index===4||index===7?'-next':'')});res.end(completed);
  });
  const body={input:[{role:'user',content:'Fixture context'}],prompt_cache_key:'same-cache-key',stream:true};
  assert.equal(await (await f.call(body,{'session-id':'same-session'})).text(),completed);
  // Native Codex ignores later response tokens because its turn state is OnceLock.
  for(let i=0;i<4;i++)assert.equal(await (await f.call(body,{'session-id':'same-session','x-codex-turn-state':'state-a'})).text(),completed);
  assert.deepEqual(f.seen.map(x=>x.account),['a','a','b','b','b','c','c']);
  assert.deepEqual(f.seen.map(x=>x.headers['x-codex-turn-state']),[undefined,'state-a',undefined,'state-b','state-b-next',undefined,'state-c']);
  for(const entry of f.seen){assert.equal(entry.headers['session-id'],'same-session');assert(entry.bytes.equals(f.seen[0].bytes));}
  assert(!JSON.stringify(f.events).includes('state-a'));assert(!JSON.stringify(f.g.service.state).includes('state-a'));
});

test('unknown tokens are dropped, tracked tokens survive long approval waits and a new turn starts without old state',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream','x-codex-turn-state':'fresh-state'});res.end(completed);});
  await (await f.call({input:[]},{'x-codex-turn-state':'unknown-old-account-state'})).text();
  const now=Date.now;Date.now=()=>now()+86400000;
  try{assert(f.r.turnState('fresh-state'));}finally{Date.now=now;}
  await (await f.call({input:[]},{'x-codex-turn-state':'fresh-state'})).text();
  await (await f.call({input:[]})).text();
  assert.deepEqual(f.seen.map(x=>x.headers['x-codex-turn-state']),[undefined,'fresh-state',undefined]);
});

test('routing-state storage is bounded, retains the active first-token alias and clears on shutdown',async t=>{
  const f=await fixture(t,()=>{}),response=token=>({headers:new Headers({'x-codex-turn-state':token})});
  f.r.rememberTurnState(response('active-native-token'),'a',{});
  for(let i=0;i<1100;i++){assert(f.r.turnState('active-native-token'));f.r.rememberTurnState(response('old-turn-'+i),'a',{});}
  assert.equal(f.r.turnStates.size,1024);assert(f.r.turnState('active-native-token'));assert.equal(f.r.turnState('old-turn-0'),null);
  await f.r.stop();assert.equal(f.r.turnStates.size,0);
});

test('saving fallback metadata cannot discard an already successful inference or trigger an extra request',async t=>{
  const f=await fixture(t,(req,res,entry)=>{
    if(entry.account==='a'){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));}
    else{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(completed);}
  });
  f.g.service.save=async()=>{throw Error('Fixture disk failure');};
  const response=await f.call({input:[],stream:true});assert.equal(response.status,200);assert.equal(await response.text(),completed);
  assert.deepEqual(f.seen.map(x=>x.account),['a','b']);assert.equal(f.r.profileId,'b');assert.equal(f.r.active,0);
  assert(f.g.service.state.quotaCooldowns.a>Date.now());assert(f.events.some(x=>x.type==='error'));assert(!f.events.some(x=>x.type==='continued'));
});

test('a healthy stream can outlive the inactivity timeout without being cut off or repeated',async t=>{
  const f=await fixture(t,(req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(event('response.output_text.delta',{delta:'start'}));
    let count=0;const timer=setInterval(()=>{if(++count===12){clearInterval(timer);res.end(completed);}else res.write(event('response.output_text.delta',{delta:'progress'}));},60);
    res.once('close',()=>clearInterval(timer));
  },true,{idleTimeoutMs:300});
  const response=await f.call({input:[],stream:true}),text=await response.text();
  assert(text.endsWith(completed));assert.equal((text.match(/event: response.output_text.delta/g)||[]).length,12);assert.equal(f.seen.length,1);
});

test('a stalled partial stream times out without rotating or replaying the model request',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(event('response.output_text.delta',{delta:'partial'}));},true,{idleTimeoutMs:300});
  const response=await f.call({input:[],stream:true});await assert.rejects(response.text());
  assert.equal(f.seen.length,1);assert.equal(f.r.profileId,'a');
});

test('persistent authentication rejection is refreshed only once and never becomes a model retry loop',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":{"type":"authentication_error"}}');});
  const response=await f.call({input:[]});assert.equal(response.status,401);await response.text();assert.deepEqual(f.seen.map(x=>x.account),['a','a']);
  assert.deepEqual([f.r.usage.requests,f.r.usage.attempts,f.r.usage.authRefreshes,f.r.usage.quotaRetries],[1,2,1,0]);
});

test('numeric diagnostics distinguish native requests, quota retries and reported cached input without changing payloads',async t=>{
  const payload=event('response.completed',{response:{output:[],usage:{input_tokens:100,input_tokens_details:{cached_tokens:90},output_tokens:10}}});
  const f=await fixture(t,(req,res,entry)=>{if(entry.account==='a'){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify(quota));}else{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(payload);}});
  const body={model:'gpt-fixture',reasoning:{effort:'medium'},input:[{role:'user',content:'Private prompt must not appear in diagnostics'}],stream:true};
  assert.equal(await (await f.call(body)).text(),payload);assert.equal(await (await f.call(body)).text(),payload);
  assert.deepEqual(f.r.usage,{requests:2,attempts:3,quotaRetries:1,authRefreshes:0,completed:2,inputTokens:200,cachedInputTokens:180,outputTokens:20,lastModel:'gpt-fixture',lastEffort:'medium'});
  assert(!JSON.stringify(f.r.usage).includes('Private prompt'));assert(!JSON.stringify(f.g.service.state).includes('cachedInputTokens'));
  assert(f.seen[0].bytes.equals(f.seen[1].bytes));
  const invalid=await fixture(t,(req,res)=>{res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":{"type":"invalid_request"}}');});
  for(const value of [null,'invalid-top-level',{model:{toString:'not-a-function'}}]){const response=await invalid.call(value);assert.equal(response.status,400);await response.text();}
  assert.equal(invalid.r.usage.attempts,3);assert.equal(invalid.r.usage.lastModel,null);
});
