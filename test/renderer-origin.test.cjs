'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {rendererOrigin}=require('../src/core/renderer-origin.cjs');
test('renderer origin accepts only the exact canonical file across portable short/full paths',()=>{
  const full=path.resolve('artifacts/full/renderer/index.html'),short=path.resolve('artifacts/SHORT~1/renderer/index.html'),other=path.resolve('artifacts/full/renderer/other.html');
  const real=file=>file===short||file===full?full:file;
  const origin=rendererOrigin(short,real);assert(origin.accept(pathToFileURL(short).href));assert(origin.accept(pathToFileURL(full).href));assert(!origin.accept(pathToFileURL(other).href));
});
test('renderer origin rejects network URLs, fragments, queries and inaccessible files',()=>{
  const file=path.resolve('artifacts/renderer/index.html'),url=pathToFileURL(file).href,origin=rendererOrigin(file,p=>{if(p!==file)throw Error('Missing');return file;});
  for(const invalid of ['https://example.test/index.html','data:text/html,test',url+'?demo=1',url+'#other',pathToFileURL(file+'.missing').href,'not a URL'])assert(!origin.accept(invalid));
  assert(origin.accept(url));
});
