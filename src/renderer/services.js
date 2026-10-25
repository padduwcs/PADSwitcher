'use strict';
// Add a service here with its existing page IDs. Navigation never connects an account.
window.padServicesUI = (() => {
  const t=(vi,en)=>window.padUI.language==='en'?en:vi;
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const registry=[
    {id:'codex',name:'Codex',mark:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></svg>',description:()=>t('Quản lý tài khoản và kết nối Codex với công cụ bạn đang dùng.','Manage accounts and connect Codex to the tools you use.'),pages:[{id:'accounts',label:()=>t('Tài khoản','Accounts')},{id:'connections',label:()=>t('Kết nối','Connections')},{id:'codex-settings',label:()=>t('Cài đặt','Settings')}],summary:state=>({count:state.profiles.length,ready:state.gateway?.status==='ready',text:state.gateway?.status==='ready'?t('Đang kết nối','Connected'):t('Chưa bật kết nối','Not connected')})},
    {id:'kaggle',name:'Kaggle',mark:'<span aria-hidden="true">k</span>',description:()=>t('Chọn tài khoản từ terminal, theo dõi quota GPU và notebook.','Select accounts from your terminal. Monitor GPU quota and notebooks.'),pages:[{id:'kaggle',label:()=>t('Tài khoản','Accounts')}],summary:state=>({count:state.kaggle?.accounts?.length||0,text:t('Làm việc từ terminal','Work from your terminal')})}
  ];
  const serviceFor=page=>registry.find(service=>service.pages.some(item=>item.id===page));
  function render(state,page){
    const list=document.querySelector('#service-list');
    const focus=document.activeElement?.closest('[data-service]')?.dataset.service;
    document.querySelector('#services-page').setAttribute('aria-label',t('Dịch vụ','Services'));
    document.querySelector('#services-heading').innerHTML=`<div><h1 tabindex="-1">${t('Dịch vụ','Services')}</h1><p>${t('Chọn dịch vụ bạn muốn sử dụng.','Choose the service you want to use.')}</p></div>`;
    list.innerHTML=registry.map(service=>{
      const info=service.summary(state);
      return `<button type="button" class="service-card" data-service="${service.id}" data-page="${service.pages[0].id}"><span class="service-card-top"><span class="service-mark ${service.id}">${service.mark}</span><span class="service-open" aria-hidden="true">↗</span></span><strong class="service-name">${service.name}</strong><span class="service-description">${e(service.description())}</span><span class="service-card-footer"><span>${info.count} ${t('tài khoản','accounts')}</span><span class="service-state ${info.ready?'ready':''}">${info.ready?'<span class="status-dot ready"></span>':''}${e(info.text)}</span></span></button>`;
    }).join('');
    if(focus)list.querySelector(`[data-service="${focus}"]`)?.focus({preventScroll:true});
    document.querySelector('#service-settings-links').innerHTML=`<h2>${t('Thiết lập dịch vụ','Service settings')}</h2><div class="service-settings-grid">${registry.map(service=>`<div class="panel service-settings-card"><div class="service-mark ${service.id}">${service.mark}</div><div><h3>${service.name}</h3><p>${service.id==='codex'?t('Thư mục làm việc, kết nối và khôi phục dữ liệu.','Working folder, connections and data recovery.'):t('Python, Kaggle CLI và lệnh trong Bash/Zsh.','Python, Kaggle CLI and Bash/Zsh commands.')}</p></div><button type="button" class="button secondary" data-page="${service.id==='codex'?'codex-settings':service.pages[0].id}">${t('Mở','Open')} ${service.name} ↗</button></div>`).join('')}</div>`;
    document.querySelector('#help-kaggle').innerHTML=`<div class="panel help-details">${window.padKaggleUI.instructions()}<button class="text-button" data-page="kaggle">${t('Mở Kaggle ↗','Open Kaggle ↗')}</button></div>`;
    context(page);
  }
  function context(page){
    const service=serviceFor(page),container=document.querySelector('#service-context');
    const focusPage=container.contains(document.activeElement)?document.activeElement.dataset.page:null;
    container.classList.toggle('hidden',!service);
    const breadcrumb=document.querySelector('#breadcrumb'),tabs=document.querySelector('#service-tabs');
    breadcrumb.setAttribute('aria-label',t('Đường dẫn','Breadcrumb'));
    tabs.setAttribute('aria-label',t('Mục dịch vụ','Service sections'));
    breadcrumb.innerHTML=service?`<button type="button" data-page="services">${t('Dịch vụ','Services')}</button><span aria-hidden="true">/</span><strong>${service.name}</strong>`:'';
    tabs.innerHTML=service&&service.pages.length>1?service.pages.map(item=>`<button type="button" class="service-tab ${item.id===page?'active':''}" data-page="${item.id}" ${item.id===page?'aria-current="page"':''}>${e(item.label())}</button>`).join(''):'';
    tabs.classList.toggle('hidden',!tabs.children.length);
    if(focusPage)container.querySelector(`[data-page="${focusPage}"]`)?.focus({preventScroll:true});
  }
  return {render,context,serviceFor};
})();
