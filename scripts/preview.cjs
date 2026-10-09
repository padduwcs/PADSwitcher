'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const mock = require('./preview-data.cjs');
const root = path.resolve(__dirname,'../src/renderer');
const allowed = new Map([['/index.html','text/html; charset=utf-8'],['/styles.css','text/css; charset=utf-8'],['/branding.css','text/css; charset=utf-8'],['/app.js','text/javascript; charset=utf-8'],['/i18n.js','text/javascript; charset=utf-8'],['/themes.css','text/css; charset=utf-8']]);
const assets = new Map([['/assets/padswitcher-symbol.png','padswitcher-symbol.png'],['/assets/padswitcher-logo.png','padswitcher-logo.png'],['/assets/padswitcher-emblem.png','padswitcher-emblem.png']]);
allowed.set('/web.js','text/javascript; charset=utf-8');
for(const file of ['BeVietnamPro-Regular.ttf','BeVietnamPro-Medium.ttf','BeVietnamPro-SemiBold.ttf'])assets.set('/assets/fonts/'+file,'fonts/'+file);
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://127.0.0.1:8866'); const file = url.pathname === '/' ? '/index.html' : url.pathname;
    if (file === '/preview.js') { res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}); res.end(mock); return; }
    if (assets.has(file)) { const bytes = await fs.readFile(path.join(root,'../assets',assets.get(file))); res.writeHead(200,{'Content-Type':file.endsWith('.ttf')?'font/ttf':'image/png','Cache-Control':'no-store'}); res.end(bytes); return; }
    if (!allowed.has(file)) { res.writeHead(404); res.end(); return; }
    let content = await fs.readFile(path.join(root,file.slice(1)),'utf8');
    if (file === '/index.html') content = content.replace('<script src="app.js" defer></script>','<script src="preview.js" defer></script><script src="app.js" defer></script>');
    res.writeHead(200,{'Content-Type':allowed.get(file),'Cache-Control':'no-store'}); res.end(content);
  } catch { res.writeHead(500); res.end('Preview error'); }
});
server.listen(8866,'127.0.0.1',() => console.log('UI preview (sample data only): http://127.0.0.1:8866'));
