# Autonomous Yandex Game Production Contract

## Mission

Build a complete, high-quality Yandex Games release candidate from `game-spec.yaml` without intermediate human approval.

## Authority and prohibitions

You may implement, generate assets, test, commit and package a release candidate. You must not publish, submit to moderation, modify production secrets, rewrite protected Git history, or claim completion when a required gate is skipped or red.

## Authority order

Read and obey `docs/SKILL_PRECEDENCE.md` and `config/skill-policy.json`.

Official Yandex Games requirements are always authoritative. Generic game-development guidance can add stricter quality checks but cannot weaken platform rules, change the declared browser-hosted target, introduce incompatible distribution patterns or approve compliance.

## Skill stack

Core:

- `$codex-engineering-system`
- `$implementation-cycle`
- `$release-audit`

Adapted external methods:

- `$product-quality-review` ← `game-design-v3`
- `$visual-quality-gate` ← `game-art-v2`
- `$web-game-playtest` ← `web-games-v2`
- `$game-audio-quality` ← `game-audio-v2`
- `$mobile-game-ux` ← `mobile-games-v2`

Production skills:

- `$game-audio-quality`
- `$mobile-game-ux`
- `$level-design-quality`
- `$game-feel-polish`
- `$game-performance-budget`
- `$asset-provenance-and-rights`
- `$game-accessibility`

Platform:

- `$yandex-release-validation`

General installed skills may support implementation and debugging, but project-local skills and Yandex requirements take precedence.

## Mandatory sequence

`SPEC → PRODUCT THESIS → VERTICAL SLICE → ART/AUDIO DIRECTION → CONTENT → PLATFORM → QA → YANDEX VALIDATION → INDEPENDENT AUDIT → RC`

The vertical slice must pass product, visual, feel, mobile, accessibility and performance review before mass content or asset generation.

## Engineering cycle

For every non-trivial task use `$codex-engineering-system`, which routes the work through `$implementation-cycle`: reproduce/define, RED evidence, diagnose, implement, targeted verification, regression, diff/worktree review.

Follow `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`: load only relevant skills and files, keep compact `.loop/` checkpoints, use the lowest sufficient reasoning level, run targeted checks during iteration, reuse only fresh same-commit evidence, and reserve full suites for task/release barriers.

Maximum three materially different fix attempts for one root cause. Then create `artifacts/ESCALATION_REPORT.md`.

## External guidance filters

Do not introduce by default:

- PWA/service workers;
- App Store/Google Play packaging;
- CDN-hosted gameplay assets;
- WebGPU-only rendering;
- audio autoplay;
- third-party monetization that conflicts with Yandex;
- UI polish that causes clipping, overlap or small touch targets.

## Target-aware updater boundary

- Use `init-project.mjs --profile new-project` only for an empty new target.
- Use `apply-update.mjs --profile mature-yandex-phaser --dry-run` before any
  mature-project integration.
- Mature-project runtime, `index.html`, `game-spec.yaml`, project profile,
  product contracts, assets and package lock are project-owned.
- `AGENTS.md`, `package.json`, project-wide Yandex contracts and existing
  same-name skills require semantic or structural merge; never overwrite them.
- Deliver skills through the configured `skillRoot`. Do not create a second
  active root when the target profile forbids it.
- Product seeds are init-only and become project-owned immediately.
- An unresolved conflict or ownership violation blocks integration status.

## Release candidate barrier

`RELEASE_CANDIDATE_READY` requires all applicable production skills, full Yandex requirements audit, independent release audit, current evidence, no open P0/P1 defects, valid ZIP and SHA-256.
