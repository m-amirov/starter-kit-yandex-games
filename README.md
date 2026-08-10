# Autonomous Yandex Games Starter Kit 0.5.1

Версионируемая engineering/compliance инфраструктура для создания новых игр и
безопасного обновления существующих зрелых проектов Яндекс Игр.

## Два разных режима

Новый проект:

```powershell
node tools/starter-kit/init-project.mjs `
  --target E:\Work\YandexGames\new-game `
  --profile new-project
```

`init` может создать `index.html`, `game-spec.yaml`, начальные project rules и
example fixtures. После создания они становятся `project-owned` и больше не
входят в managed baseline.

Зрелый Phaser-проект:

```powershell
node tools/starter-kit/apply-update.mjs `
  --target E:\Work\YandexGames\existing-game `
  --profile mature-yandex-phaser `
  --dry-run
```

Mature update не копирует product seeds, `src/**`, `public/**`, `index.html`,
`game-spec.yaml` или project profile. `AGENTS.md` и совпадающие project skills
получают semantic-merge proposal, но не перезаписываются.

## Target profiles and ownership

Profiles are validated by `config/target-profile.schema.json`. The manifest uses
schema 2 from `config/starter-kit-manifest.schema.json` and requires an explicit
ownership class for every entry:

- `managed`;
- `project-owned`;
- `semantic-merge`;
- `new-project-seed`;
- `target-mapped`;
- `ephemeral`.

The mature profile maps reference skills from `.codex/skills` in this source
package to `.agents/skills` in the target. When `allowSecondSkillRoot` is false,
the updater refuses to create or tolerate a second active skill root.

See `docs/MANIFEST_SCHEMA.md` and `docs/STARTER_KIT_UPDATES.md`.

## Semantic conflicts

Conflicting proposals are written to:

```text
.starter-kit/conflicts/<version>/<target>.new
.starter-kit/conflicts/<version>/<target>.merge.md
```

The project file remains unchanged. After manual review and merge, record the
resolution explicitly:

```powershell
node tools/starter-kit/apply-update.mjs `
  --target E:\Work\YandexGames\existing-game `
  --profile mature-yandex-phaser `
  --resolve-semantic contract:AGENTS.md
```

There is no automatic accept-all conflict flag.

## Codex engineering system

Version 0.5.0 installs `$codex-engineering-system` and the managed
`.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md` contract. It defaults to silent
single-agent execution with medium reasoning, targeted checks, one final task
barrier, compact checkpoints, and evidence files. Existing same-name project
skills use semantic merge.

## Concept proof lifecycle

Before mass production, use `.starter-kit/core/CONCEPT_PROOF_GATE.md` and the
blind-playtest templates under `templates/product-validation/`. A vertical
slice reaches `CONCEPT_PROOF_REVIEW_READY`, then the product owner records
`CONTINUE_PRODUCTION`, `REDESIGN_CORE`, or `STOP_PROJECT`. Only the first
decision permits production. `STOP_PROJECT` activates `$project-termination`.

UI/E2E instability is adjudicated through
`.starter-kit/core/TEST_HARNESS_ADJUDICATION.md` before runtime changes.

## Screenshot Visual Gate

`SCREENSHOT_VISUAL_GATE` is mandatory before accepting a production-visible gameplay, environment, enemy/boss, attack, VFX, Living Arena, UI, asset, responsive-layout, or meaningful visual-state pass. It captures the affected current-HEAD production runtime states, reviews them against the project's art contracts and accepted baseline, then permits the acceptance token only after any correction/recheck. The matrix is impact-based rather than a whole-project recapture; gameplay/UI changes include representative desktop and actual-touch mobile evidence. See `templates/visual-review/SCREENSHOT_VISUAL_GATE.md`.

## Quality stack

The kit contains the Codex engineering orchestration layer, five adapted external methods and seven production skills.
`config/skill-policy.json` and `docs/SKILL_PRECEDENCE.md` enforce:

`official Yandex requirements → Yandex validation → project contracts → production skills → adapted guidance`.

No skill may self-approve compliance or a release candidate. PWA/service
workers, CDN gameplay assets, WebGPU-only rendering, autoplay, and native
app-store guidance remain forbidden by default.

## Verification

```powershell
npm run starter-kit:manifest
npm run starter-kit:self-test
npm run test:updater
npm run starter-kit:update-self-test
npm run starter-kit:status -- --target E:\Path\To\initialized-target
```

Starter Kit 0.4.0 is **unsafe for mature-project update without the 0.4.1
updater**. It remains a valid historical new-project baseline where its init
flow is independently verified. See
`migrations/0.4.1-target-aware-updater.md`.

## Release boundary

Infrastructure delivery never assigns Yandex compliance `PASS`, authorizes a
release candidate, publishes a game, or creates a target-project release ZIP.
Yandex validation must precede the independent release audit.
