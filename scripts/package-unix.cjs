'use strict';
const {build,Platform}=require('electron-builder');
if(!['linux','darwin'].includes(process.platform))throw Error('This branch only packages Linux/macOS. Build inside Ubuntu/WSL or a macOS runner.');
const dir=process.argv.includes('--dir');
const config={electronFuses:{...require('../package.json').build.electronFuses,enableEmbeddedAsarIntegrityValidation:process.platform==='darwin'}};
if(process.platform==='darwin'&&process.env.PADSWITCHER_MAC_IDENTITY)config.mac={identity:process.env.PADSWITCHER_MAC_IDENTITY,hardenedRuntime:true};
build({targets:(process.platform==='darwin'?Platform.MAC:Platform.LINUX).createTarget(dir?['dir']:undefined),config,publish:'never'}).catch(error=>{console.error(error.message);process.exitCode=1;});
