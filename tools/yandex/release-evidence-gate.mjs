import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_REQUIRED_GATES = Object.freeze([
  'requirements',
  'docs-freshness',
  'sdk-lifecycle',
  'localization',
  'functional-desktop',
  'input-mobile',
  'visual-desktop',
  'visual-mobile',
  'production-art',
  'package',
  'media',
  'performance',
  'feature-necessity',
  'independent-final-review'
]);

export const PRE_SUBMIT_REQUIRED_GATES = Object.freeze([
  ...LOCAL_REQUIRED_GATES,
  'platform-runtime'
]);

const NON_PASS = new Set(['FAIL', 'BLOCKED', 'UNKNOWN', 'UNPROVEN', 'NOT_RUN', 'UNAVAILABLE', 'WARN']);
const POSITIVE_BY_KIND = Object.freeze({
  automated: new Set(['PASS', 'N/A']),
  manual: new Set(['MANUAL_PASS', 'N/A']),
  external: new Set(['EXTERNAL_PASS', 'N/A'])
});

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha(value, length = 40) {
  const pattern = length === 64 ? /^[a-f0-9]{64}$/i : /^[a-f0-9]{7,64}$/i;
  return pattern.test(String(value ?? ''));
}

function evidenceComplete(gate, blockers) {
  if (!Array.isArray(gate.evidenceRefs) || gate.evidenceRefs.length === 0 || gate.evidenceRefs.some((item) => !text(item))) {
    blockers.push(`${gate.id}: evidenceRefs are required`);
  }

  if (gate.status === 'N/A') {
    if (!text(gate.reason)) blockers.push(`${gate.id}: N/A requires a reason`);
    return;
  }

  if (gate.kind === 'automated') {
    if (!Number.isInteger(gate.assertionsExecuted) || gate.assertionsExecuted < 1) {
      blockers.push(`${gate.id}: automated PASS requires assertionsExecuted >= 1`);
    }
    if (!object(gate.coverage) || gate.coverage.complete !== true) {
      blockers.push(`${gate.id}: automated PASS requires complete coverage`);
    } else if (Number.isInteger(gate.coverage.checked) && Number.isInteger(gate.coverage.total)
      && gate.coverage.checked !== gate.coverage.total) {
      blockers.push(`${gate.id}: coverage.checked must equal coverage.total`);
    }
  }
}

function gateSpecific(gate, blockers) {
  const meta = object(gate.metadata) ? gate.metadata : {};
  if (gate.id === 'docs-freshness' && gate.status !== 'N/A'
    && meta.liveCheck !== true && meta.manualCurrentReview !== true) {
    blockers.push('docs-freshness: snapshot-only evidence is insufficient; live check or explicit current manual review is required');
  }

  if (gate.id === 'input-mobile' && gate.status !== 'N/A' && meta.touchPath !== true) {
    blockers.push('input-mobile: actual touch-path evidence is required');
  }

  if (gate.id === 'visual-desktop' && gate.status !== 'N/A' && meta.pixelEvidence !== true) {
    blockers.push('visual-desktop: actual current-runtime pixel evidence is required');
  }

  if (gate.id === 'visual-mobile' && gate.status !== 'N/A') {
    if (meta.pixelEvidence !== true) blockers.push('visual-mobile: actual current-runtime pixel evidence is required');
    if (meta.mobileViewport !== true) blockers.push('visual-mobile: a real target mobile viewport is required');
  }

  if (gate.id === 'production-art' && gate.status !== 'N/A') {
    for (const field of ['manifestComplete', 'filesExist', 'runtimeMapped', 'runtimeReachable', 'visualAccepted']) {
      if (meta[field] !== true) blockers.push(`production-art: metadata.${field} must be true`);
    }
  }

  if (gate.id === 'performance' && gate.status !== 'N/A' && meta.hardwareMeasured !== true) {
    blockers.push('performance: synthetic/SwiftShader evidence cannot substitute hardware measurement');
  }

  if (gate.id === 'feature-necessity' && gate.status !== 'N/A'
    && (!Number.isInteger(meta.telemetryAssertions) || meta.telemetryAssertions < 1)) {
    blockers.push('feature-necessity: successful completion alone is insufficient; telemetryAssertions >= 1 is required');
  }
}

