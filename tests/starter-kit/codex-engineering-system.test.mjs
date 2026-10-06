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
  assert.match(contract, /Default to silent execution/);
  assert.match(contract, /one final task barrier/);
  assert.match(contract, /Do not repeat a green check/);
});

test('screenshot visual gate is a canonical acceptance barrier', () => {
  const contract = read('.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md');
  const visual = read('.codex/skills/visual-quality-gate/SKILL.md');
  const template = read('templates/visual-review/SCREENSHOT_VISUAL_GATE.md');
  assert.match(contract, /SCREENSHOT_VISUAL_GATE/);
  assert.match(contract, /runtime screenshot capture → visual inspection → correction/i);
  assert.match(visual, /SCREENSHOT_VISUAL_GATE/);
  assert.match(visual, /FUNCTIONALLY_IMPLEMENTED/);
  assert.match(visual, /actual touch path/i);
  assert.match(template, /Current HEAD/);
  assert.match(template, /Desktop/);
  assert.match(template, /Mobile/);
  assert.match(read('PROJECT_RULES.md'), /SCREENSHOT_VISUAL_GATE/);
});

test('concept proof blocks production until manual review', () => {
  const gate = read('.starter-kit/core/CONCEPT_PROOF_GATE.md');
  for (const token of [
    'CONCEPT_PROOF_REVIEW_READY',
    'CONTINUE_PRODUCTION',
    'REDESIGN_CORE',
    'STOP_PROJECT',
    'release ZIP',
    'Daily',
    'solver',
    '5–10 seconds'
  ]) assert.match(gate, new RegExp(token));
  assert.match(read('templates/product-validation/BLIND_PLAYTEST.md'), /clean save/);
  assert.match(read('templates/product-validation/DECISION.md'), /first action is not understood within 10 seconds/);
});

test('termination and harness adjudication are reusable contracts', () => {
  const termination = read('.codex/skills/project-termination/SKILL.md');
  const harness = read('.starter-kit/core/TEST_HARNESS_ADJUDICATION.md');
  assert.match(termination, /STOP_PROJECT/);
  assert.match(termination, /Git history/);
  assert.match(termination, /not a temporary blocker/);
  assert.match(harness, /minimal native fixture/);
  assert.match(harness, /elementFromPoint/);
  assert.match(harness, /product defect or a harness defect/);
});

test('mature profile maps engineering system into the configured single skill root', () => {
  const profile = loadTargetProfile(ROOT, 'mature-yandex-phaser', { mode: 'update' });
  const entries = resolveManifestEntries(loadManifest(ROOT), profile, 'update');
  const system = entries.find((entry) => entry.logicalId === 'skill:codex-engineering-system:SKILL.md');
  assert.equal(system?.target, '.agents/skills/codex-engineering-system/SKILL.md');
  assert.equal(system?.conflictPolicy, 'semantic-merge');
  assert.equal(entries.some((entry) => entry.target.startsWith('.codex/skills/')), false);
});


test('failure memory is a regression-backed contract', () => {
  const agents = read('AGENTS.md');
  const contract = read('.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md');
  const harness = read('.starter-kit/core/TEST_HARNESS_ADJUDICATION.md');
  const mobile = read('.codex/skills/mobile-game-ux/SKILL.md');
  const visual = read('.codex/skills/visual-quality-gate/SKILL.md');
  const release = read('.codex/skills/release-audit/SKILL.md');
  const postmortem = read('docs/DEVELOPMENT_POSTMORTEM_2026-09.md');
  const failures = read('lessons/known-failures.yaml');

  assert.match(agents, /known-failures\.yaml/);
  assert.match(contract, /reproduce → classify → root cause → repair → regression coverage/);
  assert.match(contract, /CONFIGURATION_ERROR, TEST_FAILURE, COMMAND_FAILURE, HARNESS_DEFECT and PRODUCT_DEFECT/);
  assert.match(harness, /active locale/);
  assert.match(mobile, /390×844/);
  assert.match(visual, /source-asset\/focal-point defect/);
  assert.match(release, /BLOCKED_BASE_MISMATCH/);
  assert.match(postmortem, /default-path narrative audit/i);
  assert.match(failures, /release-base-mismatch/);
});
