import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const tests = fs.readdirSync(path.join(ROOT, 'tests', 'starter-kit'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(ROOT, 'tests', 'starter-kit', name));
const result = spawnSync(
  process.execPath,
  ['--test', ...tests],
  { cwd: ROOT, encoding: 'utf8' }
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('PASS: target-aware updater contract suite.');
