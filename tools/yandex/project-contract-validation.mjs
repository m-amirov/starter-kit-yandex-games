import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function section(text, name) {
  const match = text.match(new RegExp(`^${name}:\\s*\\n((?:[ \\t]+[^\\n]*(?:\\n|$))*)`, 'm'));
  return match?.[1] ?? '';
}

function scalar(text, key) {
  return text.match(new RegExp(`^\\s*${key}:\\s*([^#\\r\\n]+)`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
}

function booleanScalar(text, key) {
  const value = scalar(text, key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function inlineList(text, key) {
  const value = scalar(text, key);
  if (!value) return [];
  const match = value.match(/^\\[(.*)\\]$/);
  if (!match) return [];
  return match[1].split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

export function parseReleaseSpec(specText) {
  const content = section(specText, 'content');
  const localization = section(specText, 'localization');
  const audio = section(specText, 'audio');
  const yandex = section(specText, 'yandex');
  const visual = section(specText, 'visual');
  const episodesRaw = scalar(content, 'episodes');
  return {
    episodes: episodesRaw === null ? null : Number(episodesRaw),
    locales: inlineList(localization, 'languages'),
    audioEnabled: booleanScalar(audio, 'enabled') === true,
    publicationType: scalar(yandex, 'type'),
    languageDependentGameplayVideo: /horizontalGameplayVideo:[\\s\\S]*?languageDependentText:\\s*true/m.test(visual)
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
    if (actual !== spec.episodes) blockers.push(`Declared episodes ${spec.episodes} do not match release evidence ${actual ?? 'missing'}.`);
  }

  const completeLocales = new Set(releaseEvidence?.localization?.completeLocales ?? []);
  for (const locale of spec.locales) {
    if (!completeLocales.has(locale)) blockers.push(`Declared locale ${locale} is missing complete localization evidence.`);
  }

  if (spec.audioEnabled && releaseEvidence?.audio?.productionAssetsPresent !== true) {
    blockers.push('Audio is enabled in game-spec but production audio evidence is missing.');
  }

  if (spec.publicationType === 'first-publication' && spec.languageDependentGameplayVideo) {
    const mediaLocales = new Set((mediaEvidence?.videos ?? []).map((entry) => entry.locale));
    for (const locale of spec.locales) {
      if (!mediaLocales.has(locale)) blockers.push(`First-publication gameplay video is missing for locale ${locale}.`);
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
  const releaseEvidence = fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) : null;
  const mediaEvidence = fs.existsSync(mediaFile) ? JSON.parse(fs.readFileSync(mediaFile, 'utf8')) : null;
  const result = auditReleaseContract({ specText, releaseEvidence, mediaEvidence });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\\n`);
  if (result.status !== 'PASS') process.exitCode = 1;
}