export function evaluateYandexReleaseEvidence(input = {}) {
  const blockers = [];
  if (input.schemaVersion !== 1) blockers.push('schemaVersion must equal 1');
  if (!['local-rc', 'pre-submit'].includes(input.phase)) blockers.push('phase must be local-rc or pre-submit');
  if (!object(input.source)) blockers.push('source object is required');

  const sourceHead = input.source?.head;
  if (!sha(sourceHead)) blockers.push('source.head must be a Git commit SHA');
  if (input.source?.clean !== true) blockers.push('release evidence requires a clean source worktree');
  if (!sha(input.source?.releaseBuildSha256, 64)) blockers.push('source.releaseBuildSha256 must be a SHA-256');

  const gates = Array.isArray(input.gates) ? input.gates : [];
  const byId = new Map();
  for (const gate of gates) {
    if (!object(gate) || !text(gate.id)) {
      blockers.push('every gate must have a stable id');
      continue;
    }
    if (byId.has(gate.id)) blockers.push(`${gate.id}: duplicate gate id`);
    byId.set(gate.id, gate);

    if (!['automated', 'manual', 'external'].includes(gate.kind)) {
      blockers.push(`${gate.id}: kind must be automated, manual, or external`);
      continue;
    }
    if (!text(gate.status)) {
      blockers.push(`${gate.id}: status is required`);
      continue;
    }
    if (NON_PASS.has(gate.status)) blockers.push(`${gate.id}: status ${gate.status} is non-PASS`);
    if (!POSITIVE_BY_KIND[gate.kind].has(gate.status)) {
      blockers.push(`${gate.id}: status ${gate.status} is not valid positive evidence for kind ${gate.kind}`);
    }

    if (gate.status !== 'N/A' && gate.sourceHead !== sourceHead) {
      blockers.push(`${gate.id}: EVIDENCE_PROVENANCE_MISMATCH evidence=${gate.sourceHead ?? '(missing)'} current=${sourceHead ?? '(missing)'}`);
    }
    evidenceComplete(gate, blockers);
    gateSpecific(gate, blockers);
  }

  const required = input.phase === 'pre-submit' ? PRE_SUBMIT_REQUIRED_GATES : LOCAL_REQUIRED_GATES;
  for (const id of required) {
    if (!byId.has(id)) blockers.push(`${id}: required gate is missing`);
  }

  const platform = byId.get('platform-runtime');
  if (input.phase === 'pre-submit' && platform) {
    if (!['manual', 'external'].includes(platform.kind)) blockers.push('platform-runtime: local automated evidence cannot satisfy the pre-submit platform gate');
    if (!['MANUAL_PASS', 'EXTERNAL_PASS'].includes(platform.status)) blockers.push('platform-runtime: requires MANUAL_PASS or EXTERNAL_PASS');
  }

  const verdict = blockers.length
    ? 'BLOCKED_YANDEX_RELEASE_EVIDENCE'
    : input.phase === 'pre-submit' ? 'PRE_SUBMIT_READY' : 'LOCAL_RC_READY';

  return {
    schemaVersion: 1,
    phase: input.phase ?? null,
    verdict,
    sourceHead: sourceHead ?? null,
    requiredGates: required,
    blockers
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const file = arg('--file');
  if (!file) {
    console.error('Usage: node tools/yandex/release-evidence-gate.mjs --file <artifacts/evidence/yandex-release-readiness.json>');
    process.exit(2);
  }
  const input = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const result = evaluateYandexReleaseEvidence(input);
  console.log(JSON.stringify(result, null, 2));
  if (result.verdict === 'BLOCKED_YANDEX_RELEASE_EVIDENCE') process.exitCode = 1;
}
