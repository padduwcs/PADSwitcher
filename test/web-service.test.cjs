'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib');
const {WebService}=require('../src/core/web-service.cjs');
const {ModelRouter}=require('../src/core/model-router.cjs');
const {qualify,parse}=require('../src/core/web-models.cjs');
const {fixture:accountFixture,auth}=require('./helpers.cjs');
const completed='event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_web","status":"completed","output":[]}}\n\n';
async function server(t,handler){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{s.closeAllConnections();s.close(r);}));return 'http://127.0.0.1:'+s.address().port+'/v1/';}
async function fixture(t,options={}){
  const native=await accountFixture(t),seen=[],nativeSeen=[],bundles=[];
  const a=await native.service.capture(auth('a')),b=await native.service.capture(auth('b'));
  native.service.state.autoSwitch={enabled:true,order:[a.id,b.id]};
  const web=new WebService(path.join(native.directory,'web'),{platform:{protectDirectory:async()=>{}},available:()=>true,nativeHome:()=>native.desktop});await web.init();t.after(()=>clearInterval(web.timer));
  const wa=await web.add('Web A'),wb=await web.add('Web B');web.state.enabled=true;await web.save();
  web.launch=async()=>{};
  const webUrl=await server(t,async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const entry={headers:req.headers,url:req.url,body:JSON.parse(Buffer.concat(chunks))};seen.push(entry);
    if(options.webHandler)return options.webHandler(req,res,entry);
    res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(completed);
  });
  web.refreshStatus=async id=>({version:1,ready:true,authenticated:true,interactionMode:'automatic',mode:'full',baseUrl:webUrl,account:id});
  const nativeUrl=await server(t,async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const entry={headers:req.headers,url:req.url,bytes:Buffer.concat(chunks)};nativeSeen.push(entry);
    if(options.nativeHandler)return options.nativeHandler(req,res,entry);
    res.writeHead(200,{'Content-Type':'text/event-stream','x-codex-turn-state':'native-affinity'});res.end(completed);
  });
  const g={profileId:a.id,service:native.service,recovery:{note:()=>{}},changed:()=>{},syncRoute:()=>{},bundle:async(id,force)=>{bundles.push({id,force});return {accessToken:'NATIVE-SECRET-'+id,chatgptAccountId:id,chatgptPlanType:'plus'};}};
  const router=new ModelRouter(g,{webTransport:web,upstream:nativeUrl,allowTestUpstream:true,idleTimeoutMs:options.idleTimeoutMs});await router.start();router.select(a.id);t.after(()=>router.stop());
  function call(body,headers={},route='responses',signal){return fetch(router.baseUrl+'/'+route,{method:'POST',headers:{authorization:'Bearer NATIVE-CLIENT-SECRET','content-type':'application/json',...headers},body:Buffer.isBuffer(body)?body:JSON.stringify(body),signal});}
  return {...native,web,wa,wb,a,b,router,seen,nativeSeen,bundles,call};
}
test('Web requests bypass native credentials, native quota counters, sticky routing and auto-switch',async t=>{
  const f=await fixture(t),before=await fs.readFile(f.service.metadataFile);
  const body={model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[{role:'user',content:'LOCAL FIXTURE'}],tools:[],stream:true};
  const r=await f.call(body,{'thread-id':'task-a','chatgpt-account-id':'NATIVE-ACCOUNT','x-codex-turn-state':'NATIVE-STICKY'});
  assert.equal(r.status,200);assert.equal(await r.text(),completed);assert.equal(f.seen.length,1);assert.equal(f.nativeSeen.length,0);assert.equal(f.bundles.length,0);
  assert.equal(f.seen[0].body.model,'chatgpt-web/gpt-6-sol');assert.deepEqual(f.seen[0].body.input,body.input);
  assert.equal(f.seen[0].headers.authorization,'Bearer padswitcher-web');assert.equal(f.seen[0].headers['chatgpt-account-id'],undefined);assert.equal(f.seen[0].headers['x-codex-turn-state'],undefined);
  assert.equal(f.router.usage.requests,0);assert.equal(f.router.usage.quotaRetries,0);assert.equal(f.router.profileId,f.a.id);assert.deepEqual(await fs.readFile(f.service.metadataFile),before);
  assert(!JSON.stringify(f.web.view()).includes('baseUrl'));assert(!JSON.stringify(f.web.view()).includes('LOCAL FIXTURE'));assert(!JSON.stringify(f.web.view()).includes('NATIVE-'));
});
test('native request bytes, cache headers and quota retries stay unchanged with Web enabled or disabled',async t=>{
  for(const enabled of [true,false]){
    const f=await fixture(t,{nativeHandler:(req,res,entry)=>{if(entry.headers['chatgpt-account-id']===f.a.id){res.writeHead(429,{'content-type':'application/json'});res.end('{"error":{"type":"usage_limit_reached"}}');}else{res.writeHead(200,{'content-type':'text/event-stream','x-codex-turn-state':'cache-b'});res.end(completed);}}});
    f.web.state.enabled=enabled;
    const bytes=zlib.gzipSync(Buffer.from('{ "model": "native", "input": [], "stream": true, "reasoning": { "effort": "high" } }'));
    const r=await f.call(bytes,{'content-encoding':'gzip','thread-id':'native-only','session-id':'session','x-codex-beta-features':'code_mode'});
    assert.equal(await r.text(),completed);assert.equal(r.headers.get('x-codex-turn-state'),'cache-b');assert.equal(f.nativeSeen.length,2);assert.equal(f.seen.length,0);
    for(const x of f.nativeSeen){assert.deepEqual(x.bytes,bytes);assert.equal(x.headers['thread-id'],'native-only');assert.equal(x.headers['session-id'],'session');assert.equal(x.headers['x-codex-beta-features'],'code_mode');}
    assert.equal(f.router.usage.requests,1);assert.equal(f.router.usage.attempts,2);assert.equal(f.router.usage.quotaRetries,1);
  }
});
test('disabled, malformed and missing-account Web models never fall through to native inference',async t=>{
  const f=await fixture(t);
  for(const model of ['chatgpt-web/unknown',qualify('ffffffff-ffff-4fff-8fff-ffffffffffff','chatgpt-web/gpt-6-sol')]){
    const r=await f.call({model,input:[]});assert.equal(r.status,400);await r.text();
  }
  f.web.state.enabled=false;const r=await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]});assert.equal(r.status,409);await r.text();
  assert.equal(f.nativeSeen.length,0);assert.equal(f.seen.length,0);assert.equal(f.bundles.length,0);
});
test('quota, authentication and transport errors on Web do not rotate accounts or consume native quota',async t=>{
  for(const status of [429,401,503]){
    const f=await fixture(t,{webHandler:(_req,res)=>{res.writeHead(status,{'content-type':'application/json'});res.end('{"error":{"type":"usage_limit_reached"}}');}});
    const r=await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]});assert.equal(r.status,status);await r.text();
    assert.equal(f.seen.length,1);assert.equal(f.nativeSeen.length,0);assert.equal(f.bundles.length,0);assert.equal(f.web.state.selectedId,f.wa);
  }
});
test('account binding persists; selection affects new tasks; cross-account or native reuse fails before inference',async t=>{
  const f=await fixture(t);const body=id=>({model:qualify(id,'chatgpt-web/gpt-6-sol'),input:[]});
  await (await f.call(body(f.wa),{'thread-id':'thread-a'})).text();await f.web.select(f.wb);
  await (await f.call(body(f.wa),{'thread-id':'thread-a'})).text();assert.equal(f.seen.length,2);
  const mismatch=await f.call(body(f.wb),{'thread-id':'thread-a'});assert.equal(mismatch.status,409);await mismatch.text();
  const native=await f.call({model:'native',input:[]},{'thread-id':'thread-a'});assert.equal(native.status,409);await native.text();assert.equal(f.bundles.length,0);
  await (await f.call(body(f.wb),{'thread-id':'thread-b'})).text();assert.equal(f.seen.length,3);
  const restarted=new WebService(f.web.root,{platform:{protectDirectory:async()=>{}}});await restarted.init();t.after(()=>clearInterval(restarted.timer));assert.deepEqual(restarted.bindings,f.web.bindings);
  assert(!JSON.stringify(restarted.bindings).includes('thread-a'));assert(!JSON.stringify(f.web.view()).includes('thread-a'));
});
test('Web compact and compressed requests are translated only on the Web branch',async t=>{
  const f=await fixture(t);const body={model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[{role:'user',content:'compact fixture'}]};
  const compressed=zlib.gzipSync(Buffer.from(JSON.stringify(body)));const r=await f.call(compressed,{'content-encoding':'gzip'},'responses/compact');assert.equal(await r.text(),completed);
  assert.equal(f.seen[0].url,'/v1/responses/compact');assert.equal(f.seen[0].headers['content-encoding'],undefined);assert.deepEqual(f.seen[0].body.input,body.input);assert.equal(f.nativeSeen.length,0);
});
test('Web catalog appends account-qualified rows while native metadata stays exactly equal',async t=>{
  const f=await fixture(t),catalog={models:[{slug:'native',context_window:12345,multi_agent_version:'v2',supported_reasoning_levels:[{effort:'high'}]}],other:'KEEP'};
  for(const id of [f.wa,f.wb])f.web.statuses.set(id,{ready:true,authenticated:true,interactionMode:'automatic'});
  f.web.rows.set(f.wb,[{slug:qualify(f.wb,'chatgpt-web/gpt-6-sol'),display_name:'Sol (Web · Web B)',visibility:'list'}]);
  f.web.control=async()=>({models:[{slug:'chatgpt-web/gpt-6-sol',display_name:'Sol (Web)',visibility:'list',context_window:240000}]});
  const r=await f.web.augmentModels(new Response(JSON.stringify(catalog),{headers:{'x-models-etag':'original'}}));const x=await r.json();
  assert.deepEqual(x.models[0],catalog.models[0]);assert.equal(x.other,'KEEP');assert.equal(x.models[1].slug,qualify(f.wa,'chatgpt-web/gpt-6-sol'));assert.equal(x.models[1].visibility,'list');assert.equal(x.models[1].multi_agent_version,'disabled');assert.equal(x.models[2].visibility,'hide');assert.equal(r.headers.get('x-models-etag'),null);assert.equal(f.nativeSeen.length,0);
  f.web.control=async()=>{throw Error('Unavailable Web runtime');};const original=Buffer.from(' { "models": [], "preserve": true } ');
  const fallback=await f.web.augmentModels(new Response(original,{headers:{'x-models-etag':'keep'}}));assert.deepEqual(Buffer.from(await fallback.arrayBuffer()),original);assert.equal(fallback.headers.get('x-models-etag'),'keep');
});
test('idle checks block disabling, account removal and parallel requests without disrupting Codex',async t=>{
  let release,arrived;const gate=new Promise(r=>release=r),started=new Promise(r=>arrived=r);
  const f=await fixture(t,{webHandler:async(_req,res)=>{arrived();await gate;res.writeHead(200,{'content-type':'text/event-stream'});res.end(completed);}});
  const pending=f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]});await started;
  await assert.rejects(f.web.disable(),{code:'WEB_ACTIVE'});await assert.rejects(f.web.remove(f.wb),{code:'WEB_ACCOUNT_ACTIVE'});
  const second=await f.call({model:qualify(f.wb,'chatgpt-web/gpt-6-sol'),input:[]});assert.equal(second.status,409);await second.text();assert.equal(f.seen.length,1);
  release();await (await pending).text();assert.equal(f.web.active,0);assert.equal(f.router.active,0);assert.equal(f.nativeSeen.length,0);
});
test('startup, empty state, profile metadata and malformed data never invoke a model',async t=>{
  const f=await fixture(t),dir=path.join(f.directory,'new-web');const web=new WebService(dir,{platform:{protectDirectory:async()=>{}},fetch:async()=>{throw Error('Network must not be used');}});
  await web.init();t.after(()=>clearInterval(web.timer));assert.equal(web.enabled,false);assert.deepEqual(web.view().profiles,[]);await web.poll();const id=await web.add('Local-only account');assert.equal(web.view().profiles[0].id,id);
  await web.remove(id);assert.equal(web.state.profiles.length,0);assert.equal(await fs.stat(path.join(dir,'trash',id)).then(s=>s.isDirectory()),true);
  await fs.writeFile(web.file,'{"version":1,"enabled":true,"selectedId":null,"profiles":[{"id":"../escape","label":"invalid"}]}');
  await assert.rejects(new WebService(dir).init());assert.equal(f.seen.length,0);assert.equal(f.nativeSeen.length,0);
});
test('model qualification round-trips and rejects traversal or another namespace',()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';assert.deepEqual(parse(qualify(id,'chatgpt-web/gpt-6-sol')),{id,model:'chatgpt-web/gpt-6-sol'});
  assert.equal(parse('http://127.0.0.1/secret'),null);assert.throws(()=>qualify('../escape','chatgpt-web/test'));assert.equal(parse('chatgpt-web/pad-'+id+'/../native'),null);
});

