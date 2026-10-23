import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NARRATIVE_ART_ACCEPTANCE_V3, validateArtReviewV3, isArtV3Accepted } from './narrative-art-acceptance-v3.mjs';

export const WARDROBE_VISUAL_RULE = 'WARDROBE_VISUAL_ACCEPTANCE_V1';
export { NARRATIVE_ART_ACCEPTANCE_V3 };
const SHA = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const FORMAT_ROLES = ['portraitOriginal', 'portraitRuntime', 'landscapeOriginal', 'landscapeRuntime'];
const narrativeText = value => typeof value === 'string' && value.trim().length >= 18;
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function safeRead(projectDir, relative, errors, label) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) {
    errors.push(`${label}:INVALID_PATH`);
    return null;
  }
  const root = fs.realpathSync(projectDir);
  const candidate = path.resolve(root, relative);
  if (candidate === root || !candidate.startsWith(root + path.sep)) {
    errors.push(`${label}:OUTSIDE_PROJECT`);
    return null;
  }
  try {
    const canonical = fs.realpathSync(candidate);
    if (!canonical.startsWith(root + path.sep) || !fs.statSync(canonical).isFile()) {
      errors.push(`${label}:OUTSIDE_PROJECT`);
      return null;
    }
    return fs.readFileSync(canonical);
  } catch {
    errors.push(`${label}:MISSING_FILE`);
    return null;
  }
}

function extractRawReviewerJson(raw) {
  const text = String(raw).trim();
  const parseCandidate = candidate => {
    try { return JSON.parse(candidate); } catch {}
    const normalized = candidate.replace(/(?<!\\)\\([\[\]_])/g, '$1');
    if (normalized === candidate) return null;
    try { return JSON.parse(normalized); } catch { return null; }
  };
  const direct = parseCandidate(text);
  if (direct) return direct;
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (match) return parseCandidate(match[1]);
  return null;
}

