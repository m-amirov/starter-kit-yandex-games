import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib.mjs';

const OWNERSHIP_VALUES = new Set([
  'managed',
  'project-owned',
  'semantic-merge',
  'new-project-seed',
  'target-mapped',
  'ephemeral'
]);

export function validateTargetProfile(profile) {
  if (!profile || profile.schemaVersion !== 1) throw new Error('Target profile schemaVersion must be 1');
  if (!['new', 'mature'].includes(profile.projectType)) throw new Error('Target profile projectType must be new or mature');
  if (typeof profile.skillRoot !== 'string' || !profile.skillRoot) throw new Error('Target profile skillRoot is required');
  if (typeof profile.codexConfigRoot !== 'string' || !profile.codexConfigRoot) {
    throw new Error('Target profile codexConfigRoot is required');
  }
  if (typeof profile.allowSecondSkillRoot !== 'boolean') {
    throw new Error('Target profile allowSecondSkillRoot must be boolean');
  }
  if (typeof profile.applySeeds !== 'boolean') throw new Error('Target profile applySeeds must be boolean');
  if (!profile.ownershipOverrides || typeof profile.ownershipOverrides !== 'object') {
    throw new Error('Target profile ownershipOverrides is required');
  }
  for (const [pattern, ownership] of Object.entries(profile.ownershipOverrides)) {
    if (!OWNERSHIP_VALUES.has(ownership)) throw new Error(`Unknown ownership override for ${pattern}: ${ownership}`);
  }
  if (profile.projectType === 'mature') {
    for (const required of ['index.html', 'AGENTS.md', 'project.profile.yaml', 'game-spec.yaml', 'src/**', 'public/**']) {
      if (!(required in profile.ownershipOverrides)) throw new Error(`Mature profile missing ownership override: ${required}`);
    }
    if (profile.ownershipOverrides['index.html'] !== 'project-owned') {
      throw new Error('Mature profile must keep index.html project-owned');
    }
    if (profile.ownershipOverrides['AGENTS.md'] !== 'semantic-merge') {
      throw new Error('Mature profile must use semantic-merge for AGENTS.md');
    }
    if (profile.applySeeds) throw new Error('Mature profile cannot apply seeds');
  }
  return profile;
}

function profilePath(root, profile) {
  if (path.isAbsolute(profile) || /^[A-Za-z]:[\\/]/.test(profile)) return profile;
  if (profile.includes('/') || profile.includes('\\') || profile.endsWith('.json')) return path.resolve(profile);
  return path.join(root, 'config', 'targets', `${profile}.json`);
}

export function loadTargetProfile(root, profile, options = {}) {
  const { mode = 'update', targetNonEmpty = false } = options;
  let requested = profile;
  if (!requested) {
    if (mode === 'init') requested = 'new-project';
    else if (targetNonEmpty) throw new Error('Profile is required for update of a non-empty project');
    else throw new Error('Profile is required for update');
  }
  if (typeof requested === 'object') return validateTargetProfile(structuredClone(requested));
  const file = profilePath(root, requested);
  if (!fs.existsSync(file)) throw new Error(`Target profile not found: ${requested}`);
  const value = readJson(file);
  value.profileName = path.basename(file, '.json');
  return validateTargetProfile(value);
}

export function matchOwnershipOverride(profile, target) {
  const normalized = target.replaceAll('\\', '/');
  let best = null;
  for (const [pattern, ownership] of Object.entries(profile.ownershipOverrides ?? {})) {
    const normalizedPattern = pattern.replaceAll('\\', '/');
    const matches = normalizedPattern.endsWith('/**')
      ? normalized === normalizedPattern.slice(0, -3) || normalized.startsWith(normalizedPattern.slice(0, -2))
      : normalized === normalizedPattern;
    if (matches && (!best || normalizedPattern.length > best.pattern.length)) {
      best = { pattern: normalizedPattern, ownership };
    }
  }
  return best?.ownership;
}
