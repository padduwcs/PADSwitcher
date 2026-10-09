'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const name of ['build-helper.cjs','build-gpt-web.cjs']){
  const r=spawnSync(process.execPath,[path.join(__dirname,name)],{stdio:'inherit',windowsHide:true});
  if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
}
