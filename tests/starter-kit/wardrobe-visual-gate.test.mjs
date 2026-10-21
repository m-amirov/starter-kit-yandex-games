import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateWardrobeVisualAcceptance, buildWardrobeWebReviewAddendum, WARDROBE_VISUAL_RULE } from '../../tools/production-art/wardrobe-visual-gate.mjs';

const HEAD = 'a'.repeat(40);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const text = 'A detailed independent observation of the character outfit and appearance.';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-visual-'));
  const refs = {
    portraitOriginal: 'portrait-original', portraitRuntime: 'portrait-runtime',
    landscapeOriginal: 'landscape-original', landscapeRuntime: 'landscape-runtime',
    characterReferences: { giulia: 'giulia-ref' }
  };
  const images = Object.values(refs).flatMap(r => typeof r === 'string' ? [r] : Object.values(r)).map((ref, i) => {
    const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(`${ref} actual pixels`)]);
    const file = `image-${i}.png`;
    fs.writeFileSync(path.join(dir, file), bytes);
    return { ref, path: file, kind: ref.includes('runtime') ? 'runtime' : 'original', sha256: sha(bytes) };
  });
  const packet = {
    schemaVersion: 1, ruleId: WARDROBE_VISUAL_RULE, requiredCast: ['giulia'], evidenceRoles: refs,
    request: { schemaVersion: 1, sceneId: 'ep3_staff_walkthrough', sourceHead: HEAD, context: text, images },
    adjacentScenes: []
  };
  const assess = {
    characterId: 'giulia', portraitObservation: text, landscapeObservation: text,
    referenceComparison: text, dualFormatComparison: text, continuityReason: text,
    repetitionReason: text, identityStatus: 'PASS', dualFormatStatus: 'PASS',
    continuityStatus: 'PASS', repetitionStatus: 'PASS', evidenceRefs: images.map(i => i.ref)
  };
  const raw = {
    sourceHead: HEAD, status: 'PASS', actualPixelsReceived: true,
    visualEvidence: images.map(i => ({ ref: i.ref, sha256: i.sha256, path: i.path, observation: text })),
    wardrobeAssessments: [assess]
  };
  const receipt = {
    status: 'PASS', phase: 'acceptance', sourceHead: HEAD,
    actualPixelsReceived: true, artAcceptanceProfile: 'NARRATIVE_ART_ACCEPTANCE_V2',
    receivedEvidenceRefs: images.map(i => i.ref), visualEvidence: raw.visualEvidence,
    transport: {
      provider: 'codex-chatgpt-web-dev', mode: 'browser-only', stableBridgeUsed: false,
      actualProjectHead: HEAD, submitted: true, attachmentAccepted: true,
      transportTraceId: 'devweb_test', responseSha256: sha(JSON.stringify(raw))
    }
  };
  return { dir, packet, receipt, raw, args: () => ({ packet, receipt, rawResponse: JSON.stringify(raw), actualHead: HEAD, projectDir: dir }) };
}

test('independent original/runtime wardrobe evidence passes only with exact SHA and source HEAD', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  const result = validateWardrobeVisualAcceptance(f.args());
  assert.equal(result.status, 'PASS_WARDROBE_VISUAL_ACCEPTANCE');
  assert.deepEqual(result.errors, []);
});

test('rejects fabricated PASS when no reviewer wardrobe assessments exist', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  delete f.raw.wardrobeAssessments;
  f.receipt.transport.responseSha256 = sha(JSON.stringify(f.raw));
  assert.ok(validateWardrobeVisualAcceptance(f.args()).errors.includes('INDEPENDENT_WARDROBE_ASSESSMENTS_MISSING'));
});

test('rejects altered image bytes and stale source HEAD', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  fs.appendFileSync(path.join(f.dir, 'image-0.png'), 'changed');
  const errors = validateWardrobeVisualAcceptance({ ...f.args(), actualHead: 'b'.repeat(40) }).errors;
  assert.ok(errors.some(v => v.startsWith('IMAGE_SHA_MISMATCH')));
  assert.ok(errors.includes('SOURCE_HEAD_MISMATCH'));
});

test('blocks dual-format wardrobe mismatch despite overall Web PASS', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  f.raw.wardrobeAssessments[0].dualFormatStatus = 'REWORK';
  f.receipt.transport.responseSha256 = sha(JSON.stringify(f.raw));
  assert.ok(validateWardrobeVisualAcceptance(f.args()).errors.some(v => v.includes('WARDROBE_STATUS_NOT_PASS:giulia:dualFormatStatus')));
});

test('requires observed adjacent pixels for continuous scenes', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  f.packet.adjacentScenes = [{ sceneId: 'ep3_survey_start', transition: 'continuous', characters: ['giulia'], evidenceRef: 'missing-neighbor' }];
  assert.ok(validateWardrobeVisualAcceptance(f.args()).errors.some(v => v.includes('CONTINUOUS_SCENE_PIXELS_MISSING')));
});

test('does not treat wardrobe reuse across time break as automatically incorrect', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  f.packet.adjacentScenes = [{ sceneId: 'ep3_previous', transition: 'time-break', reason: 'The staff uniform remains necessary for the next work shift.' }];
  assert.equal(validateWardrobeVisualAcceptance(f.args()).status, 'PASS_WARDROBE_VISUAL_ACCEPTANCE');
});

test('rejects untrusted receipt / altered reviewer transcript', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  f.receipt.transport.stableBridgeUsed = true;
  const result = validateWardrobeVisualAcceptance({ ...f.args(), rawResponse: JSON.stringify(f.raw) + 'tamper' });
  assert.ok(result.errors.includes('WEB_TRANSPORT_NOT_ATTESTED'));
  assert.ok(result.errors.includes('RAW_RESPONSE_SHA_MISMATCH'));
});

test('rejects blank portraits and absent character references', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  delete f.packet.evidenceRoles.characterReferences.giulia;
  assert.ok(validateWardrobeVisualAcceptance(f.args()).errors.includes('CHARACTER_REFERENCE_NOT_ATTACHED:giulia'));
});

test('review instructions demand real observations and justify contextual continuity', () => {
  const msg = buildWardrobeWebReviewAddendum({ request: { sceneId: 'ep3_staff_walkthrough' }, evidenceRoles: { characterReferences: { giulia: 'giulia-ref' } }, adjacentScenes: [] });
  assert.match(msg, /portrait vs landscape/);
  assert.match(msg, /repeated outfit/);
  assert.match(msg, /wardrobeAssessments/);
  assert.match(msg, /silver streaks/);
});
