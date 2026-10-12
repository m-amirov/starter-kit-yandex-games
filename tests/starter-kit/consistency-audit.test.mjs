import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditStarterKitConsistency } from '../../tools/starter-kit/consistency-audit.mjs';

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-consistency-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'package.json': JSON.stringify({version:'0.5.11'}),
    'starter-kit.manifest.json': JSON.stringify({version:'0.5.11',entries:[]}),
    '.starter-kit/VERSION': '0.5.11\n',
    'README.md': '# Starter Kit 0.5.11\n',
    'config/yandex-requirements.yaml': "source:\n  reviewedAt: '2026-09-30'\n",
    'config/yandex-doc-snapshot.json': JSON.stringify({reviewedAt:'2026-09-30'}),
    '.codex/skills/yandex-release-validation/SKILL.md':'# Yandex Release Validation\n'
  };
  for (const [name, body] of Object.entries({...files, ...overrides})) {
    const p = path.join(root, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}

test('aligned baseline passes without mutating any file', t => {
  const root = fixture(t);
  const before = fs.readFileSync(path.join(root, 'starter-kit.manifest.json'), 'utf8');
  assert.equal(auditStarterKitConsistency(root).status, 'PASS');
  assert.equal(fs.readFileSync(path.join(root, 'starter-kit.manifest.json'), 'utf8'), before);
});

test('manifest divergence fails closed', t => {
  const root = fixture(t, {'starter-kit.manifest.json':JSON.stringify({version:'0.5.10'})});
  const result = auditStarterKitConsistency(root);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.errors.some(e => e.code === 'VERSION_MANIFEST_MISMATCH'));
});

test('requirements review divergence is an error, not an automatically accepted snapshot', t => {
  const root = fixture(t, {'config/yandex-doc-snapshot.json':JSON.stringify({reviewedAt:'2026-10-11'})});
  const result = auditStarterKitConsistency(root);
  assert.ok(result.errors.some(e => e.code === 'REGISTRY_SNAPSHOT_REVIEW_MISMATCH'));
});

test('outdated revision literal is surfaced but does not falsely claim a live docs change', t => {
  const root = fixture(t, {'.codex/skills/yandex-release-validation/SKILL.md': 'registry for the official requirements revision dated 18 August 2026'});
  const result = auditStarterKitConsistency(root);
  assert.equal(result.status, 'WARN');
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.code === 'HARDCODED_RELEASE_SKILL_REVISION'));
});
