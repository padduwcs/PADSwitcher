'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {writePrivateFileAtomic} = require('./atomic-file.cjs');

// No login cookies, tunnel keys or prompts cross this control surface.
async function startPadControl({coreHome, supervisor, browserHost, runtimeHost, showWindow, quit, stateStore}) {
  const file = path.join(coreHome, 'runtime', 'pad-control.json');
  const token = crypto.randomBytes(32).toString('base64url');
  let heartbeat = Date.now(), closing = false;
  const server = http.createServer(async (req, res) => {
    const fail = (status, error) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({error})); };
    const actual = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from('Bearer ' + token);
    if (req.headers.origin || req.headers['sec-fetch-site'] || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return fail(401, 'unauthorized');
    try {
      if (req.method === 'POST' && req.url === '/heartbeat') {
        heartbeat = Date.now(); res.end('{}'); return;
      }
      if (req.method === 'POST' && req.url === '/show') {
        heartbeat = Date.now(); showWindow(); res.end('{}'); return;
      }
      if (req.method === 'POST' && req.url === '/shutdown') {
        if (runtimeHost.currentOperation() || browserHost.currentOperation() && browserHost.currentOperation() !== 'ChatGPT login') return fail(409, 'operation_active');
        // Finish the owned runtime drain before acknowledging. Exit only AFTER the
        // response has been flushed, so the manager cannot mistake exit for failure.
        await supervisor.shutdown({cancelActiveTurns:false,force:false});
        res.end('{"ok":true}');
        res.once('finish', () => { setTimeout(() => { void quit(); }, 25); });
        return;
      }
      if (req.method === 'GET' && req.url === '/status') {
        const config = supervisor.readConfig();
        const health = config ? await supervisor.proxyHealthPayload(config).catch(() => null) : null;
        const prefs = stateStore.read();
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({version:1, pid:process.pid, authenticated:browserHost.state.authenticated === true,
          configured:!!config, ready:health?.service === 'codex-chatgpt-web' && health.version === config?.releaseVersion,
          mode:config?.mode || null, interactionMode:config?.browserInteractionMode || null,
          activeHttp:health?.active_http_turns || 0, activeBrowser:health?.active_browser_turns || 0,
          operation:runtimeHost.currentOperation() || browserHost.currentOperation() || null,
          browserSmokePassed:prefs.browserSmokePassed === true,
          // This URL is private manager state; never included in PAD renderer state.
          baseUrl:config ? `http://127.0.0.1:${config.port}/v1/` : null})); return;
      }
      if (req.method === 'POST' && req.url === '/catalog') {
        const config = supervisor.readConfig();
        if (!config || config.browserInteractionMode !== 'automatic') return fail(409, 'setup_required');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4*1024*1024) return fail(413, 'catalog_too_large'); chunks.push(chunk); }
        const response = await fetch(`http://127.0.0.1:${config.port}/admin/pad-catalog`, {method:'POST',
          headers:{authorization:'Bearer '+config.controlToken,'content-type':'application/json'},
          body:Buffer.concat(chunks), signal:AbortSignal.timeout(5000), redirect:'error'});
        res.writeHead(response.status, {'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(await response.text()); return;
      }
      fail(404, 'not_found');
    } catch { if (!res.headersSent) fail(503, 'web_runtime_unavailable'); else res.destroy(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 5000;
  server.on('clientError', (_e,socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
  await new Promise((resolve,reject) => {server.once('error', reject); server.listen(0,'127.0.0.1',resolve);});
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  writePrivateFileAtomic(file, JSON.stringify({version:1,pid:process.pid,endpoint:`http://127.0.0.1:${server.address().port}`,token}));
  const timer = setInterval(() => {
    if (!closing && Date.now()-heartbeat > 45000) {
      closing = true;
      // Owner has vanished: release tools and sessions, then terminate the whole companion.
      void supervisor.shutdown({cancelActiveTurns:true,force:true}).finally(() => {
        require('electron').app.exit(0);
      });
    }
  },5000); timer.unref();
  require('electron').app.once('will-quit', () => {clearInterval(timer);server.close();try{fs.unlinkSync(file);}catch{}});
  return server;
}
module.exports = {startPadControl};
