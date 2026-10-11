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
  function dialog(title,body,submit,label){hooks.showModal(title,literal(body),submit,label);}
  function render(next,defaultWorkspace) {
    data=next||{accounts:[],settings:{autoRefresh:true},tool:null,editing:false};workspace=defaultWorkspace||workspace;
    const unavailable=data.editing||!!data.storeError;
    const root=$('#kaggle-content'),active=document.activeElement;
    const focusId=root.contains(active)?active.id:null;
    const focusAccount=active?.dataset.kgAccount;
    const focusNotebook=root.contains(active)?['kgOpen','kgUnpin','kgPinRef'].find(key=>active.dataset[key]):null;
    const focusRef=focusNotebook?active.dataset[focusNotebook]:null;
    if(!root.dataset.ready){
      root.innerHTML='<div id="kg-heading" class="page-heading"></div><div id="kg-tool-hint"></div><div id="kg-toolbar" class="toolbar"><div class="search"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="kg-search" type="search"></div><div id="kg-refresh" class="toolbar-right"></div></div><div id="kg-empty"></div><div class="kg-layout" id="kg-layout"><div id="kg-list" class="kg-list"></div><aside id="kg-detail" class="kg-detail"></aside></div><div id="kg-guide"></div>';
      root.dataset.ready='1';$('#kg-search').oninput=event=>{query=event.target.value;render(data,workspace);};
    }
    $('#kg-heading').innerHTML=`<div><h1 tabindex="-1">Kaggle</h1><div class="list-heading"><h2>${data.accounts.length} ${t('tài khoản','accounts')}</h2></div></div><div class="heading-actions">${button('kg-setup',t('Thiết lập','Setup'),'secondary')}${button('kg-add',t('＋ Thêm tài khoản','＋ Add account'),'primary',data.editing)}</div>`;
    $('#kg-setup').onclick=setup;$('#kg-add').onclick=()=>account();
    if(data.storeError){$('#kg-tool-hint').innerHTML=`<div class="banner danger">${e(window.padUI.error(data.storeError))} ${t('Mở Codex → Cài đặt → Khôi phục & dữ liệu để xem thư mục dữ liệu, rồi khởi động lại sau khi sửa.','Open Codex → Settings → Recovery & data to inspect storage, then restart after repairing it.')}</div>`;}
    else $('#kg-tool-hint').innerHTML=data.tool&&!data.tool.supported?`<div class="banner">${t('Cần thiết lập Python và Kaggle CLI. Bấm Thiết lập để kiểm tra và cài công cụ.','Set up Python and Kaggle CLI. Open Setup to check and install the tools.')}</div>`:'';
    $('#kg-add').disabled=unavailable;$('#kg-setup').disabled=!!data.storeError;
    $('#kg-search').placeholder=t('Tìm tên hoặc username','Search name or username');$('#kg-search').setAttribute('aria-label',$('#kg-search').placeholder);
    $('#kg-toolbar').classList.toggle('hidden',!data.accounts.length);
    const any=data.accounts.some(p=>p.refreshing);
    $('#kg-refresh').innerHTML=button('kg-refresh-all',`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/></svg><span>${any?t('Đang cập nhật…','Refreshing…'):t('Làm mới','Refresh')}</span>`,'ghost refresh-button',any||unavailable);
    $('#kg-refresh-all').onclick=()=>act('kaggleRefreshAll',{},t('Đã cập nhật các tài khoản. Xem chi tiết nếu có lỗi.','Accounts refreshed. Check details for any errors.'));
    const rows=data.accounts.filter(p=>(p.label+' '+p.username).toLowerCase().includes(query.toLowerCase()));
    if(!rows.some(p=>p.id===selected))selected=rows[0]?.id;
    $('#kg-layout').classList.toggle('hidden',!rows.length);
    $('#kg-empty').innerHTML=!data.accounts.length?`<div class="empty kg-empty"><div class="service-mark kaggle">k</div><h2>${t('Thêm tài khoản Kaggle đầu tiên','Add your first Kaggle account')}</h2><p>${t('Lưu API token một lần, chọn tài khoản từ terminal khi cần.','Save an API token once, then select an account from your terminal.')}</p>${button('kg-empty-add',t('Thêm tài khoản','Add account'),'primary',data.editing)}<small>${t('Token được mã hóa bằng tài khoản Windows của bạn.','Tokens are encrypted for your Windows user.')}</small></div>`:!rows.length?`<div class="no-results">${t('Không tìm thấy tài khoản.','No matching accounts.')}</div>`:'';
    $('#kg-empty-add')?.addEventListener('click',()=>account());
    if($('#kg-empty-add'))$('#kg-empty-add').disabled=unavailable;
    $('#kg-list').setAttribute('aria-label',t('Tài khoản Kaggle đã lưu','Saved Kaggle accounts'));
    $('#kg-list').innerHTML=rows.map(p=>{
      const active=(p.notebooks||[]).filter(n=>['running','queued'].includes(n.status)).length,older=stale(p.notebooksAt)||!!p.lastError||!!p.notebooksError;
      const hint=p.refreshing?t('Đang cập nhật…','Refreshing…'):p.status==='reauth'?t('Cần token mới','New token needed'):p.lastError?t('Lỗi cập nhật','Refresh error'):!p.notebooksAt?t('Chưa cập nhật','Not refreshed'):older?t('Dữ liệu cũ','Older data'):active?t(`${active} đang chạy / chờ`,`${active} running / queued`):t('Chưa có lượt chạy / chờ','No running / queued runs found');
      return `<button class="kg-account ${selected===p.id?'selected':''}" data-kg-account="${e(p.id)}" aria-pressed="${selected===p.id}"><span class="kg-account-top"><span class="avatar">${e(p.username.slice(0,2).toUpperCase())}</span><span class="kg-account-name"><strong>${e(p.label)}</strong><small>@${e(p.username)}</small></span></span><span class="kg-account-quota">${['GPU','TPU'].map(resource=>`<span><span>${resource}</span><b>${hours(p.quota?.find(q=>q.resource===resource)?.remaining)}</b></span>`).join('')}</span><span class="kg-account-hint ${older?'kg-stale':active?'kg-fresh':''}">${!older&&active?'<span class="status-dot ready"></span>':''}${e(hint)}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-kg-account]').forEach(el=>el.onclick=()=>{selected=el.dataset.kgAccount;render(data,workspace);});
    detail(rows.find(p=>p.id===selected));guide();
    if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
    else if(focusAccount)root.querySelector(`[data-kg-account="${focusAccount}"]`)?.focus({preventScroll:true});
    else if(focusRef){const attribute={kgOpen:'data-kg-open',kgUnpin:'data-kg-unpin',kgPinRef:'data-kg-pin-ref'}[focusNotebook];root.querySelector(`[${attribute}="${focusRef}"]`)?.focus({preventScroll:true});}
  }
  function detail(p){
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
    const more=listing.loading?`<div class="kg-page-note" role="status">${t('Đang tải thêm…','Loading more…')}</div>`:listing.error?`<div class="kg-page-error" role="status"><span>${e(window.padUI.t(listing.error))}</span>${button('kg-load-more',t('Thử lại','Retry'),'ghost',disabled)}</div>`:listing.hasMore?`<div class="kg-page-note"><span>${t('Cuộn xuống để tải thêm','Scroll down to load more')}</span>${button('kg-load-more',t('Tải thêm','Load more'),'ghost',disabled)}</div>`:p.notebooksAt&&!p.notebooksError?`<div class="kg-page-note">${t('Đã xem hết danh sách gần đây','End of the recent list')}</div>`:'';
    const watched=new Set(p.watch),pinned=p.watch.map(ref=>notebookRows.find(n=>n.ref===ref)||{ref,title:ref,status:'unknown'}),recent=notebookRows.filter(n=>!watched.has(n.ref));
    const group=(id,label,rows,isPinned,empty)=>{
      const content=rows.map(n=>{
        const older=notebookStale||stale(n.readAt||p.notebooksAt)||!!n.error;
        const stamp=n.readAt||p.notebooksAt;
        return `<div class="kg-notebook"><div class="kg-notebook-main"><button class="text-button kg-notebook-link" data-kg-open="${e(n.ref)}" title="${e(n.ref)}">${e(n.title||n.ref)} ↗</button><small>${e(n.ref)}${n.accelerator?' · '+e(n.accelerator):''}</small>${n.error?`<small class="danger-text">${e(window.padUI.t(n.error))}</small>`:''}</div><span class="kg-run-status ${older?'unknown':Object.hasOwn(names,n.status)?n.status:'unknown'}" title="${e(date(stamp))}${older?' · '+t('Dữ liệu cũ','Older data'):''}">${e(status(n.status))}</span><button class="icon-button kg-notebook-toggle" ${isPinned?'data-kg-unpin':'data-kg-pin-ref'}="${e(n.ref)}" aria-label="${isPinned?t('Bỏ ghim','Unpin'):t('Ghim','Pin')} ${e(n.ref)}" title="${isPinned?t('Bỏ ghim','Unpin'):t('Ghim','Pin')}" ${disabled||(!isPinned&&p.watch.length>=20)?'disabled':''}>${isPinned?'×':'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-4 1-4 5-3 1-1-3 5-4 2-5ZM10 14l-7 7"/></svg>'}</button></div>`;
      }).join('');
      return `<section class="kg-notebook-group" aria-labelledby="${id}-title"><div class="kg-section-title kg-notebook-heading"><h3 id="${id}-title">${label}<span class="kg-notebook-count">${rows.length}</span></h3>${isPinned?button('kg-pin',t('＋ Ghim notebook','＋ Pin notebook'),'ghost',disabled||p.watch.length>=20):''}</div><div id="${id}" class="kg-notebooks" data-kg-scroll tabindex="0" role="region" aria-labelledby="${id}-title" ${!isPinned?`aria-busy="${!!listing.loading}"`:''}>${content||`<div class="kg-no-runs">${empty}</div>`}${isPinned?'':more}</div></section>`;
    };
    box.innerHTML=`
      <div class="kg-detail-heading"><div class="avatar">${e(p.username.slice(0,2).toUpperCase())}</div><div class="kg-detail-identity"><h2>${e(p.label)}</h2><span>@${e(p.username)}</span></div><span class="badge">Kaggle</span></div>
      <div id="kg-detail-body" class="kg-detail-body" data-kg-scroll tabindex="0" role="region" aria-label="${t('Quota và notebook của tài khoản','Account quota and notebooks')}">
        ${p.lastError?`<div class="banner danger">${e(window.padUI.t(p.lastError))}</div>`:''}
        <div class="kg-section-title"><h3>${t('Quota còn lại','Remaining quota')}</h3><span class="kg-update ${quotaStale?'kg-stale':''}">${e(date(p.quotaAt))}${p.quotaAt&&quotaStale?' · '+t('Dữ liệu cũ','Older data'):''}</span></div>
        <div class="kg-quota-grid">${quotas}</div>
        ${p.quotaError?`<p class="kg-inline-error">${e(window.padUI.t(p.quotaError))}</p>`:''}
        <details class="kg-quota-info" id="kg-quota-info" ${opened.has('kg-quota-info')?'open':''}><summary>${t('Chi tiết quota','Quota details')}</summary><p>${t('Giờ còn lại bao gồm phần giữ chỗ.','Remaining time includes reserved time.')}</p>${resources.map(resource=>{const q=p.quota?.find(q=>q.resource===resource);return `<p><strong>${resource}</strong> · ${t('Giữ chỗ','Reserved')}: ${hours(q?.reserved)}${q?.refreshAt?' · '+t('Đặt lại','Resets')+' '+e(date(q.refreshAt)):''}</p>`;}).join('')}</details>
        <div class="kg-use"><div class="kg-actions">${button('kg-terminal-copy',t('Dùng ở terminal','Use in terminal'),'primary',disabled)}${button('kg-launch',t('Mở terminal mới','Open new terminal'),'secondary',disabled)}</div><div class="kg-terminal-hint"><code>padkaggle use ${e(p.username)}</code>${button('kg-terminal-setup',t('Thiết lập lệnh','Set up command'),'ghost',!!data.storeError)}</div></div>
        <div class="kg-monitor-caption"><span class="${notebookStale?'kg-stale':''}">${e(date(p.notebooksAt))}${p.notebooksAt&&notebookStale?' · '+t('Dữ liệu cũ','Older data'):''}</span><button type="button" class="text-button" id="kg-scope-info">${t('Phạm vi theo dõi','Monitoring scope')}</button></div>
        ${p.notebooksError?`<p class="kg-inline-error">${e(window.padUI.t(p.notebooksError))}</p>`:''}
        ${group('kg-notebooks-pinned',t('Đã ghim','Pinned'),pinned,true,t('Chưa ghim notebook. Ghim từ danh sách gần đây hoặc thêm bằng đường dẫn.','No pinned notebooks. Pin from the recent list or add a notebook link.'))}
        ${group('kg-notebooks-recent',t('Gần đây','Recent'),recent,false,p.notebooksAt?t('Chưa có notebook khác trong danh sách gần đây.','No other notebooks in the recent list.'):t('Làm mới để xem notebook từ Kaggle.','Refresh to view notebooks from Kaggle.'))}
        <details class="kg-management" id="kg-management" ${opened.has('kg-management')?'open':''}><summary>${t('Tùy chọn tài khoản','Account options')}</summary><div class="kg-workspace"><span>${t('Thư mục mở terminal mới','New terminal folder')}</span><code>${e(p.workspace)}</code></div><div class="kg-manage">${button('kg-edit',t('Sửa tên / thư mục','Edit name / folder'),'ghost',disabled)}${button('kg-token',t('Cập nhật token','Update token'),'ghost',disabled)}${button('kg-refresh-one',p.refreshing?t('Đang cập nhật…','Refreshing…'):t('Làm mới tài khoản','Refresh account'),'ghost',disabled)}${button('kg-remove',t('Xóa tài khoản','Remove account'),'ghost danger-text',disabled)}</div></details>
      </div>`;
    $('#kg-terminal-copy').onclick=()=>act('kaggleTerminalCopy',{id:p.id},t('Đã sao chép. Dán lệnh vào terminal PowerShell đang mở.','Copied. Paste the command in your existing PowerShell terminal.'));
    $('#kg-terminal-setup').onclick=terminalSetup;
    $('#kg-launch').onclick=()=>act('kaggleLaunch',{id:p.id},t('Đã mở PowerShell riêng cho @','Opened a separate PowerShell for @')+p.username+'.');
    $('#kg-refresh-one').onclick=()=>act('kaggleRefresh',{id:p.id});$('#kg-edit').onclick=()=>account(p,true);$('#kg-token').onclick=()=>account(p);$('#kg-pin').onclick=()=>pin(p);
    $('#kg-scope-info').onclick=()=>dialog(t('Phạm vi theo dõi Kaggle','Kaggle monitoring scope'),`<p>${t('Gần đây tải 12 notebook mỗi trang khi cuộn; Đã ghim theo dõi riêng tối đa 20 notebook có quyền xem. Mỗi notebook hiển thị lượt chạy mới nhất, không bao gồm đầy đủ phiên tương tác trên web hay mọi phiên bản đang chạy.','Recent loads 12 notebooks per page as you scroll; Pinned separately monitors up to 20 accessible notebooks. Each notebook shows its latest run, which does not cover every interactive web session or every running version.')}</p><p>${t('Làm mới cập nhật quota, trang đầu và notebook ghim. Các trang tải thêm giữ dữ liệu tại lúc tải trong phiên mở app; rê chuột lên trạng thái để xem thời điểm đọc. Dữ liệu không phải trạng thái trực tiếp liên tục. Kaggle quyết định quota và khả năng cấp GPU.','Refresh updates quota, the first page and pinned notebooks. Additional pages retain their snapshot for this app session; hover a status to see when it was read. Data is not continuously live. Kaggle determines quota and GPU availability.')}</p>`,async()=>hooks.closeModal(),t('Đã hiểu','Got it'));
    $('#kg-remove').onclick=()=>dialog(t('Xóa tài khoản Kaggle?','Remove Kaggle account?'),`<p>${t('Xóa token đã lưu của','Remove the saved token for')} <strong>@${e(p.username)}</strong>.</p><p>${t('Terminal đã mở vẫn giữ token trong phiên đó. Đóng các terminal đó và thu hồi token trên Kaggle nếu muốn ngắt truy cập hoàn toàn.','Open terminals retain their token for that session. Close those terminals and revoke the token on Kaggle to remove access completely.')}</p>`,async()=>{const r=await act('kaggleRemove',{id:p.id});if(r)hooks.closeModal();},t('Xóa token đã lưu','Remove saved token'));
    box.querySelectorAll('[data-kg-open]').forEach(el=>el.onclick=()=>act('kaggleOpen',{ref:el.dataset.kgOpen}));
    box.querySelectorAll('[data-kg-unpin]').forEach(el=>el.onclick=async()=>{const r=await act('kaggleWatch',{id:p.id,ref:el.dataset.kgUnpin,remove:true});if(r)await act('kaggleRefresh',{id:p.id});});
    box.querySelectorAll('[data-kg-pin-ref]').forEach(el=>el.onclick=async()=>{const r=await act('kaggleWatch',{id:p.id,ref:el.dataset.kgPinRef});if(r)await act('kaggleRefresh',{id:p.id});});
    for(const [id,top] of scroll){const region=document.getElementById(id);if(region)region.scrollTop=top;}
    const loadMore=async()=>{
      if(disabled||!listing.hasMore||listing.loading||loadingPages.has(p.id))return;
      loadingPages.add(p.id);try{await act('kaggleNotebooksMore',{id:p.id});}finally{loadingPages.delete(p.id);}
    };
    $('#kg-load-more')?.addEventListener('click',loadMore);
    const recentBox=$('#kg-notebooks-recent'),body=$('#kg-detail-body');
    for(const region of [recentBox,body]){
      let previous=region.scrollTop;
      region.addEventListener('scroll',()=>{
        const down=region.scrollTop>previous;previous=region.scrollTop;
        if(!down||listing.error||region.scrollHeight-region.clientHeight-region.scrollTop>40)return;
        if(region===body){if(recentBox.scrollHeight>recentBox.clientHeight)return;const r=recentBox.getBoundingClientRect(),b=body.getBoundingClientRect();if(r.top>=b.bottom||r.bottom<=b.top)return;}
        loadMore();
      },{passive:true});
    }
  }
  async function account(p=null,edit=false){
    if(accountBusy||toolsBusy||$('#modal').open)return;
    if(!edit){accountBusy=true;let r;try{r=await act('kaggleTools');}finally{accountBusy=false;}if(!r||$('#modal').open)return;if(!r.result.supported){setup(false);return;}}
    dialog(edit?t('Sửa tài khoản Kaggle','Edit Kaggle account'):p?t('Cập nhật API token','Update API token'):t('Thêm tài khoản Kaggle','Add Kaggle account'),`${!edit?`<p>${t('Tạo API token tại Kaggle → Settings → API. Token sẽ được xác minh để nhận diện đúng tài khoản.','Create an API token in Kaggle → Settings → API. We verify the token to identify the account.')}</p>${button('kg-token-settings',t('Mở cài đặt Kaggle ↗','Open Kaggle settings ↗'),'ghost')}<label for="kg-token-input">API token${p?' · @'+e(p.username):''}</label><input id="kg-token-input" type="password" required autocomplete="off" spellcheck="false" maxlength="8192"><p class="field-help">${t('Dùng API token mới, không dùng mật khẩu hay tệp kaggle.json cũ.','Use a modern API token, not your password or a legacy kaggle.json file.')}</p>`:''}<label for="kg-label">${t('Tên dễ nhớ','Display name')}</label><input type="text" id="kg-label" maxlength="80" value="${e(p?.label||'')}" placeholder="${t('Ví dụ: Nhóm nghiên cứu','e.g. Research team')}"><label for="kg-folder">${t('Thư mục mở terminal','Terminal folder')}</label><div class="path-field"><input type="text" id="kg-folder" required readonly value="${e(p?.workspace||workspace)}">${button('kg-pick-folder',t('Chọn','Choose'))}</div><p class="field-help">${t('Token được mã hóa bằng Windows DPAPI. Mỗi terminal giữ tài khoản riêng khi bạn đổi thư mục bằng cd.','Tokens use Windows DPAPI encryption. Each terminal keeps its own account when you change folders with cd.')}</p>`,async()=>{
      const tokenInput=$('#kg-token-input'),args={id:p?.id||null,label:$('#kg-label').value,workspace:$('#kg-folder').value};
      if(tokenInput){args.token=tokenInput.value;tokenInput.value='';}
      const r=await act(edit?'kaggleEdit':'kaggleAdd',args,t('Đã lưu tài khoản Kaggle.','Kaggle account saved.'));delete args.token;
      if(r){selected=p?.id||r.result;hooks.closeModal();render(data,workspace);if(!edit)await act('kaggleRefresh',{id:selected});}
    },edit?t('Lưu thay đổi','Save changes'):t('Xác minh & lưu','Verify & save'));
    $('#kg-token-settings')?.addEventListener('click',()=>act('kaggleOpen',{kind:'settings'}));
    $('#kg-pick-folder').onclick=async()=>{const r=await act('pick',{kind:'kaggleWorkspace'});if(r?.result)$('#kg-folder').value=r.result;};
  }
  function pin(p){dialog(t('Ghim notebook','Pin notebook'),`<p>${t('Nhập notebook mà tài khoản này có quyền xem. Theo dõi tối đa 20 notebook ghim.','Enter a notebook this account can access. Monitor up to 20 pinned notebooks.')}</p><label for="kg-ref">username/notebook-slug</label><input type="text" id="kg-ref" required maxlength="300" placeholder="https://www.kaggle.com/code/username/notebook-slug">`,async()=>{const r=await act('kaggleWatch',{id:p.id,ref:$('#kg-ref').value});if(r){hooks.closeModal();await act('kaggleRefresh',{id:p.id});}},t('Ghim & cập nhật','Pin & refresh'));}
  async function terminalSetup(){
    if(toolsBusy||accountBusy||$('#modal').open)return;
    toolsBusy=true;let r;try{r=await act('kaggleTerminalStatus');}finally{toolsBusy=false;}
    if(!r||$('#modal').open)return;const terminal=r.result;
    dialog(t('Lệnh Kaggle trong PowerShell','Kaggle commands in PowerShell'),`<p>${t('Bật một lần để dùng padkaggle trong các terminal PowerShell mới, gồm terminal trong VS Code.','Enable once to use padkaggle in new PowerShell terminals, including VS Code terminals.')}</p><pre class="kg-shell-help">padkaggle list\npadkaggle use username\npadkaggle status\npadkaggle off</pre><p>${t('Mỗi terminal chọn tài khoản riêng và giữ nguyên thư mục hiện tại. Có thể dùng tên dễ nhớ trong dấu nháy nếu tên không trùng.','Each terminal keeps its own selection and current folder. A unique display name can also be used in quotes.')}</p><p>${t('Terminal đã mở: dùng nút “Dùng ở terminal” rồi dán lệnh, không cần mở lại VS Code.','For an existing terminal, copy “Use in terminal” and paste the command; no VS Code restart is needed.')}</p><p>${terminal.configured?t('Lệnh padkaggle đã được bật.','The padkaggle command is enabled.'):t('Thiết lập thêm một đoạn riêng vào profile PowerShell của người dùng và giữ các cấu hình khác. Không tự chọn tài khoản khi mở terminal.','Setup adds a separate block to your user PowerShell profiles and preserves other settings. It does not select an account on startup.')}</p><details><summary>${t('Profile được cấu hình','Configured profiles')}</summary>${terminal.profiles.map(p=>`<p><code>${e(p.path)}</code></p>`).join('')}</details>${terminal.profiles.some(p=>p.configured)?button('kg-terminal-disable',t('Gỡ lệnh khỏi profile','Remove from profiles'),'ghost'):''}`,async()=>{
      if(!terminal.configured){const saved=await act('kaggleTerminalConfigure',{enabled:true},t('Đã bật padkaggle cho terminal PowerShell mới.','padkaggle enabled for new PowerShell terminals.'));if(!saved)return;}
      hooks.closeModal();
    },terminal.configured?t('Đóng','Close'):t('Bật lệnh padkaggle','Enable padkaggle'));
    $('#kg-terminal-disable')?.addEventListener('click',async()=>{const removed=await act('kaggleTerminalConfigure',{enabled:false},t('Đã gỡ khỏi profile. Terminal đang mở vẫn giữ lựa chọn cho tới khi dùng padkaggle off hoặc đóng.','Removed from profiles. Existing terminals keep their selection until padkaggle off or exit.'));if(removed)hooks.closeModal();});
  }
  async function setup(check=true){
    if(toolsBusy||accountBusy||$('#modal').open)return;toolsBusy=true;try{if(check)await act('kaggleTools');}finally{toolsBusy=false;}
    if($('#modal').open)return;
    const tool=data.tool;
    dialog(t('Thiết lập Kaggle','Kaggle setup'),`<div class="kg-tool-state ${tool?.supported?'ready':''}"><strong>${tool?.supported?t('Công cụ sẵn sàng','Tools ready'):t('Cần cài / cập nhật công cụ','Install / update tools')}</strong><p>Python ${e(tool?.python||'—')} · kaggle ${e(tool?.kaggle||'—')} · kagglesdk ${e(tool?.kagglesdk||'—')}</p></div><p>${t('Cần Python 3.11+, kaggle 2.2.4+ và kagglesdk 0.1.37+. Cài bằng lệnh trong PowerShell, sau đó kiểm tra lại.','Requires Python 3.11+, kaggle 2.2.4+ and kagglesdk 0.1.37+. Run the install command in PowerShell, then check again.')}</p><div class="kg-actions">${button('kg-copy-setup',t('Sao chép lệnh cài','Copy install command'))}${button('kg-python-web',t('Tải Python ↗','Download Python ↗'),'ghost')}</div><label for="kg-python">${t('Python dùng cho Kaggle','Python for Kaggle')}</label><div class="path-field"><input type="text" id="kg-python" readonly value="${e(data.settings.pythonPath||'')}" placeholder="${t('Tự tìm python.exe trên PATH','Detect python.exe on PATH')}">${button('kg-pick-python',t('Chọn','Choose'))}</div>${button('kg-auto-python',t('Dùng Python tự tìm','Use detected Python'),'ghost')}<p class="field-help">${tool?.executable?e(tool.executable):t('Có thể chọn python.exe của môi trường venv riêng.','You can choose python.exe from a dedicated venv.')}</p><label class="check-label"><input id="kg-auto-refresh" type="checkbox" ${data.settings.autoRefresh?'checked':''}> ${t('Tự cập nhật mỗi 2 phút khi PADSwitcher mở','Refresh every 2 minutes while PADSwitcher is open')}</label><p class="field-help">${t('Có thể chọn tài khoản trong terminal PowerShell đang mở bằng padkaggle, gồm terminal trong VS Code.','Use padkaggle to select an account in an existing PowerShell terminal, including VS Code.')}</p>`,async()=>{const r=await act('kaggleSettings',{pythonPath:$('#kg-python').value,autoRefresh:$('#kg-auto-refresh').checked});if(r){hooks.closeModal();await setup();}},t('Lưu & kiểm tra','Save & check'));
    $('#kg-pick-python').onclick=async()=>{const r=await act('pick',{kind:'kagglePython'});if(r?.result)$('#kg-python').value=r.result;};
    const shellButton=document.createElement('div');shellButton.className='kg-actions';shellButton.innerHTML=button('kg-tools-terminal',t('Thiết lập lệnh padkaggle','Set up padkaggle command'),'secondary');$('#modal-body [data-literal]').append(shellButton);
    $('#kg-tools-terminal').onclick=()=>{hooks.closeModal();terminalSetup();};
    $('#kg-auto-python').onclick=()=>{$('#kg-python').value='';};
    $('#kg-python-web').onclick=()=>act('kaggleOpen',{kind:'python'});
    $('#kg-copy-setup').onclick=async()=>{const r=await act('kaggleSettings',{pythonPath:$('#kg-python').value,autoRefresh:$('#kg-auto-refresh').checked});if(r)await act('kaggleSetupCopy',{},t('Đã sao chép lệnh cài. Chạy trong PowerShell, rồi Lưu & kiểm tra.','Install command copied. Run it in PowerShell, then Save & check.'));};
  }
  function guide(){
    const box=$('#kg-guide'),open=box.querySelector('details')?.open;
    box.innerHTML=`<details class="panel disclosure kg-guide" ${open?'open':''}><summary>${t('Làm việc từ code local với Kaggle','Work with local code and Kaggle')}</summary><ol><li>${t('Thêm tài khoản bằng API token một lần. Dùng padkaggle use username trong PowerShell, hoặc sao chép lệnh từ nút Dùng ở terminal.','Add each account once. Use padkaggle use username in PowerShell, or copy Use in terminal.')}</li><li>${t('Viết code bằng VS Code như bình thường. Trong terminal tài khoản, tạo cấu hình notebook:','Write code in VS Code as usual. In the account terminal, create notebook metadata:')}<pre>kaggle kernels init -p ./job</pre>${t('Sửa kernel-metadata.json: id đúng username/notebook-slug, code_file trỏ đến code, enable_gpu: true nếu cần GPU; khai báo nguồn dữ liệu.','Edit kernel-metadata.json: set id to username/notebook-slug, code_file to your code, enable_gpu: true for GPU; specify data sources.')}</li><li>${t('Gửi code lên Kaggle và lấy kết quả bằng CLI:','Send code to Kaggle and fetch results using the CLI:')}<pre>kaggle kernels push -p ./job\nkaggle kernels status username/notebook-slug\nkaggle kernels output username/notebook-slug -p ./results</pre></li><li>${t('Mở terminal của tài khoản khác để gửi công việc khác song song, trong giới hạn và điều khoản của Kaggle.','Open another account’s terminal to submit another job in parallel, within Kaggle’s limits and terms.')}</li></ol><p>${t('python train.py vẫn chạy local. GPU Kaggle được dùng bởi notebook gửi lên Kaggle. PADSwitcher không chia job hay tự đổi tài khoản. Đóng PADSwitcher không dừng job đã gửi hoặc terminal đã mở.','python train.py runs locally. Kaggle GPUs run the notebooks you submit to Kaggle. PADSwitcher does not split jobs or switch accounts automatically. Closing PADSwitcher does not stop submitted jobs or open terminals.')}</p>${button('kg-docs',t('Tài liệu Kaggle CLI ↗','Kaggle CLI documentation ↗'),'ghost')}</details>`;
    $('#kg-docs').onclick=()=>act('kaggleOpen',{kind:'docs'});
  }
  return {init(value){hooks=value;},render};
})();
