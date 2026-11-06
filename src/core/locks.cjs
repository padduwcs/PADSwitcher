'use strict';
// Operations on one account run in order; different accounts run side by side. A null
// key covers the whole store. Callers wait in a fair queue, so one slow operation
// never fails or holds up unrelated work.
const conflict=(a,b)=>a===null||b===null||a===b;
class KeyedLock{
  constructor(){this.running=[];this.waiting=[];this.settled=[];}
  get active(){return this.running.length;}
  get whole(){return this.running.includes(null);}
  pump(){
    for(let i=0;i<this.waiting.length;){
      const entry=this.waiting[i];
      if(this.running.some(key=>conflict(key,entry.key))||this.waiting.slice(0,i).some(earlier=>conflict(earlier.key,entry.key))){i++;continue;}
      this.waiting.splice(i,1);this.running.push(entry.key);entry.start();
    }
    if(!this.running.length&&!this.waiting.length)for(const done of this.settled.splice(0))done();
  }
  async run(key,operation){
    await new Promise(start=>{this.waiting.push({key,start});this.pump();});
    try{return await operation();}finally{this.running.splice(this.running.indexOf(key),1);this.pump();}
  }
  idle(){return this.running.length||this.waiting.length?new Promise(done=>this.settled.push(done)):Promise.resolve();}
}
module.exports={KeyedLock};