test('optional Web catalog inspection preserves oversized and invalid native responses',async t=>{
  const f=await fixture(t);f.web.control=async()=>{throw Error('Must not ask the companion');};
  for(const bytes of [Buffer.alloc(4*1024*1024+1,32),Buffer.from('native catalog unavailable')]){
    const response=new Response(bytes,{headers:{'x-models-etag':'native'}});
    const result=await f.web.augmentModels(response);assert.equal(result,response);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);assert.equal(result.headers.get('x-models-etag'),'native');
  }
});

test('one stalled companion cannot delay owner heartbeats for other accounts',async t=>{
  const f=await fixture(t),seen=[];let release;
  f.web.children.set(f.wa,{});f.web.children.set(f.wb,{});
  t.after(()=>f.web.children.clear());
  f.web.control=async(id,route)=>{seen.push([id,route]);if(id===f.wa)await new Promise(r=>release=r);};
  const polling=f.web.poll();await new Promise(r=>setImmediate(r));
  assert(seen.some(([id,route])=>id===f.wb&&route==='/heartbeat'));release();await polling;
});

test('removing a Web login preserves old-chat native protection across a restart',async t=>{
  const f=await fixture(t);await (await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]},{'thread-id':'old-web'})).text();
  f.web.state.enabled=false;await f.web.remove(f.wa);
  const restarted=new WebService(f.web.root);await restarted.init();t.after(()=>clearInterval(restarted.timer));
  assert.deepEqual(restarted.bindings,f.web.bindings);assert.equal(restarted.state.profiles.length,1);
  const r=await f.call({model:'native',input:[]},{'thread-id':'old-web'});assert.equal(r.status,409);await r.text();assert.equal(f.bundles.length,0);assert.equal(f.nativeSeen.length,0);
});

