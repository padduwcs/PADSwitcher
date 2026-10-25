'use strict';
const {spawn} = require('node:child_process');
if(process.platform==='win32'&&process.argv[2]==='.')throw Error('This branch runs on Linux/macOS. Use Ubuntu/WSL; the Windows installation is kept separate.');
const env = require('./desktop-env.cjs').desktopEnvironment(); delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const child = spawn(require('electron'),process.argv.slice(2),{env,stdio:'inherit',windowsHide:true});
child.on('error',() => { console.error('Cannot launch Electron. Run npm ci first.');process.exitCode=1; });
child.on('close',code => { process.exitCode=code ?? 1; });
