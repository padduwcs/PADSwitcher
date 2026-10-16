'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
(async()=>{for(const file of await fs.readdir('dist-unix')){if(!/\.(AppImage|deb|dmg|zip)$/.test(file))continue;const hash=createHash('sha256').update(await fs.readFile(path.join('dist-unix',file))).digest('hex');await fs.writeFile(path.join('dist-unix',file+'.sha256'),hash+'  '+file+'\n');}})().catch(error=>{console.error(error.message);process.exitCode=1;});
