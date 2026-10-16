'use strict';
// Account management only. Job execution remains in the official Kaggle CLI.
window.padKaggleUI = (() => {
  let hooks, data, selected, workspace='', query='', toolsBusy=false,accountBusy=false;
  const loadingPages=new Set();
  const $=s=>document.querySelector(s);
  const t=(vi,en)=>window.padUI.language==='en'?en:vi;
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stale=stamp=>!Number.isFinite(Date.parse(stamp))||Date.now()-Date.parse(stamp)>300000;
  const date=stamp=>Number.isFinite(Date.parse(stamp))?new Date(stamp).toLocaleString(window.padUI.language==='en'?'en-GB':'vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):t('Chưa cập nhật','Not refreshed');
  const hours=value=>Number.isFinite(value)?value.toLocaleString(window.padUI.language==='en'?'en-GB':'vi-VN',{maximumFractionDigits:1})+' h':'—';
  const names={running:['Đang chạy','Running'],queued:['Đang chờ','Queued'],complete:['Hoàn tất','Complete'],error:['Lỗi','Error'],stopping:['Đang dừng','Stopping'],cancelled:['Đã hủy','Cancelled'],saved:['Chưa chạy','Saved'],unknown:['Chưa rõ','Unknown']};
  const status=value=>t(...(Object.hasOwn(names,value)?names[value]:names.unknown));
  const act=(command,args={},success)=>hooks.call(command,args,success);
  const button=(id,label,kind='secondary',disabled=false)=>`<button type="button" id="${id}" class="button ${kind}" ${disabled?'disabled':''}>${label}</button>`;
  const literal=body=>`<div data-literal>${body}</div>`;
  const layoutKey='pad-kaggle-layout';
  let sizes={},resize=null,loadNext=null;
  try{const saved=JSON.parse(localStorage.getItem(layoutKey));if(saved?.version===1)for(const key of ['width','accounts','pinned','recent'])if(Number.isFinite(saved[key])&&(key==='width'?saved[key]>0&&saved[key]<1:saved[key]>=80&&saved[key]<=10000))sizes[key]=saved[key];}catch{}
  const grip=(key,label,vertical=false)=>`<div class="kg-resizer ${vertical?'kg-column-resizer':'kg-row-resizer'}" data-kg-resize="${key}" role="separator" tabindex="0" aria-orientation="${vertical?'vertical':'horizontal'}" aria-label="${label}" title="${label}"><span aria-hidden="true"></span></div>`;
  function bounds(key){
    if(key!=='width')return [key==='accounts'?160:80,Math.max(480,window.innerHeight*2)];
    const width=Math.max(1,$('#kg-layout').clientWidth-48);
    return [Math.min(.4,240/width),Math.max(.4,Math.min(.6,1-360/width))];
  }
  const constrain=(key,value)=>{const [min,max]=bounds(key);return Math.max(min,Math.min(max,value));};
  function saveSizes(){try{if(Object.keys(sizes).length)localStorage.setItem(layoutKey,JSON.stringify({version:1,...sizes}));else localStorage.removeItem(layoutKey);}catch{}}
  function applySizes(){
    const root=$('#kaggle-content'),layout=$('#kg-layout');if(!layout||layout.classList.contains('hidden')||!layout.clientWidth)return;
    const width=Math.max(1,layout.clientWidth-48),top=layout.getBoundingClientRect().top+window.scrollY;
    const automaticAccounts=Math.max(320,window.innerHeight-top-24);
    root.style.setProperty('--kg-account-width',Math.round(constrain('width',sizes.width??.3)*width)+'px');
    root.style.setProperty('--kg-accounts-auto',automaticAccounts+'px');
    for(const key of ['accounts','pinned','recent']){
      const property='--kg-'+key+'-height';
      if(sizes[key]!=null)root.style.setProperty(property,constrain(key,sizes[key])+'px');else root.style.removeProperty(property);
    }
    for(const handle of root.querySelectorAll('[data-kg-resize]')){
      const key=handle.dataset.kgResize,[min,max]=bounds(key),region=document.getElementById(key==='accounts'?'kg-list':'kg-notebooks-'+key);
      const value=key==='width'?constrain(key,sizes.width??.3)*100:region?.getBoundingClientRect().height||sizes[key]||min;
      handle.setAttribute('aria-valuemin',Math.round(key==='width'?min*100:min));handle.setAttribute('aria-valuemax',Math.round(key==='width'?max*100:max));handle.setAttribute('aria-valuenow',Math.round(value));
      handle.setAttribute('aria-valuetext',Math.round(value)+(key==='width'?'%':' px'));
    }
  }
  function endResize(cancel=false){
    if(!resize)return;const previous=resize;resize=null;
    if(cancel)sizes=previous.before;else saveSizes();
    document.body.classList.remove('kg-resizing-width','kg-resizing-height');applySizes();
    const root=$('#kaggle-content');if(root.hasPointerCapture?.(previous.id))root.releasePointerCapture(previous.id);
  }
  function moveResize(event){
    if(!resize||event.pointerId!==resize.id)return;
    sizes[resize.key]=constrain(resize.key,resize.value+(resize.key==='width'?(event.clientX-resize.x)/resize.width:event.clientY-resize.y));applySizes();
  }
  function setupResizing(root){
    root.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-kg-resize]');if(!handle||event.button!==0)return;
      const key=handle.dataset.kgResize,region=document.getElementById(key==='accounts'?'kg-list':'kg-notebooks-'+key);
      endResize();resize={key,id:event.pointerId,x:event.clientX,y:event.clientY,width:Math.max(1,$('#kg-layout').clientWidth-48),value:key==='width'?constrain(key,sizes.width??.3):region.getBoundingClientRect().height,before:{...sizes}};
      root.setPointerCapture?.(event.pointerId);document.body.classList.add(key==='width'?'kg-resizing-width':'kg-resizing-height');handle.focus({preventScroll:true});event.preventDefault();
    });
    root.addEventListener('pointermove',moveResize);
    root.addEventListener('pointerup',event=>{if(event.pointerId===resize?.id){moveResize(event);endResize();}});
    root.addEventListener('pointercancel',event=>{if(event.pointerId===resize?.id)endResize(true);});
    root.addEventListener('lostpointercapture',()=>endResize());
    root.addEventListener('dblclick',event=>{const key=event.target.closest('[data-kg-resize]')?.dataset.kgResize;if(key){delete sizes[key];saveSizes();applySizes();}});
    root.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&resize){endResize(true);event.preventDefault();return;}
      const handle=event.target.closest('[data-kg-resize]');if(!handle)return;
      const key=handle.dataset.kgResize,up=key==='width'?'ArrowRight':'ArrowDown',down=key==='width'?'ArrowLeft':'ArrowUp';
      if(![up,down,'Home','End','Enter'].includes(event.key))return;event.preventDefault();
      if(event.key==='Enter')delete sizes[key];
      else {const [min,max]=bounds(key),current=Number(handle.getAttribute('aria-valuenow'))/(key==='width'?100:1),step=(key==='width'?.02:20)*(event.shiftKey?5:1);sizes[key]=constrain(key,event.key==='Home'?min:event.key==='End'?max:current+(event.key===up?step:-step));}
      saveSizes();applySizes();
    });
    window.addEventListener('resize',applySizes);
    let lastPageTop=window.scrollY;
    window.addEventListener('scroll',()=>{
      const down=window.scrollY>lastPageTop;lastPageTop=window.scrollY;
      if(!down||resize||$('#kaggle-page').classList.contains('hidden'))return;
      const recent=$('#kg-notebooks-recent'),p=data?.accounts.find(p=>p.id===selected);
      if(!recent||p?.notebookList?.error||recent.scrollHeight>recent.clientHeight)return;
      const rect=recent.getBoundingClientRect();if(rect.bottom<=window.innerHeight+40&&rect.bottom>90)loadNext?.();
    },{passive:true});
  }
  function dialog(title,body,submit,label){hooks.showModal(title,literal(body),submit,label);}
  function render(next,defaultWorkspace) {
    data=next||{accounts:[],settings:{autoRefresh:true},tool:null,editing:false};workspace=defaultWorkspace||workspace;
    const unavailable=data.editing||!!data.storeError;
    const root=$('#kaggle-content'),active=document.activeElement;
    const focusId=root.contains(active)?active.id:null;
    const focusAccount=active?.dataset.kgAccount;
    const focusNotebook=root.contains(active)?['kgOpen','kgUnpin','kgPinRef'].find(key=>active.dataset[key]):null;
    const focusRef=focusNotebook?active.dataset[focusNotebook]:null;
    const focusResize=root.contains(active)?active?.dataset.kgResize:null;
    if(!root.dataset.ready){
      root.innerHTML='<div id="kg-heading" class="page-heading"></div><div id="kg-tool-hint"></div><div id="kg-toolbar" class="toolbar"><div class="search"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="kg-search" type="search"></div><div id="kg-refresh" class="toolbar-right"></div></div><div id="kg-empty"></div><div class="kg-layout" id="kg-layout"><div class="kg-account-pane"><div id="kg-list" class="kg-list"></div><div id="kg-accounts-grip"></div></div><div id="kg-column-grip"></div><aside id="kg-detail" class="kg-detail"></aside></div>';
      root.dataset.ready='1';setupResizing(root);$('#kg-search').oninput=event=>{query=event.target.value;render(data,workspace);};
    }
    $('#kg-heading').innerHTML=`<div><h1 tabindex="-1">Kaggle</h1><div class="list-heading"><h2>${data.accounts.length} ${t('tài khoản','accounts')}</h2></div></div><div class="heading-actions">${button('kg-help',t('Cách dùng','How to use'),'ghost')}${button('kg-setup',t('Thiết lập','Setup'),'secondary')}${button('kg-add',t('＋ Thêm tài khoản','＋ Add account'),'primary',data.editing)}</div>`;
    $('#kg-help').onclick=guide;$('#kg-setup').onclick=setup;$('#kg-add').onclick=()=>account();
    if(data.storeError){$('#kg-tool-hint').innerHTML=`<div class="banner danger">${e(window.padUI.error(data.storeError))} ${t('Mở Codex → Cài đặt → Khôi phục & dữ liệu để xem thư mục dữ liệu, rồi khởi động lại sau khi sửa.','Open Codex → Settings → Recovery & data to inspect storage, then restart after repairing it.')}</div>`;}
    else $('#kg-tool-hint').innerHTML=data.tool&&!data.tool.supported?`<div class="banner">${t('Mở Thiết lập để cài công cụ Kaggle.','Open Setup to install the Kaggle tools.')}</div>`:'';
    $('#kg-add').disabled=unavailable;$('#kg-setup').disabled=!!data.storeError;
    $('#kg-search').placeholder=t('Tìm tên hoặc username','Search name or username');$('#kg-search').setAttribute('aria-label',$('#kg-search').placeholder);
    $('#kg-toolbar').classList.toggle('hidden',!data.accounts.length);
    const any=data.accounts.some(p=>p.refreshing);
    $('#kg-refresh').innerHTML=button('kg-layout-reset',t('Bố cục mặc định','Reset layout'),'ghost')+button('kg-refresh-all',`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/></svg><span>${any?t('Đang cập nhật…','Refreshing…'):t('Làm mới','Refresh')}</span>`,'ghost refresh-button',any||unavailable);
    $('#kg-layout-reset').onclick=()=>{endResize(true);sizes={};saveSizes();applySizes();};
    $('#kg-refresh-all').onclick=()=>act('kaggleRefreshAll',{},t('Đã làm mới.','Refreshed.'));
    const rows=data.accounts.filter(p=>(p.label+' '+p.username).toLowerCase().includes(query.toLowerCase()));
    if(!rows.some(p=>p.id===selected))selected=rows[0]?.id;
    $('#kg-layout').classList.toggle('hidden',!rows.length);
    $('#kg-column-grip').innerHTML=grip('width',t('Đổi chiều rộng cột tài khoản · phím trái/phải; Enter để đặt lại','Resize account column · left/right arrows; Enter to reset'),true);
    $('#kg-accounts-grip').innerHTML=grip('accounts',t('Đổi chiều cao danh sách tài khoản · phím lên/xuống; Enter để đặt lại','Resize account list · up/down arrows; Enter to reset'));
    $('#kg-empty').innerHTML=!data.accounts.length?`<div class="empty kg-empty"><div class="service-mark kaggle">k</div><h2>${t('Thêm tài khoản Kaggle đầu tiên','Add your first Kaggle account')}</h2><p>${t('Thêm API token một lần, dùng tài khoản khi cần.','Add an API token once, then use the account whenever you need it.')}</p>${button('kg-empty-add',t('Thêm tài khoản','Add account'),'primary',data.editing)}</div>`:!rows.length?`<div class="no-results">${t('Không tìm thấy tài khoản.','No matching accounts.')}</div>`:'';
    $('#kg-empty-add')?.addEventListener('click',()=>account());
    if($('#kg-empty-add'))$('#kg-empty-add').disabled=unavailable;
    $('#kg-list').setAttribute('aria-label',t('Tài khoản Kaggle đã lưu','Saved Kaggle accounts'));
    $('#kg-list').innerHTML=rows.map(p=>{
      const running=(p.notebooks||[]).filter(n=>n.status==='running').length,queued=(p.notebooks||[]).filter(n=>n.status==='queued').length;
      const older=stale(p.notebooksAt)||!!p.lastError||!!p.notebooksError,quotaOld=stale(p.quotaAt)||!!p.lastError||!!p.quotaError;
      const counts=[running?t(`${running} đang chạy`,`${running} running`):'',queued?t(`${queued} đang chờ`,`${queued} queued`):''].filter(Boolean).join(' · ');
      const hint=p.refreshing?t('Đang cập nhật…','Refreshing…'):p.status==='reauth'?t('Cần token mới','New token needed'):p.lastError||p.notebooksError||p.quotaError?t('Lỗi cập nhật','Refresh error'):!p.notebooksAt?t('Chưa cập nhật','Not refreshed'):older||quotaOld?t('Dữ liệu cũ','Older data'):counts;
      return `<button type="button" class="kg-account ${selected===p.id?'selected':''}" data-kg-account="${e(p.id)}" aria-pressed="${selected===p.id}"><span class="kg-account-top"><span class="kg-account-name"><strong>${e(p.label)}</strong>${p.label!==p.username?`<small>@${e(p.username)}</small>`:''}</span><svg class="icon kg-account-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></span><span class="kg-account-quota ${quotaOld?'kg-stale':''}" title="${e(date(p.quotaAt))}${quotaOld?' · '+t('Dữ liệu cũ','Older data'):''}">${['GPU','TPU'].map(resource=>`<span aria-label="${resource} ${t('còn lại','remaining')}"><span>${resource}</span><b>${hours(p.quota?.find(q=>q.resource===resource)?.remaining)}</b></span>`).join('')}</span>${hint?`<span class="kg-account-hint ${older||quotaOld||p.status==='reauth'?'kg-stale':running||queued?'kg-fresh':''}">${e(hint)}</span>`:''}</button>`;
    }).join('');
    document.querySelectorAll('[data-kg-account]').forEach(el=>el.onclick=()=>{selected=el.dataset.kgAccount;render(data,workspace);});
    detail(rows.find(p=>p.id===selected));applySizes();
    window.requestAnimationFrame?.(applySizes);
    if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
    else if(focusAccount)root.querySelector(`[data-kg-account="${focusAccount}"]`)?.focus({preventScroll:true});
    else if(focusRef){const attribute={kgOpen:'data-kg-open',kgUnpin:'data-kg-unpin',kgPinRef:'data-kg-pin-ref'}[focusNotebook];root.querySelector(`[${attribute}="${focusRef}"]`)?.focus({preventScroll:true});}
    else if(focusResize)root.querySelector(`[data-kg-resize="${focusResize}"]`)?.focus({preventScroll:true});
  }
  function detail(p){
    loadNext=null;
    const box=$('#kg-detail');if(!p){box.innerHTML='';delete box.dataset.account;return;}
    const opened=box.dataset.account===p.id?new Set([...box.querySelectorAll('details[open]')].map(el=>el.id)):new Set();
    const scroll=box.dataset.account===p.id?new Map([...box.querySelectorAll('[data-kg-scroll]')].map(el=>[el.id,el.scrollTop])):new Map();
    box.dataset.account=p.id;box.setAttribute('aria-label',t('Chi tiết tài khoản Kaggle','Kaggle account details'));
    const disabled=data.editing||!!data.storeError||p.refreshing,quotaStale=stale(p.quotaAt)||!!p.lastError||!!p.quotaError,notebookStale=stale(p.notebooksAt)||!!p.lastError||!!p.notebooksError;
    const resources=['GPU','TPU'];
    const quotas=resources.map(resource=>{
      const q=p.quota?.find(q=>q.resource===resource),percent=q?.total>0&&Number.isFinite(q.remaining)?Math.max(0,Math.min(100,q.remaining/q.total*100)):0;
      return `<div class="kg-quota"><div class="kg-quota-top"><strong>${resource}</strong><span>${t('Còn lại','Remaining')}</span></div><b>${hours(q?.remaining)}</b><span class="kg-quota-total"> / ${hours(q?.total)}</span><progress max="100" value="${percent}" aria-label="${resource}: ${hours(q?.remaining)}"></progress></div>`;
    }).join('');
    const notebookRows=p.notebooks||[];
    const listing=p.notebookList||{hasMore:false,loading:false,error:null};
    const more=listing.loading?`<div class="kg-page-note" role="status">${t('Đang tải thêm…','Loading more…')}</div>`:listing.error?`<div class="kg-page-error" role="status"><span>${e(window.padUI.t(listing.error))}</span>${button('kg-load-more',t('Thử lại','Retry'),'ghost',disabled)}</div>`:listing.hasMore?`<div class="kg-page-note">${button('kg-load-more',t('Tải thêm','Load more'),'ghost',disabled)}</div>`:'';
    const watched=new Set(p.watch),pinned=p.watch.map(ref=>notebookRows.find(n=>n.ref===ref)||{ref,title:ref,status:'unknown'}),recent=notebookRows.filter(n=>!watched.has(n.ref));
    const group=(id,label,rows,isPinned,empty)=>{
      const content=rows.map(n=>{
        const older=notebookStale||stale(n.readAt||p.notebooksAt)||!!n.error;
        const stamp=n.readAt||p.notebooksAt;
        return `<div class="kg-notebook"><div class="kg-notebook-main"><button class="text-button kg-notebook-link" data-kg-open="${e(n.ref)}" title="${e(n.ref)}">${e(n.title||n.ref)} ↗</button><small>${e(n.ref)}${n.accelerator?' · '+e(n.accelerator):''}</small>${n.error?`<small class="danger-text">${e(window.padUI.t(n.error))}</small>`:''}</div><span class="kg-run-status ${older?'unknown':Object.hasOwn(names,n.status)?n.status:'unknown'}" title="${e(date(stamp))}${older?' · '+t('Dữ liệu cũ','Older data'):''}">${e(status(n.status))}</span><button class="icon-button kg-notebook-toggle" ${isPinned?'data-kg-unpin':'data-kg-pin-ref'}="${e(n.ref)}" aria-label="${isPinned?t('Bỏ ghim','Unpin'):t('Ghim','Pin')} ${e(n.ref)}" title="${isPinned?t('Bỏ ghim','Unpin'):t('Ghim','Pin')}" ${disabled||(!isPinned&&p.watch.length>=20)?'disabled':''}>${isPinned?'×':'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-4 1-4 5-3 1-1-3 5-4 2-5ZM10 14l-7 7"/></svg>'}</button></div>`;
      }).join('');
      return `<section class="kg-notebook-group" aria-labelledby="${id}-title"><div class="kg-section-title kg-notebook-heading"><h3 id="${id}-title">${label}<span class="kg-notebook-count">${rows.length}</span></h3>${isPinned?button('kg-pin',t('＋ Ghim notebook','＋ Pin notebook'),'ghost',disabled||p.watch.length>=20):''}</div><div id="${id}" class="kg-notebooks" data-kg-scroll tabindex="0" role="region" aria-labelledby="${id}-title" ${!isPinned?`aria-busy="${!!listing.loading}"`:''}>${content||`<div class="kg-no-runs">${empty}</div>`}${isPinned?'':more}</div>${grip(isPinned?'pinned':'recent',isPinned?t('Đổi chiều cao Đã ghim · phím lên/xuống; Enter để đặt lại','Resize Pinned · up/down arrows; Enter to reset'):t('Đổi chiều cao Gần đây · phím lên/xuống; Enter để đặt lại','Resize Recent · up/down arrows; Enter to reset'))}</section>`;
    };
    box.innerHTML=`
      <div class="kg-detail-heading"><div class="avatar">${e(p.username.slice(0,2).toUpperCase())}</div><div class="kg-detail-identity"><h2>${e(p.label)}</h2><span>@${e(p.username)}</span></div><span class="badge">Kaggle</span></div>
      <div id="kg-detail-body" class="kg-detail-body">
        ${p.lastError?`<div class="banner danger">${e(window.padUI.t(p.lastError))}</div>`:''}
        <div class="kg-section-title"><h3>${t('Quota còn lại','Remaining quota')}</h3><span class="kg-update ${quotaStale?'kg-stale':''}">${e(date(p.quotaAt))}${p.quotaAt&&quotaStale?' · '+t('Dữ liệu cũ','Older data'):''}</span></div>
        <div class="kg-quota-grid">${quotas}</div>
        ${p.quotaError?`<p class="kg-inline-error">${e(window.padUI.t(p.quotaError))}</p>`:''}
        <details class="kg-quota-info" id="kg-quota-info" ${opened.has('kg-quota-info')?'open':''}><summary>${t('Chi tiết quota','Quota details')}</summary><p>${t('Giờ còn lại bao gồm phần giữ chỗ.','Remaining time includes reserved time.')}</p>${resources.map(resource=>{const q=p.quota?.find(q=>q.resource===resource);return `<p><strong>${resource}</strong> · ${t('Giữ chỗ','Reserved')}: ${hours(q?.reserved)}${q?.refreshAt?' · '+t('Đặt lại','Resets')+' '+e(date(q.refreshAt)):''}</p>`;}).join('')}</details>
        <div class="kg-use"><div class="kg-actions">${button('kg-terminal-copy',t('Sao chép lệnh','Copy command'),'primary',disabled)}${button('kg-launch',t('Mở terminal mới','Open new terminal'),'secondary',disabled)}</div><div class="kg-terminal-hint"><code>padkaggle use ${e(p.username)}</code>${button('kg-terminal-setup',t('Lệnh padkaggle','padkaggle command'),'ghost',!!data.storeError)}</div></div>
        ${notebookStale&&!p.notebooksError?`<p class="kg-inline-error">${p.notebooksAt?t('Notebook chưa được làm mới.','Notebook data needs refreshing.'):t('Làm mới để xem notebook.','Refresh to view notebooks.')}</p>`:''}
        ${p.notebooksError?`<p class="kg-inline-error">${e(window.padUI.t(p.notebooksError))}</p>`:''}
        ${group('kg-notebooks-pinned',t('Đã ghim','Pinned'),pinned,true,t('Chưa ghim notebook.','No pinned notebooks.'))}
        ${group('kg-notebooks-recent',t('Gần đây','Recent'),recent,false,t('Chưa có notebook.','No notebooks yet.'))}
        <details class="kg-management" id="kg-management" ${opened.has('kg-management')?'open':''}><summary>${t('Tùy chọn tài khoản','Account options')}</summary><div class="kg-workspace"><span>${t('Thư mục mở terminal mới','New terminal folder')}</span><code>${e(p.workspace)}</code></div><div class="kg-manage">${button('kg-edit',t('Sửa tên / thư mục','Edit name / folder'),'ghost',disabled)}${button('kg-token',t('Cập nhật token','Update token'),'ghost',disabled)}${button('kg-refresh-one',p.refreshing?t('Đang cập nhật…','Refreshing…'):t('Làm mới tài khoản','Refresh account'),'ghost',disabled)}${button('kg-remove',t('Xóa tài khoản','Remove account'),'ghost danger-text',disabled)}</div></details>
      </div>`;
    $('#kg-terminal-copy').onclick=()=>act('kaggleTerminalCopy',{id:p.id},t('Đã sao chép. Dán lệnh vào terminal Bash/Zsh đang mở.','Copied. Paste the command in your existing Bash/Zsh terminal.'));
    $('#kg-terminal-setup').onclick=terminalSetup;
    $('#kg-launch').onclick=()=>act('kaggleLaunch',{id:p.id},t('Đã mở Bash/Zsh riêng cho @','Opened a separate Bash/Zsh for @')+p.username+'.');
    $('#kg-refresh-one').onclick=()=>act('kaggleRefresh',{id:p.id});$('#kg-edit').onclick=()=>account(p,true);$('#kg-token').onclick=()=>account(p);$('#kg-pin').onclick=()=>pin(p);
    $('#kg-remove').onclick=()=>dialog(t('Xóa tài khoản Kaggle?','Remove Kaggle account?'),`<p>${t('Xóa token đã lưu của','Remove the saved token for')} <strong>@${e(p.username)}</strong>.</p><p>${t('Terminal đã mở vẫn giữ token trong phiên đó. Đóng các terminal đó và thu hồi token trên Kaggle nếu muốn ngắt truy cập hoàn toàn.','Open terminals retain their token for that session. Close those terminals and revoke the token on Kaggle to remove access completely.')}</p>`,async()=>{const r=await act('kaggleRemove',{id:p.id});if(r)hooks.closeModal();},t('Xóa token đã lưu','Remove saved token'));
    box.querySelectorAll('[data-kg-open]').forEach(el=>el.onclick=()=>act('kaggleOpen',{ref:el.dataset.kgOpen}));
    box.querySelectorAll('[data-kg-unpin]').forEach(el=>el.onclick=async()=>{const r=await act('kaggleWatch',{id:p.id,ref:el.dataset.kgUnpin,remove:true});if(r)await act('kaggleRefresh',{id:p.id});});
    box.querySelectorAll('[data-kg-pin-ref]').forEach(el=>el.onclick=async()=>{const r=await act('kaggleWatch',{id:p.id,ref:el.dataset.kgPinRef});if(r)await act('kaggleRefresh',{id:p.id});});
    for(const [id,top] of scroll){const region=document.getElementById(id);if(region)region.scrollTop=top;}
    const loadMore=async()=>{
      if(disabled||!listing.hasMore||listing.loading||loadingPages.has(p.id))return;
      loadingPages.add(p.id);try{await act('kaggleNotebooksMore',{id:p.id});}finally{loadingPages.delete(p.id);}
    };
    loadNext=loadMore;
    $('#kg-load-more')?.addEventListener('click',loadMore);
    const recentBox=$('#kg-notebooks-recent');
    for(const region of [recentBox]){
      let previous=region.scrollTop;
      region.addEventListener('scroll',()=>{
        const down=region.scrollTop>previous;previous=region.scrollTop;
        if(!down||listing.error||region.scrollHeight-region.clientHeight-region.scrollTop>40)return;
        loadMore();
      },{passive:true});
    }
  }
  async function account(p=null,edit=false){
    if(accountBusy||toolsBusy||$('#modal').open)return;
    if(!edit){accountBusy=true;let r;try{r=await act('kaggleTools');}finally{accountBusy=false;}if(!r||$('#modal').open)return;if(!r.result.supported){setup(false);return;}}
    dialog(edit?t('Sửa tài khoản Kaggle','Edit Kaggle account'):p?t('Cập nhật API token','Update API token'):t('Thêm tài khoản Kaggle','Add Kaggle account'),`${!edit?`<p>${t('Tạo API token tại Kaggle → Settings → API, rồi dán vào dưới đây.','Create an API token in Kaggle → Settings → API, then paste it below.')}</p>${button('kg-token-settings',t('Lấy API token ↗','Get API token ↗'),'ghost')}<label for="kg-token-input">API token${p?' · @'+e(p.username):''}</label><input id="kg-token-input" type="password" required autocomplete="off" spellcheck="false" maxlength="8192"><p class="field-help">${t('Dùng token mới, không phải mật khẩu tài khoản.','Use a new API token, not your account password.')}</p>`:''}<label for="kg-label">${t('Tên dễ nhớ (tùy chọn)','Display name (optional)')}</label><input type="text" id="kg-label" maxlength="80" value="${e(p?.label||'')}" placeholder="${t('Ví dụ: Nhóm nghiên cứu','e.g. Research team')}"><details class="kg-dialog-details" ${edit?'open':''}><summary>${t('Thư mục terminal mới','New terminal folder')}</summary><div class="path-field"><input type="text" id="kg-folder" aria-label="${t('Thư mục terminal mới','New terminal folder')}" required readonly value="${e(p?.workspace||workspace)}">${button('kg-pick-folder',t('Chọn','Choose'))}</div></details>`,async()=>{
      const tokenInput=$('#kg-token-input'),args={id:p?.id||null,label:$('#kg-label').value,workspace:$('#kg-folder').value};
      if(tokenInput){args.token=tokenInput.value;tokenInput.value='';}
      const r=await act(edit?'kaggleEdit':'kaggleAdd',args,t('Đã lưu tài khoản Kaggle.','Kaggle account saved.'));delete args.token;
      if(r){selected=p?.id||r.result;hooks.closeModal();render(data,workspace);if(!edit)await act('kaggleRefresh',{id:selected});}
    },edit?t('Lưu thay đổi','Save changes'):t('Xác minh & lưu','Verify & save'));
    $('#kg-token-settings')?.addEventListener('click',()=>act('kaggleOpen',{kind:'settings'}));
    $('#kg-pick-folder').onclick=async()=>{const r=await act('pick',{kind:'kaggleWorkspace'});if(r?.result)$('#kg-folder').value=r.result;};
  }
  function pin(p){dialog(t('Ghim notebook','Pin notebook'),`<p>${t('Dán đường dẫn notebook để theo dõi ở mục Đã ghim.','Paste a notebook link to keep it in Pinned.')}</p><label for="kg-ref">${t('Đường dẫn notebook','Notebook link')}</label><input type="text" id="kg-ref" required maxlength="300" placeholder="https://www.kaggle.com/code/username/notebook-slug"><p class="field-help">${t('Tối đa 20 notebook mà tài khoản này có quyền xem.','Up to 20 notebooks this account can access.')}</p>`,async()=>{const r=await act('kaggleWatch',{id:p.id,ref:$('#kg-ref').value});if(r){hooks.closeModal();await act('kaggleRefresh',{id:p.id});}},t('Ghim','Pin'));}
  async function terminalSetup(){
    if(toolsBusy||accountBusy||$('#modal').open)return;
    toolsBusy=true;let r;try{r=await act('kaggleTerminalStatus');}finally{toolsBusy=false;}
    if(!r||$('#modal').open)return;const terminal=r.result;
    dialog(t('Lệnh padkaggle','padkaggle command'),`<div class="kg-tool-state ${terminal.configured?'ready':''}"><strong>${terminal.configured?t('Đã bật lệnh padkaggle','padkaggle is enabled'):t('Bật lệnh cho terminal mới','Enable for new terminals')}</strong></div><p>${t('Bật một lần, sau đó chọn tài khoản từ Bash/Zsh ở bất kỳ thư mục nào, kể cả trong VS Code.','Enable once, then select an account from Bash/Zsh in any folder, including VS Code.')}</p><div class="kg-command-list"><p><code>padkaggle list</code><span>${t('Xem tài khoản đã lưu','List saved accounts')}</span></p><p><code>padkaggle use username</code><span>${t('Chọn tài khoản','Select an account')}</span></p><p><code>padkaggle off</code><span>${t('Bỏ chọn trong terminal này','Clear this terminal’s selection')}</span></p></div><p class="field-help">${t('Terminal đang mở: bấm Sao chép lệnh ở tài khoản rồi dán vào Bash/Zsh.','For an open terminal, click Copy command on an account and paste into Bash/Zsh.')}</p><details class="kg-dialog-details"><summary>${t('Tùy chọn nâng cao','Advanced options')}</summary><p>${t('Mỗi terminal chọn tài khoản riêng. Dùng padkaggle status để xem lựa chọn; có thể chọn bằng tên dễ nhớ trong dấu nháy nếu tên không trùng.','Each terminal has its own account. Use padkaggle status to check its selection; a unique display name can also be used in quotes.')}</p><p>${t('PADSwitcher thêm lệnh vào profile Bash/Zsh của bạn:','PADSwitcher adds the command to your Bash/Zsh profiles:')}</p>${terminal.profiles.map(p=>`<p><code>${e(p.path)}</code></p>`).join('')}${terminal.profiles.some(p=>p.configured)?button('kg-terminal-disable',t('Gỡ lệnh padkaggle','Remove padkaggle'),'ghost'):''}</details>`,async()=>{
      if(!terminal.configured){const saved=await act('kaggleTerminalConfigure',{enabled:true},t('Đã bật padkaggle cho terminal Bash/Zsh mới.','padkaggle enabled for new Bash/Zsh terminals.'));if(!saved)return;}
      hooks.closeModal();
    },terminal.configured?t('Đóng','Close'):t('Bật lệnh padkaggle','Enable padkaggle'));
    $('#kg-terminal-disable')?.addEventListener('click',async()=>{const removed=await act('kaggleTerminalConfigure',{enabled:false},t('Đã gỡ khỏi profile. Terminal đang mở vẫn giữ lựa chọn cho tới khi dùng padkaggle off hoặc đóng.','Removed from profiles. Existing terminals keep their selection until padkaggle off or exit.'));if(removed)hooks.closeModal();});
  }
  async function setup(check=true){
    if(toolsBusy||accountBusy||$('#modal').open)return;toolsBusy=true;try{if(check)await act('kaggleTools');}finally{toolsBusy=false;}
    if($('#modal').open)return;
    const tool=data.tool;
    const install=`<div class="kg-actions">${button('kg-python-web',t('Tải Python ↗','Download Python ↗'),'ghost')}${button('kg-copy-setup',t('Sao chép lệnh cài','Copy install command'))}</div>`;
    dialog(t('Thiết lập Kaggle','Kaggle setup'),`<div class="kg-tool-state ${tool?.supported?'ready':''}"><strong>${tool?.supported?t('Công cụ sẵn sàng','Tools ready'):t('Cần cài công cụ Kaggle','Install the Kaggle tools')}</strong></div>${!tool?.supported?`<ol class="kg-setup-steps"><li>${t('Cài Python nếu máy chưa có.','Install Python if it is missing.')}</li><li>${t('Sao chép lệnh cài, chạy trong Bash/Zsh, rồi bấm Lưu & kiểm tra.','Copy the install command, run it in Bash/Zsh, then Save & check.')}</li></ol>${install}`:''}<div class="kg-setup-terminal"><strong>${t('Chọn tài khoản từ terminal','Select from your terminal')}</strong><p>${t('Bật padkaggle một lần để chọn tài khoản ngay trong terminal VS Code.','Enable padkaggle once to select accounts in the VS Code terminal.')}</p>${button('kg-tools-terminal',t('Thiết lập padkaggle','Set up padkaggle'),'secondary')}</div><label class="check-label"><input id="kg-auto-refresh" type="checkbox" ${data.settings.autoRefresh?'checked':''}> ${t('Tự làm mới mỗi 2 phút','Refresh every 2 minutes')}</label><details class="kg-dialog-details"><summary>${t('Python & công cụ','Python & tools')}</summary><p class="field-help">Python ${e(tool?.python||'—')} · kaggle ${e(tool?.kaggle||'—')} · kagglesdk ${e(tool?.kagglesdk||'—')}</p><p class="field-help">${t('Yêu cầu: Python 3.11+, kaggle 2.2.4+ và kagglesdk 0.1.37+.','Requires Python 3.11+, kaggle 2.2.4+ and kagglesdk 0.1.37+.')}</p><label for="kg-python">${t('Python dùng cho Kaggle','Python for Kaggle')}</label><div class="path-field"><input type="text" id="kg-python" readonly value="${e(data.settings.pythonPath||'')}" placeholder="${t('Tự tìm Python','Detect Python automatically')}">${button('kg-pick-python',t('Chọn','Choose'))}</div>${button('kg-auto-python',t('Dùng Python tự tìm','Use detected Python'),'ghost')}<p class="field-help">${tool?.executable?e(tool.executable):t('Có thể chọn python3 trong venv.','You can select python3 in a venv.')}</p>${tool?.supported?install:''}</details>`,async()=>{const r=await act('kaggleSettings',{pythonPath:$('#kg-python').value,autoRefresh:$('#kg-auto-refresh').checked});if(r){hooks.closeModal();await setup();}},t('Lưu & kiểm tra','Save & check'));
    $('#kg-pick-python').onclick=async()=>{const r=await act('pick',{kind:'kagglePython'});if(r?.result)$('#kg-python').value=r.result;};
    $('#kg-tools-terminal').onclick=()=>{hooks.closeModal();terminalSetup();};
    $('#kg-auto-python').onclick=()=>{$('#kg-python').value='';};
    $('#kg-python-web').onclick=()=>act('kaggleOpen',{kind:'python'});
    $('#kg-copy-setup').onclick=async()=>{const r=await act('kaggleSettings',{pythonPath:$('#kg-python').value,autoRefresh:$('#kg-auto-refresh').checked});if(r)await act('kaggleSetupCopy',{},t('Đã sao chép lệnh cài. Chạy trong Bash/Zsh, rồi Lưu & kiểm tra.','Install command copied. Run it in Bash/Zsh, then Save & check.'));};
  }
  function instructions(){
    return `<div class="kg-help"><ol class="kg-instructions"><li><strong>${t('Thêm tài khoản một lần','Add accounts once')}</strong><p>${t('Lấy API token tại Kaggle → Settings → API, rồi bấm Thêm tài khoản.','Get an API token in Kaggle → Settings → API, then click Add account.')}</p></li><li><strong>${t('Chọn tài khoản trong terminal','Select from your terminal')}</strong><p>${t('Chọn tài khoản bên trái → Sao chép lệnh → dán vào Bash/Zsh, kể cả terminal VS Code.','Select an account on the left → Copy command → paste into Bash/Zsh, including the VS Code terminal.')}</p><p>${t('Muốn gõ lệnh ngắn? Bật padkaggle trong Thiết lập một lần, rồi dùng:','Want a short command? Enable padkaggle in Setup once, then use:')}</p><pre class="kg-shell-help">padkaggle use username</pre></li><li><strong>${t('Chạy và theo dõi','Run and monitor')}</strong><p>${t('Gửi notebook bằng Kaggle CLI. Quay lại đây xem giờ GPU/TPU còn lại và trạng thái notebook. Mỗi terminal có thể dùng một tài khoản khác nhau.','Submit a notebook with the Kaggle CLI. Return here to view remaining GPU/TPU hours and notebook status. Each terminal can use a different account.')}</p></li></ol><p class="kg-help-note">${t('GPU Kaggle dùng cho notebook chạy trên Kaggle. Lệnh python chạy trực tiếp trong terminal vẫn dùng máy của bạn.','Kaggle GPUs run notebooks on Kaggle. Running python directly in a terminal uses your own machine.')}</p><details class="kg-dialog-details"><summary>${t('Gửi notebook từ máy','Submit a notebook from your computer')}</summary><p>${t('Trong thư mục dự án, tạo cấu hình notebook:','In your project folder, create the notebook configuration:')}</p><pre class="kg-shell-help">kaggle kernels init -p ./job</pre><p>${t('Sửa job/kernel-metadata.json: id là username/notebook-slug, code_file trỏ đến code, thêm nguồn dữ liệu và đặt enable_gpu: true nếu cần GPU.','Edit job/kernel-metadata.json: set id to username/notebook-slug, code_file to your code, add data sources and set enable_gpu: true if you need a GPU.')}</p><pre class="kg-shell-help">kaggle kernels push -p ./job\nkaggle kernels status username/notebook-slug\nkaggle kernels output username/notebook-slug -p ./results</pre><p>${t('Để chạy song song, dùng tài khoản khác trong terminal khác và gửi notebook có id của tài khoản đó. Tuân thủ giới hạn Kaggle.','To run jobs in parallel, select another account in another terminal and submit a notebook with that account’s id. Follow Kaggle’s limits.')}</p></details><details class="kg-dialog-details"><summary>${t('Theo dõi & quản lý','Monitoring & management')}</summary><ul><li>${t('Đã ghim giữ các notebook bạn chọn, tối đa 20 mục. Gần đây tải thêm 12 notebook mỗi lần cuộn xuống cuối; số bên cạnh là số mục đã tải.','Pinned keeps the notebooks you choose, up to 20. Recent loads 12 more notebooks when you scroll to the end; the count shows loaded items.')}</li><li>${t('Trạng thái là lượt chạy mới nhất đã đọc, có thể chưa bao gồm phiên tương tác trên web. Làm mới cập nhật quota, mục ghim và trang đầu; trang tải thêm giữ dữ liệu lúc tải. Rê chuột lên trạng thái để xem thời điểm cập nhật.','Status shows the latest run read and may omit interactive web sessions. Refresh updates quota, pins and the first page; extra pages keep their data from loading time. Hover a status to see when it was read.')}</li><li>${t('Giờ còn lại bao gồm phần giữ chỗ; Kaggle quyết định việc cấp GPU. Dấu — nghĩa là chưa có dữ liệu.','Remaining hours include reserved time; Kaggle determines GPU availability. — means no data yet.')}</li><li>${t('Kéo vạch giữa hai cột hoặc dưới danh sách để đổi kích thước. Bố cục mặc định đặt lại kích thước.','Drag between columns or below a list to resize. Reset layout restores automatic sizing.')}</li><li>${t('Tên, thư mục và token nằm trong Tùy chọn tài khoản. Token được mã hóa trên máy. Đóng PADSwitcher không dừng notebook; terminal đã mở giữ token cho đến khi đóng.','Name, folder and token controls are in Account options. Tokens are encrypted on this computer. Closing PADSwitcher does not stop notebooks; open terminals keep their token until closed.')}</li></ul></details></div>`;
  }
  function guide(){
    dialog(t('Cách dùng Kaggle','How to use Kaggle'),instructions()+button('kg-docs',t('Tài liệu Kaggle CLI ↗','Kaggle CLI documentation ↗'),'ghost'),async()=>hooks.closeModal(),t('Đóng','Close'));
    $('#kg-docs').onclick=()=>act('kaggleOpen',{kind:'docs'});
  }
  return {init(value){hooks=value;},render,layout:applySizes,instructions};
})();
