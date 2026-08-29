import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from '../starter-kit/lib.mjs';
import { DOC_PARSER_VERSION, DOC_SNAPSHOT_SCHEMA_VERSION, loadSourceConfig } from './docs-watch.mjs';
import {
  VALIDATED_MANIFEST_SHA256,
  auditNormalizedEvidence,
  loadExternalRun,
  normalizeExternalEvidence,
  resolveExternalEvidenceConflict,
  verifyProviderIntegrity
} from './external-evidence.mjs';

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

function textSha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
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

export function auditSnapshotRegistryAlignment({ requirementText, consoleText, snapshot, sourceConfig }) {
  const errors = [];
  if (snapshot?.schemaVersion !== DOC_SNAPSHOT_SCHEMA_VERSION) errors.push('Yandex documentation snapshot schema version is unsupported');
  if (snapshot?.parserVersion !== DOC_PARSER_VERSION) errors.push('Yandex documentation snapshot parser version is stale');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot?.reviewedAt ?? '')) errors.push('Yandex documentation snapshot reviewedAt is missing or invalid');
  if (!snapshot?.fetchedAt || Number.isNaN(Date.parse(snapshot.fetchedAt))) errors.push('Yandex documentation snapshot fetchedAt is missing or invalid');
  if (snapshot?.registryAlignment?.requirementsRegistrySha256 !== textSha256(requirementText)) {
    errors.push('authoritative numbered registry changed after snapshot review');
  }
  if (snapshot?.registryAlignment?.consoleRegistrySha256 !== textSha256(consoleText)) {
    errors.push('authoritative Console registry changed after snapshot review');
  }

  const sourceUrls = Object.fromEntries((sourceConfig?.sources ?? []).map((source) => [source.id, source.url]));
  for (const [id, expected] of Object.entries({
    requirements: 'https://yandex.ru/dev/games/doc/ru/concepts/requirements',
    draft: 'https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft',
    moderation: 'https://yandex.ru/dev/games/doc/ru/concepts/moderation'
  })) {
    if (sourceUrls[id] !== expected) errors.push(`canonical Yandex documentation source mismatch: ${id}`);
    if (snapshot?.documents?.[id]?.canonicalUrl !== expected) errors.push(`snapshot canonical URL mismatch: ${id}`);
  }

  const months = { января: '01', февраля: '02', марта: '03', апреля: '04', мая: '05', июня: '06', июля: '07', августа: '08', сентября: '09', октября: '10', ноября: '11', декабря: '12' };
  const published = snapshot?.documents?.requirements?.documentLastModified?.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  const publishedIso = published && months[published[2].toLowerCase()]
    ? `${published[3]}-${months[published[2].toLowerCase()]}-${published[1].padStart(2, '0')}`
    : null;
  if (!publishedIso) errors.push('snapshot Requirements document last-modified value is missing or unrecognized');
  if (publishedIso && metadataValue(requirementText, 'lastModified') !== publishedIso) {
    errors.push('authoritative registry source.lastModified does not match reviewed upstream snapshot');
  }
  for (const [id, document] of Object.entries(snapshot?.documents ?? {})) {
    if (!/^[a-f0-9]{64}$/.test(document.normalizedSemanticSha256 ?? '')) errors.push(`snapshot semantic SHA-256 is invalid: ${id}`);
  }

  const rows = parseRequirementRows(requirementText);
  const snapshotClauses = snapshot?.documents?.requirements?.clauses ?? [];
  if (snapshot?.documents?.requirements?.clauseCount !== snapshotClauses.length) errors.push('snapshot Requirements clauseCount does not match extracted clauses');
  if (new Set(snapshotClauses.map((clause) => clause.id)).size !== snapshotClauses.length) errors.push('snapshot Requirements clauses contain duplicate IDs');
  const clauses = new Map(snapshotClauses.map((clause) => [clause.id, clause]));
  for (const row of rows) {
    const clause = clauses.get(row.id);
    if (!clause) {
      if (row.enforcement !== 'repealed') errors.push(`active registry clause ${row.id} is absent from reviewed upstream snapshot`);
      continue;
    }
    if (clause.status === 'repealed' && row.enforcement !== 'repealed') errors.push(`registry clause ${row.id} must be repealed to match snapshot`);
    if (clause.status === 'active' && row.enforcement === 'repealed') errors.push(`registry clause ${row.id} is obsolete but active in snapshot`);
  }
  const registryIds = new Set(rows.map((row) => row.id));
  for (const clause of clauses.values()) {
    const structuralParent = (snapshot.documents.requirements.clauses ?? []).some((candidate) => candidate.id.startsWith(`${clause.id}.`));
    if (clause.status === 'active' && !registryIds.has(clause.id) && !structuralParent) {
      errors.push(`reviewed upstream clause ${clause.id} is not represented in authoritative registry`);
    }
  }

  const horizontal = snapshot?.documents?.draft?.fields?.horizontalGameplayVideo;
  const expectedHorizontal = {
    formats: ['MP4'], aspectRatios: ['16:9'], minHeightPx: 400,
    maxDurationSeconds: 28, maxSizeBytes: 100000000
  };
  for (const [key, expected] of Object.entries(expectedHorizontal)) {
    if (JSON.stringify(horizontal?.constraints?.[key]) !== JSON.stringify(expected)) {
      errors.push(`reviewed Draft horizontalGameplayVideo ${key} no longer matches Console registry`);
    }
  }
  const consoleAudit = auditConsoleRegistryText(consoleText);
  errors.push(...consoleAudit.errors.map((error) => `Console registry: ${error}`));
  if ((snapshot?.detailPages ?? []).some((page) => page.missing || page.parseErrors?.length)) {
    errors.push('reviewed snapshot contains missing or unparsable requirement detail pages');
  }
  const discovered = snapshot?.documents?.requirements?.discoveredDetailPages ?? [];
  const fetchedDetails = (snapshot?.detailPages ?? []).map((page) => page.canonicalUrl);
  if (JSON.stringify(discovered) !== JSON.stringify(fetchedDetails)) errors.push('snapshot discovered detail-page list does not match fetched detail pages');
  return {
    errors,
    status: errors.length ? 'BLOCK' : 'PASS',
    snapshotReviewedAt: snapshot?.reviewedAt ?? null,
    snapshotFetchedAt: snapshot?.fetchedAt ?? null,
    snapshotClauseCount: snapshot?.documents?.requirements?.clauseCount ?? 0,
    discoveredDetailPageCount: snapshot?.detailPages?.length ?? 0
  };
}

