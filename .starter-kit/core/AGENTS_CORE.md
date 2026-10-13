# Starter-Owned Core Contract

This file is managed by the starter kit. Put game-specific rules in `PROJECT_RULES.md`.

## Engineering orchestration

## GitHub-first preflight (mandatory for Git-backed tasks)

Before substantial reading, implementation or CEOS checkpoints, verify exact repository root, expected remote URL, current branch, worktree and a **fresh** upstream HEAD. With CEOS available run `ceos git-preflight --project . --remote origin --branch main --fetch --json` and supply `--expect-repo owner/repo` when known; after a clean exact-branch BEHIND verdict, `--fetch --apply` performs the only allowed automatic fast-forward. If CEOS is absent, use `git remote -v`, `git branch --show-current`, `git status --porcelain`, `git fetch origin main`, and `git rev-list --left-right --count HEAD...origin/main` with the same fail-closed rules.

Never overwrite parallel work: no automatic stash, reset, clean, checkout, rebase, merge on dirty state, force-push, or treating a missing local file as remote absence. Block and report dirty/diverged/remote-mismatch/fetch failure; reconcile safely without destroying the user's files. Before an authorized push, fetch again and verify divergence. GitHub remote freshness is not the same as passing CEOS or game-release gates.


Read and obey `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`. Use `$codex-engineering-system` for every non-trivial engineering task; it must remain separate from product runtime and release artifacts.

Before producing a campaign, meta-system, procedural modes, or release
artifacts, satisfy `.starter-kit/core/CONCEPT_PROOF_GATE.md`. The status
`CONCEPT_PROOF_REVIEW_READY` is not release readiness. An explicit
`STOP_PROJECT` activates `$project-termination` and ends content production.

## Skill routing

Read `config/skill-policy.json` and `docs/SKILL_PRECEDENCE.md` before selecting skills. Load only skills relevant to the current task. Use targeted checks during iteration and full suites only at the task or release barrier. Reuse evidence only when it is fresh for the same commit and inputs. Official Yandex requirements always take priority.

## Mandatory lifecycle

`SPEC → PRODUCT THESIS → VERTICAL SLICE → CONTENT/ASSETS → PLATFORM → QA → YANDEX VALIDATION → INDEPENDENT RELEASE AUDIT → RC`

A stage advances only with fresh evidence tied to the current commit/build.
Every production-visible stage also requires `SCREENSHOT_VISUAL_GATE` under `$visual-quality-gate` before its success, acceptance, owner-review, visual or product-completion token; project-specific visual contracts may be stricter.

## No accidental release

Do not publish or submit. Release packaging occurs only after platform and independent audits pass.
