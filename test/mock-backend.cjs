'use strict';
const {WebSocketServer}=require('ws');
const fs=require('node:fs');
const args=process.argv.slice(2),url=new URL(args[args.indexOf('--listen')+1]);
const token=fs.readFileSync(args[args.indexOf('--ws-token-file')+1],'utf8');
if(!args.includes('cli_auth_credentials_store="ephemeral"'))process.exit(2);
const wss=new WebSocketServer({host:'127.0.0.1',port:Number(url.port),verifyClient:info=>info.req.headers.authorization==='Bearer '+token});
let account=null,nextTurn=0;const turns=new Map(),refresh=new Map();
function send(s,m){if(s.readyState===1)s.send(JSON.stringify(m));}
function notify(method,params){for(const s of wss.clients)send(s,{method,params});}
wss.on('connection',socket=>socket.on('message',data=>{
  const m=JSON.parse(data);if(!m.method){const entry=refresh.get(m.id);if(entry){refresh.delete(m.id);send(socket,{id:entry,result:{ok:m.id.startsWith('approval-')?m.result?.decision==='accept':!!m.result?.accessToken}});}return;}
  if(m.id==null)return;
  let result={};
  switch(m.method){
    case 'initialize':result={userAgent:'fixture'};break;
    case 'account/login/start':account=m.params;break;
    case 'account/read':result={account:{type:'chatgpt',email:account?.chatgptAccountId+'@example.test'}};break;
    case 'thread/start':result={thread:{id:'thread-fixture'}};break;
    case 'turn/start':case 'review/start':{
      if(m.params.input?.[0]?.text==='reject'){send(socket,{id:m.id,error:{code:-1,message:'fixture failure'}});return;}
      const id='turn-'+(++nextTurn),threadId=m.method==='review/start'?'review-thread':m.params.threadId;
      const turn={id,status:'inProgress',items:[]};turns.set(id,{turn,threadId,params:m.params,accountId:account?.chatgptAccountId});
      send(socket,{method:'turn/started',params:{threadId,turn}});
      result={turn,...(m.method==='review/start'?{reviewThreadId:threadId}:{})};break;
    }
    case 'fixture/complete':{
      const item=turns.get(m.params.turnId);if(item){item.turn.status=m.params.failed||m.params.quota?'failed':'completed';if(m.params.quota)item.turn.error={message:'fixture quota',codexErrorInfo:'usageLimitExceeded'};if(m.params.error)item.turn.error=m.params.error;if(m.params.items)item.turn.items=m.params.items;notify('turn/completed',{threadId:item.threadId,turn:item.turn});if(m.params.duplicate)notify('turn/completed',{threadId:item.threadId,turn:item.turn});}break;
    }
    case 'turn/interrupt':{const item=turns.get(m.params.turnId);if(item){item.turn.status='interrupted';notify('turn/completed',{threadId:item.threadId,turn:item.turn});}break;}
    case 'thread/loaded/list':result={data:[...new Set([...turns.values()].map(t=>t.threadId))],nextCursor:null};break;
    case 'thread/read':{const items=[...turns.values()].filter(t=>t.threadId===m.params.threadId);result={thread:{status:{type:items.some(t=>t.turn.status==='inProgress')?'active':items.at(-1)?.turn.status==='failed'?'systemError':'idle'},turns:items.map(t=>t.turn)}};break;}
    case 'fixture/startBackground':{const id='turn-'+(++nextTurn);turns.set(id,{turn:{id,status:'inProgress'},threadId:'native-background'});result={turnId:id};break;}
    case 'fixture/turns':result={turns:[...turns.values()]};break;
    case 'fixture/refresh':{const id='refresh-'+m.id;refresh.set(id,m.id);send(socket,{id,method:'account/chatgptAuthTokens/refresh',params:{previousAccountId:account.chatgptAccountId}});return;}
    case 'fixture/approval':{const id='approval-'+m.id;refresh.set(id,m.id);send(socket,{id,method:'item/commandExecution/requestApproval',params:{command:'Get-Content MARKER.txt'}});return;}
  }
  send(socket,{id:m.id,result});
}));
