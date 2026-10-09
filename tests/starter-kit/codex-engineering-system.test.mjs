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

test('multi-character CG fallback is a delivered, fail-closed mobile art rule', () => {
  const visual = read('.codex/skills/visual-quality-gate/SKILL.md');
  const mobile = read('.codex/skills/mobile-game-ux/SKILL.md');
  const template = read('templates/visual-review/SCREENSHOT_VISUAL_GATE.md');
  const manifest = loadManifest(ROOT);
  const mature = resolveManifestEntries(manifest, loadTargetProfile(ROOT, 'mature-yandex-phaser', { mode: 'update' }), 'update');
  for (const logicalId of ['skill:visual-quality-gate:SKILL.md', 'skill:mobile-game-ux:SKILL.md', 'managed:screenshot-visual-gate-template']) {
    assert.ok(mature.some(entry => entry.logicalId === logicalId), `missing mature update delivery: ${logicalId}`);
  }
  assert.match(visual, /two materially distinct sprite-position/i);
  assert.match(visual, /MUST evaluate a unified CG/i);
  assert.match(visual, /MUST prefer the unified CG/i);
  assert.match(visual, /360×640/);
  assert.match(visual, /visible character silhouette pixels/i);
  assert.match(visual, /Do not bake dialogue, UI, icons/i);
  assert.match(visual, /ESCALATION_REPORT\.md/);
  assert.match(mobile, /multi-character dialogue composition and CG fallback/i);
  assert.match(template, /visible silhouette pixels vs first dialogue glyphs/i);
  assert.match(template, /independent reviewer verdict/i);
});

test('generated human CG anatomy and spatial logic gate ships to mature game targets', () => {
  const visual = read('.codex/skills/visual-quality-gate/SKILL.md');
  const mobile = read('.codex/skills/mobile-game-ux/SKILL.md');
  const template = read('templates/visual-review/SCREENSHOT_VISUAL_GATE.md');
  const manifest = loadManifest(ROOT);
  const mature = resolveManifestEntries(manifest, loadTargetProfile(ROOT, 'mature-yandex-phaser', { mode: 'update' }), 'update');
  for (const logicalId of ['skill:visual-quality-gate:SKILL.md', 'skill:mobile-game-ux:SKILL.md', 'managed:screenshot-visual-gate-template']) {
    assert.ok(mature.some(entry => entry.logicalId === logicalId), `missing mature update delivery: ${logicalId}`);
  }
  assert.match(visual, /Generated human-figure anatomy, camera and spatial-continuity gate/);
  assert.match(visual, /MUST inspect the full image/);
  assert.match(visual, /compressed or implausibly short legs/);
  assert.match(visual, /wide-angle\/low-angle distortion/);
  assert.match(visual, /Grounding and spatial logic/);
  assert.match(visual, /wet reflective foreground/);
  assert.match(visual, /MUST prefer a consciously composed mid-thigh/);
  assert.match(visual, /VISUAL_ACCEPTANCE: FAIL\/REWORK/);
  assert.match(mobile, /generated human-figure anatomy, camera and spatial-continuity gate/i);
  assert.match(template, /Human-figure CG anatomy and grounding/);
  assert.match(template, /false flooded or behind-seawall appearance/);
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
