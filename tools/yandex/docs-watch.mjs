import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from '../starter-kit/lib.mjs';

export const DOC_SNAPSHOT_SCHEMA_VERSION = 1;
export const DOC_PARSER_VERSION = 2;
export const VERDICTS = Object.freeze([
  'UNCHANGED',
  'METADATA_ONLY',
  'CLAUSE_ADDED',
  'CLAUSE_CHANGED',
  'CLAUSE_REPEALED',
  'CLAUSE_REACTIVATED',
  'DRAFT_FIELD_ADDED',
  'DRAFT_FIELD_REMOVED',
  'DRAFT_REQUIREDNESS_CHANGED',
  'DRAFT_CONSTRAINT_CHANGED',
  'MODERATION_POLICY_CHANGED',
  'DETAIL_PAGE_CHANGED',
  'NEW_DETAIL_PAGE',
  'REMOVED_DETAIL_PAGE',
  'PARSE_DRIFT',
  'UNCLASSIFIED_CHANGE',
  'FETCH_FAILED'
]);

const REQUIRED_DRAFT_FIELDS = Object.freeze({
  archive: ['field-archive'],
  supportedPlatforms: ['field-supported-platforms'],
  orientation: ['field-orientation'],
  localization: ['field-languages'],
  icon: ['field-icon'],
  cover: ['field-cover'],
  screenshots: ['field-screenshots', 'field-add-screenshots'],
  verticalGameplayVideo: ['field-gameplay-video'],
  horizontalGameplayVideo: ['field-horizontal-video'],
  advertisingVideos: ['field-advertising-videos'],
  cloudSave: ['field-cloud-saves']
});
const EXPECTED_CANONICAL_SOURCES = Object.freeze({
  requirements: 'https://yandex.ru/dev/games/doc/ru/concepts/requirements',
  draft: 'https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft',
  moderation: 'https://yandex.ru/dev/games/doc/ru/concepts/moderation'
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&([a-z]+);/gi, (match, value) => named[value.toLowerCase()] ?? match);
}

