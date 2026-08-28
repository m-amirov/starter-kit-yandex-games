import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';
import { assertNoUnresolvedUpstreamChanges, inspectLocalFreshness } from '../yandex/docs-watch.mjs';

const upstreamFreshness = assertNoUnresolvedUpstreamChanges(inspectLocalFreshness(ROOT));

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'starter-kit', 'build-manifest.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'starter-kit', 'self-test.mjs')], { stdio: 'inherit' });

const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const output = path.join(path.dirname(ROOT), `yandex-games-autonomous-starter-kit-${version}.zip`);
const checksumFile = `${output}.sha256`;
const python = String.raw`
import os, sys, zipfile
root = sys.argv[1]
out = sys.argv[2]
excluded_dirs = {'.git','node_modules','dist','coverage','playwright-report','test-results','.cache','.loop','.tmp','reports'}
excluded_suffixes = ('.zip','.sha256','.log')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in excluded_dirs)
        for name in sorted(files):
            if name.endswith(excluded_suffixes):
                continue
            file_path = os.path.join(base, name)
            if os.path.islink(file_path):
                raise SystemExit('symlink is not allowed in archive')
            archive_name = os.path.relpath(file_path, root).replace(os.sep, '/')
            if archive_name.startswith('artifacts/') and archive_name != 'artifacts/evidence/final-gameplay-videos.json':
                continue
            info = zipfile.ZipInfo(archive_name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            with open(file_path, 'rb') as source:
                archive.writestr(info, source.read())
with zipfile.ZipFile(out, 'r') as archive:
    names = archive.namelist()
    if not names:
        raise SystemExit('archive is empty')
    if any('\\' in name or name.startswith('/') or '..' in name.split('/') for name in names):
        raise SystemExit('unsafe archive entry')
    if any(name.startswith('yandex-games-autonomous-starter-kit/') for name in names):
        raise SystemExit('unexpected parent directory')
    if archive.read('VERSION').decode('utf-8').strip() != sys.argv[3]:
        raise SystemExit('VERSION mismatch in archive')
`;

let packaged = false;
for (const executable of ['python', 'python3', 'py']) {
  const result = spawnSync(executable, ['-c', python, ROOT, output, version], { encoding: 'utf8' });
  if (result.status === 0) {
    packaged = true;
    break;
  }
  if (result.error?.code !== 'ENOENT') {
    process.stderr.write(result.stderr ?? '');
  }
}
if (!packaged) throw new Error('Python 3 is required to build the Starter Kit ZIP');

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(checksumFile, `${sha256}  ${path.basename(output)}\n`);
console.log(JSON.stringify({ output, checksumFile, sha256, version, upstreamFreshness }, null, 2));
