/**
 * VK Games reference adapter; explicitly opt-in and inject @vkontakte/vk-bridge.
 * Does not grant rewarded entitlement and does not silently fall back on save errors.
 */
const KEY = /^[A-Za-z0-9_-]{1,100}$/;
export function createVkBridgeAdapter(bridge, { onPause = () => {}, onResume = () => {} } = {}) {
  if (!bridge || typeof bridge.send !== 'function' || typeof bridge.subscribe !== 'function') {
    throw new TypeError('VK Bridge with send/subscribe required');
  }
  let initialized = false;
  let destroyed = false;
  let listener;
  const ready = () => {
    if (!initialized || destroyed) throw new Error('VK adapter not initialized');
  };
  async function init() {
    if (destroyed) throw new Error('Adapter destroyed');
    if (initialized) return;
    await bridge.send('VKWebAppInit');
    listener = (event) => {
      if (event?.detail?.type === 'VKWebAppViewHide') onPause();
      if (event?.detail?.type === 'VKWebAppViewRestore') onResume();
    };
    bridge.subscribe(listener);
    initialized = true;
  }
  async function showInterstitial({ atBoundary = false } = {}) {
    ready();
    if (!atBoundary) return { status: 'blocked-not-boundary' };
    try {
      const available = await bridge.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' });
      if (available?.result !== true) return { status: 'unavailable' };
      const result = await bridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
      return { status: result?.result === true ? 'shown' : 'not-shown' };
    } catch (error) {
      return { status: 'error', reason: String(error?.message ?? error) };
    }
  }
  async function showRewarded({ enabled = false } = {}) {
    ready();
    if (!enabled) return { status: 'disabled', grantReward: false };
    try {
      const available = await bridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward' });
      if (available?.result !== true) return { status: 'unavailable', grantReward: false };
      const result = await bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' });
      // Caller must verify reward-completion semantics in real client.
      return { status: result?.result === true ? 'reported-success' : 'not-completed', grantReward: false };
    } catch (error) {
      return { status: 'error', reason: String(error?.message ?? error), grantReward: false };
    }
  }
  async function save(key, state) {
    ready();
    if (!KEY.test(key)) throw new Error('Invalid VK Storage key');
    const value = JSON.stringify(state);
    if (value === undefined) throw new TypeError('Not JSON serializable');
    if (new TextEncoder().encode(value).length > 3800) {
      throw new Error('VK save too large: implement chunking with integrity verification');
    }
    const result = await bridge.send('VKWebAppStorageSet', { key, value });
    if (result?.result === false) throw new Error('VK save rejected');
    const readback = await bridge.send('VKWebAppStorageGet', { keys: [key] });
    const stored = readback?.keys?.find((item) => item.key === key)?.value;
    if (stored !== value) throw new Error('VK Storage round-trip mismatch');
    return true;
  }
  async function load(key) {
    ready();
    if (!KEY.test(key)) throw new Error('Invalid VK Storage key');
    const result = await bridge.send('VKWebAppStorageGet', { keys: [key] });
    if (!Array.isArray(result?.keys)) throw new Error('VK Storage response malformed');
    const value = result.keys.find((item) => item.key === key)?.value;
    if (value === '' || value === undefined) return null;
    return JSON.parse(value);
  }
  function destroy() {
    if (listener && typeof bridge.unsubscribe === 'function') bridge.unsubscribe(listener);
    initialized = false;
    destroyed = true;
    listener = null;
  }
  return { init, showInterstitial, showRewarded, save, load, destroy };
}
