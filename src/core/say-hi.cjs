'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { UserError, publicError } = require('./errors.cjs');
const { normalizeLimits } = require('./auth.cjs');
const { normalizeResets } = require('./resets.cjs');
const { assertDirectory, atomicWrite } = require('./files.cjs');

const PROMPT = 'Say hi. Reply only Hi. Do not use any tools.';
const INSTRUCTIONS = 'You are a greeting assistant. Reply only Hi. Do not use tools or inspect files.';
const THREAD_CONFIG = {
  'features.shell_tool': false, 'features.unified_exec': false,
  'features.apply_patch_freeform': false, 'features.code_mode': false,
  'features.code_mode_host': false, 'features.multi_agent': false,
  'features.apps': false, 'features.plugins': false, web_search: 'disabled',
  project_doc_max_bytes: 0, mcp_servers: {}
};
const cancelled = () => new UserError('Đã dừng Say hi.', 'CANCELLED');
const uncertain = () => new UserError('Chưa xác định lời chào đã hoàn tất. Làm mới quota trước khi gửi lại.', 'SAY_HI_UNCERTAIN');

async function available(service, signal, operation) {
  const until = Date.now() + 30000;
  while (service.busy) {
    if (signal.aborted) throw cancelled();
    if (Date.now() >= until) throw new UserError('Một thao tác khác đang chạy. Hãy chờ hoàn tất.', 'BUSY');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (signal.aborted) throw cancelled();
  return operation();
}

async function selectModel(rpc) {
  let cursor;
  const models = [];
  for (let page = 0; page < 10; page++) {
    const result = await rpc.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? {cursor} : {}) });
    models.push(...(result.data || []).filter(m => !m.hidden && typeof m.model === 'string' && (!m.inputModalities || m.inputModalities.includes('text'))));
    const preferred = models.find(m => m.isDefault);
    if (preferred || !result.nextCursor) {
      const model = preferred || models[0];
      if (!model) throw new UserError('Codex chưa cung cấp model cho lời chào.', 'SAY_HI_MODEL');
      const supported = (model.supportedReasoningEfforts || []).map(e => e.reasoningEffort);
      const effort = ['none','minimal','low','medium','high','xhigh','max'].find(e => supported.includes(e));
      return { model: model.model, ...(effort ? {effort} : {}) };
    }
    cursor = result.nextCursor;
  }
  throw new UserError('Codex chưa cung cấp model cho lời chào.', 'SAY_HI_MODEL');
}

