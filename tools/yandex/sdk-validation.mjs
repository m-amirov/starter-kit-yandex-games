import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_RE = /<script\\b([^>]*)>(?:[\\s\\S]*?<\\/script\\s*>|)/gi;

function attribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\\\b${name}\\\\s*=\\\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] ?? null;
}

function isModuleScript(attrs) {
  return /\\btype\\s*=\\s*["']module["']/i.test(attrs);
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
    scripts.push({ src: attribute(attrs, 'src'), module: isModuleScript(attrs), index: match.index ?? 0 });
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
  return [...source.matchAll(/\\b(?:window\\.)?YaGames\\s*\\.\\s*init\\s*\\(/g)].length;
}

function hasDynamicSdkInjection(source) {
  return /createElement\\s*\\(\\s*['"]script['"]\\s*\\)/.test(source)
    && /(?:src\\s*=\\s*['"]\\/sdk\\.js['"]|script\\[src=["']\\/sdk\\.js["']\\])/.test(source);
}

function hasReadyYaGamesGuard(source) {
  return /if\\s*\\(\\s*window\\.YaGames\\s*\\)\\s*(?:return|{[\\s\\S]{0,200}?return)/.test(source)
    || /\\bwindow\\.YaGames\\s*\\?\\?/.test(source);
}

function hasExistingSdkScriptGuard(source) {
  return /querySelector\\s*\\([^)]*script\\[src=[^)]*\\/sdk\\.js[^)]*\\)/.test(source);
}

function hasLocalFallback(source) {
  return /local[-_ ]fallback/i.test(source);
}

function hasLocalEnvironmentGuard(source) {
  const fileGuard = /location\\.protocol\\s*===?\\s*['"]file:['"]/.test(source);
  const localhostGuard = /localhost|127\\.0\\.0\\.1|\\[::1\\]/.test(source);
  const throwsOutsideLocal = /if\\s*\\(\\s*!\\s*(?:isLocal|local\\w*)\\s*\\)\\s*(?:throw|{[\\s\\S]{0,120}?throw)/i.test(source);
  return (fileGuard || localhostGuard) && throwsOutsideLocal;
}

export function auditYandexSdkSource(source) {
  const blockers = [];
  const initCalls = initCallCount(source);
  if (initCalls !== 1) blockers.push(`YaGames.init must occur exactly once in production source; found ${initCalls}.`);
  if (hasDynamicSdkInjection(source) && (!hasReadyYaGamesGuard(source) || !hasExistingSdkScriptGuard(source))) {
    blockers.push('A dynamic /sdk.js fallback must guard window.YaGames and an existing SDK script to prevent duplicate injection.');
  }
  if (hasLocalFallback(source) && !hasLocalEnvironmentGuard(source)) {
    blockers.push('Production SDK failure must be fail-closed; local fallback is allowed only behind localhost/file guards.');
  }
  return {
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    evidence: {
      initCallCount: initCalls,
      dynamicSdkInjection: hasDynamicSdkInjection(source),
      guardedDynamicSdkInjection: !hasDynamicSdkInjection(source) || (hasReadyYaGamesGuard(source) && hasExistingSdkScriptGuard(source)),
      localFallback: hasLocalFallback(source),
      localFallbackGuarded: !hasLocalFallback(source) || hasLocalEnvironmentGuard(source)
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
      else if (/\\.(?:[cm]?js|ts)$/i.test(entry.name)) files.push(full);
    }
  };
  visit(sourceRoot);
  return files.sort();
}

export function auditYandexSdkProject(root) {
  const htmlPath = path.join(root, 'index.html');
  if (!fs.existsSync(htmlPath)) return { status: 'BLOCK', blockers: ['index.html is missing'], evidence: {} };
  const bootstrap = auditYandexSdkBootstrap(fs.readFileSync(htmlPath, 'utf8'));
  const sourceFiles = collectSourceFiles(root);
  const sourceAudit = auditYandexSdkSource(sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\\n'));
  const blockers = [...bootstrap.blockers, ...sourceAudit.blockers];
  return {
    status: blockers.length ? 'BLOCK' : 'PASS',
    blockers,
    evidence: {
      bootstrap: bootstrap.evidence,
      source: sourceAudit.evidence,
      sourceFiles: sourceFiles.map((file) => path.relative(root, file).replaceAll('\\\\', '/'))
    }
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const projectIndex = process.argv.indexOf('--project');
  const root = projectIndex >= 0 ? path.resolve(process.argv[projectIndex + 1]) : process.cwd();
  const result = auditYandexSdkProject(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\\n`);
  if (result.status !== 'PASS') process.exitCode = 1;
}
