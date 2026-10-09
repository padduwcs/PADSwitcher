'use strict';
const crypto = require('node:crypto');
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ROUTE = new RegExp('^chatgpt-web/pad-('+UUID+')/([a-z0-9][a-z0-9./-]{0,120})$');
function qualify(id, slug) {
  if (!new RegExp('^'+UUID+'$').test(id) || !/^chatgpt-web\/[a-z0-9][a-z0-9./-]{0,120}$/.test(slug)) throw Error('Invalid Web model route');
  return 'chatgpt-web/pad-'+id+'/'+slug.slice('chatgpt-web/'.length);
}
function parse(model) { const m = typeof model === 'string' && ROUTE.exec(model); return m ? {id:m[1],model:'chatgpt-web/'+m[2]} : null; }
function isWeb(model) { return typeof model === 'string' && model.startsWith('chatgpt-web/'); }
function threadKey(req, body) {
  let metadata = body?.client_metadata?.['x-codex-turn-metadata'];
  try { if (typeof metadata === 'string') metadata = JSON.parse(metadata); } catch { metadata = null; }
  const id = metadata?.thread_id || metadata?.threadId || req.headers['thread-id'];
  return typeof id === 'string' && id.length > 0 && id.length < 1024 ? crypto.createHash('sha256').update(id).digest('hex') : null;
}
function hasWebArtifacts(body) {
  return Array.isArray(body?.input) && body.input.some(x => x && typeof x === 'object' &&
    typeof x.encrypted_content === 'string' && /^(ocx1:|ocxr1:)/.test(x.encrypted_content));
}
module.exports = {qualify,parse,isWeb,threadKey,hasWebArtifacts};