// Subscribe before turn/start: a fast backend can finish before acknowledging it.
async function greet(rpc, threadId, selection, signal, onSubmitted, timeout = 60000) {
  let resolveDone, rejectDone, timer, turnId, submitted = false;
  const done = new Promise((resolve,reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {});
  const listener = (method,params) => {
    if (params.threadId !== threadId) return;
    if (method === 'turn/started') turnId = params.turn?.id;
    if (method === 'turn/completed') {
      const turn = params.turn;
      if (turn?.status === 'completed') resolveDone(turn);
      else if (turn?.error?.codexErrorInfo === 'usageLimitExceeded') rejectDone(new UserError('Tài khoản đã hết quota. Chưa gửi được lời chào.', 'SAY_HI_QUOTA'));
      else rejectDone(new UserError('Codex chưa hoàn tất lời chào. Làm mới quota trước khi gửi lại.', 'SAY_HI_FAILED'));
    }
  };
  const onClose = () => rejectDone(submitted ? uncertain() : cancelled());
  const onAbort = () => rejectDone(submitted ? uncertain() : cancelled());
  rpc.listeners.add(listener);
  rpc.child?.once('close', onClose);
  signal.addEventListener('abort', onAbort, {once:true});
  try {
    if (signal.aborted) throw cancelled();
    timer = setTimeout(() => rejectDone(uncertain()), timeout);
    submitted = true; onSubmitted();
    const startRequest = rpc.request('turn/start', {threadId, ...selection, serviceTierForTurn:'default', input:[{type:'text',text:PROMPT}]});
    const first = await Promise.race([startRequest.then(started=>({started})),done.then(turn=>({turn}))]);
    if (first.turn) return first.turn;
    const started = first.started;
    if (!started.turn?.id) throw uncertain();
    turnId = started.turn.id;
    if (started.turn.status === 'completed') resolveDone(started.turn);
    if (signal.aborted) throw uncertain();
    return await done;
  } catch (error) {
    // Never repeat an ambiguous model request or send it to a backup account.
    if (submitted && turnId) await rpc.request('turn/interrupt', {threadId,turnId}, 3000).catch(() => {});
    if (['RPC_TIMEOUT','RPC_CLOSED','CODEX_RPC_ERROR'].includes(error.code)) throw uncertain();
    throw error;
  } finally {
    clearTimeout(timer); rpc.listeners.delete(listener);
    rpc.child?.removeListener('close', onClose); signal.removeEventListener('abort', onAbort);
  }
}

class SayHiService {
  constructor(service, options = {}) { this.service = service; this.options = options; this.job = null; this.flight = null; }
  view() { return this.job ? structuredClone({...this.job,active:!!this.flight,activeProfileId:this.activeId||null}) : {active:false,rows:[]}; }
  isUsing(id) { return !!this.flight && (this.activeId === id || this.job.rows.some(r => r.id === id && r.status === 'queued')); }
  start(id = null) {
    if (this.flight) throw new UserError('Say hi đang chạy. Hãy chờ hoàn tất.', 'SAY_HI_BUSY');
    if (this.closed) throw new UserError('Đã dừng Say hi.', 'CANCELLED');
    if (this.service.busy) throw new UserError('Một thao tác khác đang chạy. Hãy chờ hoàn tất.', 'BUSY');
    const profiles = id === null ? [...this.service.state.profiles] : [this.service.get(id)];
    if (!profiles.length) throw new UserError('Thêm tài khoản trước khi Say hi.', 'SAY_HI_EMPTY');
    this.abort = new AbortController();
    this.job = {stopping:false,startedAt:new Date().toISOString(),finishedAt:null,rows:profiles.map(p => ({id:p.id,label:p.label,status:'queued',submitted:false,quotaRefreshed:false}))};
    this.flight = Promise.resolve().then(() => this.run()).finally(() => {
      this.job.finishedAt = new Date().toISOString(); this.flight = null; this.service.changed();
    });
    this.service.changed();
    return this.view();
  }
  stop() { if (this.flight) { this.job.stopping = true; this.service.changed(); } }
  dismiss() { if (!this.flight) { this.job = null; this.service.changed(); } }
  async shutdown() { this.closed = true; this.stop(); this.abort?.abort(); await this.activeClose?.(); await this.flight; }
  async run() {
    for (const row of this.job.rows) {
      if (this.job.stopping) row.status = 'cancelled';
      else {
        this.activeId = row.id;
        row.status = 'sending'; this.service.changed();
        try { await this.one(row); }
        catch (error) { if (row.status !== 'sent') row.status = error.code === 'CANCELLED' ? 'cancelled' : error.code === 'SAY_HI_UNCERTAIN' ? 'uncertain' : 'failed'; row.error = publicError(error); }
        finally { this.activeId = null; }
      }
      this.service.changed();
    }
  }
  async one(row) {
    const service = this.service, signal = this.abort.signal, p = service.get(row.id);
    if (p.status === 'reauth') { row.status = 'skipped'; row.error = {code:'AUTH_INVALID',message:'Phiên đã hết hạn. Hãy đăng nhập lại tài khoản này.'}; return; }
    const bundle = await available(service, signal, () => service.accessBundle(row.id));
    let home, rpc;
    try {
      home = await fs.mkdtemp(path.join(service.root,'sayhi-rpc-'));
      await service.platform.protectDirectory(home);
      await atomicWrite(path.join(home,'config.toml'),'cli_auth_credentials_store = "ephemeral"\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n');
      rpc = service.rpcFactory(await service.executable(),home,{ephemeralStore:true,isolated:true});
      let closeFlight;
      const closeRpc = () => closeFlight || (closeFlight = rpc.close());
      this.activeClose = closeRpc;
      if (signal.aborted) throw cancelled();
      await rpc.initialize({experimentalApi:true});
      if (signal.aborted) throw cancelled();
      await rpc.request('account/login/start',{type:'chatgptAuthTokens',...bundle});
      const before = await rpc.request('account/rateLimits/read',{});
      const limits = normalizeLimits(before);
      const exhausted = limits.filter(b => b.id === 'codex').flatMap(b => b.windows).some(w => w.usedPercent >= 100 && (!w.resetsAt || w.resetsAt * 1000 > Date.now()));
      if (exhausted) { row.status = 'skipped'; row.error = {code:'SAY_HI_QUOTA',message:'Tài khoản đã hết quota. Chưa gửi được lời chào.'}; return; }
      const selection = await selectModel(rpc); row.model = selection.model;
      if (signal.aborted) throw cancelled();
      const thread = await rpc.request('thread/start',{
        model:selection.model,modelProvider:'openai',serviceTier:'default',cwd:home,
        ephemeral:true,environments:[],runtimeWorkspaceRoots:[home],sandbox:'read-only',approvalPolicy:'never',
        baseInstructions:INSTRUCTIONS,developerInstructions:INSTRUCTIONS,config:THREAD_CONFIG
      });
      if (!thread.thread?.id) throw new UserError('Không tạo được cuộc trò chuyện cho lời chào.', 'SAY_HI_FAILED');
      await greet(rpc,thread.thread.id,selection,signal,() => {row.submitted = true; this.service.changed();},this.options.turnTimeout);
      row.status = 'sent'; row.sentAt = new Date().toISOString();
      try {
        const readAt = Date.now(), result = await rpc.request('account/rateLimits/read',{});
        await available(service,signal,() => service.exclusive(async () => {
          const target = service.get(row.id);
          if (!(Date.parse(target.quotaAt) > readAt)) {
            target.quota = normalizeLimits(result); target.resetCredits = normalizeResets(result);
            target.quotaAt = new Date().toISOString(); target.status = 'ready'; target.lastError = null;
            const windows = target.quota.filter(b => b.id === 'codex').flatMap(b => b.windows);
            if (windows.length && windows.every(w => w.usedPercent < 100)) delete service.state.quotaCooldowns[row.id];
            await service.save();
          }
        }));
        row.quotaRefreshed = true;
      } catch { row.error = {code:'SAY_HI_REFRESH',message:'Đã say hi, chưa cập nhật được giờ reset. Hãy làm mới quota.'}; }
    } finally {
      bundle.accessToken = null;
      // Only remove the dedicated workspace after its backend has stopped.
      try { await this.activeClose?.(); } finally { this.activeClose = null; }
      if (home) {
        if (path.dirname(home) !== service.root || !path.basename(home).startsWith('sayhi-rpc-')) throw new Error('Unsafe Say hi cleanup');
        // Windows can keep a stopped backend's folder locked briefly (EBUSY/EPERM).
        await assertDirectory(home); await fs.rm(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});
      }
    }
  }
}
module.exports = {SayHiService,selectModel,greet,PROMPT,THREAD_CONFIG};
