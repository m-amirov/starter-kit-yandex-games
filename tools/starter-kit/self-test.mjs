import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, sha256File } from './lib.mjs';
import { loadManifest, validateManifest } from './manifest.mjs';
import { inspectTargetStatus } from './status-core.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validatePolicy(root, skillRoot, errors) {
  const policy = readJson(path.join(root, 'config', 'skill-policy.json'));
  const required = policy.skills.map((skill) => skill.name);
  for (const name of required) {
    const file = path.join(root, skillRoot, name, 'SKILL.md');
    if (!fs.existsSync(file)) {
      errors.push(`missing skill: ${name}`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('## Yandex precedence')) errors.push(`missing Yandex precedence: ${name}`);
    if (/RELEASE_CANDIDATE_READY/.test(text) && name !== 'release-audit') {
      errors.push(`production skill attempts to authorize RC: ${name}`);
    }
  }
  for (const name of ['product-quality-review', 'visual-quality-gate', 'web-game-playtest', 'game-audio-quality', 'mobile-game-ux']) {
    if (!fs.existsSync(path.join(root, skillRoot, name, 'ORIGIN.md'))) errors.push(`missing origin: ${name}`);
  }
  const policyText = fs.readFileSync(path.join(root, 'config', 'skill-policy.json'), 'utf8');
  for (const token of [
    '"pwaAndServiceWorkerDefault": "forbidden"',
    '"cdnAssetsDefault": "forbidden"',
    '"webGpuOnlyDefault": "forbidden"',
    '"autoplayAudioDefault": "forbidden"'
  ]) {
    if (!policyText.includes(token)) errors.push(`policy token missing: ${token}`);
  }
  const engineering = policy.skills.find((skill) => skill.name === 'codex-engineering-system');
  if (!engineering?.mandatory) errors.push('codex-engineering-system must be mandatory');
  if (!policy.globalRules?.codexEngineeringSystemRequired) errors.push('codex engineering system policy is not enabled');
  if (!policy.globalRules?.targetedTestsDuringIteration) errors.push('targeted test policy is not enabled');
  if (!policy.globalRules?.fullSuitesOnlyAtTaskOrReleaseBarrier) errors.push('full-suite barrier policy is not enabled');
  if (!policy.globalRules?.freshEvidenceReuseSameCommitOnly) errors.push('fresh evidence policy is not enabled');
  if (policy.globalRules?.defaultReasoningLevel !== 'medium') errors.push('default reasoning must be medium');
  if (!policy.globalRules?.onePrimaryAgentDefault) errors.push('one primary agent policy is not enabled');
  if (!policy.globalRules?.silentExecutionDefault) errors.push('silent execution policy is not enabled');
  if (!policy.globalRules?.singleFinalTaskBarrier) errors.push('single final task barrier is not enabled');
  if (policy.globalRules?.repeatGreenChecksWithoutStateChange !== 'forbidden') errors.push('repeat-green policy is not forbidden');
  if (!policy.globalRules?.conceptProofRequiredBeforeProduction) errors.push('concept proof production barrier is not enabled');
  if (!policy.globalRules?.blindPlaytestRequiredBeforeMassContent) errors.push('blind playtest barrier is not enabled');
  if (!policy.globalRules?.stopProjectIsTerminal) errors.push('STOP_PROJECT terminal policy is not enabled');
  if (!policy.globalRules?.testHarnessAdjudicationRequired) errors.push('test harness adjudication is not enabled');
  if (!policy.globalRules?.screenshotVisualGateRequiredForProductionVisiblePasses) errors.push('screenshot visual gate policy is not enabled');
  if (policy.globalRules?.screenshotVisualGateAmbiguityPolicy !== 'required') errors.push('ambiguous visual changes must require the screenshot gate');
  if (!policy.globalRules?.visualAcceptanceRequiresCurrentHeadRuntimeScreenshots) errors.push('current-head runtime screenshot policy is not enabled');
  const coreContract = path.join(root, '.starter-kit', 'core', 'CODEX_ENGINEERING_SYSTEM.md');
  if (!fs.existsSync(coreContract)) errors.push('codex engineering system core contract is missing');
  else {
    const coreText = fs.readFileSync(coreContract, 'utf8');
    for (const token of ['Token and context economy', 'Do not run a full E2E suite after every edit', 'lowest reasoning level sufficient', '.loop/', 'Default to silent execution', 'one final task barrier', 'TEST_HARNESS_ADJUDICATION.md', 'SCREENSHOT_VISUAL_GATE', 'runtime screenshot capture']) {
      if (!coreText.includes(token)) errors.push(`engineering system contract token missing: ${token}`);
    }
  }
  const conceptGate = path.join(root, '.starter-kit', 'core', 'CONCEPT_PROOF_GATE.md');
  const harnessContract = path.join(root, '.starter-kit', 'core', 'TEST_HARNESS_ADJUDICATION.md');
  const requiredTemplates = [
    'templates/product-validation/BLIND_PLAYTEST.md',
    'templates/product-validation/OBSERVATIONS.md',
    'templates/product-validation/DECISION.md',
    'templates/visual-review/SCREENSHOT_VISUAL_GATE.md'
  ];
  if (!fs.existsSync(conceptGate)) errors.push('concept proof gate is missing');
  else {
    const conceptText = fs.readFileSync(conceptGate, 'utf8');
    for (const token of ['CONCEPT_PROOF_REVIEW_READY', 'CONTINUE_PRODUCTION', 'REDESIGN_CORE', 'STOP_PROJECT', 'release ZIP', 'Daily', 'solver']) {
      if (!conceptText.includes(token)) errors.push(`concept proof token missing: ${token}`);
    }
  }
  if (!fs.existsSync(harnessContract)) errors.push('test harness adjudication contract is missing');
  else {
    const harnessText = fs.readFileSync(harnessContract, 'utf8');
    for (const token of ['minimal native fixture', 'elementFromPoint', 'product defect', 'harness defect', 'pointer, touch, and input']) {
      if (!harnessText.includes(token)) errors.push(`harness adjudication token missing: ${token}`);
    }
  }
  for (const relative of requiredTemplates) {
    if (!fs.existsSync(path.join(root, relative))) errors.push(`product validation template missing: ${relative}`);
  }
  const yandexIndex = policy.skills.findIndex((skill) => skill.name === 'yandex-release-validation');
  const releaseIndex = policy.skills.findIndex((skill) => skill.name === 'release-audit');
  if (yandexIndex < 0 || releaseIndex < 0 || yandexIndex >= releaseIndex) {
    errors.push('yandex-release-validation must precede release-audit');
  }
  return required.length;
}