test('a full binding store rejects new Web chats without evicting old ownership or invoking models',async t=>{
  const f=await fixture(t);f.web.bindings=Object.fromEntries(Array.from({length:5000},(_,i)=>[i.toString(16).padStart(64,'0'),f.wa]));
  const before=structuredClone(f.web.bindings);
  const r=await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]},{'thread-id':'over-capacity'});
  assert.equal(r.status,409);assert.equal((await r.json()).error.code,'web_thread_limit');assert.deepEqual(f.web.bindings,before);assert.equal(f.seen.length,0);assert.equal(f.nativeSeen.length,0);
});

test('Web ownership never blocks shared native model discovery',async t=>{
  const f=await fixture(t);await (await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]},{'thread-id':'web-owner'})).text();
  const r=await fetch(f.router.baseUrl+'/models',{headers:{authorization:'Bearer fixture','thread-id':'web-owner'}});
  assert.equal(r.status,200);assert.equal(await r.text(),completed);assert.equal(f.nativeSeen.length,1);assert.equal(f.nativeSeen[0].url,'/v1/models');assert.equal(f.router.usage.requests,0);assert.equal(f.seen.length,1);
});

test('parallel account launch callers spawn once and lifecycle changes wait for startup',async t=>{
  const f=await fixture(t),spawned=[];let release;
  const first=new Promise(r=>release=r);
  f.web.launch=WebService.prototype.launch;
  f.web.control=async()=>({});
  f.web.startChild=async profile=>{spawned.push(profile.id);if(profile.id===f.wa)await first;f.web.children.set(profile.id,{});};
  t.after(()=>f.web.children.clear());
  const pending=[f.web.launch(f.wa,false),f.web.launch(f.wb,false),f.web.launch(f.wb,true),f.web.launch(f.wa,true)];
  await new Promise(r=>setImmediate(r));
  await assert.rejects(f.web.disable(),{code:'WEB_BUSY'});await assert.rejects(f.web.shutdown(),{code:'WEB_BUSY'});await assert.rejects(f.web.remove(f.wb),{code:'WEB_ACCOUNT_ACTIVE'});
  release();await Promise.all(pending);assert.deepEqual(spawned,[f.wa,f.wb]);assert.equal(f.web.launchFlight,null);
  assert.equal(f.nativeSeen.length,0);assert.equal(f.seen.length,0);
});

