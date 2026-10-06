import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateYandexReleaseEvidence,
  LOCAL_REQUIRED_GATES,
  PRE_SUBMIT_REQUIRED_GATES
} from '../../tools/yandex/release-evidence-gate.mjs';

const HEAD = 'a'.repeat(40);
const BUILD = 'b'.repeat(64);

function automated(id, metadata = {}, overrides = {}) {
  return {
    id,
    kind: 'automated',
    status: 'PASS',
    sourceHead: HEAD,
    assertionsExecuted: 1,
    coverage: { scope: id, checked: 1, total: 1, complete: true },
    evidenceRefs: [`artifacts/evidence/${id}.json`],
    metadata,
    ...overrides
  };
}

function base(phase = 'local-rc') {
  const gates = LOCAL_REQUIRED_GATES.map((id) => {
    if (id === 'input-mobile') return automated(id, { touchPath: true });
    if (id === 'visual-desktop') return automated(id, { pixelEvidence: true });
    if (id === 'visual-mobile') return automated(id, { pixelEvidence: true, mobileViewport: true });
    if (id === 'production-art') return automated(id, {
      manifestComplete: true,
      filesExist: true,
      runtimeMapped: true,
      runtimeReachable: true,
      visualAccepted: true
    });
    if (id === 'performance') return automated(id, { hardwareMeasured: true });
    if (id === 'feature-necessity') return automated(id, { telemetryAssertions: 1 });
    if (id === 'docs-freshness') return automated(id, { liveCheck: true });
    return automated(id);
  });
  if (phase === 'pre-submit') gates.push({
    id: 'platform-runtime',
    kind: 'external',
    status: 'EXTERNAL_PASS',
    sourceHead: HEAD,
    evidenceRefs: ['artifacts/evidence/platform-runtime.json'],
    metadata: {}
  });
  return {
    schemaVersion: 1,
    phase,
    source: { head: HEAD, clean: true, releaseBuildSha256: BUILD },
    gates
  };
}

test('local evidence aggregates only to LOCAL_RC_READY', () => {
  const result = evaluateYandexReleaseEvidence(base());
  assert.equal(result.verdict, 'LOCAL_RC_READY');
});

test('pre-submit requires explicit manual or external platform evidence', () => {
  const input = base('pre-submit');
  input.gates = input.gates.filter((gate) => gate.id !== 'platform-runtime');
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
  assert.ok(result.blockers.some((line) => /platform-runtime/.test(line)));
  assert.ok(PRE_SUBMIT_REQUIRED_GATES.includes('platform-runtime'));
});

test('zero executable assertions cannot pass an automated gate', () => {
  const input = base();
  input.gates.find((gate) => gate.id === 'sdk-lifecycle').assertionsExecuted = 0;
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
  assert.ok(result.blockers.some((line) => /assertionsExecuted/.test(line)));
});

test('desktop visual PASS cannot substitute missing mobile visual evidence', () => {
  const input = base();
  input.gates = input.gates.filter((gate) => gate.id !== 'visual-mobile');
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
});

test('stale HEAD evidence blocks the aggregate verdict', () => {
  const input = base();
  input.gates.find((gate) => gate.id === 'visual-mobile').sourceHead = 'c'.repeat(40);
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
  assert.ok(result.blockers.some((line) => /EVIDENCE_PROVENANCE_MISMATCH/.test(line)));
});

test('manifest-only production art cannot pass', () => {
  const input = base();
  input.gates.find((gate) => gate.id === 'production-art').metadata.runtimeReachable = false;
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
  assert.ok(result.blockers.some((line) => /runtimeReachable/.test(line)));
});

test('synthetic performance cannot be called hardware PASS', () => {
  const input = base();
  input.gates.find((gate) => gate.id === 'performance').metadata.hardwareMeasured = false;
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
});

test('feature victory without telemetry assertions is unproven', () => {
  const input = base();
  input.gates.find((gate) => gate.id === 'feature-necessity').metadata.telemetryAssertions = 0;
  const result = evaluateYandexReleaseEvidence(input);
  assert.equal(result.verdict, 'BLOCKED_YANDEX_RELEASE_EVIDENCE');
});

test('pre-submit passes only with the explicit platform gate', () => {
  const result = evaluateYandexReleaseEvidence(base('pre-submit'));
  assert.equal(result.verdict, 'PRE_SUBMIT_READY');
});
