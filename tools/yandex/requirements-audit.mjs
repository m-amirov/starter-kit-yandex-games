import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from '../starter-kit/lib.mjs';

export const EXPECTED_REQUIREMENT_IDS = `
1.1 1.2 1.2.1 1.2.2 1.3 1.4 1.5 1.6
1.6.1.1 1.6.1.2 1.6.1.3 1.6.1.4 1.6.1.5 1.6.1.6 1.6.1.7 1.6.1.8
1.6.2.1 1.6.2.2 1.6.2.3 1.6.2.4 1.6.2.5 1.6.2.6 1.6.2.7
1.6.3.1 1.6.3.2 1.6.3.3 1.6.3.4 1.6.3.5
1.7 1.8 1.9 1.10.1 1.10.2 1.10.3 1.10.4 1.11 1.12
1.13.1 1.13.2 1.13.3 1.13.4 1.13.5 1.13.6
1.14 1.15 1.16 1.17 1.18 1.19.1 1.19.2 1.19.3 1.19.4
1.20 1.20.1 1.20.2 1.20.3 1.20.4 1.21 1.22 1.23 1.24
2.1 2.2 2.3 2.4 2.5 2.6 2.7 2.8 2.9 2.10 2.11 2.12 2.13 2.14
3.1 3.2 3.3 3.4.1 3.4.2 3.4.3 3.4.4 3.4.5 3.4.6 3.5 3.6
3.7.1 3.7.2 3.7.3 3.8 3.9
4.1 4.2 4.3 4.4 4.5 4.5.1 4.5.2 4.6.1 4.6.2 4.7
5.1.1 5.1.1.1 5.1.1.2 5.1.1.3 5.1.2 5.1.3 5.2 5.3 5.4 5.5
5.6 5.7 5.8 5.9 5.10 5.11 5.12
6.1 6.2 6.3 6.4 6.5 6.6 6.7 6.8 6.9 7
8.1 8.2.1 8.2.2 8.2.3 8.2.4 8.2.5
8.3.1 8.3.2 8.3.3 8.3.4 8.3.5 8.3.6 8.3.7
8.4.1 8.4.2 8.4.3 8.4.3.1 8.4.3.2 8.4.3.3 8.4.4
`.trim().split(/\s+/);

export const EXPECTED_REPEALED_IDS = [
  '1.5', '1.6.1.4', '1.17', '2.5', '2.11', '2.12', '3.1', '3.2',
  '3.3', '3.4.1', '3.7.3', '3.8', '5.5', '5.7', '5.8', '5.10', '7'
];
const EXPECTED_RECOMMENDED_IDS = ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8', '6.9'];

function metadataValue(text, key) {
  return text.match(new RegExp(`^\\s{2}${key}:\\s*['\"]?([^'\"\\r\\n]+)`, 'm'))?.[1]?.trim();
}

export function parseRequirementRows(text) {
  return [...text.matchAll(/^\s*-\s*\{\s*id:\s*'([^']+)',\s*enforcement:\s*([^,]+),\s*summary:\s*'([^']*)',\s*applicability:\s*([^,]+),\s*verification:\s*([^ }]+)\s*\}\s*$/gm)]
    .map((match) => ({
      id: match[1],
      enforcement: match[2].trim(),
      summary: match[3],
      applicability: match[4].trim(),
      verification: match[5].trim()
    }));
}

