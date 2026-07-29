import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

export const ROOT = path.resolve(currentDirectory, '../..');

export function filePathFromModuleUrl(value) {
  return fileURLToPath(value instanceof URL ? value : new URL(value));
}

export function resolveTargetPath(target, cwd = process.cwd(), pathImplementation) {
  if (!target || typeof target !== 'string') throw new Error('Target path is required');
  if (target.startsWith('file:')) return filePathFromModuleUrl(target);
  const windowsTarget = /^[A-Za-z]:[\\/]/.test(target);
  const posixAbsoluteTarget = target.startsWith('/');
  const windowsCwd = /^[A-Za-z]:[\\/]/.test(cwd);
  const implementation = pathImplementation
    ?? (windowsTarget || (!posixAbsoluteTarget && windowsCwd) ? path.win32 : path);
  return implementation.resolve(cwd, target);
}

export function posix(value) {
  return value.replaceAll('\\', '/');
}

function pathImplementationFor(...values) {
  return values.some((value) => typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value))
    ? path.win32
    : path;
}

export function assertPathInside(root, candidate) {
  const implementation = pathImplementationFor(root, candidate);
  const resolvedRoot = implementation.resolve(root);
  const resolvedCandidate = implementation.resolve(candidate);
  const relative = implementation.relative(resolvedRoot, resolvedCandidate);
  if (relative === '..' || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative)) {
    throw new Error(`Path is outside target root: ${candidate}`);
  }
  return resolvedCandidate;
}

export function resolveInside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[A-Za-z]:[\\/]/.test(relative)) {
    throw new Error(`Target path must be relative: ${relative}`);
  }
  return assertPathInside(root, path.resolve(root, relative));
}

export function assertNoReparseBetween(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = assertPathInside(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  const segments = relative ? relative.split(path.sep) : [];
  let current = resolvedRoot;
  for (const segment of segments) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Symlink/reparse path is not allowed: ${current}`);
    }
    current = path.join(current, segment);
  }
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
    throw new Error(`Symlink/reparse path is not allowed: ${current}`);
  }
  return resolvedCandidate;
}

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function shouldExclude(relative, excludes) {
  const normalized = posix(relative);
  return excludes.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`));
}

export function walk(dir, base = dir, options = {}) {
  const excludes = options.exclude ?? [
    '.git',
    'node_modules',
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    '.cache',
    '.loop',
    '.tmp',
    'artifacts',
    'reports'
  ];
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = posix(path.relative(base, full));
    if (shouldExclude(relative, excludes)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Symlink/reparse entry is not allowed: ${relative}`);
    if (entry.isDirectory()) out.push(...walk(full, base, options));
    else out.push(relative);
  }
  return out.sort();
}

export function sha256Tree(target, options = {}) {
  if (!fs.existsSync(target)) return null;
  if (fs.statSync(target).isFile()) return sha256File(target);
  const hash = crypto.createHash('sha256');
  for (const relative of walk(target, target, options)) {
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(target, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function stableJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableJson(data));
}

export function writeFileIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

export function isDirectoryNonEmpty(directory) {
  return fs.existsSync(directory) && fs.readdirSync(directory).some((name) => name !== '.git');
}