test('native invalid JSON values retain upstream status and bytes instead of becoming retryable transport errors',async t=>{
  const f=await fixture(t,{nativeHandler:(_req,res)=>{res.writeHead(400,{'content-type':'application/json'});res.end('{"error":{"type":"invalid_request"}}');}});
  for(const value of [null,'invalid',false,[],{}]){const r=await f.call(value);assert.equal(r.status,400);await r.text();assert.deepEqual(f.nativeSeen.at(-1).bytes,Buffer.from(JSON.stringify(value)));}
  assert.equal(f.nativeSeen.length,5);assert.equal(f.seen.length,0);assert.equal(f.router.usage.quotaRetries,0);
});

test('Web transport exceptions and redirects neither replay nor load native credentials',async t=>{
  for(const mode of ['throw','redirect']){
    const f=await fixture(t,{webHandler:(_req,res)=>{res.writeHead(307,{location:'https://example.invalid/never-follow'});res.end();}});
    if(mode==='throw')f.web.fetch=async()=>{throw Error('Fixture connection refused');};
    const r=await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]});assert.equal(r.status,502);await r.text();
    assert.equal(f.seen.length,mode==='throw'?0:1);assert.equal(f.nativeSeen.length,0);assert.equal(f.bundles.length,0);assert.equal(f.web.active,0);assert.equal(f.router.usage.attempts,0);
  }
});