export function auditRequirementRegistryText(text, options = {}) {
  const errors = [];
  const rows = parseRequirementRows(text);
  const ids = rows.map((row) => row.id);
  const unique = new Set(ids);
  if (rows.length !== EXPECTED_REQUIREMENT_IDS.length) {
    errors.push(`official registry must contain ${EXPECTED_REQUIREMENT_IDS.length} clauses, found ${rows.length}`);
  }
  if (unique.size !== ids.length) errors.push('official registry contains duplicate requirement IDs');
  const missing = EXPECTED_REQUIREMENT_IDS.filter((id) => !unique.has(id));
  const extra = ids.filter((id) => !EXPECTED_REQUIREMENT_IDS.includes(id));
  if (missing.length) errors.push(`official registry is missing: ${missing.join(', ')}`);
  if (extra.length) errors.push(`official registry has unknown IDs: ${extra.join(', ')}`);

  if (metadataValue(text, 'lastModified') !== '2026-08-18') {
    errors.push('source.lastModified must be 2026-08-18');
  }
  if (options.reviewedAt && metadataValue(text, 'reviewedAt') !== options.reviewedAt) {
    errors.push(`source.reviewedAt must be ${options.reviewedAt}`);
  }

  const repealedIds = rows.filter((row) => row.enforcement === 'repealed').map((row) => row.id);
  if (JSON.stringify(repealedIds) !== JSON.stringify(EXPECTED_REPEALED_IDS)) {
    errors.push('repealed clauses changed or were removed');
  }
  const recommendedIds = rows.filter((row) => row.enforcement === 'recommended').map((row) => row.id);
  if (JSON.stringify(recommendedIds) !== JSON.stringify(EXPECTED_RECOMMENDED_IDS)) {
    errors.push('recommended clause classification changed');
  }
  for (const row of rows) {
    const expected = EXPECTED_REPEALED_IDS.includes(row.id)
      ? 'repealed'
      : EXPECTED_RECOMMENDED_IDS.includes(row.id) ? 'recommended' : 'required';
    if (row.enforcement !== expected) errors.push(`${row.id} enforcement must be ${expected}`);
    if (!row.summary.trim()) errors.push(`${row.id} summary must not be empty`);
  }
  for (const row of rows.filter((item) => EXPECTED_REPEALED_IDS.includes(item.id))) {
    if (row.applicability !== 'never' || row.verification !== 'none') {
      errors.push(`repealed clause ${row.id} must remain traceability-only`);
    }
  }

  const monetization = rows.find((row) => row.id === '1.12');
  if (!monetization || !/реклама или инап-покупки/i.test(monetization.summary)) {
    errors.push('1.12 must require ads OR in-app purchases');
  } else {
    if (monetization.applicability !== 'always') errors.push('1.12 applicability must be always');
    if (monetization.verification !== 'monetization-contract') errors.push('1.12 must use monetization-contract verification');
    if (/РСЯ/i.test(monetization.summary)) errors.push('1.12 must not be reduced to advertising or RSYA');
  }

  return { errors, requirementCount: rows.length, repealedIds, rows };
}

export function evaluateMonetization({ adsEnabled, purchasesEnabled }) {
  const pass = adsEnabled === true || purchasesEnabled === true;
  return {
    requirementId: '1.12',
    status: pass ? 'PASS' : 'BLOCK',
    evidence: { adsEnabled: adsEnabled === true, purchasesEnabled: purchasesEnabled === true },
    reason: pass
      ? 'Monetization is present through ads or in-app purchases.'
      : 'Requirement 1.12 requires ads or in-app purchases.'
  };
}

export function auditConsoleRegistryText(text, options = {}) {
  const errors = [];
  const ids = [...text.matchAll(/^\s{2}- id:\s*([^\s]+)\s*$/gm)].map((match) => match[1]);
  if (JSON.stringify(ids) !== JSON.stringify(['CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO'])) {
    errors.push('Console registry must contain the first-publication horizontal gameplay video rule');
  }
  if (/requirementNumber|numberedRequirement/i.test(text)) errors.push('Console rules must not invent numbered requirement IDs');
  for (const token of [
    'applicability: first-publication',
    "linkedRequirementIds: ['5.1.1.3', '5.1.2', '5.3', '8.2.3', '8.3.1', '8.3.2', '8.3.4']",
    'format: MP4',
    "aspectRatio: '16:9'",
    'minimumHeightPx: 400',
    'maximumDurationSeconds: 28',
    'maximumSizeBytes: 100000000',
    'minimumRealGameplayRatio: 0.70',
    'promotionalMp4AllowedInReleaseZip: false'
  ]) {
    if (!text.includes(token)) errors.push(`Console registry token missing: ${token}`);
  }
  if (options.reviewedAt && metadataValue(text, 'reviewedAt') !== options.reviewedAt) {
    errors.push(`Console source.reviewedAt must be ${options.reviewedAt}`);
  }
  return { errors, ruleIds: ids };
}

function runCli() {
  const registryPath = path.join(ROOT, 'config', 'yandex-requirements.yaml');
  const result = auditRequirementRegistryText(fs.readFileSync(registryPath, 'utf8'));
  const consolePath = path.join(ROOT, 'config', 'yandex-console-requirements.yaml');
  const consoleResult = auditConsoleRegistryText(fs.readFileSync(consolePath, 'utf8'));
  const errors = [...result.errors, ...consoleResult.errors];
  console.log(JSON.stringify({
    status: errors.length ? 'BLOCK' : 'PASS',
    sourceRevision: '2026-08-18',
    requirementCount: result.requirementCount,
    repealedCount: result.repealedIds.length,
    consoleRuleIds: consoleResult.ruleIds,
    errors
  }, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
