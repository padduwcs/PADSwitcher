'use strict';
// Local troubleshooting history that survives a restart. Only allow-listed scalar
// fields are stored: never prompts, responses, tokens, account/thread identifiers,
// paths or capability URLs. Logging must never affect the connection it describes.
const fs=require('node:fs/promises');
const {assertRegular}=require('./files.cjs');
const FIELDS=new Set(['scope','type','event','reason','route','attempt','code','kind','activeTurns']);
const MAX_BYTES=1024*1024,MAX_TEXT=80;
class EventLog{
  constructor(file,{maxBytes=MAX_BYTES}={}){this.file=file;this.maxBytes=maxBytes;this.size=null;this.flight=Promise.resolve();}
  write(fields){
    const entry={at:new Date().toISOString()};
    for(const [key,value]of Object.entries(fields))if(FIELDS.has(key)&&['string','number'].includes(typeof value))entry[key]=typeof value==='string'?value.slice(0,MAX_TEXT):value;
    const line=JSON.stringify(entry)+'\n';
    this.flight=this.flight.then(()=>this.append(line)).catch(()=>{this.size=null;});
    return this.flight;
  }
  async append(line){
    const bytes=Buffer.byteLength(line);
    if(this.size===null){try{await assertRegular(this.file);this.size=(await fs.stat(this.file)).size;}catch(e){if(e.code!=='ENOENT')throw e;this.size=0;}}
    if(this.size&&this.size+bytes>this.maxBytes){await fs.rename(this.file,this.file+'.1');this.size=0;}
    await fs.appendFile(this.file,line,{mode:0o600});this.size+=bytes;
  }
  flush(){return this.flight;}
}
module.exports={EventLog};