function validateNarrativeV3Acceptance({ packet, receipt, rawResponse, projectDir, actualHead } = {}) {
  const errors = [];
  const request = packet?.request;
  const head = request?.sourceHead;
  if (!packet || packet.schemaVersion !== 1 || packet.ruleId !== NARRATIVE_ART_ACCEPTANCE_V3) errors.push('INVALID_V3_PACKET');
  if (!HEAD.test(String(head ?? '')) || (actualHead && head !== actualHead)) errors.push('SOURCE_HEAD_MISMATCH');
  if (!narrativeText(request?.context)) errors.push('SOURCE_CONTEXT_MISSING');
  const images = Array.isArray(request?.images) ? request.images : [];
  if (images.length < 2 || images.length > 10) errors.push('IMAGE_COUNT_INVALID');
  const byRef = new Map();
  let hasOriginal = false;
  let hasRuntime = false;
  for (const image of images) {
    if (!image || typeof image.ref !== 'string' || byRef.has(image.ref) || !['original', 'runtime'].includes(image.kind)) {
      errors.push('INVALID_IMAGE_REF');
      continue;
    }
    byRef.set(image.ref, image);
    hasOriginal ||= image.kind === 'original';
    hasRuntime ||= image.kind === 'runtime';
    if (!SHA.test(String(image.sha256 ?? ''))) errors.push(`IMAGE_SHA_INVALID:${image.ref}`);
    if (projectDir) {
      const bytes = safeRead(projectDir, image.path, errors, `IMAGE:${image.ref}`);
      if (bytes && sha256(bytes) !== image.sha256?.toLowerCase()) errors.push(`IMAGE_SHA_MISMATCH:${image.ref}`);
      if (bytes && image.path?.toLowerCase().endsWith('.png') && !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) errors.push(`PNG_SIGNATURE_INVALID:${image.ref}`);
    }
  }
  if (!hasOriginal || !hasRuntime) errors.push('ORIGINAL_AND_RUNTIME_PIXELS_REQUIRED');
  const raw = extractRawReviewerJson(rawResponse);
  if (!raw || raw.artAcceptanceProfile !== NARRATIVE_ART_ACCEPTANCE_V3 || raw.sourceHead !== head || raw.status !== receipt?.status || raw.actualPixelsReceived !== true) errors.push('RAW_V3_REVIEW_MISSING_OR_DIVERGENT');
  if (!receipt || receipt.phase !== 'acceptance' || receipt.artAcceptanceProfile !== NARRATIVE_ART_ACCEPTANCE_V3 || receipt.actualPixelsReceived !== true) errors.push('INDEPENDENT_V3_REVIEW_MISSING');
  if (receipt?.sourceHead !== head || receipt?.transport?.actualProjectHead !== head) errors.push('REVIEW_HEAD_MISMATCH');
  if (receipt?.transport?.provider !== 'codex-chatgpt-web-dev' || receipt.transport.mode !== 'browser-only' || receipt.transport.stableBridgeUsed !== false || receipt.transport.submitted !== true || receipt.transport.attachmentAccepted !== true || !receipt.transport.transportTraceId) errors.push('WEB_TRANSPORT_NOT_ATTESTED');
  if (!SHA.test(String(receipt?.transport?.responseSha256 ?? '')) || receipt.transport.responseSha256 !== sha256(String(rawResponse ?? ''))) errors.push('RAW_RESPONSE_SHA_MISMATCH');
  const reviewed = raw ? validateArtReviewV3(raw) : { ok: false, errors: ['raw V3 response unavailable'] };
  if (!reviewed.ok) errors.push(...reviewed.errors.map(error => `V3_REVIEW_INVALID:${error}`));
  const receivedRefs = new Set(receipt?.receivedEvidenceRefs ?? []);
  const pixels = new Map((receipt?.visualEvidence ?? []).map(item => [item.ref, item]));
  const rawPixels = new Map((raw?.visualEvidence ?? []).map(item => [item.ref, item]));
  for (const [ref, image] of byRef) {
    const evidence = pixels.get(ref);
    if (!receivedRefs.has(ref) || !evidence || evidence.sha256 !== image.sha256 || evidence.path !== image.path || !narrativeText(evidence.observation)) errors.push(`PIXEL_OBSERVATION_MISSING:${ref}`);
    if (JSON.stringify(rawPixels.get(ref) ?? null) !== JSON.stringify(evidence ?? null)) errors.push(`RAW_PIXEL_OBSERVATIONS_DIVERGE:${ref}`);
  }
  if (JSON.stringify(receipt?.requiredCast ?? null) !== JSON.stringify(raw?.requiredCast ?? null) || JSON.stringify(receipt?.wardrobeAssessments ?? null) !== JSON.stringify(raw?.wardrobeAssessments ?? null)) errors.push('V3_UNIFIED_RECEIPT_DIVERGES_FROM_RAW');
  if (receipt?.status === 'REWORK') errors.push('REVIEW_REQUIRES_REWORK');
  return {
    ruleId: NARRATIVE_ART_ACCEPTANCE_V3,
    artAcceptanceProfile: NARRATIVE_ART_ACCEPTANCE_V3,
    status: receipt?.status ?? 'BLOCKED',
    unifiedVerdict: receipt?.status ?? 'BLOCKED',
    wardrobeVerdict: 'NESTED_IN_UNIFIED_ART_REVIEW',
    errors: [...new Set(errors)],
    sceneId: request?.sceneId ?? null,
    sourceHead: head ?? null,
    accepted: errors.length === 0 && isArtV3Accepted(receipt?.status)
  };
}

