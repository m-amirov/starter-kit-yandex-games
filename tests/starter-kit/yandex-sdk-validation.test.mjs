import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditYandexSdkBootstrap,
  auditYandexSdkSource
} from '../../tools/yandex/sdk-validation.mjs';

const canonicalHtml = `<!doctype html>
<html>
<head>
  <script src="/sdk.js"></script>
</head>
<body>
  <script type="module" src="/src/entry.js"></script>
</body>
</html>`;

test('blocks production HTML without explicit /sdk.js bootstrap', () => {
  const result = auditYandexSdkBootstrap('<script type="module" src="/src/entry.js"></script>');
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /explicit \/sdk\.js/i);
});

test('blocks sdk script after application module entry', () => {
  const result = auditYandexSdkBootstrap(`
    <script type="module" src="/src/entry.js"></script>
    <script src="/sdk.js"></script>
  `);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /before.*module/i);
});

test('accepts explicit sdk script before application module entry', () => {
  assert.equal(auditYandexSdkBootstrap(canonicalHtml).status, 'PASS');
});

test('blocks multiple YaGames.init calls in production source', () => {
  const source = `
    await YaGames.init();
    if (retry) await window.YaGames.init();
  `;
  const result = auditYandexSdkSource(source);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /YaGames\.init.*exactly once/i);
});

test('requires guarded dynamic sdk injection when a fallback loader exists', () => {
  const source = `
    function loadSdkScript() {
      const script = document.createElement('script');
      script.src = '/sdk.js';
      document.head.append(script);
    }
    await YaGames.init();
  `;
  const result = auditYandexSdkSource(source);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /window\.YaGames.*duplicate/i);
});

test('accepts guarded fallback loader and one init call', () => {
  const source = `
    async function loadSdkScript() {
      if (window.YaGames) return window.YaGames;
      const existing = document.querySelector('script[src="/sdk.js"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = '/sdk.js';
        document.head.append(script);
      }
      return window.YaGames;
    }
    const ysdk = await YaGames.init();
  `;
  assert.equal(auditYandexSdkSource(source).status, 'PASS');
});

test('production fallback must fail closed instead of silently entering local mode', () => {
  const source = `
    try { await YaGames.init(); }
    catch (error) { return { mode: 'local-fallback' }; }
  `;
  const result = auditYandexSdkSource(source);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /production.*fail-closed/i);
});

test('localhost and file fallback guards are allowed', () => {
  const source = `
    const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    try { await YaGames.init(); }
    catch (error) {
      if (!isLocal) throw error;
      return { mode: 'local-fallback' };
    }
  `;
  assert.equal(auditYandexSdkSource(source).status, 'PASS');
});


test('accepts guarded SDK_PATH loader and isLocalDevelopment fail-closed pattern', () => {
  const source = `
    const SDK_PATH = '/sdk.js';
    export function isLocalDevelopment(location = globalThis.location) {
      return location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    }
    function loadSdkScript({ document, window }) {
      if (window?.YaGames) return Promise.resolve(window.YaGames);
      const existing = document.querySelector?.(\`script[src="\${SDK_PATH}"]\`);
      const script = existing || document.createElement('script');
      if (!existing) {
        script.src = SDK_PATH;
        document.head.append(script);
      }
      return Promise.resolve(window.YaGames);
    }
    async function init({ location, window, document }) {
      let YaGames;
      try { YaGames = await loadSdkScript({ document, window }); }
      catch (error) {
        if (isLocalDevelopment(location)) return { mode: 'local-fallback' };
        throw error;
      }
      return YaGames.init();
    }
  `;
  assert.equal(auditYandexSdkSource(source).status, 'PASS');
});
