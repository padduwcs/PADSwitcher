'use strict';
const {UserError}=require('./errors.cjs');
const SCOPES=['vscode','jetbrains','cli'];
const defaults=()=>Object.fromEntries(SCOPES.map(k=>[k,{mode:'shared',profileId:null,autoSwitch:{enabled:false,order:[]}}]));
function validate(routes,ids){
  if(!routes||typeof routes!=='object'||Array.isArray(routes)||Object.keys(routes).some(k=>!SCOPES.includes(k)))throw new UserError('Cấu hình tài khoản riêng không hợp lệ.', 'STORE_INVALID');
  for(const scope of SCOPES){const r=routes[scope],p=r?.autoSwitch;
    if(!r||!['shared','private'].includes(r.mode)||(r.profileId!==null&&!ids.has(r.profileId))||(r.mode==='private'&&!r.profileId)||!p||typeof p.enabled!=='boolean'||!Array.isArray(p.order)||p.order.length>200||new Set(p.order).size!==p.order.length||p.order.some(id=>!ids.has(id))||(p.enabled&&p.order.length<2))throw new UserError('Cấu hình tài khoản riêng không hợp lệ.', 'STORE_INVALID');
  }
  return routes;
}
module.exports={SCOPES,defaults,validate};
