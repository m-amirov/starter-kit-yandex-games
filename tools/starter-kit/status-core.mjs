import fs from 'node:fs';
import path from 'node:path';
import { readJson, sha256Buffer, sha256File, stableJson } from './lib.mjs';

const PRODUCT_RUNTIME = /^(src|public|levels|assets)(\/|$)|^(index\.html|project\.profile\.yaml|game-spec\.yaml|package-lock\.json)$/;

export function inspectTargetStatus({ sourceRoot, targetRoot }) {
  const stateFile = path.join(targetRoot, '.starter-kit', 'state.json');
  const targetProfileFile = path.join(targetRoot, '.starter-kit', 'target.json');
  const targetManifestFile = path.join(targetRoot, '.starter-kit', 'manifest.json');
  const sourceManifestFile = path.join(sourceRoot, 'starter-kit.manifest.json');
  const manifestFile = fs.existsSync(targetManifestFile)
    ? path.join(targetRoot, '.starter-kit', 'manifest.json')
    : sourceManifestFile;
  if (!fs.existsSync(stateFile)) {
    return {
      status: 'missing-state',
      sourceVersion: fs.existsSync(manifestFile) ? readJson(manifestFile).version : null,
      updaterSchemaVersion: null,
      unresolvedConflicts: [],
      violations: ['Target state is missing']
    };
  }
  const state = readJson(stateFile);
  const profile = fs.existsSync(targetProfileFile) ? readJson(targetProfileFile) : state.targetProfile;
  const manifest = readJson(manifestFile);
  const sourceManifest = fs.existsSync(sourceManifestFile) ? readJson(sourceManifestFile) : manifest;
  const currentSourceManifestHash = fs.existsSync(sourceManifestFile) ? sha256File(sourceManifestFile) : state.sourceManifestHash;
  const managedFiles = [];
  const modifiedManagedFiles = [];
  for (const [logicalId, baseline] of Object.entries(state.baseline ?? {})) {
    const file = path.join(targetRoot, baseline.target);
    managedFiles.push({ logicalId, target: baseline.target });
    if (!fs.existsSync(file) || sha256File(file) !== baseline.targetHash) modifiedManagedFiles.push(baseline.target);
  }
  const otherRoot = profile?.skillRoot === '.agents/skills' ? '.codex/skills' : '.agents/skills';
  const secondRootViolation = profile && !profile.allowSecondSkillRoot
    && fs.existsSync(path.join(targetRoot, otherRoot))
    && fs.readdirSync(path.join(targetRoot, otherRoot)).length > 0;
  const runtimeViolations = managedFiles.filter((entry) => PRODUCT_RUNTIME.test(entry.target));
  const seedViolations = manifest.entries.filter((entry) =>
    entry.ownership === 'new-project-seed'
    && entry.modes.includes('update')
    && profile?.projectType === 'mature'
  );
  const violations = [];
  if (!profile) violations.push('Target profile is missing');
  if (manifest.schemaVersion !== 2) violations.push(`Manifest schema mismatch: ${manifest.schemaVersion}`);
  if (secondRootViolation) violations.push(`Forbidden second skill root: ${otherRoot}`);
  if (runtimeViolations.length) violations.push('Managed product runtime detected');
  if (seedViolations.length) violations.push('Update-enabled seed detected for mature project');
  if (state.updaterSchemaVersion !== manifest.updaterSchemaVersion) violations.push('Manifest/updater schema mismatch');
  if (currentSourceManifestHash && state.sourceManifestHash !== currentSourceManifestHash) {
    violations.push('Source manifest differs from the applied target manifest');
  }
  const unresolvedConflicts = state.conflicts ?? [];
  let status = 'clean';
  if (unresolvedConflicts.length) status = 'conflicts';
  else if (modifiedManagedFiles.length || violations.length) status = 'modified';
  return {
    status,
    sourceVersion: sourceManifest.version,
    updaterVersion: sourceManifest.version,
    installedVersion: state.installedVersion,
    targetVersion: state.attemptedVersion,
    updaterSchemaVersion: manifest.updaterSchemaVersion,
    projectType: profile?.projectType,
    targetProfile: profile?.profileName ?? 'stored',
    skillRoot: profile?.skillRoot,
    managedFiles,
    projectOwnedFiles: [
      ...Object.entries(profile?.ownershipOverrides ?? {})
        .filter(([, ownership]) => ownership === 'project-owned')
        .map(([targetPattern]) => ({ targetPattern })),
      ...Object.values(state.projectOwned ?? {})
    ],
    semanticMergeFiles: Object.values(state.semanticAcceptances ?? {}),
    unresolvedConflicts,
    pendingMigrations: state.pendingMigrations ?? [],
    sourceManifestHash: state.sourceManifestHash,
    currentSourceManifestHash,
    targetStateHash: sha256Buffer(Buffer.from(stableJson(state))),
    idempotencyStatus: status === 'clean' ? 'clean' : 'blocked',
    forbiddenSecondRootStatus: secondRootViolation ? 'violation' : 'clean',
    productRuntimeOwnershipViolations: runtimeViolations,
    modifiedManagedFiles,
    violations
  };
}
