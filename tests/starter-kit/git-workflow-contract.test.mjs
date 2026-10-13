import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('GitHub-first preflight is installed through agent and managed core contracts', () => {
  for (const name of ['AGENTS.md', '.starter-kit/core/AGENTS_CORE.md', '.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md']) {
    const text = read(name);
    assert.match(text, /git-preflight/);
    assert.match(text, /--fetch/);
    assert.match(text, /--apply/);
    assert.match(text, /dirty|Dirty|Diverged|diverged/);
    assert.match(text, /origin\/main|GitHub|remote/);
  }
});

test('Git preflight rule source is manifest-hashed and mature AGENTS stays semantic-merge', () => {
  const manifest = JSON.parse(read('starter-kit.manifest.json'));
  const expected = {
    'AGENTS.md': 'semantic-merge',
    '.starter-kit/core/AGENTS_CORE.md': 'managed',
    '.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md': 'managed'
  };
  for (const [source, ownership] of Object.entries(expected)) {
    const entry = manifest.entries.find(e => e.source === source);
    assert.ok(entry, source);
    assert.equal(entry.ownership, ownership);
    assert.equal(entry.sha256, crypto.createHash('sha256').update(read(source)).digest('hex'));
    assert.notEqual(entry.conflictPolicy, 'overwrite');
  }
});

test('release metadata and generated manifest version agree', () => {
  const version = read('VERSION').trim();
  assert.equal(JSON.parse(read('package.json')).version, version);
  assert.equal(JSON.parse(read('starter-kit.manifest.json')).version, version);
  assert.equal(JSON.parse(read('config/skill-policy.json')).starterKitVersion, version);
  assert.equal(JSON.parse(read('autonomy/state.json')).starterKitVersion, version);
});
