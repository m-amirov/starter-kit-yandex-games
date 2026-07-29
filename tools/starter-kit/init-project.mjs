import { ROOT, resolveTargetPath } from './lib.mjs';
import { executeUpdate } from './update-engine.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const targetArg = arg('--target');
if (!targetArg) {
  throw new Error('Usage: node tools/starter-kit/init-project.mjs --target <project> [--profile new-project] [--dry-run]');
}

const report = await executeUpdate({
  sourceRoot: ROOT,
  targetRoot: resolveTargetPath(targetArg),
  profile: arg('--profile') ?? 'new-project',
  mode: 'init',
  dryRun: process.argv.includes('--dry-run')
});

console.log(JSON.stringify(report, null, 2));
if (report.conflicts.length) process.exitCode = 2;
