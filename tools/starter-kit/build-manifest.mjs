import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, sha256File, writeJson } from './lib.mjs';
import { validateManifest } from './manifest.mjs';

const configuration = readJson(path.join(ROOT, 'config', 'manifest-entries.json'));
if (configuration.schemaVersion !== 1 || !Array.isArray(configuration.entries)) {
  throw new Error('config/manifest-entries.json must use schemaVersion 1');
}
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const entries = configuration.entries.map((entry) => ({
  ...entry,
  sha256: sha256File(path.join(ROOT, entry.source))
}));
const manifest = {
  schemaVersion: 2,
  updaterSchemaVersion: 2,
  version,
  entries
};
validateManifest(manifest, ROOT);
writeJson(path.join(ROOT, 'starter-kit.manifest.json'), manifest);
console.log(`Wrote manifest v${manifest.schemaVersion} for ${version} with ${entries.length} entries.`);
