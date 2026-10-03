'use strict';
// Package the supplied artwork at Windows icon sizes; do not redraw the logo.
// Run with: node scripts/run-electron.cjs scripts/create-icon.cjs
const {app,nativeImage} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
try {
  const root = path.resolve(__dirname,'../src/assets');
  const source = nativeImage.createFromPath(path.join(root,'padswitcher-emblem.png'));
  if (source.isEmpty()) throw Error('Missing symbol artwork.');
  const dimensions = source.getSize();
  if (dimensions.width !== dimensions.height) throw Error('The symbol must be square.');
  const sizes = [16,24,32,48,64,128,256];
  const frames = sizes.map(size => source.resize({width:size,height:size,quality:'best'}).toPNG());
  const header = Buffer.alloc(6+16*sizes.length);
  header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4);
  let offset = header.length;
  for (let i=0;i<sizes.length;i++) {
    const entry = 6+16*i;
    header[entry] = sizes[i]===256 ? 0 : sizes[i]; header[entry+1] = header[entry];
    header.writeUInt16LE(1,entry+4); header.writeUInt16LE(32,entry+6);
    header.writeUInt32LE(frames[i].length,entry+8); header.writeUInt32LE(offset,entry+12);
    offset += frames[i].length;
  }
  fs.writeFileSync(path.join(root,'padswitcher.ico'),Buffer.concat([header,...frames]));
  console.log('Windows icon packaged from supplied symbol: 16, 24, 32, 48, 64, 128, 256 px.');
  app.exit(0);
} catch {
  console.error('Cannot package the Windows icon. Check the source artwork.'); app.exit(1);
}
