import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../tools/starter-kit/lib.mjs';
import {
  auditConsoleRegistryText,
  auditSnapshotRegistryAlignment,
  auditRequirementRegistryText,
  evaluateMonetization
} from '../../tools/yandex/requirements-audit.mjs';
import {
  validateGameplayVideos,
  validatePromotionalVideoExclusion
} from '../../tools/yandex/media-validation.mjs';
import { loadSourceConfig } from '../../tools/yandex/docs-watch.mjs';

const validReview = {
  realGameplay: { status: 'PASS', evidence: 'manual-review/gameplay.md' },
  systemUiAbsent: { status: 'PASS', evidence: 'manual-review/gameplay.md' },
  yandexUiAbsent: { status: 'PASS', evidence: 'manual-review/gameplay.md' },
  artificialBlackBarsAbsent: { status: 'PASS', evidence: 'manual-review/gameplay.md' },
  localeMatchesDraft: { status: 'PASS', evidence: 'manual-review/gameplay.md' },
  openingFrameReady: { status: 'PASS', evidence: 'manual-review/gameplay.md#opening-frame' }
};

function video(locale = 'ru', overrides = {}) {
  return {
    locale,
    path: `artifacts/marketing/gameplay-${locale}.mp4`,
    dimensions: { width: 1920, height: 1080 },
    durationSeconds: 24,
    sizeBytes: 8_000_000,
    gameplayRatio: 1,
    sha256: locale === 'ru' ? 'a'.repeat(64) : 'b'.repeat(64),
    manualReview: validReview,
    ...overrides
  };
}

function facts(overrides = {}) {
  return {
    exists: true,
    format: 'mp4',
    width: 1920,
    height: 1080,
    durationSeconds: 24,
    sizeBytes: 8_000_000,
    sha256: 'a'.repeat(64),
    ...overrides
  };
}

function validate(videos, options = {}) {
  return validateGameplayVideos({
    publicationType: 'first-publication',
    declaredLocales: ['ru', 'en'],
    languageDependentText: true,
    videos,
    sourceHead: 'f'.repeat(40),
    currentHead: 'f'.repeat(40),
    inspectMedia: async (entry) => options.factsByLocale?.[entry.locale] ?? facts({ sha256: entry.locale === 'ru' ? 'a'.repeat(64) : 'b'.repeat(64) }),
    ...options
  });
}

