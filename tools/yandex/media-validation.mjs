import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { inspectZipForExternalEvidence } from './external-evidence.mjs';

const MAX_SIZE_BYTES = 100_000_000;
const MAX_DURATION_SECONDS = 28;
const MIN_HEIGHT = 400;
const MIN_GAMEPLAY_RATIO = 0.7;

function normalize(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function manualPass(entry, key) {
  const review = entry.manualReview?.[key];
  return review?.status === 'PASS' && typeof review.evidence === 'string' && review.evidence.trim().length > 0;
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function yamlValue(text, wantedPath) {
  const stack = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const indent = match[1].length;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const key = match[2];
    const current = [...stack.map((item) => item.key), key].join('.');
    const raw = match[3]?.trim();
    if (current === wantedPath) return raw;
    if (!raw) stack.push({ indent, key });
  }
  return undefined;
}

function scalar(raw) {
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return raw.replace(/^['"]|['"]$/g, '');
}

export function readGameSpecMediaContract(text) {
  return {
    publicationType: scalar(yamlValue(text, 'yandex.publication.type')),
    declaredLocales: scalar(yamlValue(text, 'localization.languages')) ?? [],
    languageDependentText: scalar(yamlValue(text, 'visual.marketing.horizontalGameplayVideo.languageDependentText'))
  };
}

export function inspectMediaFile(file) {
  if (!fs.existsSync(file)) return { exists: false };
  const stat = fs.statSync(file);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=format_name,duration',
    '-of', 'json', file
  ], { encoding: 'utf8' });
  if (probe.status !== 0) {
    return {
      exists: true,
      sizeBytes: stat.size,
      sha256: sha256File(file),
      probeError: (probe.stderr || probe.error?.message || 'ffprobe failed').trim()
    };
  }
  const data = JSON.parse(probe.stdout);
  const stream = data.streams?.[0] ?? {};
  const formatName = String(data.format?.format_name ?? '');
  return {
    exists: true,
    format: formatName.split(',').includes('mp4') ? 'mp4' : formatName,
    width: Number(stream.width),
    height: Number(stream.height),
    durationSeconds: Number(data.format?.duration),
    sizeBytes: stat.size,
    sha256: sha256File(file)
  };
}

function validateEvidenceMatchesFile(entry, actual, blockers) {
  if (entry.dimensions?.width !== actual.width || entry.dimensions?.height !== actual.height) {
    blockers.push(`${entry.locale}: evidence dimensions do not match the file`);
  }
  if (Math.abs(Number(entry.durationSeconds) - actual.durationSeconds) > 0.05) {
    blockers.push(`${entry.locale}: evidence duration does not match the file`);
  }
  if (entry.sizeBytes !== actual.sizeBytes) blockers.push(`${entry.locale}: evidence size does not match the file`);
  if (String(entry.sha256).toLowerCase() !== String(actual.sha256).toLowerCase()) {
    blockers.push(`${entry.locale}: evidence SHA-256 does not match the file`);
  }
}

export async function validateGameplayVideos(options) {
  const {
    publicationType,
    declaredLocales = [],
    languageDependentText,
    videos = [],
    rootDir = process.cwd(),
    inspectMedia = async (entry) => inspectMediaFile(path.resolve(rootDir, entry.path)),
    languageIndependentTextReview
  } = options;
  const blockers = [];
  const warnings = [];
  const results = [];

  if (!['first-publication', 'update'].includes(publicationType)) {
    blockers.push('yandex.publication.type must be first-publication or update');
  }
  if (publicationType === 'update' && videos.length === 0) {
    return { ruleId: 'CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO', status: 'PASS', blockers, warnings, results };
  }
  if (publicationType === 'first-publication' && videos.length === 0) {
    blockers.push('first-publication requires a horizontal gameplay video');
  }

  const localeEntries = new Map();
  const pathLocales = new Map();
  for (const entry of videos) {
    const locale = String(entry.locale ?? '');
    if (!locale) blockers.push('video evidence is missing locale');
    else localeEntries.set(locale, entry);
    const normalizedPath = normalize(entry.path);
    const localesForPath = pathLocales.get(normalizedPath) ?? [];
    localesForPath.push(locale);
    pathLocales.set(normalizedPath, localesForPath);

    const actual = await inspectMedia(entry);
    const itemBlockers = [];
    if (!actual?.exists) itemBlockers.push(`${locale}: video file is missing`);
    else if (actual.probeError) itemBlockers.push(`${locale}: media metadata is not provable: ${actual.probeError}`);
    else {
      if (path.extname(entry.path).toLowerCase() !== '.mp4' || actual.format !== 'mp4') itemBlockers.push(`${locale}: format must be MP4`);
      if (!Number.isFinite(actual.width) || !Number.isFinite(actual.height) || Math.abs(actual.width / actual.height - 16 / 9) > 0.001) {
        itemBlockers.push(`${locale}: aspect ratio must be 16:9`);
      }
      if (actual.height < MIN_HEIGHT) itemBlockers.push(`${locale}: height must be at least ${MIN_HEIGHT}px`);
      if (!(actual.durationSeconds > 0 && actual.durationSeconds <= MAX_DURATION_SECONDS)) {
        itemBlockers.push(`${locale}: duration must be at most ${MAX_DURATION_SECONDS}s`);
      }
      if (actual.sizeBytes > MAX_SIZE_BYTES) itemBlockers.push(`${locale}: size must be at most ${MAX_SIZE_BYTES} bytes`);
      if (actual.width !== 1920 || actual.height !== 1080) warnings.push(`${locale}: 1920x1080 is preferred`);
      validateEvidenceMatchesFile(entry, actual, itemBlockers);
    }
    if (!(Number(entry.gameplayRatio) >= MIN_GAMEPLAY_RATIO && Number(entry.gameplayRatio) <= 1)) {
      itemBlockers.push(`${locale}: manually reviewed real gameplay ratio must be at least 0.70`);
    }
    const reviewLabels = {
      realGameplay: 'real gameplay',
      systemUiAbsent: 'system UI absence',
      yandexUiAbsent: 'Yandex Games UI absence',
      artificialBlackBarsAbsent: 'artificial black bars absence',
      localeMatchesDraft: 'Draft locale match'
    };
    for (const [key, label] of Object.entries(reviewLabels)) {
      if (!manualPass(entry, key)) itemBlockers.push(`${locale}: manual ${label} review with evidence is required`);
    }
    blockers.push(...itemBlockers);
    results.push({ locale, path: entry.path, status: itemBlockers.length ? 'BLOCK' : 'PASS', blockers: itemBlockers, actual });
  }

  if (publicationType === 'first-publication') {
    if (languageDependentText !== true && languageDependentText !== false) {
      blockers.push('horizontalGameplayVideo.languageDependentText must be declared');
    } else if (languageDependentText) {
      for (const locale of declaredLocales) {
        if (!localeEntries.has(locale)) blockers.push(`missing locale-specific horizontal gameplay video for ${locale}`);
      }
      for (const [videoPath, locales] of pathLocales) {
        if (videoPath && new Set(locales).size > 1) blockers.push(`${videoPath}: localized gameplay video cannot be reused across locales`);
      }
    } else {
      const covered = new Set(videos.flatMap((entry) => entry.coversLocales ?? [entry.locale]));
      for (const locale of declaredLocales) {
        if (!covered.has(locale)) blockers.push(`horizontal gameplay video does not cover locale ${locale}`);
      }
      const shared = videos.some((entry) => (entry.coversLocales?.length ?? 0) > 1)
        || [...pathLocales.values()].some((locales) => new Set(locales).size > 1);
      if (shared && !(languageIndependentTextReview?.status === 'PASS' && languageIndependentTextReview?.evidence)) {
        blockers.push('shared locale video requires evidence that gameplay contains no language-dependent text');
      }
    }
  }

  return {
    ruleId: 'CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO',
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    warnings,
    results
  };
}

export function validatePromotionalVideoExclusion({ zipEntries = [], videos = [] }) {
  const promoPaths = new Set(videos.map((entry) => normalize(entry.path)));
  const promoNames = new Set([...promoPaths].map((entry) => path.posix.basename(entry)));
  const promoHashes = new Set(videos.map((entry) => String(entry.sha256 ?? '').toLowerCase()).filter(Boolean));
  const matches = zipEntries
    .map((entry) => typeof entry === 'string' ? { name: normalize(entry), sha256: null } : {
      name: normalize(entry.name),
      sha256: String(entry.sha256 ?? '').toLowerCase()
    })
    .filter((entry) => entry.name.endsWith('.mp4'))
    .filter((entry) => promoPaths.has(entry.name) || promoNames.has(path.posix.basename(entry.name)) || promoHashes.has(entry.sha256));
  return {
    status: matches.length ? 'BLOCK' : 'PASS',
    blockers: matches.map((entry) => `promotional MP4 must not be inside the Yandex release ZIP: ${entry.name}`),
    matches: matches.map((entry) => entry.name)
  };
}

export function inspectZipEntries(file) {
  const buffer = fs.readFileSync(file);
  let eocd = -1;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found');
  const entries = [];
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const localOffset = buffer.readUInt32LE(offset + 42);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local header');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
    entries.push({
      name,
      sha256: content ? crypto.createHash('sha256').update(content).digest('hex') : null
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function listZipEntries(file) {
  return inspectZipEntries(file).map((entry) => entry.name);
}

async function runCli() {
  const rootDir = path.resolve(readArg('--root', process.cwd()));
  const specPath = path.resolve(rootDir, readArg('--spec', 'game-spec.yaml'));
  const evidencePath = path.resolve(rootDir, readArg('--evidence', 'artifacts/evidence/final-gameplay-videos.json'));
  const contract = readGameSpecMediaContract(fs.readFileSync(specPath, 'utf8'));
  const evidence = fs.existsSync(evidencePath)
    ? JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
    : { videos: [] };
  const media = await validateGameplayVideos({
    ...contract,
    videos: evidence.videos ?? [],
    languageIndependentTextReview: evidence.languageIndependentTextReview,
    rootDir
  });
  if (evidence.publicationType && evidence.publicationType !== contract.publicationType) {
    media.blockers.push('evidence publicationType does not match game-spec.yaml');
    media.status = 'BLOCK';
  }
  const zipPath = readArg('--zip');
  const archive = zipPath
    ? validatePromotionalVideoExclusion({
      zipEntries: inspectZipEntries(path.resolve(rootDir, zipPath)),
      videos: evidence.videos ?? []
    })
    : { status: 'PASS', blockers: [], matches: [], note: 'ZIP not supplied; archive exclusion was not checked.' };
  const externalProviderArchive = zipPath
    ? inspectZipForExternalEvidence(path.resolve(rootDir, zipPath))
    : { status: 'NOT_CHECKED', blockers: [], matches: [], note: 'ZIP not supplied; provider contamination was not checked.' };
  const blockers = [...media.blockers, ...archive.blockers, ...externalProviderArchive.blockers];
  console.log(JSON.stringify({
    status: blockers.length ? 'BLOCK' : 'PASS',
    media,
    archive,
    externalProviderArchive,
    blockers
  }, null, 2));
  if (blockers.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
