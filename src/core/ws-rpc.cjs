'use strict';
const {EventEmitter} = require('node:events');
const WebSocket = require('ws');
const {UserError} = require('./errors.cjs');
const MAX_FRAME = 32 * 1024 * 1024;
function connect(url, token, timeout = 1500) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'ws:' || parsed.hostname !== '127.0.0.1') throw new UserError('Chỉ kết nối gateway trên máy này.', 'GATEWAY_ADDRESS');
  return new Promise((resolve,reject) => {
    const socket = new WebSocket(url,{headers:{Authorization:`Bearer ${token}`},handshakeTimeout:timeout,maxPayload:MAX_FRAME,perMessageDeflate:false,followRedirects:false});
    const fail = () => { socket.terminate(); reject(new UserError('Chưa kết nối được Codex App Server.', 'GATEWAY_CONNECT')); };
    socket.once('error',fail);
    socket.once('open',() => { socket.removeListener('error',fail); socket.on('error',() => {}); resolve(socket); });
  });
}
class WsRpc extends EventEmitter {
  constructor(socket) {
    super(); this.socket=socket; this.sequence=0; this.pending=new Map(); this.serverRequest=null;
    socket.on('message',data => this.receive(data));
    socket.on('close',() => { for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new UserError('Gateway đã ngắt kết nối.', 'GATEWAY_CLOSED'));}this.pending.clear();this.emit('closed'); });
  }
  send(message) { if(this.socket.readyState===WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  receive(data) {
    let message; try {message=JSON.parse(data.toString());} catch {this.socket.terminate();return;}
    if (message.id!=null && !message.method) {
      const p=this.pending.get(message.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(message.id);
      if(message.error) p.reject(new UserError('Codex chưa thực hiện được yêu cầu gateway.', 'GATEWAY_RPC')); else p.resolve(message.result);
    } else if(message.method && message.id!=null) {
      Promise.resolve().then(() => this.serverRequest ? this.serverRequest(message.method,message.params) : Promise.reject()).then(result => this.send({id:message.id,result}),() => this.send({id:message.id,error:{code:-32000,message:'PADSwitcher cannot complete this request.'}}));
    } else if(message.method) this.emit('notification',message.method,message.params||{});
  }
  request(method,params={},timeout=25000) {
    if(this.socket.readyState!==WebSocket.OPEN)return Promise.reject(new UserError('Gateway đã ngắt kết nối.', 'GATEWAY_CLOSED'));
    const id=`pad-control-${++this.sequence}`;
    return new Promise((resolve,reject) => {const timer=setTimeout(()=>{this.pending.delete(id);reject(new UserError('Codex phản hồi quá lâu.', 'GATEWAY_TIMEOUT'));},timeout);this.pending.set(id,{resolve,reject,timer});this.send({id,method,params});});
  }
  async initialize() { await this.request('initialize',{clientInfo:{name:'padswitcher',title:'PADSwitcher',version:require('../../package.json').version},capabilities:{experimentalApi:true}});this.send({method:'initialized',params:{}}); }
  close() { this.socket.terminate(); }
}
module.exports={connect,WsRpc,MAX_FRAME};
