import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    return raw.slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return raw.replace(/^["']|["']$/g, '');
}

export function parseReleaseSpec(specText) {
  return {
    episodes: scalar(yamlValue(specText, 'content.episodes')) ?? null,
    locales: scalar(yamlValue(specText, 'localization.languages')) ?? [],
    audioEnabled: scalar(yamlValue(specText, 'audio.enabled')) === true,
    publicationType: scalar(yamlValue(specText, 'yandex.publication.type')) ?? null,
    languageDependentGameplayVideo: scalar(
      yamlValue(specText, 'visual.marketing.horizontalGameplayVideo.languageDependentText')
    ) === true
  };
}

export function auditReleaseContract({ specText, releaseEvidence, mediaEvidence }) {
  const blockers = [];
  const spec = parseReleaseSpec(specText);

  if (!releaseEvidence || typeof releaseEvidence !== 'object') {
    blockers.push('Release contract evidence is missing.');
    return { status: 'BLOCK', blockers, evidence: { spec } };
  }

  if (Number.isFinite(spec.episodes)) {
    const actual = releaseEvidence?.content?.episodes;
    if (actual !== spec.episodes) {
      blockers.push('Declared episodes ' + spec.episodes + ' do not match release evidence ' + (actual ?? 'missing') + '.');
    }
  }

  const completeLocales = new Set(releaseEvidence?.localization?.completeLocales ?? []);
  for (const locale of spec.locales) {
    if (!completeLocales.has(locale)) {
      blockers.push('Declared locale ' + locale + ' is missing complete localization evidence.');
    }
  }

  if (spec.audioEnabled && releaseEvidence?.audio?.productionAssetsPresent !== true) {
    blockers.push('Audio is enabled in game-spec but production audio evidence is missing.');
  }

  if (spec.publicationType === 'first-publication' && spec.languageDependentGameplayVideo) {
    const mediaLocales = new Set((mediaEvidence?.videos ?? []).map((entry) => entry.locale));
    for (const locale of spec.locales) {
      if (!mediaLocales.has(locale)) {
        blockers.push('First-publication gameplay video is missing for locale ' + locale + '.');
      }
    }
  }

  return {
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    evidence: {
      spec,
      releaseEvidence: {
        episodes: releaseEvidence?.content?.episodes ?? null,
        completeLocales: [...completeLocales],
        productionAudio: releaseEvidence?.audio?.productionAssetsPresent === true
      },
      mediaLocales: (mediaEvidence?.videos ?? []).map((entry) => entry.locale)
    }
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const rootIndex = process.argv.indexOf('--project');
  const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : process.cwd();
  const specFile = path.join(root, 'game-spec.yaml');
  const evidenceFile = path.join(root, 'artifacts', 'evidence', 'release-contract.json');
  const mediaFile = path.join(root, 'artifacts', 'evidence', 'final-gameplay-videos.json');
  const specText = fs.existsSync(specFile) ? fs.readFileSync(specFile, 'utf8') : '';
  const releaseEvidence = fs.existsSync(evidenceFile)
    ? JSON.parse(fs.readFileSync(evidenceFile, 'utf8'))
    : null;
  const mediaEvidence = fs.existsSync(mediaFile)
    ? JSON.parse(fs.readFileSync(mediaFile, 'utf8'))
    : null;
  const result = auditReleaseContract({ specText, releaseEvidence, mediaEvidence });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'PASS') process.exitCode = 1;
}
