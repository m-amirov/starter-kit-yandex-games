import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { recordSemanticAcceptance } from '../../tools/starter-kit/semantic-acceptance.mjs';
import { inspectTargetStatus } from '../../tools/starter-kit/status-core.mjs';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-semantic-'));
  fs.mkdirSync(path.join(root, '.starter-kit'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  const source = '{"reviewedAt":"2026-09-30"}\n';
  const reviewed = '{"reviewedAt":"2026-10-05"}\n';
  const target = 'config/yandex-doc-snapshot.json';
  fs.writeFileSync(path.join(root, target), source);
  const manifest = {
    schemaVersion: 2,
    version: 'test',
    updaterSchemaVersion: 2,
    entries: [{
      source: target,
      logicalId: 'contract:yandex-doc-snapshot',
      ownership: 'semantic-merge',
      target,
      modes: ['init', 'update'],
      projectTypes: ['new', 'mature'],
      conflictPolicy: 'semantic-merge',
      sha256: sha256(source)
    }]
  };
  fs.writeFileSync(path.join(root, '.starter-kit', 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(root, '.starter-kit', 'state.json'), JSON.stringify({
    updaterSchemaVersion: 2,
    installedVersion: 'test',
    attemptedVersion: 'test',
    sourceManifestHash: null,
    targetProfile: { profileName: 'mature-yandex-phaser', projectType: 'mature', skillRoot: '.codex/skills', allowSecondSkillRoot: false, ownershipOverrides: {} },
    baseline: {},
    projectOwned: {},
    semanticAcceptances: {
      'contract:yandex-doc-snapshot': { target, sourceHash: sha256(source), targetHash: sha256(source) }
    },
    conflicts: []
  }, null, 2));
  return { root, target, reviewed, manifest };
}

test('reviewed snapshot acceptance updates semantic target hash and status stays clean', () => {
  const { root, target, reviewed } = fixture();
  fs.writeFileSync(path.join(root, target), reviewed);
  const result = recordSemanticAcceptance({ root, logicalId: 'contract:yandex-doc-snapshot', target });
  assert.equal(result.status, 'ACCEPTED');
  const state = JSON.parse(fs.readFileSync(path.join(root, '.starter-kit', 'state.json'), 'utf8'));
  assert.equal(state.semanticAcceptances['contract:yandex-doc-snapshot'].targetHash, sha256(reviewed));
  assert.equal(inspectTargetStatus({ sourceRoot: root, targetRoot: root }).status, 'clean');
});

test('unreviewed edit of a semantic-accepted target is detected as modified', () => {
  const { root, target } = fixture();
  fs.writeFileSync(path.join(root, target), '{"reviewedAt":"tampered"}\n');
  const status = inspectTargetStatus({ sourceRoot: root, targetRoot: root });
  assert.equal(status.status, 'modified');
  assert.deepEqual(status.modifiedSemanticFiles, [target]);
});

test('semantic acceptance rejects non-semantic manifest entries', () => {
  const { root, target, manifest } = fixture();
  manifest.entries[0].ownership = 'managed';
  manifest.entries[0].conflictPolicy = 'replace-if-baseline';
  fs.writeFileSync(path.join(root, '.starter-kit', 'manifest.json'), JSON.stringify(manifest, null, 2));
  assert.throws(
    () => recordSemanticAcceptance({ root, logicalId: 'contract:yandex-doc-snapshot', target }),
    /not semantic-merge/i
  );
});
