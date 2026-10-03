'use strict';
const crypto=require('node:crypto');
const {UserError}=require('./errors.cjs');

// Only Codex's structured account-quota error qualifies. A bare HTTP 429,
// message containing "quota", transport failure, or interrupted turn does not.
function quotaError(error){return error?.codexErrorInfo==='usageLimitExceeded';}
const CONTINUE_TEXT='PADSwitcher: the previous turn stopped because the account reached its usage limit. An account with available capacity has now been selected. Continue the unfinished user request in this same conversation using the saved history and existing workspace. First inspect the previous tool results and current state. Do not replay the whole request or repeat completed file edits, commands, or external actions. Verify any ambiguous partial operation before proceeding. Preserve the user’s instructions, scope, and approval requirements. If the requested work is already complete, report its result rather than doing it again.';
const OMIT=new Set(['input','clientUserMessageId','toolOutput','turnTrigger','responsesapiClientMetadata']);
function continuation(params){
  const next={};for(const [key,value]of Object.entries(params))if(!OMIT.has(key))next[key]=value;
  return {...next,input:[{type:'text',text:CONTINUE_TEXT,text_elements:[]}],turnTrigger:'padswitcher_quota_continuation'};
}
function exhaustedSnapshot(p,now){
  if(p.status!=='ready'||!Number.isFinite(Date.parse(p.quotaAt))||now-Date.parse(p.quotaAt)>600000)return false;
  return (p.quota||[]).some(b=>(b.id==='codex'||b.name==='codex')&&(b.windows||[]).some(w=>w.usedPercent>=100&&(!w.resetsAt||w.resetsAt*1000>now)));
}
function terminalTools(turn){
  const tools=new Set(['commandExecution','fileChange','mcpToolCall','dynamicToolCall','collabAgentToolCall']);
  return Array.isArray(turn.items)&&turn.items.every(item=>(item.status===undefined||['completed','failed','declined'].includes(item.status))&&(!tools.has(item.type)||item.status!==undefined));
}
class Recovery {
  constructor(gateway){this.g=gateway;this.queue=[];this.epoch=0;this.flight=null;this.active=null;this.events=[];this.message=null;}
  get policy(){return this.g.service.state.autoSwitch||{enabled:false,order:[]};}
  get busy(){return !!(this.queue.length||this.active);}
  view(){return {enabled:this.policy.enabled,queued:this.queue.length,active:!!this.active,message:this.message,events:this.events.slice(-12)};}
  note(type,message,from=null,to=null){this.message=message;this.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),type,message,from,to});if(this.events.length>30)this.events.shift();this.g.changed();}
  cancel(message=null){
    this.epoch++;this.queue=[];
    if(this.active?.target===this.g.pendingId)this.g.pendingId=null;
    this.active=null;if(message)this.note('cancelled',message);
  }
  cancelThread(id){if(this.active?.threadId===id||this.queue.some(j=>j.threadId===id))this.cancel('Bạn đã thao tác trên hội thoại; tự tiếp tục đã được hủy.');}
  complete(t,turn){
    if(!this.policy.enabled||turn.status!=='failed'||!quotaError(turn.error||t.lastError)||t.method!=='turn/start'||!t.startParams||!t.client||t.auxiliary||t.noAutoRecovery)return;
    if(!t.threadId||!turn.id||t.disconnected||t.client.front.readyState!==1||t.client.back?.readyState!==1)return;
    const attempted=new Set(t.attempted||[]);attempted.add(t.profileId);
    const now=Date.now(),p=this.g.service.get(t.profileId);
    const resets=(p.quota||[]).filter(b=>b.id==='codex'||b.name==='codex').flatMap(b=>b.windows||[]).filter(w=>w.usedPercent>=100&&w.resetsAt*1000>now).map(w=>w.resetsAt*1000);
    this.g.service.state.quotaCooldowns={...this.g.service.state.quotaCooldowns,[t.profileId]:resets.length?Math.max(...resets):now+900000};
    // Do not persist prompts, native error text, tool output, or credentials.
    this.g.service.save().catch(()=>this.note('error','Không lưu được thời gian chờ quota.'));
    if(this.queue.length>=32){this.note('blocked','Có quá nhiều hội thoại chờ; hãy tiếp tục thủ công.');return;}
    this.queue.push({...t,lastError:turn.error||t.lastError,turnId:turn.id,attempted,deadline:now+120000});
    this.note('waiting','Hết quota: đang chờ các lượt khác kết thúc để đổi tài khoản.',t.profileId);
    this.tick();
  }
  valid(job,epoch){return this.epoch===epoch&&this.policy.enabled&&this.g.status==='ready'&&job.client.front.readyState===1&&job.client.back?.readyState===1&&!job.disconnected;}
  tick(){
    if(this.flight||!this.queue.length||this.g.status!=='ready')return;
    this.flight=this.run().catch(()=>this.note('error','Không tự tiếp tục được. Kiểm tra kết nối rồi nhắn tiếp trong Codex.')).finally(()=>{this.flight=null;});
  }
  async run(){
    const g=this.g,job=this.queue[0],epoch=this.epoch;
    if(!this.valid(job,epoch)){this.queue.shift();return;}
    if(Date.now()>job.deadline){this.queue.shift();this.note('blocked','Đã chờ hơn 2 phút. Hãy đổi tài khoản và tiếp tục thủ công.');return;}
    if(g.changing||g.refreshFlight||g.pendingId||g.service.busy)return;
    await g.reconcile();if(!this.valid(job,epoch)||g.turns.size)return;
    this.queue.shift();this.active=job;
    try{
      const data=await g.control.request('thread/read',{threadId:job.threadId,includeTurns:true});
      if(!this.valid(job,epoch))return;
      const thread=data.thread,latest=thread?.turns?.at(-1);
      if(!['idle','systemError'].includes(thread?.status?.type)||latest?.id!==job.turnId||latest.status!=='failed'||!quotaError(latest.error||job.lastError)||!terminalTools(latest)||job.client.approvals.size){
        this.note('blocked','Trạng thái hội thoại chưa đủ rõ để tự tiếp tục. Kiểm tra Codex rồi nhắn tiếp.');return;
      }
      const candidates=this.policy.order.filter(id=>!job.attempted.has(id)&&g.service.state.profiles.some(p=>p.id===id&&p.status!=='reauth'&&!g.service.running.has(id)&&!exhaustedSnapshot(p,Date.now()))&&(g.service.state.quotaCooldowns?.[id]||0)<=Date.now());
      let selected=false;
      for(const id of candidates){
        if(Date.now()>job.deadline){this.note('blocked','Đã chờ hơn 2 phút. Hãy tiếp tục thủ công.');return;}
        if(!this.valid(job,epoch))return;
        job.attempted.add(id);job.target=id;g.pendingId=id;
        this.note('switching','Đang tự chuyển sang tài khoản dự phòng.',job.profileId,id);
        try{await g.applyPending();}catch{if(this.valid(job,epoch))this.note('skipped','Không đăng nhập được tài khoản dự phòng; thử tài khoản tiếp theo.',job.profileId,id);}
        if(!this.valid(job,epoch))return;
        if(g.turns.size){this.queue.unshift(job);return;}
        if(g.profileId===id&&!g.pendingId){selected=true;break;}
      }
      if(!selected){this.note('exhausted','Không còn tài khoản dự phòng khả dụng. Cập nhật quota hoặc đăng nhập lại rồi tiếp tục thủ công.',job.profileId);return;}
      if(Date.now()>job.deadline){this.note('blocked','Đã chuyển tài khoản nhưng vượt thời gian chờ; hãy nhắn tiếp trong Codex.');return;}
      if(!this.valid(job,epoch))return;
      // Recheck after asynchronous login: a user/client may have changed the thread.
      const checked=await g.control.request('thread/read',{threadId:job.threadId,includeTurns:true});
      if(!this.valid(job,epoch))return;
      if(!['idle','systemError'].includes(checked.thread?.status?.type)||checked.thread?.turns?.at(-1)?.id!==job.turnId)throw new UserError('Hội thoại đã thay đổi.', 'RECOVERY_CHANGED');
      await g.startContinuation(job,continuation(job.startParams));
      if(this.epoch===epoch)this.note('continued','Đã đổi tài khoản và gửi lượt tiếp tục trong cùng hội thoại.',job.profileId,g.profileId);
    }catch(e){if(this.epoch===epoch)this.note('blocked',e.code==='RECOVERY_CHANGED'?'Hội thoại đã thay đổi; đã hủy tự tiếp tục.':'Không tự tiếp tục được. Kiểm tra Codex và nhắn tiếp trong hội thoại.');}
    finally{if(this.active===job)this.active=null;g.changed();}
  }
}
module.exports={Recovery,quotaError,continuation,terminalTools,exhaustedSnapshot,CONTINUE_TEXT};