// Authored briefs cannot substitute for independent pixel observations.
export function validateWardrobeVisualAcceptance({ packet, receipt, rawResponse, projectDir, actualHead } = {}) {
  if (packet?.ruleId === NARRATIVE_ART_ACCEPTANCE_V3 || receipt?.artAcceptanceProfile === NARRATIVE_ART_ACCEPTANCE_V3) {
    return validateNarrativeV3Acceptance({ packet, receipt, rawResponse, projectDir, actualHead });
  }
  const errors = [];
  if (!packet || packet.schemaVersion !== 1 || packet.ruleId !== WARDROBE_VISUAL_RULE) errors.push('INVALID_PACKET');
  const request = packet?.request;
  const head = request?.sourceHead;
  if (!HEAD.test(String(head ?? '')) || (actualHead && head !== actualHead)) errors.push('SOURCE_HEAD_MISMATCH');
  if (!narrativeText(request?.context)) errors.push('SOURCE_CONTEXT_MISSING');
  if (!Array.isArray(request?.images)) errors.push('IMAGES_MISSING');
  if (!Array.isArray(packet?.requiredCast) || packet.requiredCast.length === 0 || new Set(packet.requiredCast).size !== packet.requiredCast.length) errors.push('REQUIRED_CAST_INVALID');

  const images = Array.isArray(request?.images) ? request.images : [];
  const byRef = new Map();
  for (const image of images) {
    if (!image || typeof image.ref !== 'string' || byRef.has(image.ref) || !['original', 'runtime'].includes(image.kind)) {
      errors.push('INVALID_IMAGE_REF');
      continue;
    }
    byRef.set(image.ref, image);
    if (!SHA.test(String(image.sha256 ?? ''))) errors.push(`IMAGE_SHA_INVALID:${image.ref}`);
    if (projectDir) {
      const bytes = safeRead(projectDir, image.path, errors, `IMAGE:${image.ref}`);
      if (bytes && sha256(bytes) !== image.sha256?.toLowerCase()) errors.push(`IMAGE_SHA_MISMATCH:${image.ref}`);
      if (bytes && image.path?.toLowerCase().endsWith('.png') && !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) errors.push(`PNG_SIGNATURE_INVALID:${image.ref}`);
    }
  }
  if (images.length < 4 || images.length > 10) errors.push('IMAGE_COUNT_INVALID');
  const roles = packet?.evidenceRoles ?? {};
  for (const role of FORMAT_ROLES) {
    const ref = roles[role];
    const image = byRef.get(ref);
    if (!image || image.kind !== (role.endsWith('Original') ? 'original' : 'runtime')) errors.push(`REQUIRED_PIXEL_EVIDENCE_MISSING:${role}`);
  }
  if (new Set(FORMAT_ROLES.map(role => roles[role])).size !== 4) errors.push('FORMATS_MUST_HAVE_DISTINCT_REFS');

  for (const character of packet?.requiredCast ?? []) {
    const ref = roles.characterReferences?.[character];
    if (!ref || byRef.get(ref)?.kind !== 'original') errors.push(`CHARACTER_REFERENCE_NOT_ATTACHED:${character}`);
  }
  if (!Array.isArray(packet?.adjacentScenes)) errors.push('ADJACENCY_DECLARATION_MISSING');
  const adjacencies = Array.isArray(packet?.adjacentScenes) ? packet.adjacentScenes : [];
  for (const neighbor of adjacencies) {
    if (!neighbor || !['continuous', 'context-change', 'time-break'].includes(neighbor.transition) || !neighbor.sceneId) {
      errors.push('ADJACENCY_INVALID'); continue;
    }
    if (neighbor.transition === 'continuous' && (!neighbor.evidenceRef || !byRef.has(neighbor.evidenceRef))) errors.push(`CONTINUOUS_SCENE_PIXELS_MISSING:${neighbor.sceneId}`);
    if (neighbor.transition !== 'continuous' && !narrativeText(neighbor.reason)) errors.push(`WARDROBE_CHANGE_REASON_MISSING:${neighbor.sceneId}`);
  }

  if (receipt?.status !== 'PASS' || receipt?.phase !== 'acceptance' || receipt?.actualPixelsReceived !== true || receipt?.artAcceptanceProfile !== 'NARRATIVE_ART_ACCEPTANCE_V2') errors.push('INDEPENDENT_WEB_PASS_MISSING');
  if (receipt?.sourceHead !== head || receipt?.transport?.actualProjectHead !== head) errors.push('REVIEW_HEAD_MISMATCH');
  if (receipt?.transport?.provider !== 'codex-chatgpt-web-dev' || receipt?.transport?.mode !== 'browser-only' || receipt?.transport?.stableBridgeUsed !== false || receipt?.transport?.submitted !== true || receipt?.transport?.attachmentAccepted !== true || !receipt?.transport?.transportTraceId) errors.push('WEB_TRANSPORT_NOT_ATTESTED');
  if (!SHA.test(String(receipt?.transport?.responseSha256 ?? '')) || receipt.transport.responseSha256 !== sha256(String(rawResponse ?? ''))) errors.push('RAW_RESPONSE_SHA_MISMATCH');
  const raw = extractRawReviewerJson(rawResponse);
  if (!raw || raw.status !== 'PASS' || raw.sourceHead !== head || raw.actualPixelsReceived !== true) errors.push('RAW_WEB_PASS_MISSING');
  const receivedRefs = new Set(receipt?.receivedEvidenceRefs ?? []);
  const pixels = new Map((receipt?.visualEvidence ?? []).map(v => [v.ref, v]));
  for (const [ref, image] of byRef) {
    const e = pixels.get(ref);
    if (!receivedRefs.has(ref) || !e || e.sha256 !== image.sha256 || e.path !== image.path || !narrativeText(e.observation)) errors.push(`PIXEL_OBSERVATION_MISSING:${ref}`);
  }
  const rawPixels = Array.isArray(raw?.visualEvidence) ? new Map(raw.visualEvidence.map(v => [v.ref, v])) : null;
  if (!rawPixels || rawPixels.size !== pixels.size) errors.push('RAW_PIXEL_OBSERVATIONS_DIVERGE');
  for (const [ref, observation] of pixels) {
    if (JSON.stringify(rawPixels?.get(ref) ?? null) !== JSON.stringify(observation)) errors.push(`RAW_PIXEL_OBSERVATIONS_DIVERGE:${ref}`);
  }
  if (Array.isArray(receipt?.unresolved) && receipt.unresolved.length) errors.push('REVIEW_HAS_UNRESOLVED_FINDINGS');
  if ((receipt?.findings ?? []).some(f => ['P0', 'P1'].includes(f.severity) && f.status !== 'RESOLVED')) errors.push('REVIEW_HAS_BLOCKING_FINDINGS');

  // Require per-character observations in the hash-bound independent raw response.
  const assessments = raw?.wardrobeAssessments;
  if (!Array.isArray(assessments)) errors.push('INDEPENDENT_WARDROBE_ASSESSMENTS_MISSING');
  for (const character of packet?.requiredCast ?? []) {
    const records = Array.isArray(assessments) ? assessments.filter(a => a.characterId === character) : [];
    if (records.length !== 1) { errors.push(`WARDROBE_ASSESSMENT_MISSING:${character}`); continue; }
    const item = records[0];
    for (const field of ['portraitObservation', 'landscapeObservation', 'referenceComparison', 'dualFormatComparison', 'continuityReason', 'repetitionReason']) {
      if (!narrativeText(item[field])) errors.push(`WARDROBE_OBSERVATION_MISSING:${character}:${field}`);
    }
    for (const field of ['identityStatus', 'dualFormatStatus', 'continuityStatus', 'repetitionStatus']) {
      if (item[field] !== 'PASS') errors.push(`WARDROBE_STATUS_NOT_PASS:${character}:${field}`);
    }
    const claimRefs = new Set(item.evidenceRefs ?? []);
    const required = [...FORMAT_ROLES.map(role => roles[role]), roles.characterReferences?.[character], ...adjacencies.filter(n => n.transition === 'continuous' && (n.characters ?? []).includes(character)).map(n => n.evidenceRef)];
    for (const ref of required) if (!ref || !claimRefs.has(ref) || !receivedRefs.has(ref)) errors.push(`WARDROBE_EVIDENCE_NOT_LINKED:${character}:${ref ?? 'missing'}`);
  }
  if (Array.isArray(assessments) && assessments.some(a => !(packet?.requiredCast ?? []).includes(a.characterId))) errors.push('EXTRANEOUS_CHARACTER_ASSESSMENT');
  return {
    ruleId: WARDROBE_VISUAL_RULE,
    status: errors.length ? 'NOT_VERIFIED_WARDROBE_VISUAL_ACCEPTANCE' : 'PASS_WARDROBE_VISUAL_ACCEPTANCE',
    sceneId: request?.sceneId ?? null,
    sourceHead: head ?? null,
    checkedCharacters: packet?.requiredCast ?? [],
    errors: [...new Set(errors)]
  };
}

