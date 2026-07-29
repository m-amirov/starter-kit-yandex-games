# Starter-Owned Core Contract

This file is managed by the starter kit. Put game-specific rules in `PROJECT_RULES.md`.

## Engineering orchestration

Read and obey `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`. Use `$codex-engineering-system` for every non-trivial engineering task; it must remain separate from product runtime and release artifacts.

## Skill routing

Read `config/skill-policy.json` and `docs/SKILL_PRECEDENCE.md` before selecting skills. Load only skills relevant to the current task. Use targeted checks during iteration and full suites only at the task or release barrier. Reuse evidence only when it is fresh for the same commit and inputs. Official Yandex requirements always take priority.

## Mandatory lifecycle

`SPEC → PRODUCT THESIS → VERTICAL SLICE → CONTENT/ASSETS → PLATFORM → QA → YANDEX VALIDATION → INDEPENDENT RELEASE AUDIT → RC`

A stage advances only with fresh evidence tied to the current commit/build.

## No accidental release

Do not publish or submit. Release packaging occurs only after platform and independent audits pass.
