# Target-aware Starter Kit updates

## Safety boundary

Never copy a newer Starter Kit over an existing project. Use a clean Git
revision, an explicit target profile, and dry run first.

Starter Kit 0.4.0 is unsafe for mature-project update without the 0.4.1 updater.
Its `URL.pathname` root calculation fails on Windows, and its manifest does not
separate mature product ownership from new-project seeds.

## Modes

### Initialize a new project

```bash
node tools/starter-kit/init-project.mjs \
  --target ../new-game \
  --profile new-project
```

Only `init` may create product seeds. Every created seed is written to
`state.json` as project-owned and excluded from the managed baseline.
`init` rejects a non-empty target; existing projects must use `update`.

Init and update reports include a best-effort offline `upstreamFreshness`
indication from the reviewed Yandex documentation snapshot and the latest local
live-check report, when present. The updater does not fetch the network, rewrite
normative registries, create another framework or add product-owned seeds. Run
`npm run yandex:docs:check` explicitly for live integration evidence.

### Update a mature project

```bash
node tools/starter-kit/apply-update.mjs \
  --target ../existing-game \
  --profile mature-yandex-phaser \
  --dry-run
```

An explicit profile is mandatory for a non-empty project unless the target
already contains `.starter-kit/target.json`.

## Ownership

- `managed`: update only when the target hash matches its recorded baseline.
- `project-owned`: never copy, replace, or baseline.
- `semantic-merge`: keep the target and create a proposal plus merge notes.
- `new-project-seed`: init only; project-owned immediately afterwards.
- `target-mapped`: resolve through the configured target path such as
  `{skillRoot}`.
- `ephemeral`: never deliver or track.

The mature Phaser profile protects `src/**`, `public/**`, `index.html`,
`game-spec.yaml`, `project.profile.yaml`, package lock, runtime contracts, game
content, saves, ads, leaderboards, assets, and project-specific tests.

## Skill mapping

Logical skill identity does not depend on source layout. The bundled reference
copy may remain in `.codex/skills`, while the mature profile maps delivery to
`.agents/skills`. Unknown project skills are preserved. A differing same-name
skill becomes a semantic conflict.

Managed text that references profile-owned paths may declare
`contentTemplate: true`. The updater then materializes `{skillRoot}` and
`{codexConfigRoot}` from the same target profile used for path mapping. This is
content configuration, not a profile-name branch in the updater.

If `allowSecondSkillRoot` is false, an unexpected second active root blocks the
plan. No double registration is performed.

## Semantic merge and package.json

For a conflicting entry, the updater preserves the project file and writes:

```text
.starter-kit/conflicts/<version>/<target>.new
.starter-kit/conflicts/<version>/<target>.merge.md
```

To accept the current project version after manual merge:

```bash
node tools/starter-kit/apply-update.mjs \
  --target ../existing-game \
  --profile mature-yandex-phaser \
  --resolve-semantic <logical-id>
```

To intentionally accept the incoming Starter Kit version for a semantic or
target-mapped entry, use the explicit incoming strategy:

```bash
node tools/starter-kit/apply-update.mjs \
  --target ../existing-game \
  --profile mature-yandex-phaser \
  --resolve-semantic-incoming <logical-id>
```

The updater writes the profile-materialized incoming bytes and records their
hash as the semantic acceptance. `--resolve-semantic` remains accept-current.
`package.json` only supports accept-current because its structural merge keeps
project-specific scripts and dependencies authoritative.

`package.json` uses a structural merge. Missing Starter Kit scripts may be
added. Project scripts, name, version, package manager, and dependencies are
preserved. A script-name collision becomes a conflict; dependency changes
require an explicit migration. The updater never runs `npm install`.

## State and status

The target stores:

- `.starter-kit/target.json`;
- `.starter-kit/manifest.json`;
- `.starter-kit/state.json`;
- `.starter-kit/update-report.json`;
- versioned conflict proposals.

Status reports source/installed/target versions, updater schema, profile,
project type, skill root, managed/project-owned/semantic files, conflicts,
migrations, manifest/state hashes, idempotency, second-root violations, and
managed product-runtime violations.

```bash
node tools/starter-kit/status.mjs --target ../existing-game
```

Status is non-zero for conflicts, drift, profile/schema errors, a forbidden
second root, update-enabled mature seeds, or managed product runtime.

## Migration and rollback

Read every migration guide between the installed and target versions. The
0.4.1 migration is `migrations/0.4.1-target-aware-updater.md`.

Rollback uses Git:

1. inspect the explicit infrastructure diff;
2. restore the pre-update project commit through the project's normal Git
   workflow;
3. do not copy files from the Starter Kit manually;
4. do not accept all conflicts automatically.

Dry run performs no writes. Neither init/update status tooling nor dry run
creates a target-project release ZIP.

## Optional external runtime provider

Version 0.5.7 delivers only the managed pinned provider tooling, integrity
metadata, registry/schema and documentation. Mature updates never overwrite or
seed `artifacts/evidence/external/yandex-runtime/`, never touch the local
Harness-owned `.state/dedicated-auth-profile/`, never update the pin from
upstream, and never start an authenticated browser. Product runtime,
`game-spec.yaml`, `src/`, `public/`, `index.html`, package lock, project evidence
and local configuration remain protected by the existing profile boundary.

The provider subtree contains a local `.gitignore` for `.state/` and temporary
provider-side `evidence/`; completed runs are moved to the project-owned evidence
root by the explicit command. Reapplying the same managed 0.5.7 inputs is
idempotent. See `migrations/0.5.6-to-0.5.7.md`.


## Reviewed mutable contracts

Some Starter Kit contracts are intentionally updated by an explicit project review flow. They must not be modeled as immutable managed files.

`config/yandex-doc-snapshot.json` is semantic-merge state. The supported `yandex:docs:accept-snapshot` command records the reviewed target hash in `.starter-kit/state.json`. A later unreviewed edit is reported by `starter-kit:status` as semantic drift. An unchanged legacy managed baseline migrates to semantic ownership during the next canonical updater run; a locally modified legacy snapshot still requires an explicit semantic resolution.
