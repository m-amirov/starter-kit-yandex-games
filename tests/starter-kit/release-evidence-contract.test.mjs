import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../tools/starter-kit/lib.mjs';

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('release evidence contract freezes HEAD before HEAD-bound evidence', () => {
  const contract = read('docs/HEAD_BOUND_RELEASE_EVIDENCE.md');
  assert.match(contract, /source\/config.*FINAL_RELEASE_HEAD/is);
  assert.match(contract, /push.*FINAL_RELEASE_HEAD/is);
  assert.match(contract, /no more commits/i);
  assert.match(contract, /HEAD-bound.*after.*FINAL_RELEASE_HEAD/is);
  assert.match(contract, /committing.*HEAD-bound.*invalidates/i);
});

test('release skills require packaged RC verification after final freeze', () => {
  const releaseAudit = read('.codex/skills/release-audit/SKILL.md');
  const yandex = read('.codex/skills/yandex-release-validation/SKILL.md');
  for (const value of [releaseAudit, yandex]) {
    assert.match(value, /FINAL_RELEASE_HEAD/);
    assert.match(value, /HEAD-bound/i);
    assert.match(value, /actual.*ZIP|packaged.*RC/i);
  }
});

test('core orchestration distinguishes local freeze from external evidence', () => {
  const core = read('.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md');
  assert.match(core, /local freeze/i);
  assert.match(core, /external.*evidence/i);
  assert.match(core, /must not turn.*local.*PASS.*FAIL/i);
});
