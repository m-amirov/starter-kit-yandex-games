import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_RE = /<script\b([^>]*)>/gi;

function attribute(attrs, name) {
  for (const match of attrs.matchAll(/\\b([A-Za-z_:][\\w:.-]*)\\s*=\\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if (match[1].toLowerCase() === String(name).toLowerCase()) return match[2] ?? match[3] ?? null;
  }
  return null;
}

function isModuleScript(attrs) {
  return /\btype\s*=\s*["']module["']/i.test(attrs);
}

function normalizeScriptSrc(src) {
  if (!src) return null;
  try {
    return new URL(src, 'https://example.invalid/').pathname;
  } catch {
    return src.split(/[?#]/, 1)[0];
  }
}

export function auditYandexSdkBootstrap(html) {
  const blockers = [];
  const scripts = [];
  for (const match of html.matchAll(SCRIPT_RE)) {
    const attrs = match[1] ?? '';
    scripts.push({
      src: attribute(attrs, 'src'),
      module: isModuleScript(attrs),
      index: match.index ?? 0
    });
  }

  const sdkScripts = scripts.filter((entry) => normalizeScriptSrc(entry.src) === '/sdk.js');
  if (!sdkScripts.length) blockers.push('Production HTML must contain an explicit /sdk.js script reference.');
  if (sdkScripts.length > 1) blockers.push('Production HTML must contain exactly one explicit /sdk.js script reference.');

  const firstModule = scripts.find((entry) => entry.module);
  if (sdkScripts.length && firstModule && sdkScripts[0].index > firstModule.index) {
    blockers.push('The explicit /sdk.js script must appear before the application module entry.');
  }

  return {
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    evidence: {
      explicitSdkScriptCount: sdkScripts.length,
      firstSdkScriptIndex: sdkScripts[0]?.index ?? null,
      firstModuleIndex: firstModule?.index ?? null
    }
  };
}

function initCallCount(source) {
  return [...source.matchAll(/\b(?:window\??\.)?YaGames\s*\.\s*init\s*\(/g)].length;
}

function sdkPathIdentifiers(source) {
  return new Set(
    [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["']\/sdk\.js["']/g)]
      .map((match) => match[1])
  );
}

function hasDynamicSdkInjection(source) {
  if (!/createElement\s*\(\s*["']script["']\s*\)/.test(source)) return false;
  if (/\.src\s*=\s*["']\/sdk\.js["']/.test(source)) return true;
  for (const identifier of sdkPathIdentifiers(source)) {
    const pattern = new RegExp('\\.src\\s*=\\s*' + identifier + '\\b');
    if (pattern.test(source)) return true;
  }
  return false;
}

function hasReadyYaGamesGuard(source) {
  return /if\s*\(\s*window\??\.YaGames\s*\)\s*(?:return|{[\s\S]{0,200}?return)/.test(source)
    || /\bwindow\??\.YaGames\s*\?\?/.test(source);
}

function hasExistingSdkScriptGuard(source) {
  const queryCalls = [...source.matchAll(/querySelector\??\.\s*\(([^)]*)\)|querySelector\s*\(([^)]*)\)/g)]
    .map((match) => match[1] ?? match[2] ?? '');
  const identifiers = sdkPathIdentifiers(source);
  return queryCalls.some((query) => {
    if (!/script\s*\[\s*src\s*=/.test(query)) return false;
    if (/\/sdk\.js/.test(query)) return true;
    return [...identifiers].some((identifier) => new RegExp('\\b' + identifier + '\\b').test(query));
  });
}

function hasLocalFallback(source) {
  return /local[-_ ]fallback/i.test(source);
}

function hasLocalEnvironmentGuard(source) {
  const fileGuard = /location\.protocol\s*===?\s*["']file:["']/.test(source);
  const localhostGuard = /localhost|127\.0\.0\.1|\[::1\]/.test(source);
  const negativeLocalThrow = /if\s*\(\s*!\s*(?:isLocalDevelopment\([^)]*\)|isLocal|local\w*)\s*\)\s*(?:throw|{[\s\S]{0,160}?throw)/i.test(source);
  const positiveLocalReturn = /if\s*\(\s*(?:isLocalDevelopment\([^)]*\)|isLocal|local\w*)\s*\)\s*(?:return|{[\s\S]{0,160}?return)/i.test(source);
  return (fileGuard || localhostGuard) && (negativeLocalThrow || (positiveLocalReturn && /\bthrow\b/.test(source)));
}

export function auditYandexSdkSource(source) {
  const blockers = [];
  const initCalls = initCallCount(source);
  if (initCalls !== 1) {
    blockers.push('YaGames.init must occur exactly once in production source; found ' + initCalls + '.');
  }

  const dynamicSdkInjection = hasDynamicSdkInjection(source);
  const guardedDynamicSdkInjection = !dynamicSdkInjection
    || (hasReadyYaGamesGuard(source) && hasExistingSdkScriptGuard(source));
  if (!guardedDynamicSdkInjection) {
    blockers.push('A dynamic /sdk.js fallback must guard window.YaGames and an existing SDK script to prevent duplicate injection.');
  }

  const localFallback = hasLocalFallback(source);
  const localFallbackGuarded = !localFallback || hasLocalEnvironmentGuard(source);
  if (!localFallbackGuarded) {
    blockers.push('Production SDK failure must be fail-closed; local fallback is allowed only behind localhost/file guards.');
  }

  return {
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    evidence: {
      initCallCount: initCalls,
      dynamicSdkInjection,
      guardedDynamicSdkInjection,
      localFallback,
      localFallbackGuarded
    }
  };
}

function collectSourceFiles(root) {
  const files = [];
  const sourceRoot = path.join(root, 'src');
  if (!fs.existsSync(sourceRoot)) return files;

  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:[cm]?js|ts)$/i.test(entry.name)) files.push(full);
    }
  };

  visit(sourceRoot);
  return files.sort();
}

export function auditYandexSdkProject(root) {
  const htmlPath = path.join(root, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return { status: 'BLOCK', blockers: ['index.html is missing'], evidence: {} };
  }

  const bootstrap = auditYandexSdkBootstrap(fs.readFileSync(htmlPath, 'utf8'));
  const sourceFiles = collectSourceFiles(root);
  const sourceAudit = auditYandexSdkSource(
    sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  );
  const blockers = [...bootstrap.blockers, ...sourceAudit.blockers];

  return {
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    evidence: {
      bootstrap: bootstrap.evidence,
      source: sourceAudit.evidence,
      sourceFiles: sourceFiles.map((file) => path.relative(root, file).replaceAll('\\', '/'))
    }
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const projectIndex = process.argv.indexOf('--project');
  const root = projectIndex >= 0 ? path.resolve(process.argv[projectIndex + 1]) : process.cwd();
  const result = auditYandexSdkProject(root);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'PASS') process.exitCode = 1;
}