async function runCli() {
  const registryPath = path.join(ROOT, 'config', 'yandex-requirements.yaml');
  const result = auditRequirementRegistryText(fs.readFileSync(registryPath, 'utf8'));
  const consolePath = path.join(ROOT, 'config', 'yandex-console-requirements.yaml');
  const consoleResult = auditConsoleRegistryText(fs.readFileSync(consolePath, 'utf8'));
  const snapshotArgIndex = process.argv.indexOf('--snapshot');
  const snapshotPath = snapshotArgIndex >= 0 && process.argv[snapshotArgIndex + 1]
    ? path.resolve(process.argv[snapshotArgIndex + 1])
    : path.join(ROOT, 'config', 'yandex-doc-snapshot.json');
  const snapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : null;
  const snapshotResult = auditSnapshotRegistryAlignment({
    requirementText: fs.readFileSync(registryPath, 'utf8'),
    consoleText: fs.readFileSync(consolePath, 'utf8'),
    snapshot,
    sourceConfig: loadSourceConfig(path.join(ROOT, 'config', 'yandex-doc-sources.yaml'))
  });
  const consoleOnly = process.argv.includes('--console-only');
  const errors = consoleOnly ? consoleResult.errors : [...result.errors, ...consoleResult.errors, ...snapshotResult.errors];
  const externalRunIndex = process.argv.indexOf('--external-run');
  let externalEvidence = {
    status: 'EXTERNAL_EVIDENCE_UNAVAILABLE',
    optional: true,
    recommendation: 'After Draft upload, explicitly run the pinned provider and preserve normalized evidence before submission.'
  };
  if (!consoleOnly && externalRunIndex >= 0) {
    const externalRun = process.argv[externalRunIndex + 1];
    if (!externalRun) errors.push('--external-run requires an evidence directory');
    else {
      try {
        const integrity = await verifyProviderIntegrity();
        const normalized = normalizeExternalEvidence({
          ...loadExternalRun(path.resolve(externalRun)),
          metadata: {
            starterKitVersion: fs.existsSync(path.join(ROOT, 'VERSION'))
              ? fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()
              : fs.readFileSync(path.join(ROOT, '.starter-kit', 'VERSION'), 'utf8').trim(),
            project: path.basename(ROOT)
          },
          actualManifestSha256: integrity.actualManifestSha256 ?? VALIDATED_MANIFEST_SHA256
        });
        const audit = auditNormalizedEvidence(normalized);
        const conflict = resolveExternalEvidenceConflict({
          starterStatus: 'PASS',
          externalStatus: normalized.normalizedStatus
        });
        externalEvidence = { ...normalized, integrity: integrity.status, audit, conflict };
        errors.push(...audit.blockers.map((error) => `External evidence: ${error}`));
        if (conflict.status === 'REVIEW_REQUIRED') errors.push('External evidence conflicts with Starter PASS and requires review');
      } catch (error) {
        errors.push(`External provider integrity: ${error.classification ?? error.message}`);
      }
    }
  }
  console.log(JSON.stringify({
    status: errors.length ? 'BLOCK' : 'PASS',
    audit: consoleOnly ? 'console' : 'requirements-console-snapshot-alignment',
    sourceRevision: '2026-08-18',
    requirementCount: result.requirementCount,
    repealedCount: result.repealedIds.length,
    consoleRuleIds: consoleResult.ruleIds,
    snapshotAlignment: snapshotResult.status,
    snapshotReviewedAt: snapshotResult.snapshotReviewedAt,
    snapshotClauseCount: snapshotResult.snapshotClauseCount,
    discoveredDetailPageCount: snapshotResult.discoveredDetailPageCount,
    externalEvidence,
    authenticatedExternalRunStarted: false,
    errors
  }, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
