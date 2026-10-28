'use strict';
// Process-local numeric diagnostics only: no prompt, response text, credentials or
// account/thread identifiers. Observation never changes the forwarded stream.
const MAX_USAGE_EVENT=1024*1024,MAX_EVENT=64*1024*1024;
function tokens(value){return Number.isSafeInteger(value)&&value>=0?value:0;}
function createUsage(){return {requests:0,attempts:0,quotaRetries:0,authRefreshes:0,blockedReplays:0,completed:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,lastModel:null,lastEffort:null};}
function observeUsage(usage,onTerminal=()=>{}){
  const decoder=new TextDecoder();let buffer='',discard=false,counted=false,failed=false;
  const frame=frame=>{
      if(discard||frame.length>MAX_EVENT){discard=false;return;}
      if(failed)return;
      if(!frame.includes('response.completed')&&!frame.includes('response.failed')&&!frame.includes('"error"'))return;
      try{
        const raw=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        const value=JSON.parse(raw);
        if(['response.failed','error'].includes(value.type)){if(!counted){failed=true;onTerminal(false);}return;}
        if(value.type!=='response.completed')return;
        onTerminal(true);if(counted)return;
        counted=true;usage.completed++;
        // Parse terminal state independently of the smaller numeric telemetry
        // limit. Native accepts data-only SSE and large completion payloads.
        if(frame.length>MAX_USAGE_EVENT)return;
        const v=value.response?.usage;
        if(v){const input=tokens(v.input_tokens);usage.inputTokens+=input;usage.cachedInputTokens+=Math.min(input,tokens(v.input_tokens_details?.cached_tokens));usage.outputTokens+=tokens(v.output_tokens);}
      }catch{} // Diagnostics must not cause a transport error or native replay.
  };
  const observe=bytes=>{
    buffer+=decoder.decode(bytes,{stream:true});let separator;
    while((separator=/\r?\n\r?\n/.exec(buffer))!==null){
      const value=buffer.slice(0,separator.index);buffer=buffer.slice(separator.index+separator[0].length);frame(value);
    }
    if(buffer.length>MAX_EVENT){buffer='';discard=true;}
  };
  return observe;
}
module.exports={createUsage,observeUsage};
