'use strict';
// Process-local numeric diagnostics only: no prompt, response text, credentials or
// account/thread identifiers. Observation never changes the forwarded stream.
const MAX_EVENT=1024*1024;
function tokens(value){return Number.isSafeInteger(value)&&value>=0?value:0;}
function createUsage(){return {requests:0,attempts:0,quotaRetries:0,authRefreshes:0,completed:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,lastModel:null,lastEffort:null};}
function observeUsage(usage){
  const decoder=new TextDecoder();let buffer='',discard=false,counted=false;
  return bytes=>{
    buffer+=decoder.decode(bytes,{stream:true});let separator;
    while((separator=/\r?\n\r?\n/.exec(buffer))!==null){
      const frame=buffer.slice(0,separator.index);buffer=buffer.slice(separator.index+separator[0].length);
      if(discard||frame.length>MAX_EVENT){discard=false;continue;}
      if(counted||!frame.includes('response.completed'))continue;
      try{
        const raw=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        const value=JSON.parse(raw);if(value.type!=='response.completed')continue;
        const v=value.response?.usage;counted=true;usage.completed++;
        if(v){const input=tokens(v.input_tokens);usage.inputTokens+=input;usage.cachedInputTokens+=Math.min(input,tokens(v.input_tokens_details?.cached_tokens));usage.outputTokens+=tokens(v.output_tokens);}
      }catch{} // Diagnostics must not cause a transport error or native replay.
    }
    if(buffer.length>MAX_EVENT){buffer='';discard=true;}
  };
}
module.exports={createUsage,observeUsage};