const errors = [];
const sourceMode = fs.existsSync(path.join(ROOT, 'starter-kit.manifest.json'))
  && fs.existsSync(path.join(ROOT, 'VERSION'));
const explicitTarget = arg('--target');
let version;
let manifest;
let skillRoot;
let targetStatus;

if (sourceMode) {
  version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const packageVersion = readJson(path.join(ROOT, 'package.json')).version;
  if (version !== '0.5.4' || packageVersion !== version) errors.push(`version mismatch: VERSION=${version}, package=${packageVersion}`);
  manifest = loadManifest(ROOT);
  validateManifest(manifest, ROOT);
  if (manifest.version !== version) errors.push(`manifest version mismatch: ${manifest.version}`);
  for (const entry of manifest.entries) {
    const file = path.join(ROOT, entry.source);
    if (sha256File(file) !== entry.sha256) errors.push(`manifest drift: ${entry.source}`);
  }
  const matureEntries = manifest.entries.filter((entry) => entry.projectTypes.includes('mature') && entry.modes.includes('update'));
  if (matureEntries.some((entry) => entry.source === 'index.html' || /^(src|public)(\/|$)/.test(entry.source))) {
    errors.push('mature update manifest contains product runtime');
  }
  if (manifest.entries.some((entry) => entry.ownership === 'new-project-seed' && entry.modes.includes('update'))) {
    errors.push('manifest contains update-enabled seed');
  }
  skillRoot = '.codex/skills';
} else {
  const profileFile = path.join(ROOT, '.starter-kit', 'target.json');
  if (!fs.existsSync(profileFile)) errors.push('target profile is missing');
  const profile = fs.existsSync(profileFile) ? readJson(profileFile) : {};
  skillRoot = profile.skillRoot;
  const manifestFile = path.join(ROOT, '.starter-kit', 'manifest.json');
  if (!fs.existsSync(manifestFile)) errors.push('target manifest snapshot is missing');
  manifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : { version: null };
  version = manifest.version;
  targetStatus = inspectTargetStatus({ sourceRoot: ROOT, targetRoot: ROOT });
  if (targetStatus.status !== 'clean') errors.push(`target status is ${targetStatus.status}`);
}

const skillCount = skillRoot ? validatePolicy(ROOT, skillRoot, errors) : 0;
if (explicitTarget) {
  targetStatus = inspectTargetStatus({ sourceRoot: ROOT, targetRoot: path.resolve(explicitTarget) });
  if (targetStatus.status !== 'clean') errors.push(`target status is ${targetStatus.status}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({
  status: 'PASS',
  mode: sourceMode ? 'source' : 'target',
  version,
  manifestSchemaVersion: manifest.schemaVersion,
  updaterSchemaVersion: manifest.updaterSchemaVersion,
  manifestEntries: manifest.entries.length,
  skills: skillCount,
  targetStatus: targetStatus?.status ?? 'not-requested'
}, null, 2));
