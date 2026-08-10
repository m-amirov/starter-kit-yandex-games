---
name: implementation-cycle
description: Use for every non-trivial implementation task. Enforces evidence-first scoped engineering with targeted verification.
---

# Implementation Cycle

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Workflow

1. Establish preflight: repository state, protected areas, current requirement and success token.
2. Reproduce the defect or express the intended behavior as an executable check.
3. Create or identify RED evidence where practical.
4. Diagnose the smallest root cause; do not patch symptoms with overlays, delays or weakened assertions.
5. Implement one coherent change.
6. Run targeted unit, browser and build checks relevant to the change.
7. At an acceptance boundary for a production-visible pass, run `SCREENSHOT_VISUAL_GATE` through `$visual-quality-gate`: actual-runtime current-HEAD capture, impact-based visual inspection, correction/recheck, then acceptance token.
8. Add regression coverage.
9. Inspect the diff, generated files and worktree.
10. Escalate rather than claiming completion when a mandatory gate is unavailable or red.

## Efficiency

Obey `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`. In particular:

- start from focused search/file lists and read only the nearest relevant implementation and tests;
- use targeted tests during development;
- run a broader regression suite once at the task barrier and full cross-browser/compliance suites only at the release barrier or for directly affected surfaces;
- do not repeatedly re-read stable architecture, re-run unchanged green suites, or repeat preflight/worktree scans without a state change;
- reuse evidence only when commit, inputs, configuration, and relevant files are unchanged;
- default to the lowest sufficient reasoning level and avoid generic subagents or multiple models when a local skill and one primary pass cover the task;
- summarize large logs and keep full output in artifacts rather than expanding working context;
- keep product, engineering and generated evidence commits separated when project rules require it.
- screenshot capture is not needed after each RED/GREEN iteration; it is required before acceptance of a production-visible change. Functional/E2E PASS alone is insufficient, and ambiguous classification is visual by default.
