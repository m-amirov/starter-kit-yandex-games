import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../../tools/starter-kit/lib.mjs';
import { loadManifest, resolveManifestEntries } from '../../tools/starter-kit/manifest.mjs';
import { loadTargetProfile } from '../../tools/starter-kit/profile.mjs';

test('narrative visual preflight is delivered by Starter Kit with authoritative hashes', () => {
  const manifest=loadManifest(ROOT);
  const ids=['managed:narrative-scene-contract','managed:narrative-scene-contract-doc'];
  const mature=resolveManifestEntries(manifest,loadTargetProfile(ROOT,'mature-yandex-phaser',{mode:'update'}),'update');
  for(const id of ids) {
    const entry=manifest.entries.find(e=>e.logicalId===id);
    assert.ok(entry,'missing entry '+id);
    assert.ok(mature.some(e=>e.logicalId===id),'not delivered to mature projects: '+id);
    const bytes=fs.readFileSync(path.join(ROOT,entry.source));
    const digest=crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(entry.sha256,digest,'stale delivered file: '+entry.source);
  }
});

test('visual quality gate requires authored scene mapping without conflating it with Web review', () => {
  const text=fs.readFileSync(path.join(ROOT,'.codex/skills/visual-quality-gate/SKILL.md'),'utf8');
  assert.match(text,/Narrative visual beat preflight/);
  assert.match(text,/narrative-scene-contract\.mjs/);
  assert.match(text,/Metadata agreement never counts as independent pixel review/);
});