test('Web disconnect after partial output releases activity without replay; native requests work during the Web turn',async t=>{
  let disconnected;const closed=new Promise(r=>disconnected=r);
  const f=await fixture(t,{webHandler:(_req,res)=>{res.once('close',disconnected);res.writeHead(200,{'content-type':'text/event-stream'});res.write('event: response.output_text.delta\ndata: {"delta":"partial"}\n\n');}});
  const controller=new AbortController(),r=await f.call({model:qualify(f.wa,'chatgpt-web/gpt-6-sol'),input:[]},{},'responses',controller.signal);
  const reader=r.body.getReader();assert.equal((await reader.read()).done,false);assert.equal(f.web.active,1);
  const native=await f.call({model:'native',input:[]});assert.equal(await native.text(),completed);assert.equal(f.nativeSeen.length,1);
  controller.abort();await reader.cancel().catch(()=>{});await closed;
  for(let i=0;i<100&&f.web.active;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(f.web.active,0);assert.equal(f.seen.length,1);assert.equal(f.router.usage.requests,1);assert.equal(f.router.usage.quotaRetries,0);
});

test('ready Web status polling uses only owner heartbeat/status endpoints and cannot infer',async t=>{
  const f=await fixture(t),calls=[];f.web.children.set(f.wa,{});t.after(()=>f.web.children.clear());
  f.web.control=async(id,route)=>{calls.push(route);return {};};
  f.web.refreshStatus=async id=>{calls.push('/status');f.web.statuses.set(id,{ready:true,authenticated:true,interactionMode:'automatic'});};
  for(let i=0;i<3;i++)await f.web.poll();assert.deepEqual(calls,['/heartbeat','/status','/heartbeat','/status','/heartbeat','/status']);assert.equal(f.seen.length,0);assert.equal(f.nativeSeen.length,0);assert.equal(f.bundles.length,0);
});
