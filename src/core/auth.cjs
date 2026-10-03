'use strict';
const crypto = require('node:crypto');
const { UserError } = require('./errors.cjs');
function claims(token) {
  try { const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function parseAuth(bytes) {
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new UserError('Phiên đăng nhập không hợp lệ.', 'AUTH_INVALID'); }
  const tokens = data?.tokens;
  if (!tokens || typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string' || !tokens.access_token || !tokens.refresh_token || !tokens.id_token || data.auth_mode === 'apikey') throw new UserError('Chỉ hỗ trợ phiên đăng nhập ChatGPT do Codex quản lý. Hãy đăng nhập qua OpenAI.', 'AUTH_UNSUPPORTED');
  const id = claims(tokens.id_token), access = claims(tokens.access_token);
  const auth = id['https://api.openai.com/auth'] || access['https://api.openai.com/auth'] || {};
  const accountId = tokens.account_id || auth.chatgpt_account_id;
  const subject = id.sub || access.sub || auth.chatgpt_user_id;
  if (typeof accountId !== 'string' || typeof subject !== 'string') throw new UserError('Không xác định được tài khoản từ phiên Codex.', 'AUTH_INVALID');
  const profile = id['https://api.openai.com/profile'] || access['https://api.openai.com/profile'] || {};
  return {
    identity: crypto.createHash('sha256').update(`${subject}\0${accountId}`).digest('hex'),
    email: typeof (id.email || profile.email) === 'string' ? (id.email || profile.email).slice(0,254) : '',
    plan: typeof auth.chatgpt_plan_type === 'string' ? auth.chatgpt_plan_type : '',
  };
}
function normalizeLimits(result) {
  const buckets = result?.rateLimitsByLimitId && typeof result.rateLimitsByLimitId === 'object'
    ? Object.entries(result.rateLimitsByLimitId) : result?.rateLimits ? [['codex', result.rateLimits]] : [];
  return buckets.slice(0, 20).map(([key, bucket]) => ({
    id: String(key).slice(0,100), name: String(bucket?.limitName || key).slice(0,100),
    windows: ['primary', 'secondary'].flatMap(kind => {
      const w = bucket?.[kind];
      if (!w || !Number.isFinite(w.usedPercent)) return [];
      return [{ kind, usedPercent: Math.max(0,Math.min(100,w.usedPercent)), windowDurationMins: Number.isFinite(w.windowDurationMins) ? w.windowDurationMins : null, resetsAt: Number.isFinite(w.resetsAt) ? w.resetsAt : null }];
    })
  }));
}
module.exports = { parseAuth, normalizeLimits };
