---
name: project-termination
description: Close a stopped game project, revoke release candidates, archive history, and separate reusable engineering lessons from product-specific content.
---

# Project Termination

## Yandex precedence

This workflow is subordinate to official Yandex Games requirements,
`config/yandex-requirements.yaml`, `AGENTS.md`, and project contracts. It never
publishes, submits, or authorizes a release candidate.

## Activation

Use after the product owner records `STOP_PROJECT`. This is a terminal product
decision, not a temporary blocker.

## Workflow

1. Stop product repair loops and all further level or content production.
2. Record `PROJECT_STATUS.md` with the stopped baseline, publication state, and
   release-candidate state.
3. Create `POSTMORTEM.md` covering hypothesis, implementation, technical
   strengths, product failure, process errors, and future stop criteria.
4. Create a reusable inventory separating generalized engineering,
   reference-only components, and product-specific content that must not move.
5. Move or retain previous release candidates under a revoked location and add
   an explicit warning that they must not be uploaded.
6. Archive all Git history with a bundle, verify it, and record SHA-256.
7. Record archive metadata, branch, commit, date, and document links.
8. Prepare generalized lessons for the Starter Kit without copying
   product-specific code or inventing a successor game.

## Exit

The project remains stopped. Do not resume repair loops, produce new content,
create a release ZIP, or reinterpret `STOP_PROJECT` as a transient failure.
