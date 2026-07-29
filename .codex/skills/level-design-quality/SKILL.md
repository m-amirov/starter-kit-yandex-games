---
name: level-design-quality
description: Use for authored levels, generated challenges, difficulty curves, solvability and content-duration validation.
---

# Level Design Quality

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Inputs

Read the game rules, solver/validator, content goals, target session length and Yandex genre/category evidence before changing levels.

## Mandatory checks

- every authored/generated level is valid and solvable under actual runtime rules;
- deterministic fixtures or seeds reproduce generator defects;
- new mechanics are introduced in controlled contexts before combinations;
- difficulty rises through meaningful complexity rather than hidden information or arbitrary punishment;
- levels are not near-duplicates with cosmetic changes;
- no dead ends, impossible portal pairs, unreachable goals or softlocks;
- preview, validator, solver, scoring and runtime share the same semantics;
- content duration meets the platform requirement without filler.

## Playtest profiles

Where feasible compare a solver, competent heuristic, random/poor player and interrupted/reload flow. Record success rate, move count, retries, difficulty spikes and invalid states.

## Evidence

Write `artifacts/evidence/level-design-review.json` and preserve minimal failing seeds as regression fixtures.
