(() => {
  'use strict';
  if (Object.prototype.hasOwnProperty.call(window, '__YG_HARDENED_OBSERVER')) return;
  const VERSION = 'hardened-live-observer-1.0.0';
  const trustedInput = [];
  const record = (event) => {
    if (event.isTrusted !== true) return;
    trustedInput.push({ type: event.type, at: new Date().toISOString() });
    if (trustedInput.length > 50) trustedInput.shift();
  };
  for (const type of ['click', 'keydown', 'touchstart', 'pointerdown', 'contextmenu']) {
    window.addEventListener(type, record, { capture: true, passive: true });
  }
  const snapshot = () => ({
    checkerVersion: VERSION,
    observedAt: new Date().toISOString(),
    page: { origin: location.origin, pathname: location.pathname, visibilityState: document.visibilityState },
    platformPresence: { YaGames: 'YaGames' in window, ysdk: 'ysdk' in window },
    trustedInput: trustedInput.slice(),
    verdicts: {
      projectLanguageResolver: { rawStatus: 'NOT VERIFIED', reason: 'project callbacks are not executed in live Draft mode' },
      syntheticInteraction: { rawStatus: 'MANUAL', reason: 'synthetic events are forbidden' },
      stateMutationProbes: { rawStatus: 'NOT VERIFIED', reason: 'save, leaderboard, purchase, consume, and ad calls are forbidden' },
    },
  });
  Object.defineProperty(window, '__YG_HARDENED_OBSERVER', {
    configurable: true,
    enumerable: false,
    value: Object.freeze({ version: VERSION, snapshot }),
    writable: false,
  });
})();
