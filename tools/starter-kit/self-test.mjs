import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, sha256File } from './lib.mjs';
import { loadManifest, validateManifest } from './manifest.mjs';
import { inspectTargetStatus } from './status-core.mjs';
import { auditConsoleRegistryText, auditRequirementRegistryText, auditSnapshotRegistryAlignment } from '../yandex/requirements-audit.mjs';
import { loadSourceConfig } from '../yandex/docs-watch.mjs';

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
  if (!policy.globalRules?.firstPublicationHorizontalGameplayVideoRequired) errors.push('first-publication horizontal gameplay video policy is not enabled');
  if (!policy.globalRules?.upstreamDocumentationFreshnessRequiredBeforeYandexSubmission) errors.push('upstream documentation freshness policy is not enabled');
  if (!policy.globalRules?.unresolvedUpstreamSemanticDiffBlocksRelease) errors.push('unresolved upstream semantic diff policy is not enabled');
  if (!policy.globalRules?.fetchFailedRequiresExplicitManualCurrentDocumentReview) errors.push('FETCH_FAILED manual review policy is not enabled');
  if (!policy.globalRules?.realGameplayRatioRequiresManualVisualEvidence) errors.push('real gameplay ratio manual evidence policy is not enabled');
  if (policy.globalRules?.promotionalMp4InGameReleaseZip !== 'forbidden') errors.push('promotional MP4 release ZIP policy is not forbidden');
  if (policy.globalRules?.externalEvidenceProviderAuthority !== 'advisory') errors.push('external evidence provider must remain advisory');
  if (!policy.globalRules?.externalEvidenceProviderOptional) errors.push('external evidence provider must remain optional');
  if (policy.globalRules?.authenticatedExternalRun !== 'explicit-only') errors.push('authenticated external provider run must be explicit-only');
  if (policy.globalRules?.externalProviderFloatingRefs !== 'forbidden') errors.push('external provider floating refs must be forbidden');
  if (policy.globalRules?.externalProviderRuntimeInGameZip !== 'forbidden') errors.push('external provider runtime must be forbidden in the game ZIP');
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

