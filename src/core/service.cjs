'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { UserError, publicError } = require('./errors.cjs');
const { exists, atomicWrite, profilePath, readLimited, assertDirectory } = require('./files.cjs');
const { parseAuth, normalizeLimits } = require('./auth.cjs');
const { normalizeResets, availableCredit } = require('./resets.cjs');
const windows = require('./windows.cjs');
const { CodexRpc } = require('./rpc.cjs');
const { SEAL_SESSION } = require('./guardian.cjs');
const {defaults:routeDefaults,validate:validateRoutes,SCOPES}=require('./client-routes.cjs');

class ProfileService extends EventEmitter {
  constructor(root, adapters = {}) {
    super(); this.root = path.resolve(root); this.profilesRoot = path.join(this.root, 'profiles');
    this.metadataFile = path.join(this.root, 'accounts.json'); this.rollbackFile = path.join(this.root, 'desktop-rollback.dpapi');
    this.journalFile = path.join(this.root, 'desktop-journal.json');
    this.platform = { ...windows, ...adapters };
    this.rpcFactory = adapters.rpcFactory || ((exe,home,opts) => new CodexRpc(exe,home,opts));
    this.running = new Map(); this.busy = false; this.login = null;
    this.state = { version: 1, profiles: [], settings: { codexPath: '', desktopHome: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), workspace: process.cwd(), autoRefresh: true }, activeDesktopId: null, rollback: null };
    this.state.autoSwitch={enabled:false,order:[]};this.state.quotaCooldowns={};
    this.state.clientRoutes=routeDefaults();
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true }); await assertDirectory(this.root); await this.platform.protectDirectory(this.root);
    await fs.mkdir(this.profilesRoot, { recursive: true }); await assertDirectory(this.profilesRoot);
    if (await exists(this.metadataFile)) {
      let parsed;
      try { parsed = JSON.parse((await readLimited(this.metadataFile, 4 * 1024 * 1024)).toString('utf8')); } catch { throw new UserError('Danh sách hồ sơ bị lỗi. Hãy giữ nguyên thư mục dữ liệu để phục hồi.', 'STORE_INVALID'); }
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles) || !parsed.settings || parsed.profiles.length > 200) throw new UserError('Định dạng dữ liệu chưa được hỗ trợ.', 'STORE_INVALID');
      const ids = new Set();
      for (const p of parsed.profiles) {
        profilePath(this.profilesRoot,p.id);
        if (ids.has(p.id) || !/^[a-f0-9]{64}$/.test(p.identity) || typeof p.label !== 'string') throw new UserError('Danh sách hồ sơ không hợp lệ.', 'STORE_INVALID');
        ids.add(p.id);
        if(p.resetAttempt && (!/^[a-f0-9-]{36}$/.test(p.resetAttempt.key)||!['prepared','pending','completed'].includes(p.resetAttempt.status)||!Number.isFinite(Date.parse(p.resetAttempt.at))||(p.resetAttempt.creditId!==null&&(typeof p.resetAttempt.creditId!=='string'||!p.resetAttempt.creditId||p.resetAttempt.creditId.length>1024))||(p.resetAttempt.status==='completed'&&!['reset','alreadyRedeemed','nothingToReset','noCredit'].includes(p.resetAttempt.outcome)))) throw new UserError('Trạng thái reset không hợp lệ. Giữ nguyên dữ liệu để kiểm tra.', 'STORE_INVALID');
      }
      if (typeof parsed.settings.desktopHome !== 'string' || !path.isAbsolute(parsed.settings.desktopHome) || typeof parsed.settings.workspace !== 'string' || typeof parsed.settings.codexPath !== 'string') throw new UserError('Cài đặt đường dẫn không hợp lệ.', 'STORE_INVALID');
      this.state = { ...this.state, ...parsed, settings: { ...this.state.settings, ...parsed.settings } };
      validateRoutes(this.state.clientRoutes,ids);
      if(!this.state.autoSwitch||typeof this.state.autoSwitch.enabled!=='boolean'||!Array.isArray(this.state.autoSwitch.order)||this.state.autoSwitch.order.length>200||new Set(this.state.autoSwitch.order).size!==this.state.autoSwitch.order.length||this.state.autoSwitch.order.some(id=>!ids.has(id)))throw new UserError('Cấu hình tự đổi tài khoản không hợp lệ.', 'STORE_INVALID');
      if(!this.state.quotaCooldowns||Array.isArray(this.state.quotaCooldowns)||typeof this.state.quotaCooldowns!=='object'||Object.entries(this.state.quotaCooldowns).some(([id,v])=>!ids.has(id)||!Number.isFinite(v)||v<0))throw new UserError('Thời gian chờ quota không hợp lệ.', 'STORE_INVALID');
    } else await this.save();
    await this.recoverJournal();
    await this.recoverRuntimes();
    await this.syncDesktop();
    return this.view();
  }
  async save() {
    // Quota/recovery notifications may arrive while a user operation is saving.
    // Serialize commits so an older snapshot cannot overwrite newer settings.
    const data=JSON.stringify(this.state,null,2),write=(this.saveFlight||Promise.resolve()).catch(()=>{}).then(()=>atomicWrite(this.metadataFile,data));
    this.saveFlight=write;await write;
  }
  view() {
    return {
      version: require('../../package.json').version, profiles: this.state.profiles.map(p => ({ ...p, running: this.running.has(p.id), desktopActive: p.id === this.state.activeDesktopId })),
      settings: { ...this.state.settings }, busy: this.busy||!!this.gateway?.flight, login: this.login ? { profileId: this.login.profileId } : null,
      autoSwitch:{...this.state.autoSwitch,order:[...this.state.autoSwitch.order]},
      clientRoutes:JSON.parse(JSON.stringify(this.state.clientRoutes)),
      canRestore: Boolean(this.state.rollback), recoveryPending: this.recoveryPending || false,
      gateway: this.gateway?.view() || {status:'stopped',profileId:null,pendingId:null,activeTurns:0,clients:0},
      vscode: this.vscode || {configuration:'unknown',helperPresent:false},
      jetbrains: this.jetbrains || {configuration:'notConfigured',runtimePresent:false},
    };
  }
  changed() { this.emit('change',this.view()); }
  async exclusive(operation) {
    if (this.busy) throw new UserError('Một thao tác khác đang chạy. Hãy chờ hoàn tất.', 'BUSY');
    this.busy = true; this.changed();
    try { return await operation(); } finally { this.busy = false; this.changed(); }
  }
  get(id) { const p = this.state.profiles.find(p => p.id === id); if (!p) throw new UserError('Không tìm thấy hồ sơ.', 'PROFILE_MISSING'); return p; }
  home(id) { return profilePath(this.profilesRoot,id); }
  vault(id) { return path.join(this.home(id),'session.dpapi'); }
  backup(journal) {
    if (!journal?.rollbackId) return this.rollbackFile;
    profilePath(this.root,journal.rollbackId);
    return path.join(this.root,`desktop-rollback-${journal.rollbackId}.dpapi`);
  }
  async storeAuth(id, bytes) {
    const identity = parseAuth(bytes);
    if (this.get(id).identity !== identity.identity) throw new UserError('Phiên đăng nhập không khớp hồ sơ. Chưa ghi đè dữ liệu.', 'IDENTITY_MISMATCH');
    const encrypted = await this.platform.dpapi(bytes);
    try { await atomicWrite(this.vault(id),encrypted); } finally { encrypted.fill(0); }
  }
  async loadAuth(id) {
    const bytes = await this.platform.dpapi(await readLimited(this.vault(id)),true);
    try { if (parseAuth(bytes).identity !== this.get(id).identity) throw new UserError('Phiên không khớp hồ sơ đã lưu.', 'IDENTITY_MISMATCH'); return bytes; } catch (e) { bytes.fill(0); throw e; }
  }
  async capture(bytes, label) {
    const identity = parseAuth(bytes);
    let p = this.state.profiles.find(p => p.identity === identity.identity);
    const created = !p;
    if (!p) {
      p = { id: crypto.randomUUID(), ...identity, label: cleanText(label || identity.email || `Tài khoản ${this.state.profiles.length+1}`,80), notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), quota: [], quotaAt: null, status: 'ready', lastError: null };
      await fs.mkdir(this.home(p.id)); this.state.profiles.push(p);
    }
    try {
      await this.storeAuth(p.id,bytes);
      Object.assign(p,{ ...identity, updatedAt: new Date().toISOString(), status: 'ready', lastError: null });
      await this.save(); return p;
    } catch(e) { if (created) this.state.profiles = this.state.profiles.filter(x => x.id !== p.id); throw e; }
  }
  async desktopAuth() {
    await assertDirectory(this.state.settings.desktopHome);
    const file = path.join(this.state.settings.desktopHome,'auth.json');
    return await exists(file) ? readLimited(file) : null;
  }
  async desktopIdentity() {
    const bytes = await this.desktopAuth(); if (!bytes) return null;
    try { return parseAuth(bytes); } finally { bytes.fill(0); }
  }
  async syncDesktop() {
    let identity = null;
    try { identity = await this.desktopIdentity(); } catch (e) { if (!['ENOENT','AUTH_INVALID','AUTH_UNSUPPORTED'].includes(e.code)) throw e; }
    const id = this.state.profiles.find(p => p.identity === identity?.identity)?.id || null;
    if (id !== this.state.activeDesktopId) { this.state.activeDesktopId = id; await this.save(); }
  }
  async importCurrent(label) {
    return this.exclusive(async () => {
      const bytes = await this.desktopAuth();
      if (!bytes) throw new UserError('Chưa có phiên auth.json của Codex. Hãy đăng nhập Codex hoặc thêm tài khoản qua OpenAI.', 'NO_DESKTOP_AUTH');
      try { const p = await this.capture(bytes,label); this.state.activeDesktopId = p.id; await this.save(); return p.id; }
      finally { bytes.fill(0); }
    });
  }
  async executable() { return this.platform.findGatewayCodex ? this.platform.findGatewayCodex(this.state.settings.codexPath) : this.platform.findCodex(this.state.settings.codexPath); }
  async accessBundle(id, force = false) {
    return this.exclusive(async () => {
      const p=this.get(id), desktop=(await this.desktopIdentity())?.identity===p.identity;
      let bytes=desktop ? await this.desktopAuth() : this.running.has(id) ? await readLimited(path.join(this.home(id),'auth.json')) : await this.loadAuth(id);
      try {
        if(parseAuth(bytes).identity!==p.identity) throw new UserError('Phiên không khớp hồ sơ.', 'IDENTITY_MISMATCH');
        let data=JSON.parse(bytes.toString('utf8'));
        let expires=0;try{expires=JSON.parse(Buffer.from(data.tokens.access_token.split('.')[1],'base64url')).exp||0;}catch{}
        if(force || (expires && expires*1000-Date.now()<90000)) {
          bytes.fill(0); bytes=null;
          const home=desktop ? this.state.settings.desktopHome : await this.runtime(id);
          const rpc=this.rpcFactory(await this.executable(),home,{fileStore:!desktop});
          try {await rpc.initialize();await rpc.request('account/read',{refreshToken:true});bytes=await readLimited(path.join(home,'auth.json'));await this.storeAuth(id,bytes);}
          finally {await rpc.close();if(!desktop&&!this.running.has(id))await this.seal(id);}
          if(parseAuth(bytes).identity!==p.identity) throw new UserError('Tài khoản đã thay đổi trong lúc làm mới phiên.', 'IDENTITY_MISMATCH');
          data=JSON.parse(bytes.toString('utf8'));await this.storeAuth(id,bytes);
        }
        const accountId=data.tokens.account_id||JSON.parse(Buffer.from(data.tokens.id_token.split('.')[1],'base64url'))['https://api.openai.com/auth']?.chatgpt_account_id;
        if(!accountId)throw new UserError('Phiên thiếu mã tài khoản ChatGPT.', 'AUTH_INVALID');
        const tokenPlan=parseAuth(bytes).plan,personal=plan=>['free','plus','pro'].includes(String(plan||'').toLowerCase());
        // Either source indicating a managed plan must keep it out of the
        // personal model route, including during a plan/token transition.
        const plan=tokenPlan&&!personal(tokenPlan)?tokenPlan:p.plan||tokenPlan||null;
        return {accessToken:data.tokens.access_token,chatgptAccountId:accountId,chatgptPlanType:plan};
      } finally {bytes?.fill(0);}
    });
  }
  async runtime(id) {
    const home = this.home(id); await assertDirectory(home);
    const authFile = path.join(home,'auth.json');
    // Recover a fresher runtime copy rather than overwriting token rotation after a crash.
    if (await exists(authFile)) {
      const bytes = await readLimited(authFile);
      try { await this.storeAuth(id,bytes); } finally { bytes.fill(0); }
    } else {
      const bytes = await this.loadAuth(id);
      try { await atomicWrite(authFile,bytes); } finally { bytes.fill(0); }
    }
    await atomicWrite(path.join(home,'config.toml'),'cli_auth_credentials_store = "file"\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n');
    return home;
  }
  async seal(id) {
    const file = path.join(this.home(id),'auth.json');
    if (await exists(file)) {
      const bytes = await readLimited(file);
      try { await this.storeAuth(id,bytes); await fs.unlink(file); } finally { bytes.fill(0); }
    }
  }
  async recoverRuntimes() {
    const list = await this.platform.processes();
    for (const p of this.state.profiles) {
      const marker = path.join(this.home(p.id),'runtime.json');
      if (await exists(marker)) {
        let lease; try { lease = JSON.parse((await readLimited(marker)).toString('utf8')); } catch { throw new UserError('Trạng thái phiên CLI bị lỗi. Không xóa dữ liệu đang dùng.', 'LEASE_INVALID'); }
        if (list.some(x => x.ProcessId === lease.pid && /^powershell\.exe$/i.test(x.Name))) { this.running.set(p.id,{ pid: lease.pid, recovered: true, desktop: lease.desktop === true }); continue; }
      }
      await this.seal(p.id);
      if (await exists(marker)) await fs.unlink(marker);
    }
  }
  async checkRecovered() {
    const recovered = [...this.running.entries()].filter(([,v]) => v.recovered);
    if (!recovered.length) return;
    const list = await this.platform.processes();
    for (const [id, lease] of recovered) if (!list.some(x => x.ProcessId === lease.pid && /^powershell\.exe$/i.test(x.Name))) {
      await this.seal(id); await fs.unlink(path.join(this.home(id),'runtime.json')).catch(() => {}); this.running.delete(id);
    }
  }
  async refresh(id) { return this.exclusive(() => this.refreshOne(id)); }
  async refreshAll() {
    return this.exclusive(async () => {
      await this.checkRecovered();
      await this.syncDesktop();
      for (const p of this.state.profiles) {
        try { await this.refreshOne(p.id); } catch(e) { p.lastError = publicError(e).message; p.status = e.code === 'AUTH_INVALID' || e.code === 'AUTH_UNSUPPORTED' ? 'reauth' : 'error'; await this.save(); this.changed(); }
      }
    });
  }
  async refreshOne(id) {
    await this.syncDesktop();
    const p = this.get(id); const current = await this.desktopIdentity();
    const desktop = current?.identity === p.identity;
    const wasRunning = this.running.has(id);
    const executable = await (this.platform.findGatewayCodex?.(this.state.settings.codexPath) || this.executable());
    const home = desktop ? this.state.settings.desktopHome : await this.runtime(id);
    const rpc = this.rpcFactory(executable,home,{ fileStore: !desktop });
    try {
      await rpc.initialize();
      const account = await rpc.request('account/read',{ refreshToken: false });
      if (account?.account?.type !== 'chatgpt') throw new UserError('Phiên đã hết hạn hoặc chưa đăng nhập ChatGPT. Hãy đăng nhập lại hồ sơ này.', 'AUTH_INVALID');
      const result = await rpc.request('account/rateLimits/read',{});
      p.email = account.account.email || p.email; p.plan = account.account.planType || p.plan;
      p.quota = normalizeLimits(result); p.resetCredits = normalizeResets(result); p.quotaAt = new Date().toISOString(); p.status = 'ready'; p.lastError = null;
      const codexWindows=p.quota.filter(b=>b.id==='codex'||b.name==='codex').flatMap(b=>b.windows||[]);
      if(codexWindows.length&&codexWindows.every(w=>w.usedPercent<100))delete this.state.quotaCooldowns[id];
      if (desktop) this.state.activeDesktopId = p.id;
      await this.save();
    } catch(e) { p.lastError = publicError(e).message; p.status = e.code === 'AUTH_INVALID' ? 'reauth' : 'error'; await this.save(); throw e; }
    finally {
      await rpc.close();
      if (!desktop && !wasRunning) await this.seal(id);
      if (desktop) { const bytes = await this.desktopAuth(); if (bytes) { try { await this.storeAuth(id,bytes); } finally { bytes.fill(0); } } }
    }
  }
  async prepareReset(id, creditId = null) {
    return this.exclusive(async () => {
      const p = this.get(id);
      if (p.resetAttempt?.status === 'pending') return {...p.resetAttempt,retry:true};
      if (creditId !== null && (typeof creditId !== 'string' || !creditId || creditId.length > 1024)) throw new UserError('Lượt reset không hợp lệ.', 'RESET_STALE');
      await this.refreshOne(id); // Read-only: preparation never consumes a credit.
      if (!p.resetCredits) throw new UserError('Codex chưa cung cấp dữ liệu lượt reset. Hãy cập nhật Codex rồi làm mới.', 'RESET_UNAVAILABLE');
      if (!p.resetCredits.availableCount) throw new UserError('Tài khoản không còn lượt reset.', 'RESET_NO_CREDIT');
      if (creditId !== null && !availableCredit(p.resetCredits,creditId)) throw new UserError('Lượt reset đã thay đổi hoặc hết hạn. Hãy chọn lại.', 'RESET_STALE');
      p.resetAttempt = {key:crypto.randomUUID(),creditId,status:'prepared',at:new Date().toISOString()};
      await this.save(); return {...p.resetAttempt,retry:false};
    });
  }
  async consumeReset(id, key, confirmed = false) {
    // Authenticate the named profile, never the currently selected gateway account.
    // External tokens stay in memory; this RPC cannot overwrite a shared login.
    if (confirmed !== true) throw new UserError('Cần xác nhận trước khi dùng lượt reset.', 'RESET_CONFIRMATION');
    const initial = this.get(id).resetAttempt;
    if (typeof key !== 'string' || initial?.key !== key) throw new UserError('Xác nhận reset đã cũ. Hãy mở lại.', 'RESET_STALE');
    if (initial.status === 'completed') return {outcome:initial.outcome,quotaRefreshed:false};
    const bundle = await this.accessBundle(id);
    try { return await this.exclusive(async () => {
      const p = this.get(id), attempt = p.resetAttempt;
      if (attempt?.key !== key) throw new UserError('Xác nhận reset đã cũ. Hãy mở lại.', 'RESET_STALE');
      if (attempt.status === 'completed') return {outcome:attempt.outcome,quotaRefreshed:false};
      const retry = attempt.status === 'pending';
      if (!retry && Date.now()-Date.parse(attempt.at) > 5*60000) throw new UserError('Xác nhận reset đã hết hạn. Hãy mở lại.', 'RESET_STALE');
      const home = await fs.mkdtemp(path.join(this.root,'reset-rpc-'));
      let rpc;
      try {
        await this.platform.protectDirectory(home);
        const executable = await (this.platform.findGatewayCodex?.(this.state.settings.codexPath) || this.executable());
        rpc = this.rpcFactory(executable,home,{ephemeralStore:true});
        await rpc.initialize({experimentalApi:true});
        await rpc.request('account/login/start',{type:'chatgptAuthTokens',...bundle});
        if (!retry) {
          const before = normalizeResets(await rpc.request('account/rateLimits/read',{}));
          if (!before) throw new UserError('Codex chưa cung cấp dữ liệu lượt reset.', 'RESET_UNAVAILABLE');
          if (!before.availableCount) throw new UserError('Tài khoản không còn lượt reset.', 'RESET_NO_CREDIT');
          if (attempt.creditId !== null && !availableCredit(before,attempt.creditId)) throw new UserError('Lượt reset đã thay đổi hoặc hết hạn.', 'RESET_STALE');
        }
        // Persist the key BEFORE sending. Timeout/restart retries reuse this key,
        // including when the service already consumed the credit but the reply was lost.
        attempt.status = 'pending'; p.resetCredits=null; await this.save(); this.changed();
        let response;
        try { response = await rpc.request('account/rateLimitResetCredit/consume',{idempotencyKey:key,...(attempt.creditId !== null ? {creditId:attempt.creditId} : {})}); }
        catch { throw new UserError('Chưa xác định kết quả reset. Kiểm tra lại lần này; ứng dụng sẽ giữ nguyên mã yêu cầu để tránh dùng thêm lượt.', 'RESET_UNCERTAIN'); }
        if (!['reset','alreadyRedeemed','nothingToReset','noCredit'].includes(response?.outcome)) throw new UserError('Chưa xác định kết quả reset. Hãy kiểm tra lại cùng lần reset.', 'RESET_UNCERTAIN');
        Object.assign(attempt,{status:'completed',outcome:response.outcome});
        p.quotaAt = null; await this.save();
        let quotaRefreshed = false;
        try {
          const result = await rpc.request('account/rateLimits/read',{});
          p.quota = normalizeLimits(result); p.resetCredits = normalizeResets(result); p.quotaAt = new Date().toISOString(); p.status = 'ready'; p.lastError = null;
          const limits=p.quota.filter(b=>b.id==='codex').flatMap(b=>b.windows);
          if(limits.length&&limits.every(w=>w.usedPercent<100))delete this.state.quotaCooldowns[id];
          quotaRefreshed = true;
        } catch { p.lastError='Reset đã có kết quả; cần làm mới quota.'; }
        await this.save(); return {outcome:response.outcome,quotaRefreshed};
      } finally {
        try { await rpc?.close(); } finally {
          if (path.dirname(home) !== this.root || !path.basename(home).startsWith('reset-rpc-')) throw new Error('Unsafe reset cleanup');
          await fs.rm(home,{recursive:true,force:true});
        }
      }
    }); } finally { bundle.accessToken = null; }
  }
  async addAccount(label, openUrl, device = false, expectedId = null, onDevice = () => {}) {
    return this.exclusive(async () => {
      if(expectedId&&(this.gateway?.isUsing?.(expectedId)||this.gateway?.profileId===expectedId||this.gateway?.pendingId===expectedId||this.gateway?.router?.isUsing(expectedId)))throw new UserError('Dừng gateway hoặc chọn tài khoản khác trước khi đăng nhập lại hồ sơ này.', 'PROFILE_ACTIVE');
      if (expectedId && this.running.has(expectedId)) throw new UserError('Hãy đóng CLI của hồ sơ trước khi đăng nhập lại.', 'PROFILE_RUNNING');
      if (expectedId && (await this.desktopIdentity())?.identity === this.get(expectedId).identity) throw new UserError('Hồ sơ này đang dùng cho desktop. Chuyển desktop sang tài khoản khác trước khi đăng nhập lại; hoặc đăng nhập lại trong Codex rồi bấm Lưu tài khoản hiện tại.', 'PROFILE_ACTIVE');
      const loginRoot = path.join(this.root,'login'); await fs.mkdir(loginRoot,{ recursive:true }); await assertDirectory(loginRoot);
      // The dedicated login directory is never a profile or the desktop home.
      const loginAuth = path.join(loginRoot,'auth.json');
      if (await exists(loginAuth)) throw new UserError('Có phiên đăng nhập chưa được lưu từ lần trước. Dùng “Khôi phục đăng nhập” trong Cài đặt.', 'LOGIN_RECOVERY');
      const rpc = this.rpcFactory(await this.executable(),loginRoot,{ fileStore: true });
      let timer, resolveLogin, rejectLogin, loginId;
      let cancelled = false;
      const done = new Promise((resolve,reject) => { resolveLogin = resolve; rejectLogin = reject; });
      // Attach immediately so a very fast callback/cancel cannot cause an unhandled rejection.
      done.catch(() => {});
      this.login = { profileId: expectedId, rpc, cancel: () => { cancelled = true; rejectLogin(new UserError('Đã hủy đăng nhập.', 'CANCELLED')); } }; this.changed();
      const listener = (method,params) => {
        if (method !== 'account/login/completed' || (loginId && params.loginId !== loginId)) return;
        params.success ? resolveLogin() : rejectLogin(new UserError('Đăng nhập chưa hoàn tất. Hãy thử lại trên trang OpenAI.', 'LOGIN_FAILED'));
      };
      rpc.listeners.add(listener);
      try {
        await rpc.initialize();
        if (cancelled) throw new UserError('Đã hủy đăng nhập.', 'CANCELLED');
        const result = await rpc.request('account/login/start',{ type: device ? 'chatgptDeviceCode' : 'chatgpt' },40000);
        loginId = result.loginId; this.login.loginId = loginId;
        if (cancelled) throw new UserError('Đã hủy đăng nhập.', 'CANCELLED');
        if (device) { onDevice({ userCode: result.userCode, verificationUrl: result.verificationUrl }); await openUrl(result.verificationUrl); }
        else await openUrl(result.authUrl);
        timer = setTimeout(() => rejectLogin(new UserError('Đăng nhập đã quá 5 phút. Hãy thử lại.', 'LOGIN_TIMEOUT')),5 * 60 * 1000);
        await done;
        await rpc.close(); // Credentials are complete and no longer being written.
        const bytes = await readLimited(loginAuth);
        try {
          const identity = parseAuth(bytes);
          if (expectedId && identity.identity !== this.get(expectedId).identity) throw new UserError('Bạn đã đăng nhập tài khoản khác. Hồ sơ cũ được giữ nguyên; hãy dùng Thêm tài khoản.', 'IDENTITY_MISMATCH');
          const existing = this.state.profiles.find(p => p.identity === identity.identity);
          if (existing && this.running.has(existing.id)) throw new UserError('Tài khoản này đang chạy CLI. Đóng CLI rồi dùng Khôi phục đăng nhập để lưu phiên mới.', 'PROFILE_RUNNING');
          // Browser sessions sometimes select the already-active desktop account. Keep one canonical cache.
          if ((await this.desktopIdentity())?.identity === identity.identity) {
            const canonical = await this.desktopAuth();
            try { const p = await this.capture(canonical,label); await fs.unlink(loginAuth); return p.id; } finally { canonical?.fill(0); }
          }
          const p = await this.capture(bytes,label); await fs.unlink(loginAuth); return p.id;
        } finally { bytes.fill(0); }
      } finally {
        clearTimeout(timer);
        if (!rpc.closed && loginId) await rpc.request('account/login/cancel',{ loginId },5000).catch(() => {});
        await rpc.close(); rpc.listeners.delete(listener); this.login = null;
        // If a callback finished but saving failed, retain it under private ACL for recovery.
      }
    });
  }
  cancelLogin() { this.login?.cancel(); }
  async recoverLogin() {
    return this.exclusive(async () => {
      const file = path.join(this.root,'login','auth.json'); const bytes = await readLimited(file);
      try {
        const identity = parseAuth(bytes), existing = this.state.profiles.find(p => p.identity === identity.identity);
        if (existing && this.running.has(existing.id)) throw new UserError('Đóng CLI của tài khoản này trước khi khôi phục phiên đăng nhập.', 'PROFILE_RUNNING');
        if ((await this.desktopIdentity())?.identity === identity.identity) {
          const canonical = await this.desktopAuth();
          try { const p = await this.capture(canonical); await fs.unlink(file); return p.id; } finally { canonical?.fill(0); }
        }
        const p = await this.capture(bytes); await fs.unlink(file); return p.id;
      } finally { bytes.fill(0); }
    });
  }
  async checkDesktopOffline() {
    await this.checkRecovered();
    if (this.running.size) throw new UserError('Hãy đóng các phiên CLI do PADSwitcher mở trước khi chuyển desktop.', 'PROFILE_RUNNING');
    const blocked = this.platform.blockers(await this.platform.processes());
    if (blocked.length) {
      const names = [...new Set(blocked.map(p => p.Name))].join(', ');
      throw new UserError(`Hãy thoát Codex/ChatGPT và các ứng dụng có thể dùng Codex (${names}), rồi thử lại. PADSwitcher không tự đóng tác vụ của bạn.`, 'DESKTOP_RUNNING');
    }
    await assertDirectory(this.state.settings.desktopHome);
    const config = path.join(this.state.settings.desktopHome,'config.toml');
    if (await exists(config)) {
      const topLevel = (await readLimited(config)).toString('utf8').split(/^\s*\[/m)[0];
      const mode = topLevel.match(/^\s*cli_auth_credentials_store\s*=\s*["']([^"']+)["']/m)?.[1];
      if (mode && mode !== 'file') throw new UserError('Desktop đang dùng keyring/auto/ephemeral. Bộ chuyển auth.json chỉ hỗ trợ chế độ file; giữ nguyên cấu hình hiện tại.', 'DESKTOP_AUTH_STORE');
    }
  }
  async switchDesktop(id) {
    return this.exclusive(async () => {
      const target = this.get(id); await this.checkDesktopOffline();
      if (this.recoveryPending) throw new UserError('Có lần chuyển chưa hoàn tất. Khôi phục trước khi chuyển tiếp.', 'RECOVERY_PENDING');
      const original = await this.desktopAuth(); const next = await this.loadAuth(id);
      const previousRollback = this.state.rollback;
      try {
        if (original) {
          const originalIdentity = parseAuth(original);
          if (originalIdentity.identity === target.identity) { await this.storeAuth(id,original); this.state.activeDesktopId = id; await this.save(); return; }
          await this.capture(original);
        }
        const journal = { version: 1, phase: 'prepared', rollbackId: crypto.randomUUID(), home: this.state.settings.desktopHome, targetId: id, originalHash: hash(original), targetHash: hash(next), hadAuth: Boolean(original), createdAt: new Date().toISOString() };
        if (original) await atomicWrite(this.backup(journal),await this.platform.dpapi(original));
        await atomicWrite(this.journalFile,JSON.stringify(journal));
        this.state.rollback = journal; await this.save();
        await this.checkDesktopOffline();
        const current = await this.desktopAuth();
        try { if (hash(current) !== journal.originalHash) throw new UserError('Phiên Codex vừa thay đổi. Chưa chuyển tài khoản; hãy thử lại.', 'AUTH_CHANGED'); } finally { current?.fill(0); }
        await atomicWrite(path.join(journal.home,'auth.json'),next);
        const written = await this.desktopAuth();
        try { if (hash(written) !== journal.targetHash) throw new UserError('Chưa xác minh được phiên mới. Có thể khôi phục phiên trước.', 'SWITCH_VERIFY_FAILED'); } finally { written?.fill(0); }
        this.state.activeDesktopId = id; this.state.rollback = journal; await this.save();
        await fs.unlink(this.journalFile);
        if (previousRollback) await fs.unlink(this.backup(previousRollback)).catch(() => {});
      } catch(e) { if (await exists(this.journalFile)) this.recoveryPending = true; throw e; }
      finally { original?.fill(0); next.fill(0); }
    });
  }
  async recoverJournal() {
    this.recoveryPending = false;
    if (!await exists(this.journalFile)) return;
    let journal; try { journal = JSON.parse((await readLimited(this.journalFile)).toString('utf8')); } catch { throw new UserError('Thông tin khôi phục bị lỗi. Giữ nguyên dữ liệu để kiểm tra.', 'JOURNAL_INVALID'); }
    if (journal.version !== 1 || journal.home !== this.state.settings.desktopHome || !this.state.profiles.some(p => p.id === journal.targetId)) throw new UserError('Thông tin chuyển tài khoản không khớp dữ liệu.', 'JOURNAL_INVALID');
    const current = await this.desktopAuth();
    try {
      if (hash(current) === journal.targetHash) { this.state.activeDesktopId = journal.targetId; this.state.rollback = journal; await this.save(); await fs.unlink(this.journalFile); }
      else if (hash(current) === journal.originalHash) { await fs.unlink(this.journalFile); }
      else { this.state.rollback = journal; this.recoveryPending = true; }
    } finally { current?.fill(0); }
  }
  async restoreDesktop() {
    return this.exclusive(async () => {
      await this.checkDesktopOffline();
      const recovery = this.state.rollback;
      if (!recovery || recovery.home !== this.state.settings.desktopHome) throw new UserError('Không có phiên trước để khôi phục tại thư mục này.', 'NO_ROLLBACK');
      const current = await this.desktopAuth();
      try { if (current) await this.capture(current); } finally { current?.fill(0); }
      if (recovery.hadAuth) {
        let bytes = await this.platform.dpapi(await readLimited(this.backup(recovery)),true);
        try {
          const previousIdentity = parseAuth(bytes);
          const saved = this.state.profiles.find(p => p.identity === previousIdentity.identity);
          if (saved) { const latest = await this.loadAuth(saved.id); bytes.fill(0); bytes = latest; }
          else await this.capture(bytes);
          await this.checkDesktopOffline(); await atomicWrite(path.join(recovery.home,'auth.json'),bytes);
          this.state.activeDesktopId = this.state.profiles.find(p => p.identity === parseAuth(bytes).identity)?.id || null;
        } finally { bytes.fill(0); }
      } else {
        await this.checkDesktopOffline(); const file = path.join(recovery.home,'auth.json'); if (await exists(file)) { await readLimited(file); await fs.unlink(file); } this.state.activeDesktopId = null;
      }
      this.state.rollback = null; this.recoveryPending = false; await this.save();
      if (await exists(this.journalFile)) await fs.unlink(this.journalFile);
      if (await exists(this.backup(recovery))) await fs.unlink(this.backup(recovery));
    });
  }
  async launchCli(id, resume = false) {
    return this.exclusive(async () => {
      this.get(id); await this.checkRecovered();
      if (this.running.has(id)) throw new UserError('CLI của hồ sơ này đã mở.', 'PROFILE_RUNNING');
      const current = await this.desktopIdentity();
      const desktop = current?.identity === this.get(id).identity;
      await assertDirectory(this.state.settings.workspace);
      const executable = await this.executable(); const home = desktop ? this.state.settings.desktopHome : await this.runtime(id);
      const inner = "$ErrorActionPreference='Stop'; $Host.UI.RawUI.WindowTitle='PADSwitcher — Codex'; Set-Location -LiteralPath $env:PADSWITCHER_WORKSPACE; if ($env:PADSWITCHER_RESUME -eq '1') { & $env:PADSWITCHER_CODEX --no-daemon -C $env:PADSWITCHER_WORKSPACE resume } else { & $env:PADSWITCHER_CODEX --no-daemon -C $env:PADSWITCHER_WORKSPACE }; Write-Host ''; Read-Host 'Nhan Enter de dong cua so va khoa lai phien'";
      const encoded = Buffer.from(inner,'utf16le').toString('base64');
      const outer = `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath $env:PADSWITCHER_POWERSHELL -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand','${encoded}') -PassThru -Wait; ${SEAL_SESSION}; exit $p.ExitCode`;
      const env = { ...process.env, CODEX_HOME: home, PADSWITCHER_PRIVATE_SESSION: desktop ? '0' : '1', PADSWITCHER_SESSION_IDENTITY: this.get(id).identity, PADSWITCHER_CODEX: executable, PADSWITCHER_WORKSPACE: this.state.settings.workspace, PADSWITCHER_RESUME: resume ? '1' : '0', PADSWITCHER_POWERSHELL: this.platform.powershell };
      for (const key of ['CODEX_SQLITE_HOME','CODEX_ACCESS_TOKEN','CODEX_API_KEY','OPENAI_API_KEY','ACCESS_TOKEN','OPENAI_IDENTITY_TOKEN_FILE','OPENAI_WORKSPACE_ID','OPENAI_FEDERATION_RULE_ID']) delete env[key];
      const child = spawn(this.platform.powershell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(outer,'utf16le').toString('base64')], { env, windowsHide: true, stdio:'ignore' });
      try {
        await new Promise((resolve,reject) => { child.once('spawn',resolve); child.once('error',reject); });
        this.running.set(id,{ pid: child.pid, child, desktop });
        child.once('close',() => { this.finishCli(id).catch(e => { this.get(id).lastError = publicError(e).message; this.changed(); }); });
        await atomicWrite(path.join(this.home(id),'runtime.json'),JSON.stringify({ pid: child.pid, desktop, createdAt: new Date().toISOString() }));
        return child.pid;
      } catch(e) { if (!child.pid && !desktop) await this.seal(id); throw e; }
    });
  }
  async finishCli(id) {
    // A quota read may still be using the same home. Wait for that operation to close first.
    while (this.busy) await new Promise(resolve => setTimeout(resolve,100));
    return this.exclusive(async () => {
      if (this.running.get(id)?.desktop) { const bytes = await this.desktopAuth(); if (bytes) { try { await this.storeAuth(id,bytes); } finally { bytes.fill(0); } } }
      else await this.seal(id);
      await fs.unlink(path.join(this.home(id),'runtime.json')).catch(() => {}); this.running.delete(id);
    });
  }
  async edit(id, label, notes) {
    return this.exclusive(async () => { const p = this.get(id); p.label = cleanText(label,80); if (!p.label) throw new UserError('Tên hồ sơ không được để trống.', 'INVALID_LABEL'); p.notes = cleanText(notes,500); await this.save(); });
  }
  async remove(id) {
    return this.exclusive(async () => {
      const p = this.get(id); await this.checkRecovered();
      if(this.gateway?.isUsing?.(id)||this.gateway?.profileId===id||this.gateway?.pendingId===id||this.gateway?.router?.isUsing(id))throw new UserError('Hãy chọn tài khoản khác trong gateway trước khi xóa.', 'PROFILE_ACTIVE');
      if (this.running.has(id)) throw new UserError('Hãy đóng CLI trước khi xóa hồ sơ.', 'PROFILE_RUNNING');
      if (this.state.activeDesktopId === id || (await this.desktopIdentity())?.identity === p.identity) throw new UserError('Đây là tài khoản desktop hiện tại. Hãy chuyển sang hồ sơ khác trước khi xóa khỏi danh sách.', 'PROFILE_ACTIVE');
      const home = this.home(id); await assertDirectory(home); await this.seal(id);
      await atomicWrite(path.join(home,'profile.json'),JSON.stringify(p,null,2));
      // Move to a private trash folder first so failures never destroy the only usable vault.
      const trash = path.join(this.root,'trash'); await fs.mkdir(trash,{recursive:true}); await assertDirectory(trash);
      const destination = path.join(trash,id); if (await exists(destination)) throw new UserError('Có hồ sơ cùng mã trong thùng rác.', 'TRASH_CONFLICT');
      await fs.rename(home,destination);
      this.state.profiles = this.state.profiles.filter(p => p.id !== id);
      const oldAuto=this.state.autoSwitch,oldCooldown=this.state.quotaCooldowns,oldRoutes=this.state.clientRoutes;
      const order=oldAuto.order.filter(x=>x!==id);this.state.autoSwitch={enabled:oldAuto.enabled&&order.length>=2,order};
      this.state.quotaCooldowns={...oldCooldown};delete this.state.quotaCooldowns[id];this.gateway?.recovery.cancel();
      this.state.clientRoutes=Object.fromEntries(SCOPES.map(k=>{const r=oldRoutes[k],order=r.autoSwitch.order.filter(x=>x!==id);return [k,{...r,...(r.profileId===id?{mode:'shared',profileId:null}:{}),autoSwitch:{enabled:r.autoSwitch.enabled&&order.length>=2,order}}];}));
      try { await this.save(); } catch(e) { this.state.autoSwitch=oldAuto;this.state.quotaCooldowns=oldCooldown;this.state.clientRoutes=oldRoutes;this.state.profiles.push(p); await fs.rename(destination,home); throw e; }
      // Deletion never touches remote accounts; encrypted local vault is retained in trash.
    });
  }
  async listTrash() {
    const trash = path.join(this.root,'trash');
    if (!await exists(trash)) return [];
    await assertDirectory(trash);
    const entries = await fs.readdir(trash,{withFileTypes:true}); const result = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        const directory = profilePath(trash,entry.name); await assertDirectory(directory);
        const p = JSON.parse((await readLimited(path.join(directory,'profile.json'))).toString('utf8'));
        if (p.id === entry.name && typeof p.label === 'string') result.push({id:p.id,label:p.label});
      } catch {} // An incomplete entry is preserved, never deleted.
    }
    return result;
  }
  async restoreProfile(id) {
    return this.exclusive(async () => {
      const source = profilePath(path.join(this.root,'trash'),id); await assertDirectory(source);
      const p = JSON.parse((await readLimited(path.join(source,'profile.json'))).toString('utf8'));
      if (p.id !== id || typeof p.label !== 'string' || !/^[a-f0-9]{64}$/.test(p.identity)) throw new UserError('Thông tin hồ sơ đã xóa không hợp lệ.', 'TRASH_INVALID');
      if (this.state.profiles.some(x => x.id === id || x.identity === p.identity)) throw new UserError('Tài khoản này đã có trong danh sách.', 'PROFILE_EXISTS');
      const bytes = await this.platform.dpapi(await readLimited(path.join(source,'session.dpapi')),true);
      try { if (parseAuth(bytes).identity !== p.identity) throw new UserError('Phiên không khớp hồ sơ đã xóa.', 'IDENTITY_MISMATCH'); } finally { bytes.fill(0); }
      const home = this.home(id); if (await exists(home)) throw new UserError('Thư mục hồ sơ đã tồn tại.', 'PROFILE_EXISTS');
      await fs.rename(source,home); this.state.profiles.push(p);
      try { await this.save(); } catch(e) { this.state.profiles = this.state.profiles.filter(x => x.id !== id); await fs.rename(home,source); throw e; }
      await this.syncDesktop(); return id;
    });
  }
  async settings(input) {
    return this.exclusive(async () => {
      if(this.gateway&&!['stopped','error'].includes(this.gateway.status))throw new UserError('Dừng gateway trước khi đổi đường dẫn.', 'GATEWAY_RUNNING');
      if (!input || typeof input !== 'object') throw new UserError('Cài đặt không hợp lệ.', 'INVALID_SETTINGS');
      const next = { ...this.state.settings };
      for (const field of ['codexPath','workspace','desktopHome']) if (input[field] !== undefined) { if (typeof input[field] !== 'string' || input[field].length > 2048) throw new UserError('Đường dẫn không hợp lệ.', 'INVALID_SETTINGS'); next[field] = input[field]; }
      if (next.codexPath) await this.platform.findCodex(next.codexPath);
      await assertDirectory(next.workspace); await assertDirectory(next.desktopHome);
      if (next.desktopHome !== this.state.settings.desktopHome && (this.state.rollback || this.recoveryPending)) throw new UserError('Khôi phục lần chuyển gần nhất trước khi đổi thư mục desktop.', 'ROLLBACK_EXISTS');
      if (next.desktopHome !== this.state.settings.desktopHome) this.state.activeDesktopId = null;
      if (input.autoRefresh !== undefined) { if (typeof input.autoRefresh !== 'boolean') throw new UserError('Cài đặt không hợp lệ.', 'INVALID_SETTINGS'); next.autoRefresh = input.autoRefresh; }
      this.state.settings = next; await this.save();
    });
  }
  async autoSwitchSettings(input){
    return this.exclusive(async()=>{
      if(!input||typeof input.enabled!=='boolean'||!Array.isArray(input.order)||input.order.length>200||new Set(input.order).size!==input.order.length||input.order.some(id=>typeof id!=='string'||!this.state.profiles.some(p=>p.id===id))||(input.enabled&&input.order.length<2))throw new UserError('Chọn ít nhất hai tài khoản khác nhau và thứ tự dự phòng hợp lệ.', 'INVALID_SETTINGS');
      const requested=input.scope||'shared';
      if(requested!=='shared'&&!SCOPES.includes(requested))throw new UserError('Kết nối không hợp lệ.', 'INVALID_SETTINGS');
      if(this.gateway?.flight)throw new UserError('Chờ thay đổi chế độ kết nối hoàn tất.', 'BUSY');
      const scope=requested!=='shared'&&this.state.clientRoutes[requested].mode==='private'?requested:'shared';
      const target=scope==='shared'?this.state:this.state.clientRoutes[scope];
      (this.gateway?.route?.(scope)||this.gateway)?.recovery.cancel('Đã cập nhật cấu hình tự đổi; các lượt tiếp tục đang chờ đã được hủy.');
      const old=target.autoSwitch;target.autoSwitch={enabled:input.enabled,order:[...input.order]};
      try{await this.save();}catch(e){target.autoSwitch=old;throw e;}
    });
  }
  async diagnostics() {
    const executable = await this.executable(); const version = await this.platform.run(executable,['--version']);
    const blocked = this.platform.blockers(await this.platform.processes());
    return { codex: executable, version: /^codex-cli [\w.+-]+$/.test(version) ? version : 'Codex CLI', blockers: [...new Set(blocked.map(p => p.Name))], storage: this.root, loginRecovery: await exists(path.join(this.root,'login','auth.json')) };
  }
  async close() { this.cancelLogin(); }
}
function cleanText(value,max) { if (typeof value !== 'string') return ''; return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').trim().slice(0,max); }
function hash(bytes) { return bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : null; }
module.exports = { ProfileService, hash, cleanText };
