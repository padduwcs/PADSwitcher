'use strict';
const {spawn}=require('node:child_process');
const [helper,executable]=process.argv.slice(2);
const child=spawn(helper,['--host',String(process.pid),executable,'app-server','--listen','ws://127.0.0.1:0','-c','cli_auth_credentials_store="ephemeral"'],{env:process.env,windowsHide:true,stdio:'ignore'});
child.once('spawn',()=>process.send({pid:child.pid}));
child.once('error',()=>process.exit(1));
