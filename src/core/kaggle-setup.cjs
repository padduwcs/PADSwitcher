'use strict';
const path=require('node:path');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function installCommand({root,python,custom}){
  const venv=path.join(root,'venv'),target=path.join(venv,'Scripts','python.exe');
  const install=" -m pip install 'kaggle>=2.2.4,<3' 'kagglesdk>=0.1.37,<1'";
  if(custom)return '& '+quote(custom)+install;
  if(python&&path.resolve(python).toLowerCase()===path.resolve(target).toLowerCase())return '& '+quote(target)+install;
  const base=python?'& '+quote(python):'py -3';
  return "$ErrorActionPreference='Stop'; "+base+' -m venv '+quote(venv)+"; if ($LASTEXITCODE -ne 0) { throw 'Could not create the Kaggle environment.' }; & "+quote(target)+install;
}
module.exports={installCommand};
