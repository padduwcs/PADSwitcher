'use strict';
// Run the existing native quota/cache tests unchanged in both Web states.
// All upstreams are synthetic loopback servers; no real account or model calls.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const state of ['disabled','enabled']){
  console.log('Native quota/cache regression with GPT Web '+state+':');
  const result=spawnSync(process.execPath,['--test','test/model-router.test.cjs','test/model-usage.test.cjs'],{
    cwd:path.resolve(__dirname,'..'),env:{...process.env,PAD_TEST_WEB_BRANCH:state},stdio:'inherit',windowsHide:true,
  });
  if(result.error||result.status!==0){process.exitCode=result.status||1;break;}
}
