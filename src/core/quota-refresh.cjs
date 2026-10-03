'use strict';
// Opening/returning to the app always fetches a new snapshot. The preference
// controls only polling while the app stays open. Throttle focus events.
function createQuotaRefresher(service, now = Date.now) {
  let lastAttempt = -Infinity;
  return async function refresh(reason) {
    if (service.busy || !service.state.profiles.length) return false;
    if (reason === 'periodic' && !service.state.settings.autoRefresh) return false;
    const current = now();
    if (current - lastAttempt < 60000) return false;
    lastAttempt = current;
    await service.refreshAll();
    return true;
  };
}
module.exports = { createQuotaRefresher };
