'use strict';
// Opening/returning to the app always fetches a new snapshot. The preference
// controls only polling while the app stays open. Throttle focus events.
function createQuotaRefresher(service, now = Date.now) {
  let lastAttempt = -Infinity;
  let inFlight = false;
  return async function refresh(reason) {
    if (inFlight || service.busy || !service.state.profiles.length) return false;
    if (reason === 'periodic' && !service.state.settings.autoRefresh) return false;
    const current = now();
    // A periodic timer can fire a few milliseconds early. Keep focus throttling
    // strict without accidentally turning a one-minute timer into two minutes.
    if (current >= lastAttempt && current - lastAttempt < (reason==='periodic'?59000:60000)) return false;
    lastAttempt = current;
    inFlight = true;
    try { await service.refreshAll(); return true; }
    finally { inFlight = false; }
  };
}
module.exports = { createQuotaRefresher };
