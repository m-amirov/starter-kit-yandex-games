# Starter Kit Manifest Schema 2

`starter-kit.manifest.json` is generated from
`config/manifest-entries.json`. Every entry has an explicit ownership class and
an immutable logical identity.

Required fields:

- `source` — path inside the Starter Kit source tree;
- `logicalId` — stable identity independent of the target path;
- `ownership` — `managed`, `project-owned`, `semantic-merge`,
  `new-project-seed`, `target-mapped`, or `ephemeral`;
- `target` or `targetTemplate` — safe relative destination;
- `modes` — `init`, `update`, or both;
- `projectTypes` — `new`, `mature`, or both;
- `conflictPolicy` — the allowed delivery behavior;
- `sha256` — hash of the source file.

Optional `contentTemplate: true` marks a UTF-8 text source whose
`{skillRoot}` and `{codexConfigRoot}` tokens are materialized from the selected
target profile. The manifest hash remains the hash of canonical template bytes;
the target baseline records the hash of the materialized bytes.

## Ownership behavior

- `managed`: replace only when the target still matches its recorded baseline.
- `project-owned`: never copy, replace, or enter the managed baseline.
- `semantic-merge`: keep the target and emit `.new` plus `.merge.md` when a
  proposal differs.
- `new-project-seed`: create only during `init`; record as project-owned.
- `target-mapped`: render `targetTemplate` through the target profile, including
  `{skillRoot}`.
- `ephemeral`: never deliver or track.

Manifest validation rejects managed `index.html`, update-enabled seeds,
semantic merges with overwrite behavior, path traversal, duplicate resolved
targets, managed mature-project runtime, and skills outside the configured
skill root.

The JSON Schema is `config/starter-kit-manifest.schema.json`. Target profiles
use `config/target-profile.schema.json`.