export function buildWardrobeWebReviewAddendum(packet) {
  const scene = packet?.request?.sceneId ?? 'unknown';
  const references = packet?.evidenceRoles?.characterReferences ?? {};
  const adjacency = (packet?.adjacentScenes ?? []).map(item => `${item.sceneId}: ${item.transition}; ref=${item.evidenceRef ?? 'none'}; reason=${item.reason ?? 'none'}`).join('\n');
  return [
    `Wardrobe independent pixel-review requirement ${WARDROBE_VISUAL_RULE} for ${scene}.`,
    'Inspect the attached original and runtime pixels separately in both portrait and landscape.',
    'Compare every character with the attached canonical reference: apparent age, face, hair (including silver streaks), outfit and silhouette.',
    'Compare portrait vs landscape outfit, color, accessories; examine adjacent scene images for continuity, and consider authored time/location breaks.',
    'Flag unmotivated repeated outfit across time, but do not penalize a justified same-day/working-uniform continuity.',
    'An outfit described in a brief is NOT visual proof: any missing required pixels or material identity/wardrobe contradiction means REWORK or BLOCKED, never PASS.',
    `Cast and reference refs: ${JSON.stringify(references)}`,
    `Adjacency: ${adjacency || 'no neighboring evidence supplied; report any missing continuity evidence'}`,
    'In the ONE reviewer JSON object add wardrobeAssessments (not a separate response): one entry per required character, with fields:',
    'characterId, portraitObservation, landscapeObservation, referenceComparison, dualFormatComparison, continuityReason, repetitionReason, identityStatus, dualFormatStatus, continuityStatus, repetitionStatus, evidenceRefs.',
    'Each status must be PASS or REWORK; do not use PASS if unable to observe the relevant evidence. EvidenceRefs must refer only to images actually attached and received.',
    'Do not invent observations. Evaluate material player-facing contradictions first; avoid cosmetic regeneration loops.'
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = key => args[args.indexOf(key) + 1];
  if (!['--packet', '--receipt', '--raw', '--project'].every(key => args.includes(key))) {
    process.stderr.write('Usage: node tools/production-art/wardrobe-visual-gate.mjs --project <dir> --packet <json> --receipt <json> --raw <txt> [--head <40-char-sha>]\n');
    process.exitCode = 2;
  } else {
    const projectDir = path.resolve(get('--project'));
    const packet = JSON.parse(fs.readFileSync(path.resolve(projectDir, get('--packet')), 'utf8'));
    const receipt = JSON.parse(fs.readFileSync(path.resolve(projectDir, get('--receipt')), 'utf8'));
    const rawResponse = fs.readFileSync(path.resolve(projectDir, get('--raw')), 'utf8');
    const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8', windowsHide: true }).trim();
    if (args.includes('--head') && get('--head') !== actualHead) {
      process.stderr.write('Supplied HEAD differs from actual project HEAD\n');
      process.exit(2);
    }
    const result = validateWardrobeVisualAcceptance({ packet, receipt, rawResponse, projectDir, actualHead });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  }
}
