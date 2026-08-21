import { ROOT, resolveTargetPath } from './lib.mjs';
import { executeUpdate } from './update-engine.mjs';

function values(name) {
  const out = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) out.push(process.argv[index + 1]);
  }
  return out;
}

function value(name) {
  return values(name)[0];
}

const targetArg = value('--target');
if (!targetArg) {
  throw new Error('Usage: node tools/starter-kit/apply-update.mjs --target <project> --profile <name-or-file> [--dry-run] [--resolve-semantic <logical-id>] [--resolve-semantic-incoming <logical-id>] [--resolve-managed <logical-id>]');
}

const report = await executeUpdate({
  sourceRoot: ROOT,
  targetRoot: resolveTargetPath(targetArg),
  profile: value('--profile'),
  mode: 'update',
  dryRun: process.argv.includes('--dry-run'),
  resolveSemantic: values('--resolve-semantic'),
  resolveSemanticIncoming: values('--resolve-semantic-incoming'),
  resolveManaged: values('--resolve-managed')
});

console.log(JSON.stringify(report, null, 2));
if (report.conflicts.length) process.exitCode = 2;
