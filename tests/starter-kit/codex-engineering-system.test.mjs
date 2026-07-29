import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../tools/starter-kit/lib.mjs';
import { loadManifest, resolveManifestEntries } from '../../tools/starter-kit/manifest.mjs';
import { loadTargetProfile } from '../../tools/starter-kit/profile.mjs';

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('codex engineering system is explicit and mandatory', () => {
  const policy = JSON.parse(read('config/skill-policy.json'));
  const system = policy.skills.find((skill) => skill.name === 'codex-engineering-system');
  assert.equal(system?.mandatory, true);
  assert.deepEqual(system?.routesThrough, ['implementation-cycle']);
  assert.equal(policy.globalRules.codexEngineeringSystemRequired, true);
  assert.match(read('AGENTS.md'), /\$codex-engineering-system/);
  assert.match(read('MASTER_PROMPT.md'), /\$codex-engineering-system/);
});

test('token economy contract forbids repeated broad verification during iteration', () => {
  const contract = read('.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md');
  assert.match(contract, /Do not run a full E2E suite after every edit/);
  assert.match(contract, /lowest reasoning level sufficient/);
  assert.match(contract, /do not load the full skill catalog by default/i);
  assert.match(contract, /commit, inputs, configuration/i);
  assert.match(contract, /three materially different failed attempts/i);
});

test('mature profile maps engineering system into the configured single skill root', () => {
  const profile = loadTargetProfile(ROOT, 'mature-yandex-phaser', { mode: 'update' });
  const entries = resolveManifestEntries(loadManifest(ROOT), profile, 'update');
  const system = entries.find((entry) => entry.logicalId === 'skill:codex-engineering-system:SKILL.md');
  assert.equal(system?.target, '.agents/skills/codex-engineering-system/SKILL.md');
  assert.equal(system?.conflictPolicy, 'semantic-merge');
  assert.equal(entries.some((entry) => entry.target.startsWith('.codex/skills/')), false);
});
