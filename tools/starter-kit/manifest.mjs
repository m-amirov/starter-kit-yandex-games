import fs from 'node:fs';
import path from 'node:path';
import { assertNoReparseBetween, posix, readJson, resolveInside } from './lib.mjs';
import { matchOwnershipOverride } from './profile.mjs';

const OWNERSHIP = new Set([
  'managed',
  'project-owned',
  'semantic-merge',
  'new-project-seed',
  'target-mapped',
  'ephemeral'
]);

export function loadManifest(root) {
  const manifest = readJson(path.join(root, 'starter-kit.manifest.json'));
  validateManifest(manifest, root);
  return manifest;
}

export function validateManifest(manifest, root) {
  if (manifest.schemaVersion !== 2) throw new Error(`Manifest schema mismatch: ${manifest.schemaVersion}`);
  if (manifest.updaterSchemaVersion !== 2) throw new Error('Manifest updaterSchemaVersion must be 2');
  if (typeof manifest.version !== 'string' || !manifest.version) throw new Error('Manifest version is required');
  if (!Array.isArray(manifest.entries)) throw new Error('Manifest entries must be an array');
  const logicalIds = new Set();
  for (const entry of manifest.entries) {
    for (const field of ['source', 'logicalId', 'ownership', 'modes', 'projectTypes', 'conflictPolicy', 'sha256']) {
      if (entry[field] === undefined) throw new Error(`Manifest entry ${entry.logicalId ?? entry.source ?? '<unknown>'} missing ${field}`);
    }
    if (logicalIds.has(entry.logicalId)) throw new Error(`Duplicate logicalId: ${entry.logicalId}`);
    logicalIds.add(entry.logicalId);
    if (!OWNERSHIP.has(entry.ownership)) throw new Error(`Unknown ownership: ${entry.ownership}`);
    if (!entry.target && !entry.targetTemplate) throw new Error(`Manifest entry ${entry.logicalId} has no target`);
    if (!Array.isArray(entry.modes) || entry.modes.some((mode) => !['init', 'update'].includes(mode))) {
      throw new Error(`Invalid modes for ${entry.logicalId}`);
    }
    if (!Array.isArray(entry.projectTypes) || entry.projectTypes.some((type) => !['new', 'mature'].includes(type))) {
      throw new Error(`Invalid projectTypes for ${entry.logicalId}`);
    }
    if (entry.ownership === 'new-project-seed' && entry.modes.includes('update')) {
      throw new Error(`Seed ${entry.logicalId} cannot be enabled in update mode`);
    }
    if (entry.ownership === 'semantic-merge' && entry.conflictPolicy === 'overwrite') {
      throw new Error(`Semantic-merge ${entry.logicalId} cannot use overwrite policy`);
    }
    if (entry.source === 'index.html' && entry.ownership === 'managed') {
      throw new Error('index.html cannot be managed');
    }
    if (/^(src|public)(\/|$)/.test(entry.source) && entry.ownership === 'managed' && entry.projectTypes.includes('mature')) {
      throw new Error(`${entry.source} cannot be managed for a mature project`);
    }
    if (root) {
      const source = resolveInside(root, entry.source);
      assertNoReparseBetween(root, source);
      if (!fs.existsSync(source)) throw new Error(`Manifest source missing: ${entry.source}`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid SHA-256 for ${entry.logicalId}`);
  }
  return manifest;
}

function renderTarget(entry, profile) {
  const rendered = entry.targetTemplate
    ? entry.targetTemplate
      .replaceAll('{skillRoot}', profile.skillRoot)
      .replaceAll('{codexConfigRoot}', profile.codexConfigRoot)
    : entry.target;
  return posix(path.normalize(rendered));
}

export function resolveManifestEntries(manifest, profile, mode) {
  validateManifest(manifest);
  const resolved = [];
  const targets = new Map();
  for (const sourceEntry of manifest.entries) {
    if (!sourceEntry.modes.includes(mode) || !sourceEntry.projectTypes.includes(profile.projectType)) continue;
    if (sourceEntry.ownership === 'new-project-seed' && (!profile.applySeeds || mode !== 'init')) continue;
    if (sourceEntry.ownership === 'ephemeral') continue;
    const target = renderTarget(sourceEntry, profile);
    resolveInside('target-root', target);
    const override = matchOwnershipOverride(profile, target);
    const ownership = override ?? sourceEntry.ownership;
    if (ownership === 'project-owned') continue;
    if (sourceEntry.logicalId.startsWith('skill:')) {
      const expectedPrefix = `${profile.skillRoot.replaceAll('\\', '/')}/`;
      if (!target.startsWith(expectedPrefix)) {
        throw new Error(`Skill ${sourceEntry.logicalId} ignores configured skill root`);
      }
      if (!profile.allowSecondSkillRoot) {
        const forbiddenRoot = profile.skillRoot === '.codex/skills' ? '.agents/skills/' : '.codex/skills/';
        if (target.startsWith(forbiddenRoot)) throw new Error(`Second skill root is forbidden: ${target}`);
      }
    }
    if (targets.has(target)) {
      throw new Error(`Two logical IDs resolve to the same target: ${targets.get(target)} and ${sourceEntry.logicalId}`);
    }
    targets.set(target, sourceEntry.logicalId);
    resolved.push({ ...sourceEntry, target, ownership });
  }
  return resolved;
}
