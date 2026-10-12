import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../../tools/starter-kit/lib.mjs';

const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const image = '.codex/skills/visual-quality-gate/SKILL.md';
const mobile = '.codex/skills/mobile-game-ux/SKILL.md';
const template = 'templates/visual-review/SCREENSHOT_VISUAL_GATE.md';

test('static narrative imagery defaults to full-scene CG with explicit sprite exceptions', () => {
  assert.match(read(image), /CG-first for static narrative beats/);
  assert.match(read(image), /Independently staged sprites require a recorded reason/);
  assert.match(read(mobile), /full-scene CG-first/);
  assert.match(read(template), /Sprite staging exception and authored reason/);
});

test('independent art review prioritizes factual P0-P1 errors and forbids endless P3 rework', () => {
  const visual=read(image);
  assert.match(visual, /P0\/P1 factual defects first/);
  assert.match(visual, /P3 subjective style preferences/);
  assert.match(visual, /cannot alone trigger REWORK/);
  assert.match(visual, /transport\/quota loss is BLOCKED/i);
  assert.match(read(template), /P3 alone does not trigger additional generation/);
});

test('preload and crossfade are required scoped regressions for image-driven projects', () => {
  for (const p of [image, mobile]) {
    const s=read(p);
    assert.match(s, /preload(?:\/| and )crossfade/i);
    assert.match(s, /stale/);
    assert.match(s, /Slow 3G/);
    assert.match(s, /reduced-motion/);
  }
  assert.match(read(template), /Image-driven preload\/crossfade/);
});

test('deliverable narrative art policies are kept in authoritative manifest', () => {
  const manifest=JSON.parse(read('starter-kit.manifest.json'));
  for (const source of [image,mobile,template]){
    const entry=manifest.entries.find(e=>e.source===source);
    assert.ok(entry, 'missing manifest entry: '+source);
    const sum=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,source))).digest('hex');
    assert.equal(entry.sha256,sum,'managed file hash drift: '+source);
  }
});