test('official numbered registry matches the 29 September 2026 revision and preserves repealed clauses', () => {
  const registry = fs.readFileSync(path.join(ROOT, 'config', 'yandex-requirements.yaml'), 'utf8');
  const result = auditRequirementRegistryText(registry, { reviewedAt: '2026-09-30' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.requirementCount, 149);
  assert.deepEqual(result.repealedIds, [
    '1.5', '1.6.1.3', '1.6.1.4', '1.6.2.3', '1.17', '2.5', '2.6', '2.10', '2.11', '2.12', '3.1', '3.2',
    '3.3', '3.4.1', '3.7.1', '3.7.2', '3.7.3', '3.8', '5.5', '5.7', '5.8', '5.10', '7'
  ]);
});

test('Console-only rules are separate and have no invented numbered requirement', () => {
  const registry = fs.readFileSync(path.join(ROOT, 'config', 'yandex-console-requirements.yaml'), 'utf8');
  const result = auditConsoleRegistryText(registry, { reviewedAt: '2026-09-30' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.ruleIds, ['CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO']);
});

test('reviewed upstream snapshot aligns with numbered and Console registries', () => {
  const snapshotPath = process.env.YANDEX_DOC_SNAPSHOT_PATH
    ? path.resolve(process.env.YANDEX_DOC_SNAPSHOT_PATH)
    : path.join(ROOT, 'config', 'yandex-doc-snapshot.json');
  const result = auditSnapshotRegistryAlignment({
    requirementText: fs.readFileSync(path.join(ROOT, 'config', 'yandex-requirements.yaml'), 'utf8'),
    consoleText: fs.readFileSync(path.join(ROOT, 'config', 'yandex-console-requirements.yaml'), 'utf8'),
    snapshot: JSON.parse(fs.readFileSync(snapshotPath, 'utf8')),
    sourceConfig: loadSourceConfig()
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.errors, []);
  assert.equal(result.snapshotClauseCount, 157);
  assert.equal(result.discoveredDetailPageCount, 24);
});

test('snapshot alignment blocks registry changes made after review', () => {
  const requirementText = fs.readFileSync(path.join(ROOT, 'config', 'yandex-requirements.yaml'), 'utf8');
  const consoleText = fs.readFileSync(path.join(ROOT, 'config', 'yandex-console-requirements.yaml'), 'utf8');
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'yandex-doc-snapshot.json'), 'utf8'));
  const result = auditSnapshotRegistryAlignment({
    requirementText: requirementText.replace('SDK Яндекс Игр встроен', 'SDK встроен'),
    consoleText,
    snapshot,
    sourceConfig: loadSourceConfig()
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.errors.join('\n'), /registry changed after snapshot review/);
});

test('requirement 1.12 accepts ads-only monetization', () => {
  assert.equal(evaluateMonetization({ adsEnabled: true, purchasesEnabled: false }).status, 'PASS');
});

test('requirement 1.12 accepts IAP-only monetization', () => {
  assert.equal(evaluateMonetization({ adsEnabled: false, purchasesEnabled: true }).status, 'PASS');
});

test('requirement 1.12 blocks a game with neither ads nor IAP', () => {
  assert.equal(evaluateMonetization({ adsEnabled: false, purchasesEnabled: false }).status, 'BLOCK');
});

test('first publication without a horizontal gameplay video is blocked', async () => {
  assert.equal((await validate([])).status, 'BLOCK');
});

test('an update without a video is not blocked only by the Console first-publication rule', async () => {
  const result = await validateGameplayVideos({
    publicationType: 'update',
    declaredLocales: ['ru', 'en'],
    languageDependentText: true,
    videos: []
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.blockers, []);
});

for (const [name, entry, actual] of [
  ['format', video('ru', { path: 'artifacts/marketing/gameplay-ru.webm' }), facts({ format: 'webm' })],
  ['aspect', video('ru', { dimensions: { width: 1280, height: 800 } }), facts({ width: 1280, height: 800 })],
  ['duration', video('ru', { durationSeconds: 29 }), facts({ durationSeconds: 29 })],
  ['size', video('ru', { sizeBytes: 100_000_001 }), facts({ sizeBytes: 100_000_001 })]
]) {
  test(`wrong horizontal gameplay video ${name} is blocked`, async () => {
    const result = await validate([entry, video('en')], {
      factsByLocale: { ru: actual, en: facts() }
    });
    assert.equal(result.status, 'BLOCK');
  });
}

test('missing locale-specific video is blocked when gameplay has localized text', async () => {
  const result = await validate([video('ru')]);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /en/);
});

test('real gameplay share remains a manual evidence gate', async () => {
  const pending = video('ru', {
    gameplayRatio: 0.9,
    manualReview: {
      ...validReview,
      realGameplay: { status: 'NOT_REVIEWED', evidence: null }
    }
  });
  const result = await validate([pending, video('en')]);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /manual.*real gameplay/i);
});

test('promotional MP4 inside the game ZIP is blocked', () => {
  const result = validatePromotionalVideoExclusion({
    zipEntries: ['index.html', 'assets/game.js', 'artifacts/marketing/gameplay-ru.mp4'],
    videos: [video('ru')]
  });
  assert.equal(result.status, 'BLOCK');
});

test('renamed promotional MP4 inside the game ZIP is blocked by SHA-256', () => {
  const result = validatePromotionalVideoExclusion({
    zipEntries: [{ name: 'assets/renamed.mp4', sha256: 'a'.repeat(64) }],
    videos: [video('ru')]
  });
  assert.equal(result.status, 'BLOCK');
});


test('stale gameplay video source HEAD is blocked', async () => {
  const result = await validate([video('ru'), video('en')], {
    sourceHead: 'a'.repeat(40),
    currentHead: 'b'.repeat(40)
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /source HEAD.*current HEAD/i);
});

test('renamed duplicate locale videos are blocked by identical media hash', async () => {
  const result = await validate([
    video('ru', { path: 'artifacts/marketing/ru.mp4' }),
    video('en', { path: 'artifacts/marketing/en.mp4' })
  ], {
    factsByLocale: {
      ru: facts({ sha256: 'c'.repeat(64) }),
      en: facts({ sha256: 'c'.repeat(64) })
    }
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /same media.*multiple locales|identical.*localized/i);
});

test('opening frame requires explicit reviewed evidence', async () => {
  const pending = video('ru', {
    manualReview: {
      ...validReview,
      openingFrameReady: { status: 'NOT_REVIEWED', evidence: null }
    }
  });
  const result = await validate([pending, video('en')]);
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /opening frame/i);
});

test('video evidence SHA mismatch remains blocking', async () => {
  const result = await validate([
    video('ru', { sha256: 'd'.repeat(64) }),
    video('en')
  ], {
    factsByLocale: { ru: facts({ sha256: 'e'.repeat(64) }), en: facts() }
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /SHA-256 does not match/i);
});
