'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let failures = 0;
function visit(folder) { for (const file of fs.readdirSync(folder,{withFileTypes:true})) { const target = path.join(folder,file.name); if (file.isDirectory()) visit(target); else if (/\.(cjs|js)$/.test(file.name)) { const result = spawnSync(process.execPath,['--check',target],{encoding:'utf8'}); if (result.status !== 0) { process.stderr.write(result.stderr); failures++; } } } }
for (const folder of ['src','scripts','test']) if (fs.existsSync(folder)) visit(folder);
if (failures) process.exitCode = 1; else console.log('Syntax checks passed.');
