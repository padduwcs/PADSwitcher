'use strict';
// A local, capability-protected Responses relay. No prompt/response/token logging.
// Retry only an explicit account-quota rejection, before any stream is committed.
const http=require('node:http');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {exhaustedSnapshot}=require('./recovery.cjs');
const {createUsage,observeUsage}=require('./model-usage.cjs');
const MAX_BODY=64*1024*1024,MAX_PEEK=128*1024,MAX_ERROR=1024*1024;
const ROUTES=new Map([['responses','POST'],['responses/compact','POST'],['responses/lite','POST'],['models','GET'],['web_search','POST']]);
const PRELUDE=new Set(['response.created','response.in_progress','response.queued']);
function quotaError(value){const e=value?.error||value?.response?.error;return !!e&&[e.type,e.code].includes('usage_limit_reached');}
function decodeRequest(bytes,encoding){
  const options={maxOutputLength:MAX_BODY};
  if(encoding==='zstd')bytes=zlib.zstdDecompressSync(bytes,options);
  else if(encoding==='gzip')bytes=zlib.gunzipSync(bytes,options);
  else if(encoding==='deflate')bytes=zlib.inflateSync(bytes,options);
  else if(encoding&&encoding!=='identity')throw Error('Unsupported encoding');
  return JSON.parse(bytes.toString('utf8'));
}
function replayable(body){
  // Incremental server-side references may belong to one account. Never rotate them.
  return !body?.previous_response_id&&!body?.conversation&&!(Array.isArray(body?.input)&&body.input.some(x=>typeof x==='string'||x?.type==='item_reference'));
}
function personalProfile(profile){return ['free','plus','pro'].includes(String(profile?.plan||'').toLowerCase());}
function outgoingHeaders(incoming,bundle){
  const headers={authorization:'Bearer '+bundle.accessToken,'chatgpt-account-id':bundle.chatgptAccountId};
  for(const [key,value]of Object.entries(incoming)){
    if(typeof value==='string'&&(/^(accept|content-type|content-encoding|user-agent|originator|version|openai-beta|session-id|thread-id|session_id|conversation_id|traceparent|tracestate|x-request-id|x-client-request-id|x-openai-subagent|x-openai-memgen-request|x-openai-internal-codex-responses-lite|x-responsesapi-include-timing-metrics)$/.test(key)||/^x-codex-/.test(key)))headers[key]=value;
  }
  return headers;
}
class ModelRouter {
  constructor(gateway,options={}){this.g=gateway;this.options=options;this.requests=new Set();this.used=new Map();this.turnStates=new Map();this.usage=createUsage();this.epoch=0;this.profileId=null;this.active=0;}
  async start(){
    const upstream=new URL(this.options.upstream||'https://chatgpt.com/backend-api/codex/');
    if(!this.options.allowTestUpstream&&(upstream.protocol!=='https:'||upstream.hostname!=='chatgpt.com'||upstream.pathname!=='/backend-api/codex/'))throw Error('Invalid model upstream');
    this.upstream=upstream;this.capability=crypto.randomBytes(32).toString('hex');
    this.server=http.createServer((req,res)=>this.handle(req,res));
    this.server.requestTimeout=300000;this.server.headersTimeout=15000;
    this.server.on('upgrade',(req,socket)=>{
      socket.on('error',()=>{});
      // Official Codex falls back to full-input HTTP Responses on 426.
      const status=this.authorized(req)?426:401;
      socket.end(`HTTP/1.1 ${status} ${status===426?'Upgrade Required':'Unauthorized'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    });
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
    this.host='127.0.0.1:'+this.server.address().port;this.baseUrl='http://'+this.host+'/'+this.capability;
  }
  authorized(req){
    const prefix='/'+this.capability+'/';
    return req.headers.host===this.host&&!req.headers.origin&&!req.headers['sec-fetch-site']&&req.url.startsWith(prefix)&&/^Bearer \S+$/.test(req.headers.authorization||'');
  }
  cancel(){this.epoch++;for(const controller of this.requests)controller.abort();}
  async stop(){this.cancel();this.turnStates.clear();if(!this.server)return;this.server.closeAllConnections();await new Promise(r=>this.server.close(r));this.server=null;this.capability=null;this.baseUrl=null;this.profileId=null;}
  note(type,message,from=null,to=null){this.g.recovery.note(type,message,from,to);}
  select(id){this.profileId=id;}
  isUsing(id){return this.profileId===id||this.used.has(id);}
  turnState(token){
    if(typeof token!=='string'||!token||token.length>16384)return null;
    const key=crypto.createHash('sha256').update(token).digest('hex'),state=this.turnStates.get(key);
    // Codex can wait for approval/tools for hours within the same turn. Match
    // its turn lifetime instead of expiring a valid routing token on a timer.
    if(state){this.turnStates.delete(key);this.turnStates.set(key,state);}
    return state||null;
  }
  headers(incoming,bundle,id){
    const headers=outgoingHeaders(incoming,bundle);
    // Native Codex keeps the first token in a OnceLock for the entire turn.
    // Resolve that token to this account's state after a mid-turn rotation;
    // never send account A's sticky-routing token to account B.
    const state=this.turnState(incoming['x-codex-turn-state']),token=state?.accounts.get(id);
    delete headers['x-codex-turn-state'];
    if(token)headers['x-codex-turn-state']=token;
    return headers;
  }
  rememberTurnState(response,id,incoming){
    const token=response.headers.get('x-codex-turn-state');
    if(!token||token.length>16384)return;
    const state=this.turnState(incoming['x-codex-turn-state'])||{accounts:new Map()};
    state.accounts.set(id,token);
    const key=crypto.createHash('sha256').update(token).digest('hex');
    this.turnStates.delete(key);this.turnStates.set(key,state);
    // Routing tokens live only in bounded process memory, never in diagnostics.
    while(this.turnStates.size>1024)this.turnStates.delete(this.turnStates.keys().next().value);
  }
  async routeSelected(id){
    if(this.profileId===id||(this.g.service.state.quotaCooldowns?.[id]||0)>Date.now())return;
    const from=this.profileId||this.g.profileId;this.profileId=id;
    this.g.service.state.gatewayProfileId=id;
    try{await this.g.service.save();}catch{this.note('error','Không lưu được tài khoản đã đổi; phiên hiện tại vẫn tiếp tục.');}
    this.note('routed','Đã đổi tài khoản và thử lại lần gọi model; không thêm tin nhắn.',from,id);
    this.g.changed();
  }
  candidates(first,attempted){
    const g=this.g,policy=g.service.state.autoSwitch||{enabled:false,order:[]};
    if(!policy.enabled||!personalProfile(g.service.state.profiles.find(p=>p.id===first)))return attempted.size?[]:[first];
    return [...new Set([first,...policy.order])].filter(id=>!attempted.has(id)&&g.service.state.profiles.some(p=>p.id===id&&personalProfile(p)&&p.status!=='reauth'&&!g.service.running.has(id)&&!exhaustedSnapshot(p,Date.now()))&&(g.service.state.quotaCooldowns?.[id]||0)<=Date.now());
  }
  async cooldown(id,value){
    const e=value?.error||value?.response?.error||{},now=Date.now();
    const reset=Number(e.resets_at)*1000||now+Number(e.resets_in_seconds)*1000;
    this.g.service.state.quotaCooldowns={...this.g.service.state.quotaCooldowns,[id]:Number.isFinite(reset)&&reset>now?reset:now+900000};
    try{await this.g.service.save();}catch{this.note('error','Không lưu được thời gian chờ quota; vẫn giữ trong phiên hiện tại.');}
  }
  error(res,status,code,message){if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{type:code,code,message}}));}else res.destroy();}
  async handle(req,res){
    if(!this.authorized(req)){this.error(res,401,'unauthorized','Local model connection rejected.');return;}
    const suffix=req.url.slice(this.capability.length+2),route=suffix.split('?')[0];
    if(!ROUTES.has(route)||req.method!==ROUTES.get(route)){this.error(res,404,'not_found','Unsupported model route.');return;}
    if(this.active>=16){this.error(res,503,'router_busy','Too many model requests.');return;}
    const controller=new AbortController(),epoch=this.epoch;this.requests.add(controller);this.active++;
    res.once('close',()=>{if(!res.writableFinished)controller.abort();});
    controller.signal.addEventListener('abort',()=>res.destroy(),{once:true});
    // Timeout inactivity, not total generation time. Cutting off a healthy long
    // stream can make native Codex retry inference that already consumed quota.
    let timer;const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),this.options.idleTimeoutMs||300000);};touch();
    let bytes=Buffer.alloc(0);const used=new Set();
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){touch();size+=chunk.length;if(size>MAX_BODY){this.error(res,413,'request_too_large','Model request is too large.');return;}chunks.push(chunk);}
      bytes=Buffer.concat(chunks);let body={};
      if(req.method==='POST'){
        try{body=decodeRequest(bytes,req.headers['content-encoding']);}catch{this.error(res,400,'invalid_request','Invalid model request.');return;}
      }
      const track=req.method==='POST'&&route.startsWith('responses'),observe=track?observeUsage(this.usage):()=>{};
      if(track){this.usage.requests++;this.usage.lastModel=typeof body?.model==='string'&&/^[a-z0-9_.-]{1,80}$/i.test(body.model)?body.model:null;this.usage.lastEffort=['none','minimal','low','medium','high','xhigh','max'].includes(body?.reasoning?.effort)?body.reasoning.effort:null;}
      const canReplay=replayable(body),attempted=new Set(),deadline=Date.now()+120000;
      let first=this.profileId||this.g.profileId,lastQuota=null;
      while(!controller.signal.aborted&&epoch===this.epoch){
        const id=this.candidates(first,attempted)[0];
        if(!id||Date.now()>deadline){
          if(lastQuota){this.note('exhausted','Không còn tài khoản dự phòng khả dụng.');this.error(res,429,'usage_limit_reached','No available fallback account.');}
          else {this.note('exhausted','Không còn tài khoản dự phòng khả dụng.');this.error(res,429,'usage_limit_reached','No available account.');}
          return;
        }
        attempted.add(id);
        if(!used.has(id)){used.add(id);this.used.set(id,(this.used.get(id)||0)+1);}
        let refreshed=false;
        for(;;){
          const bundle=await this.g.bundle(id,refreshed);
          if(controller.signal.aborted||epoch!==this.epoch)return;
          if(!['free','plus','pro'].includes(String(bundle.chatgptPlanType||'').toLowerCase())){
            if(id!==first){this.note('skipped','Bỏ qua tài khoản dự phòng chưa xác định là tài khoản cá nhân.',first,id);break;}
            this.note('blocked','Bộ định tuyến hiện hỗ trợ tài khoản cá nhân Free, Plus và Pro. Tài khoản tổ chức cần luồng kết nối riêng.');
            this.error(res,409,'unsupported_account_plan','Only confirmed personal Free, Plus and Pro accounts can use this model route.');return;
          }
          if(track){this.usage.attempts++;if(lastQuota&&!refreshed)this.usage.quotaRetries++;}
          const response=await (this.options.fetch||fetch)(new URL(suffix,this.upstream),{method:req.method,headers:this.headers(req.headers,bundle,id),body:req.method==='POST'?bytes:undefined,redirect:'error',signal:controller.signal});touch();
          if(response.status===401&&!refreshed){await response.body?.cancel();refreshed=true;if(track)this.usage.authRefreshes++;continue;}
          let prefix=[],quota=null,streamReader=null;
          if(!response.ok){
            const reader=response.body?.getReader();let length=0;
            if(reader)for(;;){const {done,value}=await reader.read();if(done)break;touch();length+=value.length;if(length>MAX_ERROR){await reader.cancel();this.error(res,502,'upstream_error','Upstream error body is too large.');return;}prefix.push(Buffer.from(value));}
            try{const value=JSON.parse(Buffer.concat(prefix).toString());if(response.status===429&&quotaError(value))quota=value;}catch{}
          }else if(['responses','responses/lite'].includes(route)&&/text\/event-stream/.test(response.headers.get('content-type')||'')){
            const peek=await this.peek(response,controller,touch);prefix=peek.prefix;quota=peek.quota;streamReader=peek.reader;
            if(!quota){this.rememberTurnState(response,id,req.headers);await this.routeSelected(id);await this.forward(response,res,prefix,peek.reader,touch,observe);return;}
          }
          const personal=personalProfile(this.g.service.state.profiles.find(p=>p.id===first))&&['free','plus','pro'].includes(String(bundle.chatgptPlanType||'').toLowerCase());
          if(quota&&this.g.service.state.autoSwitch?.enabled&&personal&&!this.g.pendingId&&!this.g.changing&&canReplay&&epoch===this.epoch){
            await this.cooldown(id,quota);lastQuota=quota;
            this.note('retrying','Hết quota: đang thử tài khoản dự phòng cho cùng lần gọi model.',id);
            break;
          }
          if(quota&&!canReplay)this.note('blocked','Yêu cầu dùng trạng thái riêng của tài khoản; không tự phát lại.');
          if(quota&&this.g.service.state.autoSwitch?.enabled&&!personal)this.note('blocked','Tự đổi chỉ hỗ trợ tài khoản cá nhân Free, Plus và Pro đã xác định.');
          if(response.ok){this.rememberTurnState(response,id,req.headers);await this.routeSelected(id);}
          await this.forward(response,res,prefix,streamReader,touch,observe);return;
        }
      }
    }catch{
      if(!controller.signal.aborted)this.note('error','Lần gọi model bị lỗi kết nối; không tự phát lại.');
      this.error(res,502,'model_transport_error','Model connection failed. No automatic replay was performed.');
    }finally{clearTimeout(timer);bytes.fill(0);this.requests.delete(controller);this.active--;for(const id of used){const count=this.used.get(id)-1;if(count)this.used.set(id,count);else this.used.delete(id);}this.g.changed();this.g.syncRoute?.();}
  }
  async peek(response,controller,touch=()=>{}){
    const reader=response.body.getReader(),prefix=[],decoder=new TextDecoder();let text='',parsed=0,size=0;
    const started=Date.now();
    while(size<MAX_PEEK&&Date.now()-started<5000){
      // A pending read remains on this reader; timeout flushes the prefix and
      // forwards the same promise instead of issuing a second concurrent read.
      let timer;const pending=reader.read();
      const part=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(1,5000-(Date.now()-started)));})]);clearTimeout(timer);
      if(part===null)return {prefix,reader:this.pendingReader(reader,pending),quota:null};
      if(part.done)break;
      touch();
      prefix.push(Buffer.from(part.value));size+=part.value.length;text+=decoder.decode(part.value,{stream:true});
      let separator;
      while((separator=/\r?\n\r?\n/.exec(text.slice(parsed)))!==null){
        const end=parsed+separator.index,event=text.slice(parsed,end);parsed=end+separator[0].length;
        const raw=event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if(!raw)continue;
        let value;try{value=JSON.parse(raw);}catch{return {prefix,reader,quota:null};}
        if(['response.failed','error'].includes(value.type)&&quotaError(value)){await reader.cancel();return {prefix,reader:{read:async()=>({done:true})},quota:value};}
        if(!PRELUDE.has(value.type))return {prefix,reader,quota:null};
      }
      if(controller.signal.aborted)break;
    }
    return {prefix,reader,quota:null};
  }
  pendingReader(reader,pending){let first=true;return {read:()=>{if(first){first=false;return pending;}return reader.read();},cancel:()=>reader.cancel()};}
  async forward(response,res,prefix=[],reader=null,touch=()=>{},observe=()=>{}){
    const headers={'Cache-Control':'no-store'};
    for(const [key,value]of response.headers){
      if(/^(content-type|retry-after|x-request-id|x-codex-turn-state|x-models-etag|openai-model|x-reasoning-included|x-codex-promo-message)$/.test(key)||/^x-codex-(primary-|secondary-|credits-|rate-limit-|safety-buffering-)/.test(key)||/^x-[a-z0-9-]+-(primary|secondary)-(used-percent|window-minutes|reset-at)$/.test(key)||/^x-codex-[a-z0-9-]+-limit-name$/.test(key))headers[key]=value;
    }
    res.writeHead(response.status,headers);
    const write=async value=>{
      observe(value);
      if(res.destroyed)throw Error('Client disconnected');
      if(!res.write(value))await new Promise((resolve,reject)=>{
        const cleanup=()=>{res.off('drain',drained);res.off('close',closed);res.off('error',closed);};
        const drained=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(Error('Client disconnected'));};
        res.once('drain',drained);res.once('close',closed);res.once('error',closed);
      });
    };
    for(const value of prefix)await write(value);
    // An unsuccessful response body was already consumed into prefix.
    if(!reader&&response.ok)reader=response.body?.getReader();
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;touch();await write(value);}
    res.end();
  }
}
module.exports={ModelRouter,quotaError,replayable,decodeRequest,outgoingHeaders};
