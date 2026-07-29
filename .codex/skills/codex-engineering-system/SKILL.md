---
name: codex-engineering-system
description: Mandatory orchestration for non-trivial Starter Kit engineering. Routes scoped evidence-first work while controlling context, verification, retries, and token use.
---

# Codex Engineering System

## Yandex precedence

This skill is subordinate to current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, `PROJECT_RULES.md`, and explicit product constraints. It coordinates engineering work but cannot approve compliance, weaken a release gate, or authorize a release candidate.

## Activation

Use for every non-trivial engineering task. Read `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`, then activate `$implementation-cycle` plus only the local skills needed for the task.

Do not add this system to product runtime or the release ZIP. In a mature project, preserve an existing same-name system through semantic merge and the configured single skill root.

## Routing

1. Establish a compact scope, protected areas, success token, and evidence plan.
2. Load focused context and the minimum relevant skills.
3. Delegate implementation discipline to `$implementation-cycle`.
4. Use the smallest sufficient verification ladder.
5. Store compact state under `.loop/` when the task spans multiple phases.
6. Stop at the success token or escalate after three materially different failed attempts for one root cause.

## Token discipline

- default to medium reasoning for routine scoped work;
- use higher reasoning only for architecture, state/concurrency, security, data-loss risk, unclear root cause, or escalation;
- do not repeatedly read unchanged files or stable architecture;
- use one primary agent by default; do not load the entire skill catalog, use generic subagents, or invoke multiple models by default;
- batch related reads and commands;
- run targeted tests during iteration and full suites only at the task or release barrier;
- reuse fresh evidence only for the same commit, inputs, configuration, and unaffected scope;
- summarize large logs and keep full output in an artifact when needed;
- do not repeat preflight, worktree scans, or reports without a relevant state change.
- default to silent execution and communicate only for blockers, approvals,
  destructive actions, explicit manual checkpoints, or the final result;
- run one final task barrier and do not repeat green checks without a relevant
  state change.

## Required result

Return a concise result with changed scope, targeted evidence, broader barrier evidence if applicable, unresolved risks, and the final success or escalation token.
