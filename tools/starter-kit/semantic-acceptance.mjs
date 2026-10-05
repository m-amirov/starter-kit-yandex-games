import fs from 'node:fs';
import path from 'node:path';

import { readJson, sha256File, writeJson } from './lib.mjs';

export function recordSemanticAcceptance({ root, logicalId, target }) {
  const stateFile = path.join(root, '.starter-kit', 'state.json');
  const manifestFile = path.join(root, '.starter-kit', 'manifest.json');
  if (!fs.existsSync(stateFile) || !fs.existsSync(manifestFile)) {
    return { status: 'NOT_MANAGED', logicalId, target };
  }

  const state = readJson(stateFile);
  const manifest = readJson(manifestFile);
  const entry = (manifest.entries ?? []).find((item) => item.logicalId === logicalId);
  if (!entry) throw new Error(`Starter Kit manifest entry is missing: ${logicalId}`);
  const semantic = entry.ownership === 'semantic-merge'
    || entry.ownership === 'target-mapped'
    || entry.conflictPolicy === 'semantic-merge';
  if (!semantic) throw new Error(`Starter Kit entry is not semantic-merge: ${logicalId}`);
  const expectedTarget = entry.target ?? target;
  if (!target || expectedTarget !== target) {
    throw new Error(`Semantic acceptance target mismatch for ${logicalId}: expected ${expectedTarget}, got ${target}`);
  }
  const targetFile = path.join(root, target);
  if (!fs.existsSync(targetFile)) throw new Error(`Semantic acceptance target is missing: ${target}`);

  state.semanticAcceptances ??= {};
  state.baseline ??= {};
  state.semanticAcceptances[logicalId] = {
    target,
    sourceHash: entry.sha256,
    targetHash: sha256File(targetFile)
  };
  delete state.baseline[logicalId];
  state.conflicts = (state.conflicts ?? []).filter((item) => item.logicalId !== logicalId && item.target !== target);
  writeJson(stateFile, state);
  return { status: 'ACCEPTED', logicalId, target, targetHash: state.semanticAcceptances[logicalId].targetHash };
}