function stripHtmlShell(text) {
  if (!/<html\b|<main\b|<body\b/i.test(text)) return text;
  const main = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?? text;
  return main
    .replace(/<(script|style|template|noscript|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/li>|<\/h[1-6]>|<\/tr>|<\/section>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function frontMatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  return match ? { metadata: match[1], body: text.slice(match[0].length) } : { metadata: '', body: text };
}

export function normalizeSemanticText(input, { excludePublishedDate = true } = {}) {
  const htmlStripped = stripHtmlShell(String(input ?? ''));
  const { body } = frontMatter(htmlStripped);
  let text = body
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/^>\s*\*\*Documentation Index:\*\*.*$/gmi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)(?:<\/svg>)?/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)(?:\{[^}]*\})?/g, '$1')
    .replace(/\{#[^}]+\}/g, ' ')
    .replace(/\{%[^%]*%\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u00a0\u202f]/g, ' ');
  if (excludePublishedDate) text = text.replace(/^\s*Дата последнего изменения:.*$/gmi, ' ');
  return decodeEntities(text)
    .replace(/[`*_#>|]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\r?\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function publishedLastModified(text) {
  return String(text).match(/Дата последнего изменения:\s*([^\r\n<]+)/i)?.[1]?.replace(/[.\s]+$/, '').trim() ?? null;
}

function metadataHash(text) {
  const { metadata } = frontMatter(String(text));
  return sha256(normalizeSemanticText(metadata, { excludePublishedDate: false }));
}

function canonicalUrl(value) {
  const url = new URL(value, 'https://yandex.ru');
  if (url.hostname !== 'yandex.ru') throw new Error(`Non-authoritative documentation host: ${url.hostname}`);
  if (!url.pathname.startsWith('/dev/games/doc/ru/')) throw new Error(`Out-of-scope documentation path: ${url.pathname}`);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\.md$/, '').replace(/\/$/, '');
  return url.toString();
}

function markdownUrl(value) {
  const url = new URL(canonicalUrl(value));
  url.pathname = `${url.pathname}.md`;
  return url.toString();
}

function discoverDetailPages(text) {
  const found = new Set();
  const pattern = /(?:https:\/\/yandex\.ru)?\/dev\/games\/doc\/ru\/requirements\/[0-9][^\s)"'#?]*(?:\.md)?(?:#[^\s)"']*)?/gi;
  for (const match of String(text).matchAll(pattern)) {
    try { found.add(canonicalUrl(match[0].split('#')[0])); } catch { /* ignore non-canonical links */ }
  }
  return [...found].sort();
}

function parseRequirements(text, canonical) {
  const clauses = [];
  const raw = String(text);
  const pattern = /<span\s+class=["']hidden-text["']>Пункт\s+([0-9]+(?:\.[0-9]+)*)\.<\/span>\s*(.*?)\s*\{#[^}\r\n]+\}/g;
  for (const match of raw.matchAll(pattern)) {
    const normalizedText = normalizeSemanticText(match[2], { excludePublishedDate: false });
    const repealed = /упразднен/i.test(normalizedText) || /\.deprecated\b/.test(match[0]);
    clauses.push({
      id: match[1],
      status: repealed ? 'repealed' : 'active',
      text: normalizedText,
      textHash: sha256(normalizedText)
    });
  }
  const duplicateIds = clauses.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index);
  const parseErrors = [];
  if (!clauses.length) parseErrors.push('no numbered clauses extracted');
  if (duplicateIds.length) parseErrors.push(`duplicate numbered clauses: ${[...new Set(duplicateIds)].join(', ')}`);
  const semanticText = normalizeSemanticText(raw);
  return {
    canonicalUrl: canonical,
    documentLastModified: publishedLastModified(raw),
    metadataHash: metadataHash(raw),
    normalizedSemanticSha256: sha256(semanticText),
    clauseCount: clauses.length,
    clauses,
    discoveredDetailPages: discoverDetailPages(raw),
    parseErrors
  };
}

function extractFieldSections(text) {
  const matches = [...String(text).matchAll(/^#{2,4}\s+(.+?)\s+\{#(field-[a-z0-9-]+)\}\s*$/gmi)];
  const sections = {};
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    sections[current[2]] = {
      heading: current[1],
      body: String(text).slice(current.index + current[0].length, next?.index ?? String(text).length)
    };
  }
  return sections;
}

function numberFrom(text, pattern) {
  const value = text.match(pattern)?.[1];
  return value === undefined ? undefined : Number(value.replace(',', '.'));
}

function mediaBytes(value, unit) {
  if (value === undefined) return undefined;
  const multiplier = /кб/i.test(unit) ? 1_000 : /гб/i.test(unit) ? 1_000_000_000 : 1_000_000;
  return Number(value.replace(',', '.')) * multiplier;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined))].sort();
}

function constraintsFor(fieldName, source) {
  const normalized = normalizeSemanticText(source, { excludePublishedDate: false });
  const formats = unique([...normalized.matchAll(/\b(MP4|WEBM|PNG|JPEG|JPG|ZIP|GIF)\b/gi)].map((match) => match[1].toUpperCase()));
  const ratioLines = normalized.split('\n').filter((line) => /Соотношение сторон|Пропорции/i.test(line));
  const aspectRatios = unique(ratioLines.flatMap((line) => [...line.matchAll(/(\d+)\s*[:×x]\s*(\d+)/gi)].map((match) => `${match[1]}:${match[2]}`)));
  const dimensions = unique(normalized.split('\n')
    .filter((line) => /Размер|разрешение/i.test(line))
    .flatMap((line) => [...line.matchAll(/(\d+)\s*[×x]\s*(\d+)/gi)].map((match) => `${match[1]}x${match[2]}`)));
  const sizeMatch = normalized.match(/(?:Вес|размер[^\n]*?)\s*(?:—|-)?\s*(?:до|не более)\s*(\d+(?:[.,]\d+)?)\s*(МБ|КБ|ГБ)/i);
  const constraints = {
    formats,
    aspectRatios,
    dimensions,
    minHeightPx: numberFrom(normalized, /Высота\s*(?:—|-)?\s*от\s*(\d+)/i),
    maxDurationSeconds: numberFrom(normalized, /Длительность\s*(?:—|-)?\s*до\s*(\d+(?:[.,]\d+)?)/i),
    maxSizeBytes: sizeMatch ? mediaBytes(sizeMatch[1], sizeMatch[2]) : undefined
  };
  if (fieldName === 'archive') {
    constraints.rootIndexHtmlRequired = /корн[^\n]*index\.html/i.test(normalized);
    constraints.noSpacesOrCyrillicInPaths = /нет пробелов[^\n]*кирил/i.test(normalized);
  }
  if (fieldName === 'supportedPlatforms') constraints.allowedValues = unique(['Десктоп', 'Мобильные', 'ТВ'].filter((value) => normalized.includes(value)));
  if (fieldName === 'orientation') constraints.allowedValues = unique(['Портретная', 'Альбомная', 'Любая'].filter((value) => normalized.includes(value)));
  if (fieldName === 'screenshots') {
    constraints.minCountPerPlatform = numberFrom(normalized, /(?:минимум|как минимум)[^\d]*(\d+)/i);
    const range = normalized.match(/(?:Размер|размер)\s*(?:—|-)?\s*от\s*(\d+)\s*до\s*(\d+)/i);
    if (range) {
      constraints.longSideMinPx = Number(range[1]);
      constraints.longSideMaxPx = Number(range[2]);
    }
  }
  if (fieldName === 'advertisingVideos') constraints.maxCount = numberFrom(normalized, /до\s*(\d+)\s*видео/i);
  return Object.fromEntries(Object.entries(constraints).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length)));
}

function parseDraft(text, canonical) {
  const raw = String(text);
  const sections = extractFieldSections(raw);
  const fields = {};
  const parseErrors = [];
  for (const [fieldName, anchors] of Object.entries(REQUIRED_DRAFT_FIELDS)) {
    const existing = anchors.map((anchor) => sections[anchor]).filter(Boolean);
    if (!existing.length) {
      parseErrors.push(`missing Draft field section: ${fieldName}`);
      continue;
    }
    const combined = existing.map((section) => `${section.heading}\n${section.body}`).join('\n');
    const required = existing.some((section) => /class=["']red["'][^>]*>\s*\*|yes-button\.svg/i.test(section.heading))
      || anchors.some((anchor) => new RegExp(`\\(#${anchor}\\)[^\\n]*yes-button\\.svg`, 'i').test(raw));
    const normalized = normalizeSemanticText(combined, { excludePublishedDate: false });
    fields[fieldName] = {
      anchors,
      required,
      constraints: constraintsFor(fieldName, combined),
      textHash: sha256(normalized)
    };
  }
  const coveredAnchors = new Set(Object.values(REQUIRED_DRAFT_FIELDS).flat());
  for (const [anchor, section] of Object.entries(sections)) {
    if (coveredAnchors.has(anchor)) continue;
    const fieldName = `official:${anchor.replace(/^field-/, '')}`;
    const combined = `${section.heading}\n${section.body}`;
    const required = /class=["']red["'][^>]*>\s*\*|yes-button\.svg/i.test(section.heading)
      || new RegExp(`\\(#${anchor}\\)[^\\n]*yes-button\\.svg`, 'i').test(raw);
    const normalized = normalizeSemanticText(combined, { excludePublishedDate: false });
    fields[fieldName] = {
      anchors: [anchor],
      required,
      constraints: constraintsFor(fieldName, combined),
      textHash: sha256(normalized)
    };
  }
  const semanticText = normalizeSemanticText(raw);
  if (!/Заполнение черновика/i.test(semanticText)) parseErrors.push('Draft document title was not recognized');
  return {
    canonicalUrl: canonical,
    documentLastModified: publishedLastModified(raw),
    metadataHash: metadataHash(raw),
    normalizedSemanticSha256: sha256(semanticText),
    fields,
    parseErrors
  };
}

function parseModeration(text, canonical) {
  const raw = String(text);
  const semanticText = normalizeSemanticText(raw);
  const headings = unique([...raw.matchAll(/^#{1,4}\s+([^\r\n{]+)/gm)].map((match) => normalizeSemanticText(match[1], { excludePublishedDate: false })));
  const parseErrors = [];
  if (!/Модерац/i.test(semanticText) || semanticText.length < 40) parseErrors.push('Moderation document structure was not recognized');
  return {
    canonicalUrl: canonical,
    documentLastModified: publishedLastModified(raw),
    metadataHash: metadataHash(raw),
    normalizedSemanticSha256: sha256(semanticText),
    headings,
    parseErrors
  };
}

function parseDetail(text, canonical) {
  const raw = String(text);
  const semanticText = normalizeSemanticText(raw);
  return {
    canonicalUrl: canonical,
    documentLastModified: publishedLastModified(raw),
    metadataHash: metadataHash(raw),
    normalizedSemanticSha256: sha256(semanticText),
    parseErrors: semanticText.length < 10 ? ['requirement detail page is empty or structurally unexpected'] : []
  };
}

export function buildSemanticSnapshot({ documents, sources, fetchedAt = new Date().toISOString(), reviewedAt = null }) {
  const requirementsUrl = canonicalUrl(sources.requirements);
  const draftUrl = canonicalUrl(sources.draft);
  const moderationUrl = canonicalUrl(sources.moderation);
  const requirements = parseRequirements(documents[requirementsUrl] ?? documents[sources.requirements], requirementsUrl);
  const draft = parseDraft(documents[draftUrl] ?? documents[sources.draft], draftUrl);
  const moderation = parseModeration(documents[moderationUrl] ?? documents[sources.moderation], moderationUrl);
  for (const document of [requirements, draft, moderation]) {
    document.fetchedAt = fetchedAt;
    document.reviewedAt = reviewedAt;
  }
  const detailPages = requirements.discoveredDetailPages.map((url) => {
    const source = documents[url] ?? documents[markdownUrl(url)];
    const detail = source === undefined
      ? { canonicalUrl: url, missing: true, parseErrors: ['discovered detail page was not fetched'] }
      : parseDetail(source, url);
    detail.fetchedAt = fetchedAt;
    detail.reviewedAt = reviewedAt;
    return detail;
  });
  return {
    schemaVersion: DOC_SNAPSHOT_SCHEMA_VERSION,
    parserVersion: DOC_PARSER_VERSION,
    reviewedAt,
    fetchedAt,
    documents: { requirements, draft, moderation },
    detailPages
  };
}

function changeRecord(before, after) {
  return { before, after };
}

function fieldDiff(before, after) {
  const constraints = {};
  for (const key of new Set([...Object.keys(before?.constraints ?? {}), ...Object.keys(after?.constraints ?? {})])) {
    if (stable(before?.constraints?.[key]) !== stable(after?.constraints?.[key])) {
      constraints[key] = changeRecord(before?.constraints?.[key] ?? null, after?.constraints?.[key] ?? null);
    }
  }
  return {
    required: before?.required === after?.required ? undefined : changeRecord(before?.required, after?.required),
    constraints,
    textHash: before?.textHash === after?.textHash ? undefined : changeRecord(before?.textHash, after?.textHash)
  };
}

function metadataChanged(before, after) {
  return before?.documentLastModified !== after?.documentLastModified || before?.metadataHash !== after?.metadataHash;
}

export function compareSnapshots(reviewed, current) {
  const verdictSet = new Set();
  const requirementsDiff = {
    clauseCount: changeRecord(reviewed.documents.requirements.clauseCount, current.documents.requirements.clauseCount),
    added: [], changed: [], repealed: [], reactivated: []
  };
  const draftDiff = { added: {}, removed: {}, changed: {} };
  const moderationDiff = {};
  const parseErrors = [
    ...Object.entries(current.documents).flatMap(([id, document]) => (document.parseErrors ?? []).map((error) => `${id}: ${error}`)),
    ...current.detailPages.flatMap((document) => (document.parseErrors ?? []).map((error) => `${document.canonicalUrl}: ${error}`))
  ];
  const baselineClauseCount = reviewed.documents.requirements.clauseCount;
  if (current.documents.requirements.clauseCount < Math.max(1, Math.floor(baselineClauseCount * 0.7))) {
    parseErrors.push(`requirements clause count dropped from ${baselineClauseCount} to ${current.documents.requirements.clauseCount}`);
  }
  if (parseErrors.length) verdictSet.add('PARSE_DRIFT');

  const beforeClauses = new Map(reviewed.documents.requirements.clauses.map((clause) => [clause.id, clause]));
  const afterClauses = new Map(current.documents.requirements.clauses.map((clause) => [clause.id, clause]));
  for (const [id, after] of afterClauses) {
    const before = beforeClauses.get(id);
    if (!before) {
      requirementsDiff.added.push(after);
      verdictSet.add('CLAUSE_ADDED');
    } else if (before.status === 'repealed' && after.status === 'active') {
      requirementsDiff.reactivated.push({ id, before, after });
      verdictSet.add('CLAUSE_REACTIVATED');
    } else if (before.status === 'active' && after.status === 'repealed') {
      requirementsDiff.repealed.push({ id, before, after });
      verdictSet.add('CLAUSE_REPEALED');
    } else if (before.textHash !== after.textHash) {
      requirementsDiff.changed.push({ id, before, after });
      verdictSet.add('CLAUSE_CHANGED');
    }
  }
  for (const [id, before] of beforeClauses) {
    if (!afterClauses.has(id)) {
      requirementsDiff.repealed.push({ id, before, after: null });
      verdictSet.add('CLAUSE_REPEALED');
    }
  }

  const beforeFields = reviewed.documents.draft.fields;
  const afterFields = current.documents.draft.fields;
  for (const name of new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])) {
    if (!beforeFields[name]) {
      draftDiff.added[name] = afterFields[name];
      verdictSet.add('DRAFT_FIELD_ADDED');
      continue;
    }
    if (!afterFields[name]) {
      draftDiff.removed[name] = beforeFields[name];
      verdictSet.add('DRAFT_FIELD_REMOVED');
      continue;
    }
    const diff = fieldDiff(beforeFields[name], afterFields[name]);
    if (diff.required) verdictSet.add('DRAFT_REQUIREDNESS_CHANGED');
    if (Object.keys(diff.constraints).length || (diff.textHash && !diff.required)) verdictSet.add('DRAFT_CONSTRAINT_CHANGED');
    if (diff.required || Object.keys(diff.constraints).length || diff.textHash) draftDiff.changed[name] = diff;
  }

  if (reviewed.documents.moderation.normalizedSemanticSha256 !== current.documents.moderation.normalizedSemanticSha256) {
    verdictSet.add('MODERATION_POLICY_CHANGED');
    moderationDiff.semanticSha256 = changeRecord(
      reviewed.documents.moderation.normalizedSemanticSha256,
      current.documents.moderation.normalizedSemanticSha256
    );
    moderationDiff.headings = changeRecord(reviewed.documents.moderation.headings, current.documents.moderation.headings);
  }

  const beforeDetails = new Map(reviewed.detailPages.map((page) => [page.canonicalUrl, page]));
  const afterDetails = new Map(current.detailPages.map((page) => [page.canonicalUrl, page]));
  const detailDiff = { added: [], removed: [], changed: [] };
  for (const [url, page] of afterDetails) {
    const before = beforeDetails.get(url);
    if (!before) {
      detailDiff.added.push(page);
      verdictSet.add('NEW_DETAIL_PAGE');
    } else if (before.normalizedSemanticSha256 !== page.normalizedSemanticSha256) {
      detailDiff.changed.push({ canonicalUrl: url, before, after: page });
      verdictSet.add('DETAIL_PAGE_CHANGED');
    }
  }
  for (const [url, page] of beforeDetails) {
    if (!afterDetails.has(url)) {
      detailDiff.removed.push(page);
      verdictSet.add('REMOVED_DETAIL_PAGE');
    }
  }

  const requirementsClassified = requirementsDiff.added.length || requirementsDiff.changed.length
    || requirementsDiff.repealed.length || requirementsDiff.reactivated.length || detailDiff.added.length || detailDiff.removed.length;
  if (reviewed.documents.requirements.normalizedSemanticSha256 !== current.documents.requirements.normalizedSemanticSha256 && !requirementsClassified) {
    verdictSet.add('UNCLASSIFIED_CHANGE');
  }
  const draftClassified = Object.keys(draftDiff.added).length || Object.keys(draftDiff.removed).length || Object.keys(draftDiff.changed).length;
  if (reviewed.documents.draft.normalizedSemanticSha256 !== current.documents.draft.normalizedSemanticSha256 && !draftClassified) {
    verdictSet.add('UNCLASSIFIED_CHANGE');
  }

  const semanticChanged = verdictSet.size > 0;
  if (!semanticChanged) {
    const metadataOnly = Object.keys(reviewed.documents).some((id) => metadataChanged(reviewed.documents[id], current.documents[id]))
      || reviewed.detailPages.some((page) => metadataChanged(page, afterDetails.get(page.canonicalUrl)));
    verdictSet.add(metadataOnly ? 'METADATA_ONLY' : 'UNCHANGED');
  }
  const verdicts = VERDICTS.filter((verdict) => verdictSet.has(verdict));
  const reviewRequired = verdicts.some((verdict) => !['UNCHANGED', 'METADATA_ONLY'].includes(verdict));
  return {
    status: reviewRequired ? 'BLOCK' : 'PASS',
    blockCode: reviewRequired ? 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED' : null,
    reviewRequired,
    verdicts,
    parseErrors,
    diffs: { requirements: requirementsDiff, draft: draftDiff, moderation: moderationDiff, detailPages: detailDiff }
  };
}

export function loadSourceConfig(file = path.join(ROOT, 'config', 'yandex-doc-sources.yaml')) {
  const text = fs.readFileSync(file, 'utf8');
  const sources = [...text.matchAll(/^\s{2}- id:\s*([^\s]+)\s*\r?\n\s{4}url:\s*(https:\/\/[^\s]+)(?:\r?\n\s{4}discoverDetailPages:\s*([^\r\n]+))?/gm)]
    .map((match) => ({ id: match[1], url: canonicalUrl(match[2]), discoverDetailPages: match[3]?.trim() }));
  const value = (key, fallback) => Number(text.match(new RegExp(`^\\s{2}${key}:\\s*(\\d+)`, 'm'))?.[1] ?? fallback);
  if (sources.map((source) => source.id).join(',') !== 'requirements,draft,moderation') {
    throw new Error('yandex-doc-sources.yaml must define requirements, draft and moderation canonical sources');
  }
  if (Number(text.match(/^schemaVersion:\s*(\d+)/m)?.[1]) !== DOC_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('yandex-doc-sources.yaml schemaVersion is unsupported');
  }
  if (Number(text.match(/^parserVersion:\s*(\d+)/m)?.[1]) !== DOC_PARSER_VERSION) {
    throw new Error('yandex-doc-sources.yaml parserVersion is stale');
  }
  for (const source of sources) {
    if (source.url !== EXPECTED_CANONICAL_SOURCES[source.id]) {
      throw new Error(`canonical source mismatch for ${source.id}`);
    }
  }
  return {
    schemaVersion: Number(text.match(/^schemaVersion:\s*(\d+)/m)?.[1]),
    parserVersion: Number(text.match(/^parserVersion:\s*(\d+)/m)?.[1]),
    fetch: { timeoutMs: value('timeoutMs', 15000), retries: value('retries', 2), retryDelayMs: value('retryDelayMs', 750) },
    sources
  };
}

async function defaultFetcher(url, { timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(markdownUrl(url), {
      redirect: 'follow',
      headers: { accept: 'text/markdown,text/plain;q=0.9' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const final = new URL(response.url);
    if (final.hostname !== 'yandex.ru') throw new Error(`Redirected to non-authoritative host: ${final.hostname}`);
    return { text: await response.text(), fetchedUrl: response.url, httpLastModified: response.headers.get('last-modified') };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(fetcher, url, options) {
  let lastError;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const result = await fetcher(url, options);
      return typeof result === 'string' ? { text: result, fetchedUrl: url, httpLastModified: null } : result;
    } catch (error) {
      lastError = error;
      if (attempt < options.retries && options.retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function reportMarkdown(result, fetchedAt) {
  const changes = summarizeChanges(result);
  const lines = [
    '# Yandex Games upstream documentation watch',
    '',
    `Run: ${fetchedAt}`,
    `Status: **${result.status}**`,
    `Verdicts: ${result.verdicts.join(', ')}`,
    `Review required: ${result.reviewRequired ? 'yes' : 'no'}`,
    ''
  ];
  if (changes.length) lines.push('## Concrete changes', '', ...changes.map((change) => `- ${change}`), '');
  if (result.parseErrors?.length) lines.push('## Parser findings', '', ...result.parseErrors.map((error) => `- ${error}`), '');
  lines.push('The authoritative requirements registry was not modified by this check.', '');
  return `${lines.join('\n')}\n`;
}

function summarizeChanges(result) {
  const items = [];
  const requirements = result.diffs?.requirements ?? {};
  if (requirements.added?.length) items.push(`Added clauses: ${requirements.added.map((item) => item.id).join(', ')}`);
  if (requirements.changed?.length) items.push(`Changed clauses: ${requirements.changed.map((item) => item.id).join(', ')}`);
  if (requirements.repealed?.length) items.push(`Repealed/removed clauses: ${requirements.repealed.map((item) => item.id).join(', ')}`);
  if (requirements.reactivated?.length) items.push(`Reactivated clauses: ${requirements.reactivated.map((item) => item.id).join(', ')}`);
  const draft = result.diffs?.draft ?? {};
  if (Object.keys(draft.added ?? {}).length) items.push(`Added Draft fields: ${Object.keys(draft.added).join(', ')}`);
  if (Object.keys(draft.removed ?? {}).length) items.push(`Removed Draft fields: ${Object.keys(draft.removed).join(', ')}`);
  if (Object.keys(draft.changed ?? {}).length) items.push(`Changed Draft fields: ${Object.keys(draft.changed).join(', ')}`);
  if (Object.keys(result.diffs?.moderation ?? {}).length) items.push('Moderation policy semantic content changed.');
  const details = result.diffs?.detailPages ?? {};
  if (details.added?.length) items.push(`New detail pages: ${details.added.map((item) => item.canonicalUrl).join(', ')}`);
  if (details.removed?.length) items.push(`Removed detail pages: ${details.removed.map((item) => item.canonicalUrl).join(', ')}`);
  if (details.changed?.length) items.push(`Changed detail pages: ${details.changed.map((item) => item.canonicalUrl).join(', ')}`);
  if (result.parseErrors?.length) items.push(`Parser findings: ${result.parseErrors.join('; ')}`);
  return items;
}

function updateTaskMarkdown(result) {
  const concrete = summarizeChanges(result).map((item) => `- ${item}`).join('\n') || '- Inspect the unclassified semantic hashes and source metadata.';
  return `# Codex update task\n\nReview the official Yandex Games documentation diff with verdicts: ${result.verdicts.join(', ')}.\n\n${concrete}\n\n` +
    `Reconcile only the affected numbered requirements, Console fields, moderation policy, or detail pages shown in the JSON diff files. ` +
    `Preserve repealed clauses for traceability, update tests and release validation, run requirements and Console audits, then explicitly accept the reviewed snapshot. ` +
    `Do not auto-copy prose into the authoritative registry and do not change game product runtime.\n`;
}

function writeReports(root, runId, result, currentSnapshot, sourceMetadata) {
  const directory = path.join(root, 'artifacts', 'upstream', 'yandex-docs', runId);
  fs.mkdirSync(directory, { recursive: true });
  const writeJson = (name, value) => fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
  writeJson('change-report.json', {
    schemaVersion: 1,
    runId,
    status: result.status,
    blockCode: result.blockCode,
    reviewRequired: result.reviewRequired,
    verdicts: result.verdicts,
    parseErrors: result.parseErrors ?? []
  });
  fs.writeFileSync(path.join(directory, 'change-report.md'), reportMarkdown(result, currentSnapshot?.fetchedAt ?? sourceMetadata.fetchedAt));
  writeJson('requirements-diff.json', {
    ...(result.diffs?.requirements ?? {}),
    detailPages: result.diffs?.detailPages ?? {}
  });
  writeJson('draft-diff.json', result.diffs?.draft ?? {});
  writeJson('moderation-diff.json', result.diffs?.moderation ?? {});
  writeJson('source-metadata.json', sourceMetadata);
  fs.writeFileSync(path.join(directory, 'CODEX_UPDATE_TASK.md'), updateTaskMarkdown(result));
  const latest = path.join(root, 'artifacts', 'upstream', 'yandex-docs', 'latest.json');
  fs.writeFileSync(latest, `${JSON.stringify({ runId, directory, ...result, currentSnapshot: undefined }, null, 2)}\n`);
  return directory;
}

export async function runDocumentationWatch({
  root = ROOT,
  reviewedSnapshot,
  sourceConfig = loadSourceConfig(path.join(root, 'config', 'yandex-doc-sources.yaml')),
  fetcher = defaultFetcher,
  writeArtifacts = true,
  now = new Date()
}) {
  const fetchedAt = now.toISOString();
  const runId = fetchedAt.replace(/[:.]/g, '-');
  const sourceMetadata = { fetchedAt, sources: [], failures: [] };
  try {
    const documents = {};
    for (const source of sourceConfig.sources) {
      const result = await fetchWithRetry(fetcher, source.url, sourceConfig.fetch ?? { timeoutMs: 15000, retries: 2, retryDelayMs: 750 });
      documents[canonicalUrl(source.url)] = result.text;
      sourceMetadata.sources.push({ id: source.id, canonicalUrl: canonicalUrl(source.url), fetchedUrl: result.fetchedUrl, httpLastModified: result.httpLastModified ?? null });
    }
    const requirementsSource = sourceConfig.sources.find((source) => source.id === 'requirements');
    const detailUrls = discoverDetailPages(documents[canonicalUrl(requirementsSource.url)]);
    for (const url of detailUrls) {
      const result = await fetchWithRetry(fetcher, url, sourceConfig.fetch ?? { timeoutMs: 15000, retries: 2, retryDelayMs: 750 });
      documents[url] = result.text;
      sourceMetadata.sources.push({ id: 'requirement-detail', canonicalUrl: url, fetchedUrl: result.fetchedUrl, httpLastModified: result.httpLastModified ?? null });
    }
    const sourceMap = Object.fromEntries(sourceConfig.sources.map((source) => [source.id, source.url]));
    const currentSnapshot = buildSemanticSnapshot({ documents, sources: sourceMap, fetchedAt, reviewedAt: reviewedSnapshot?.reviewedAt ?? null });
    for (const source of sourceMetadata.sources) {
      const semantic = source.id === 'requirement-detail'
        ? currentSnapshot.detailPages.find((page) => page.canonicalUrl === source.canonicalUrl)
        : currentSnapshot.documents[source.id];
      source.documentLastModified = semantic?.documentLastModified ?? null;
      source.normalizedSemanticSha256 = semantic?.normalizedSemanticSha256 ?? null;
      source.parserVersion = DOC_PARSER_VERSION;
    }
    const result = reviewedSnapshot
      ? compareSnapshots(reviewedSnapshot, currentSnapshot)
      : {
        status: 'BLOCK', blockCode: 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED', reviewRequired: true,
        verdicts: ['UNCLASSIFIED_CHANGE'], parseErrors: ['reviewed snapshot is missing'],
        diffs: { requirements: {}, draft: {}, moderation: {}, detailPages: {} }
      };
    const artifactDirectory = writeArtifacts ? writeReports(root, runId, result, currentSnapshot, sourceMetadata) : null;
    return { ...result, fetchedAt, artifactDirectory, currentSnapshot, sourceMetadata };
  } catch (error) {
    sourceMetadata.failures.push({ message: error.message });
    const result = {
      status: 'MANUAL_REQUIRED',
      blockCode: 'BLOCK_YANDEX_DOCS_FETCH_FAILED',
      reviewRequired: true,
      verdicts: ['FETCH_FAILED'],
      parseErrors: [],
      diffs: { requirements: {}, draft: {}, moderation: {}, detailPages: {} }
    };
    const artifactDirectory = writeArtifacts ? writeReports(root, runId, result, null, sourceMetadata) : null;
    return { ...result, fetchedAt, artifactDirectory, currentSnapshot: null, sourceMetadata };
  }
}

export function inspectLocalFreshness(root = ROOT) {
  const snapshotFile = path.join(root, 'config', 'yandex-doc-snapshot.json');
  const latestFile = path.join(root, 'artifacts', 'upstream', 'yandex-docs', 'latest.json');
  const snapshot = fs.existsSync(snapshotFile) ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) : null;
  const latest = fs.existsSync(latestFile) ? JSON.parse(fs.readFileSync(latestFile, 'utf8')) : null;
  return {
    status: latest?.reviewRequired ? 'REVIEW_REQUIRED' : latest?.status ?? (snapshot ? 'SNAPSHOT_ONLY' : 'MISSING'),
    snapshotReviewedAt: snapshot?.reviewedAt ?? null,
    snapshotFetchedAt: snapshot?.fetchedAt ?? null,
    lastLiveCheckAt: latest?.fetchedAt ?? null,
    lastLiveVerdicts: latest?.verdicts ?? [],
    unresolvedSemanticChanges: latest?.reviewRequired === true,
    blockCode: latest?.reviewRequired ? (latest.blockCode ?? 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED') : null
  };
}

export function assertNoUnresolvedUpstreamChanges(freshness) {
  if (freshness?.unresolvedSemanticChanges) {
    throw new Error(`${freshness.blockCode ?? 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED'}: unresolved official Yandex documentation changes must be reviewed`);
  }
  return freshness;
}

export function evaluatePreSubmitFreshness({ liveCheck, acceptedSnapshotEvidence = false, manualCurrentDocumentReview = null }) {
  if (liveCheck?.reviewRequired && !liveCheck.verdicts?.includes('FETCH_FAILED')) {
    return {
      status: 'BLOCK',
      blockCode: 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED',
      reason: 'Unresolved semantic changes exist in official Yandex Games documentation.'
    };
  }
  if (liveCheck?.status === 'PASS' && liveCheck.verdicts?.every((value) => ['UNCHANGED', 'METADATA_ONLY'].includes(value))) {
    return { status: 'PASS', blockCode: null, reason: 'Live upstream check matches the reviewed semantic snapshot.' };
  }
  if (acceptedSnapshotEvidence === true) {
    return { status: 'PASS', blockCode: null, reason: 'Detected changes were reviewed and the semantic snapshot was explicitly accepted.' };
  }
  if (liveCheck?.verdicts?.includes('FETCH_FAILED')) {
    const manualPass = manualCurrentDocumentReview?.status === 'PASS'
      && /^\d{4}-\d{2}-\d{2}$/.test(manualCurrentDocumentReview.reviewedAt ?? '')
      && Array.isArray(manualCurrentDocumentReview.sources)
      && manualCurrentDocumentReview.sources.length >= 3;
    return manualPass
      ? { status: 'MANUAL_PASS', blockCode: null, reason: 'Upstream was unavailable; explicit current-document review evidence was supplied.' }
      : { status: 'MANUAL_REQUIRED', blockCode: 'BLOCK_YANDEX_DOCS_FETCH_FAILED', reason: 'FETCH_FAILED is not PASS; current official documents require explicit manual review.' };
  }
  return { status: 'MANUAL_REQUIRED', blockCode: 'BLOCK_YANDEX_DOCS_FRESHNESS_EVIDENCE_MISSING', reason: 'No acceptable upstream freshness evidence was supplied.' };
}

function arg(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] ?? true;
  const prefixed = process.argv.find((item) => item.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

async function runCli() {
  const snapshotFile = path.join(ROOT, 'config', 'yandex-doc-snapshot.json');
  const reviewedSnapshot = fs.existsSync(snapshotFile) ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) : null;
  const accepting = process.argv.includes('--accept-snapshot');
  const result = await runDocumentationWatch({ reviewedSnapshot });
  if (accepting) {
    const reviewedAt = arg('--reviewed-at');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reviewedAt ?? ''))) {
      throw new Error('--accept-snapshot requires explicit --reviewed-at YYYY-MM-DD after human review');
    }
    if (!result.currentSnapshot) throw new Error('Cannot accept a snapshot after FETCH_FAILED');
    if (result.reviewRequired && !process.argv.includes('--policy-reviewed')) {
      throw new Error('Semantic changes require explicit --policy-reviewed after registry and policy review');
    }
    const registryAlignment = {
      requirementsRegistrySha256: sha256(fs.readFileSync(path.join(ROOT, 'config', 'yandex-requirements.yaml'), 'utf8')),
      consoleRegistrySha256: sha256(fs.readFileSync(path.join(ROOT, 'config', 'yandex-console-requirements.yaml'), 'utf8'))
    };
    const candidate = { ...result.currentSnapshot, reviewedAt, registryAlignment };
    if (result.reviewRequired || !reviewedSnapshot) {
      const candidateFile = path.join(result.artifactDirectory, 'candidate-snapshot.json');
      fs.writeFileSync(candidateFile, `${JSON.stringify(candidate, null, 2)}\n`);
      execFileSync(process.execPath, [path.join(ROOT, 'tools', 'yandex', 'requirements-audit.mjs'), '--snapshot', candidateFile], { stdio: 'inherit' });
      execFileSync(process.execPath, ['--test',
        path.join(ROOT, 'tests', 'starter-kit', 'yandex-docs-watch.test.mjs'),
        path.join(ROOT, 'tests', 'starter-kit', 'yandex-release-validation.test.mjs')
      ], {
        stdio: 'inherit',
        env: { ...process.env, YANDEX_DOC_SNAPSHOT_PATH: candidateFile }
      });
    }
    fs.writeFileSync(snapshotFile, `${JSON.stringify(candidate, null, 2)}\n`);
    const latestFile = path.join(ROOT, 'artifacts', 'upstream', 'yandex-docs', 'latest.json');
    fs.mkdirSync(path.dirname(latestFile), { recursive: true });
    fs.writeFileSync(latestFile, `${JSON.stringify({
      status: 'PASS',
      blockCode: null,
      reviewRequired: false,
      fetchedAt: result.fetchedAt,
      verdicts: ['UNCHANGED'],
      acceptedAfterReview: true,
      acceptedSourceVerdicts: result.verdicts,
      snapshotReviewedAt: reviewedAt
    }, null, 2)}\n`);
    console.log(JSON.stringify({ status: 'SNAPSHOT_ACCEPTED', reviewedAt, snapshotFile, sourceVerdicts: result.verdicts }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    status: result.status,
    blockCode: result.blockCode,
    reviewRequired: result.reviewRequired,
    verdicts: result.verdicts,
    fetchedAt: result.fetchedAt,
    artifactDirectory: result.artifactDirectory,
    parseErrors: result.parseErrors
  }, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
