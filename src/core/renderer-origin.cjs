'use strict';
const fs=require('node:fs'),{pathToFileURL,fileURLToPath}=require('node:url');
// Portable extraction can expose the same file through Windows short and full
// paths. Compare canonical file identity; never accept a directory/prefix match.
function rendererOrigin(file,realpath=fs.realpathSync){
  const canonical=realpath(file),url=pathToFileURL(file).href;
  return {url,accept(value){
    try{const parsed=new URL(value);if(parsed.protocol!=='file:'||parsed.search||parsed.hash)return false;return realpath(fileURLToPath(parsed))===canonical;}catch{return false;}
  }};
}
module.exports={rendererOrigin};
