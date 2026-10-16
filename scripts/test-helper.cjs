'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
if(process.platform==='win32')throw Error('Run native Unix helper tests in Ubuntu/WSL or macOS.');
const result=spawnSync('go',['test','./...'],{cwd:path.resolve(__dirname,'../src/helper/unix'),stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
