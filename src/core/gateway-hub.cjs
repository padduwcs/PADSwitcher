'use strict';
// Stable helper endpoint dispatches each authenticated client to a separate native
// backend when requested. Shared mode retains the original shared router.
const path=require('node:path');
const {Gateway}=require('./gateway.cjs');
const {MAX_FRAME}=require('./ws-rpc.cjs');
const {SCOPES}=require('./client-routes.cjs');
const {UserError}=require('./errors.cjs');
function kind(m){const n=m.params?.clientInfo?.name;return m.params?._padswitcherClient==='jetbrains'?'jetbrains':['codex_vscode','codex_vscode_copilot'].includes(n)?'vscode':['codex_cli_rs','codex_cli'].includes(n)?'cli':'other';}
class GatewayHub{
  constructor(service,options={}){
    this.service=service;this.options=options;this.private=new Map();this.waiting=new Set();this.transitions=new Map();this.flight=null;
    this.shared=new Gateway(service,{...options,attach:front=>this.attach(front),clientCount:()=>this.all().reduce((n,g)=>n+g.clients.size,0)+this.waiting.size});service.gateway=this;
    this.router={isUsing:id=>this.isUsing(id)};
    this.recovery={cancel:message=>{for(const g of this.all())g.recovery.cancel(message);}};
  }
  all(){return [this.shared,...this.private.values()];}
  config(scope){return this.transitions.get(scope)||this.service.state.clientRoutes[scope];}
  scope(scope='shared'){if(scope==='shared')return scope;if(!SCOPES.includes(scope))throw new UserError('Kết nối không hợp lệ.', 'INVALID_SETTINGS');return this.config(scope).mode==='private'?scope:'shared';}
  route(scope='shared'){return this.scope(scope)==='shared'?this.shared:this.private.get(scope);}
  get status(){return this.shared.status;}
  get helper(){return this.shared.helper;}
  get profileId(){return this.shared.profileId;}
  get pendingId(){return this.shared.pendingId;}
  get turns(){return new Map(this.all().flatMap(g=>[...g.turns].map(([k,v])=>[g.root+':'+k,v])));}
  isUsing(id){return [...this.transitions.values()].some(r=>r.mode==='private'&&r.profileId===id)||this.all().some(g=>g.profileId===id||g.pendingId===id||g.router?.isUsing(id));}
  changed(){this.service.changed();}
  view(){
    const base=this.shared.view(),views=this.all().map(g=>g.view()),connected={vscode:0,jetbrains:0,cli:0,other:0};
    for(const v of views)for(const k of Object.keys(connected))connected[k]+=v.connected[k]||0;
    const scopes=Object.fromEntries(SCOPES.map(k=>{const config=this.service.state.clientRoutes[k],g=this.route(k);return [k,{...g?.view(),mode:config.mode,autoSwitch:config.mode==='private'?config.autoSwitch:this.service.state.autoSwitch}];}));
    return {...base,connected,clients:views.reduce((n,v)=>n+v.clients,0)+this.waiting.size,activeTurns:views.reduce((n,v)=>n+v.activeTurns,0),scopes,routingBusy:!!this.flight};
  }
  privateGateway(scope){
    if(this.private.has(scope))return this.private.get(scope);
    const owner=this.service,hub=this;
    const state=new Proxy({}, {get:(_t,k)=>k==='gatewayProfileId'?hub.config(scope).profileId:k==='autoSwitch'?hub.config(scope).autoSwitch:k==='gatewayEnabled'?false:owner.state[k],set:(_t,k,v)=>{if(k==='gatewayProfileId')hub.config(scope).profileId=v;else if(k!=='gatewayEnabled')owner.state[k]=v;return true;}});
    const facade={root:owner.root,platform:owner.platform,state,running:owner.running,get busy(){return owner.busy;},get:id=>owner.get(id),accessBundle:(...args)=>owner.accessBundle(...args),executable:()=>owner.executable(),save:()=>owner.save(),changed:()=>owner.changed()};
    const g=new Gateway(facade,{...this.options,attach:undefined,root:path.join(owner.root,'gateway','routes',scope),isolatedState:true});
    this.private.set(scope,g);return g;
  }
  async start(id,scope='shared'){
    if(this.flight)throw new UserError('Chờ thay đổi chế độ kết nối hoàn tất.', 'BUSY');
    const target=this.scope(scope);
    this.service.get(id);
    if(this.status==='error')await this.stop();
    if(target==='shared')await this.shared.start(id);
    else {if(this.status!=='ready')await this.shared.start(this.service.state.gatewayProfileId||id);await this.privateGateway(target).start(id);}
    for(const k of SCOPES)if(this.config(k).mode==='private'&&this.private.get(k)?.status!=='ready')await this.privateGateway(k).start(this.config(k).profileId);
  }
  async select(id,scope='shared'){const g=this.route(scope);if(!g)throw new UserError('Bật kết nối trước khi đổi tài khoản.', 'GATEWAY_STOPPED');await g.select(id);}
  async configure({scope,mode,profileId}){
    if(this.flight||this.service.busy)throw new UserError('Một thao tác khác đang chạy. Hãy chờ hoàn tất.', 'BUSY');
    if(!SCOPES.includes(scope)||!['shared','private'].includes(mode))throw new UserError('Kết nối không hợp lệ.', 'INVALID_SETTINGS');
    if(mode==='private')this.service.get(profileId);
    this.flight=this.configureInner(scope,mode,profileId);this.changed();try{return await this.flight;}finally{this.flight=null;this.changed();}
  }
  async configureInner(scope,mode,profileId){
    if(this.status!=='ready')throw new UserError('Bật kết nối Codex trước khi chọn tài khoản riêng.', 'GATEWAY_STOPPED');
    const previous=this.config(scope),old=this.route(scope);
    if(previous.mode===mode){if(mode==='private')await old.start(profileId);return {reconnect:false};}
    if(old.status==='ready')await old.reconcile();
    if([...old.turns.values()].some(t=>!t.client||t.client.kind===scope)||old.changing||old.refreshFlight||old.router?.active)throw new UserError('Chờ lượt đang chạy hoàn tất trước khi đổi chế độ kết nối.', 'GATEWAY_ACTIVE');
    const config={...previous,mode,profileId:mode==='private'?profileId:previous.profileId};this.transitions.set(scope,config);
    const frozen=[...old.clients].filter(c=>c.kind===scope);for(const c of frozen)c.routeChanging=true;
    let next,committed=false;
    try{
      if(mode==='private'){next=this.privateGateway(scope);await next.start(profileId);}
      this.service.state.clientRoutes[scope]=config;
      try{await this.service.save();}catch(e){this.service.state.clientRoutes[scope]=previous;throw e;}
      // Do not interrupt any active work. Recheck after asynchronous setup/save.
      if([...old.turns.values()].some(t=>!t.client||t.client.kind===scope)||old.router?.active){this.service.state.clientRoutes[scope]=previous;await this.service.save();throw new UserError('Một lượt mới vừa bắt đầu. Giữ chế độ hiện tại và thử lại sau.', 'GATEWAY_ACTIVE');}
      committed=true;
      for(const c of old.clients)if(c.kind===scope)c.front.close(1012,'Account mode changed; reconnect client');
      if(mode==='shared'&&this.private.has(scope)){await old.stop(true);this.private.delete(scope);}
      return {reconnect:true};
    }catch(e){if(next){await next.stop(true);this.private.delete(scope);}throw e;}
    finally{if(!committed)for(const c of frozen)c.routeChanging=false;this.transitions.delete(scope);}
  }
  attach(front){
    const pending={front};this.waiting.add(pending);let bytes=0;
    const timer=setTimeout(()=>front.close(1008,'Initialize required'),10000);
    const clean=()=>{clearTimeout(timer);this.waiting.delete(pending);front.off('message',first);front.off('close',clean);this.changed();};
    const first=data=>{
      bytes+=data.length;let m;try{m=JSON.parse(data.toString());}catch{front.close(1007);return;}
      if(bytes>MAX_FRAME||m?.method!=='initialize'||m.id==null){front.close(1008,'Initialize required');return;}
      const scope=kind(m);if(this.transitions.has(scope)){front.close(1013,'Account mode changing');return;}
      const g=this.route(scope==='other'?'shared':scope);
      if(!g||g.status!=='ready'){front.close(1013,'Selected connection is not ready');return;}
      clean();g.attach(front,[data]);
    };
    front.on('message',first);front.on('close',clean);front.on('error',()=>{});this.changed();
  }
  async stop(force=false){
    if(this.flight)throw new UserError('Chờ thay đổi chế độ kết nối hoàn tất.', 'BUSY');
    if(!force){for(const g of this.all())if(g.status==='ready')await g.reconcile();if(this.turns.size||this.all().some(g=>g.router?.active))throw new UserError('Codex còn yêu cầu đang chạy. Chờ hoàn tất trước khi dừng.', 'GATEWAY_ACTIVE');}
    for(const p of this.waiting)p.front.terminate();this.waiting.clear();
    for(const g of [...this.private.values(),this.shared])await g.stop(force);this.private.clear();
  }
}
module.exports={GatewayHub,kind};
