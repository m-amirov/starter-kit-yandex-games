import { ROOT, resolveTargetPath } from './lib.mjs';
import { inspectTargetStatus } from './status-core.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const targetRoot = resolveTargetPath(arg('--target') ?? ROOT);
const status = inspectTargetStatus({ sourceRoot: ROOT, targetRoot });
console.log(JSON.stringify(status, null, 2));
if (status.status !== 'clean') process.exitCode = 2;
