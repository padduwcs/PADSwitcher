'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../artifacts/kaggle-sdk-probe');
const run=(file,args)=>{const result=spawnSync(file,args,{stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);};
fs.mkdirSync(path.dirname(root),{recursive:true});
run(process.env.PADSWITCHER_TEST_PYTHON||(process.platform==='win32'?'python':'python3'),['-m','venv',root]);
const python=path.join(root,process.platform==='win32'?'Scripts/python.exe':'bin/python');
run(python,['-m','pip','install','--disable-pip-version-check','kaggle==2.2.4','kagglesdk==0.1.37']);
run(python,['-I',path.resolve(__dirname,'../test/kaggle-reader-test.py')]);