function validateYandexContracts(root, skillRoot, errors, sourceMode) {
  const numbered = fs.readFileSync(path.join(root, 'config', 'yandex-requirements.yaml'), 'utf8');
  const numberedAudit = auditRequirementRegistryText(numbered, sourceMode ? { reviewedAt: '2026-09-30' } : {});
  errors.push(...numberedAudit.errors.map((error) => `Yandex numbered registry: ${error}`));

  const consoleRegistry = fs.readFileSync(path.join(root, 'config', 'yandex-console-requirements.yaml'), 'utf8');
  const consoleAudit = auditConsoleRegistryText(consoleRegistry, sourceMode ? { reviewedAt: '2026-09-30' } : {});
  errors.push(...consoleAudit.errors.map((error) => `Yandex Console registry: ${error}`));

  for (const relative of ['config/yandex-doc-sources.yaml', 'config/yandex-doc-snapshot.json', 'tools/yandex/docs-watch.mjs']) {
    if (!fs.existsSync(path.join(root, relative))) errors.push(`Yandex documentation watcher file is missing: ${relative}`);
  }
  if (fs.existsSync(path.join(root, 'config', 'yandex-doc-snapshot.json'))) {
    const snapshotAudit = auditSnapshotRegistryAlignment({
      requirementText: numbered,
      consoleText: consoleRegistry,
      snapshot: readJson(path.join(root, 'config', 'yandex-doc-snapshot.json')),
      sourceConfig: loadSourceConfig(path.join(root, 'config', 'yandex-doc-sources.yaml'))
    });
    errors.push(...snapshotAudit.errors.map((error) => `Yandex snapshot alignment: ${error}`));
  }

  for (const relative of ['config/game-spec.schema.json', 'config/final-gameplay-videos.schema.json', 'config/yandex-external-evidence.schema.json', 'config/yandex-release-evidence.schema.json']) {
    try { readJson(path.join(root, relative)); } catch (error) { errors.push(`invalid JSON schema ${relative}: ${error.message}`); }
  }
  const packageJson = readJson(path.join(root, 'package.json'));
  if (!packageJson.scripts?.['yandex:requirements:audit']) errors.push('yandex:requirements:audit script is missing');
  if (!packageJson.scripts?.['yandex:console:audit']) errors.push('yandex:console:audit script is missing');
  if (!packageJson.scripts?.['yandex:docs:check']) errors.push('yandex:docs:check script is missing');
  if (!packageJson.scripts?.['yandex:docs:accept-snapshot']) errors.push('yandex:docs:accept-snapshot script is missing');
  if (!packageJson.scripts?.['yandex:media:validate']) errors.push('yandex:media:validate script is missing');
  if (!packageJson.scripts?.['yandex:release:evidence']) errors.push('yandex:release:evidence script is missing');
  for (const command of ['verify', 'run', 'normalize', 'audit']) {
    if (!packageJson.scripts?.[`yandex:external:${command}`]) errors.push(`yandex:external:${command} script is missing`);
  }

  for (const relative of ['tools/yandex/release-evidence-gate.mjs', 'docs/PRODUCTION_INCIDENT_HARDENING.md']) {
    if (!fs.existsSync(path.join(root, relative))) errors.push(`Yandex release hardening file is missing: ${relative}`);
  }
  const providerRegistryFile = path.join(root, 'config', 'yandex-external-evidence-providers.yaml');
  const providerToolFile = path.join(root, 'tools', 'yandex', 'external-evidence.mjs');
  const providerRoot = path.join(root, 'tools', 'yandex', 'external-runtime-provider');
  for (const required of [providerRegistryFile, providerToolFile, path.join(providerRoot, 'integrity-manifest.json'), path.join(providerRoot, 'validation-record.json')]) {
    if (!fs.existsSync(required)) errors.push(`external evidence provider file is missing: ${path.relative(root, required)}`);
  }
  if (fs.existsSync(providerRegistryFile)) {
    const registry = fs.readFileSync(providerRegistryFile, 'utf8');
    for (const token of [
      'id: yandex-draft-runtime-hardened', 'authority: advisory', 'optional: true',
      'authenticatedRun: explicit', 'providerVersion: hardened-draft-runtime-harness-1.3.0',
      'validatedManifestSha256: 3a73a9feb15de4b38f2ecd57bec167f5c280d8e0780f394b7d5a122e45a3755a',
      'officialYandexTool: false'
    ]) if (!registry.includes(token)) errors.push(`external provider registry token missing: ${token}`);
  }
  const providerManifest = path.join(providerRoot, 'integrity-manifest.json');
  if (fs.existsSync(providerManifest) && sha256File(providerManifest) !== '3a73a9feb15de4b38f2ecd57bec167f5c280d8e0780f394b7d5a122e45a3755a') {
    errors.push('external provider validated manifest pin changed');
  }
  if (fs.existsSync(providerManifest)) {
    const integrityManifest = readJson(providerManifest);
    for (const entry of integrityManifest.runtimeClosure ?? []) {
      const runtimeFile = path.join(providerRoot, entry.path);
      if (!fs.existsSync(runtimeFile)) errors.push(`external provider runtimeClosure file is missing: ${entry.path}`);
      else if (sha256File(runtimeFile) !== entry.sha256) errors.push(`external provider runtimeClosure hash mismatch: ${entry.path}`);
    }
    for (const entry of integrityManifest.provenanceInputs ?? []) {
      if (fs.existsSync(path.join(providerRoot, entry.historicalPath))) errors.push(`external provider provenance input was vendored: ${entry.historicalPath}`);
    }
  }

  const validationSkill = fs.readFileSync(path.join(root, skillRoot, 'yandex-release-validation', 'SKILL.md'), 'utf8');
  for (const token of [
    'CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO',
    'final-gameplay-videos.json',
    'yandex:media:validate',
    'Promotional MP4',
    '20–25 seconds',
    'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED',
    'yandex-doc-snapshot.json',
    'Optional external Draft runtime evidence',
    'Aggregated release verdict — P0',
    'yandex:release:evidence',
    'PRE_SUBMIT_READY'
  ]) {
    if (!validationSkill.includes(token)) errors.push(`Yandex validation skill token missing: ${token}`);
  }
  if (sourceMode) {
    const spec = fs.readFileSync(path.join(root, 'game-spec.yaml'), 'utf8');
    for (const token of ['yandex:', 'type: first-publication', 'horizontalGameplayVideo:', 'languageDependentText:']) {
      if (!spec.includes(token)) errors.push(`game-spec video contract token missing: ${token}`);
    }
    if (!fs.existsSync(path.join(root, 'artifacts', 'evidence', 'final-gameplay-videos.json'))) {
      errors.push('final gameplay videos evidence seed is missing');
    }
  }
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
  if (packageVersion !== version) errors.push(`version mismatch: VERSION=${version}, package=${packageVersion}`);
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
if (skillRoot) validateYandexContracts(ROOT, skillRoot, errors, sourceMode);
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
