# Codex Engineering System Contract

This managed contract defines the internal engineering orchestration used by the Starter Kit. It is engineering infrastructure only: it must not be imported into product runtime, bundled into the game archive, or treated as an external vendor framework.

## Mandatory activation

Use `$codex-engineering-system` for every non-trivial engineering task. The system routes the task through `$implementation-cycle` and only the project-local skills that are relevant to the current scope.

A trivial task is a deterministic one-file change with no behavioral, build, save, SDK, layout, asset-pipeline, or release impact. When uncertain, treat the task as non-trivial.

## Operating sequence

1. Define the exact scope, protected areas, success token, and smallest evidence needed.
2. Read the nearest contract, implementation files, and tests first. Expand context only when the current evidence is insufficient.
3. Use RED evidence or an executable acceptance check where practical.
4. Diagnose one root cause and implement one coherent change.
5. Verify through the smallest sufficient test ladder.
6. Record a compact checkpoint, inspect the final diff/worktree, and stop when the success token is satisfied.
7. Escalate after three materially different failed attempts for the same root cause.

## Token and context economy

### Context loading

- Load only skills relevant to the current task; do not load the full skill catalog by default.
- Start with file lists, search results, and focused ranges. Do not read the entire repository or every architecture document unless the task is a release audit, migration audit, or unresolved cross-cutting failure.
- Do not re-read unchanged files, stable architecture, or previously verified requirements in the same task. Re-open them only when the file changed, the evidence became stale, or a concrete contradiction appears.
- Keep a compact task checkpoint under `.loop/` with scope, decisions, changed files, evidence, and next step. Update it at phase boundaries rather than repeatedly reconstructing context.
- Reuse fresh evidence only when commit, inputs, configuration, and relevant files are unchanged. State what evidence was reused.

### Execution

- Use the lowest reasoning level sufficient for the task. Routine scoped implementation defaults to standard/medium reasoning; higher reasoning is reserved for architecture, data-loss risk, concurrency/state-machine defects, security, unclear root causes, or escalation after failed attempts.
- Prefer one primary agent and project-local skills. Do not spawn generic subagents, parallel reviewers, or multiple models for routine work when one scoped pass is sufficient.
- Batch related searches, reads, and checks. Avoid repeated preflight, repeated `git status`, repeated manifest scans, and repeated summaries when nothing relevant changed.
- Do not rewrite the task as a long plan. Keep plans and progress reports proportional to the work.
- Do not generate or inspect unrelated assets, content, viewports, browsers, or platform branches.

### Verification ladder

During implementation, run only checks affected by the change, in this order where applicable:

1. focused static or schema check;
2. nearest unit/component test;
3. targeted browser/E2E scenario for changed user-visible behavior;
4. affected typecheck, lint, build, or asset validation;
5. broader regression suite once at the task barrier;
6. full cross-browser, full viewport matrix, full compliance audit, and release packaging only at the release barrier or when the task explicitly changes those surfaces.

Do not run a full E2E suite after every edit. Do not repeat a green suite against the same commit and inputs unless the test is known to be flaky and the rerun is part of diagnosis.

### Logs and evidence

- Keep full logs in files when useful; report the command, verdict, duration when available, and the first actionable failure instead of pasting large logs into the working context.
- Preserve concise RED/GREEN evidence and final hashes, but do not duplicate the same evidence in multiple reports.
- A skipped mandatory gate must be reported as blocked; token economy may reduce redundant work, never required release evidence.

## Boundaries

- Official Yandex requirements, `AGENTS.md`, `PROJECT_RULES.md`, and project-specific protected systems remain authoritative.
- Existing project-local `codex-engineering-system` files require semantic merge. Never overwrite them blindly or create a second active skill root.
- The system coordinates engineering; it does not authorize `RELEASE_CANDIDATE_READY`. Yandex validation and independent release audit remain mandatory.
