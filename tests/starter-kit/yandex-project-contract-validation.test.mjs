import assert from 'node:assert/strict';
import test from 'node:test';

import { auditReleaseContract } from '../../tools/yandex/project-contract-validation.mjs';

const spec = `
schemaVersion: 2
yandex:
  publication:
    type: first-publication
content:
  episodes: 10
audio:
  enabled: true
localization:
  languages: [ru, en]
visual:
  marketing:
    horizontalGameplayVideo:
      languageDependentText: true
`;

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    content: { episodes: 10 },
    localization: { completeLocales: ['ru', 'en'] },
    audio: { productionAssetsPresent: true },
    ...overrides
  };
}

function media(locales = ['ru', 'en']) {
  return { videos: locales.map((locale) => ({ locale })) };
}

test('blocks stale episode count declared by release evidence', () => {
  const result = auditReleaseContract({
    specText: spec,
    releaseEvidence: evidence({ content: { episodes: 12 } }),
    mediaEvidence: media()
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /episodes.*10.*12/i);
});

test('blocks a declared locale without complete localization evidence', () => {
  const result = auditReleaseContract({
    specText: spec,
    releaseEvidence: evidence({ localization: { completeLocales: ['ru'] } }),
    mediaEvidence: media()
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /locale.*en/i);
});

test('blocks enabled audio without production audio evidence', () => {
  const result = auditReleaseContract({
    specText: spec,
    releaseEvidence: evidence({ audio: { productionAssetsPresent: false } }),
    mediaEvidence: media()
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /audio.*production/i);
});

test('blocks missing locale-specific first-publication media', () => {
  const result = auditReleaseContract({
    specText: spec,
    releaseEvidence: evidence(),
    mediaEvidence: media(['ru'])
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /video.*en/i);
});

test('passes when declared product contract matches release evidence', () => {
  assert.equal(auditReleaseContract({
    specText: spec,
    releaseEvidence: evidence(),
    mediaEvidence: media()
  }).status, 'PASS');
});
