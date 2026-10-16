import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runVkGamesProfile } from '../../tools/vk/vk-games-check.mjs';
import { createVkBridgeAdapter } from '../../templates/platform/vk-bridge-adapter.mjs';
import { ROOT } from '../../tools/starter-kit/lib.mjs';
import { loadManifest, resolveManifestEntries } from '../../tools/starter-kit/manifest.mjs';
import { loadTargetProfile } from '../../tools/starter-kit/profile.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-games-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const part of ['dist/vk', 'platform', 'src/platform']) {
    fs.mkdirSync(path.join(root, part), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'dist/vk/index.html'), '<html>VK only</html>');
  fs.writeFileSync(path.join(root, 'src/platform/vk-games.mjs'), 'export const adapter = true;');
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/platform/vk-games.contract.example.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'platform/vk-games.contract.json'), JSON.stringify(contract));
  const profile = { schemaVersion: 1, profile: 'vk-games', enabled: true,
    contractPath: 'platform/vk-games.contract.json', evidencePath: 'artifacts/evidence/vk-games-runtime.json' };
  return { root, profile, contract };
}

test('vk-games is inactive by default and delivered to new and mature targets without runtime injection', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/skill-policy.json'), 'utf8'));
  const entry = policy.optionalProfiles.find((p) => p.name === 'vk-games');
  assert.equal(entry.enabledByDefault, false);
  const template = JSON.parse(fs.readFileSync(path.join(ROOT, entry.config), 'utf8'));
  assert.equal(template.enabled, false);
  const manifest = loadManifest(ROOT);
  const sources = [
    'tools/vk/vk-games-check.mjs', 'config/optional-profiles/vk-games.json',
    'templates/platform/vk-bridge-adapter.mjs', 'templates/platform/vk-games.contract.example.json',
    'docs/VK_GAMES_PROFILE.md'
  ];
  for (const source of sources) {
    assert.ok(manifest.entries.some((e) => e.source === source), 'missing manifest: ' + source);
  }
  for (const name of ['new-project', 'mature-yandex-phaser']) {
    const mode = name === 'new-project' ? 'init' : 'update';
    const resolved = resolveManifestEntries(manifest, loadTargetProfile(ROOT, name, { mode }), mode);
    for (const source of sources) {
      assert.ok(resolved.some((e) => e.source === source), 'not delivered: ' + source);
    }
    assert.ok(!resolved.some((e) => sources.includes(e.source) && /^(src|public)\//.test(e.target)));
  }
  assert.equal(runVkGamesProfile(ROOT, template).status, 'SKIPPED_OPT_IN_PROFILE');
});

test('static contract can PASS but never approves a VK release', (t) => {
  const { root, profile } = fixture(t);
  const result = runVkGamesProfile(root, profile);
  assert.equal(result.status, 'PASS_VK_STATIC_CONTRACT');
  assert.equal(result.releaseReady, false);
  assert.equal(runVkGamesProfile(root, profile, { release: true }).reason, 'RUNTIME_EVIDENCE_MISSING');
});

test('bad policy and SDK mixing fail closed', (t) => {
  const { root, profile, contract } = fixture(t);
  contract.ads.allowDuringDialogue = true;
  fs.writeFileSync(path.join(root, profile.contractPath), JSON.stringify(contract));
  assert.equal(runVkGamesProfile(root, profile).reason, 'INVALID_VK_CONTRACT');
  contract.ads.allowDuringDialogue = false;
  fs.writeFileSync(path.join(root, profile.contractPath), JSON.stringify(contract));
  fs.writeFileSync(path.join(root, contract.buildFile), '<script>YaGames.init()</script>');
  assert.equal(runVkGamesProfile(root, profile).reason, 'YANDEX_SDK_IN_VK_BUILD');
});

test('unsafe traversal and symlink paths are rejected', (t) => {
  const { root, profile } = fixture(t);
  assert.throws(() => runVkGamesProfile(root, { ...profile, contractPath: '../secret.json' }), /Unsafe profile path/);
  fs.symlinkSync(path.join(root, 'platform'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => runVkGamesProfile(root, { ...profile, contractPath: 'linked/vk-games.contract.json' }), /Unsafe profile path/);
});

test('mocked VK Bridge adapter honors lifecycle, boundary ads and round-trip storage', async () => {
  const calls = [], events = [], storage = new Map();
  let handler;
  const bridge = {
    async send(method, params = {}) {
      calls.push(method);
      if (method === 'VKWebAppCheckNativeAds' || method === 'VKWebAppShowNativeAds') return { result: true };
      if (method === 'VKWebAppStorageSet') { storage.set(params.key, params.value); return { result: true }; }
      if (method === 'VKWebAppStorageGet') {
        return { keys: params.keys.map((key) => ({ key, value: storage.get(key) ?? '' })) };
      }
      return { result: true };
    },
    subscribe(fn) { handler = fn; },
    unsubscribe(fn) { assert.equal(fn, handler); }
  };
  const adapter = createVkBridgeAdapter(bridge, {
    onPause: () => events.push('pause'),
    onResume: () => events.push('resume')
  });
  await adapter.init();
  handler({ detail: { type: 'VKWebAppViewHide' } });
  handler({ detail: { type: 'VKWebAppViewRestore' } });
  assert.deepEqual(events, ['pause', 'resume']);
  assert.equal((await adapter.showInterstitial()).status, 'blocked-not-boundary');
  assert.equal((await adapter.showInterstitial({ atBoundary: true })).status, 'shown');
  assert.equal((await adapter.showRewarded()).status, 'disabled');
  assert.equal((await adapter.showRewarded({ enabled: true })).grantReward, false);
  assert.equal(await adapter.save('progress', { scene: 1 }), true);
  assert.deepEqual(await adapter.load('progress'), { scene: 1 });
  assert.equal(calls[0], 'VKWebAppInit');
  adapter.destroy();
  await assert.rejects(() => adapter.load('progress'), /not initialized/);
});

test('save rejects oversized and truncated data; load never silently resets corrupted JSON', async () => {
  const bridge = {
    send: async (method, params = {}) => {
      if (method === 'VKWebAppStorageGet') return { keys: [{ key: params.keys[0], value: 'garbage' }] };
      return { result: true };
    },
    subscribe() {}
  };
  const adapter = createVkBridgeAdapter(bridge);
  await adapter.init();
  await assert.rejects(() => adapter.save('progress', { scene: 1 }), /round-trip mismatch/);
  await assert.rejects(() => adapter.save('progress', { text: 'А'.repeat(2000) }), /too large/);
  await assert.rejects(() => adapter.load('progress'), SyntaxError);
});

test('fake runtime evidence without git commit cannot claim release PASS', (t) => {
  const { root, profile } = fixture(t);
  fs.mkdirSync(path.join(root, 'artifacts/evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, profile.evidencePath), JSON.stringify({
    schemaVersion: 1, sourceHead: '0'.repeat(40), buildSha256: '0'.repeat(64),
    capturedAt: '2026-10-16T00:00:00Z', clients: []
  }));
  assert.equal(runVkGamesProfile(root, profile, { release: true }).reason, 'GIT_HEAD_UNVERIFIED');
});
