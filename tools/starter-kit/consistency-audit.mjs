import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function content(root, relative) {
  const p = path.join(root, relative);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function json(root, relative, errors) {
  const raw = content(root, relative);
  if (raw === null) {
    errors.push({ code: 'MISSING_FILE', path: relative });
    return null;
  }
  try { return JSON.parse(raw); }
  catch { errors.push({ code: 'INVALID_JSON', path: relative }); return null; }
}

function yamlScalar(raw, name) {
  const expression = '^\\s*' + name + ':\\s*[\'"]?([^\'"\\r\\n#]+)';
  const match = raw?.match(new RegExp(expression, 'm'));
  return match?.[1]?.trim() ?? null;
}

/** Read-only cross-file source audit. This is not a live Yandex documentation check. */
export function auditStarterKitConsistency(root = SOURCE_ROOT) {
  const errors = [];
  const warnings = [];
  const pkg = json(root, 'package.json', errors);
  const manifest = json(root, 'starter-kit.manifest.json', errors);
  const snapshot = json(root, 'config/yandex-doc-snapshot.json', errors);
  const readme = content(root, 'README.md');
  const versionText = content(root, '.starter-kit/VERSION');
  const registry = content(root, 'config/yandex-requirements.yaml');
  const releaseSkill = content(root, '.codex/skills/yandex-release-validation/SKILL.md');
  const version = pkg?.version ?? null;

  if (version && manifest?.version && version !== manifest.version)
    errors.push({ code: 'VERSION_MANIFEST_MISMATCH', expected: version, actual: manifest.version });
  if (version && versionText !== null && versionText.trim() !== version)
    errors.push({ code: 'VERSION_FILE_MISMATCH', expected: version, actual: versionText.trim() });
  if (version && readme !== null && !readme.split('\n', 1)[0].includes(version))
    warnings.push({ code: 'README_VERSION_STALE', expected: version });
  if (!registry) errors.push({ code: 'MISSING_FILE', path: 'config/yandex-requirements.yaml' });
  if (!releaseSkill) errors.push({ code: 'MISSING_FILE', path: '.codex/skills/yandex-release-validation/SKILL.md' });
  const registryReviewedAt = yamlScalar(registry, 'reviewedAt');
  const snapshotReviewedAt = snapshot?.reviewedAt ?? null;
  if (registryReviewedAt && snapshotReviewedAt && registryReviewedAt !== snapshotReviewedAt)
    errors.push({ code: 'REGISTRY_SNAPSHOT_REVIEW_MISMATCH', registryReviewedAt, snapshotReviewedAt });
  if (!registryReviewedAt) errors.push({ code: 'REGISTRY_REVIEW_MISSING' });
  if (!snapshotReviewedAt) errors.push({ code: 'SNAPSHOT_REVIEW_MISSING' });
  if (releaseSkill && /registry for the official requirements revision dated\s+\d{1,2}\s+[A-Za-z]+\s+20\d\d/i.test(releaseSkill))
    warnings.push({ code: 'HARDCODED_RELEASE_SKILL_REVISION', path: '.codex/skills/yandex-release-validation/SKILL.md' });

  return {
    status: errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS',
    version, registryReviewedAt, snapshotReviewedAt, errors, warnings,
    note: 'Read-only source consistency only; does not prove live Yandex documentation freshness.'
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const idx = process.argv.indexOf('--root');
  const root = idx >= 0 ? process.argv[idx + 1] : SOURCE_ROOT;
  const result = auditStarterKitConsistency(root);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.errors.length || (process.argv.includes('--strict') && result.warnings.length)) process.exitCode = 2;
}
