# Starter Kit source consistency audit (preflight)

This is a **read-only** check of repository-local version and Yandex registry metadata. It does not fetch official documents, accept requirements changes, rebuild a manifest, install anything, or approve a game release.

Run:
- `node tools/starter-kit/consistency-audit.mjs`
- `node tools/starter-kit/consistency-audit.mjs --strict`
- `node --test tests/starter-kit/consistency-audit.test.mjs`

Statuses: `PASS` means no detected cross-file drift; `WARN` means documentation needs review, with `--strict` returning exit code 2; `FAIL` means conflicting baseline metadata or missing required inputs (exit code 2).

The checker compares package version, authoritative manifest version, .starter-kit/VERSION, README version, and the Yandex registry/snapshot reviewed-at dates. It deliberately does not assume a newer game baseline may overwrite an older upstream baseline. Resolve mismatches by reviewing the official requirements and using the existing manifest generator/updater; never hand-edit hash fields.

GitHub main may lag a newer local Starter Kit checkout: compare ancestry and version before adoption. Run the existing `starter-kit:self-test`, updater suite and clean-target dry-run separately before merging. This tool does not replace authoritative release evidence gates.
