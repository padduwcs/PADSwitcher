'use strict';
// Keep earned resets separate from purchased credits and scheduled quota resets.
function normalizeResets(result) {
  const value = result?.rateLimitResetCredits;
  if (!value || !Number.isSafeInteger(value.availableCount) || value.availableCount < 0) return null;
  return { availableCount: value.availableCount, credits: Array.isArray(value.credits) ? value.credits.slice(0,200).flatMap(c => {
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 1024) return [];
    return [{id:c.id, resetType:c.resetType === 'codexRateLimits' ? c.resetType : 'unknown', status:typeof c.status === 'string' ? c.status.slice(0,40) : 'unknown', grantedAt:Number.isFinite(c.grantedAt) ? c.grantedAt : null, expiresAt:Number.isFinite(c.expiresAt) ? c.expiresAt : null, title:typeof c.title === 'string' ? c.title.slice(0,200) : null}];
  }) : null };
}
function availableCredit(summary,id) {
  return summary?.credits?.find(c => c.id === id && c.status === 'available' && c.resetType === 'codexRateLimits' && (!c.expiresAt || c.expiresAt*1000 > Date.now()));
}
module.exports = {normalizeResets,availableCredit};
