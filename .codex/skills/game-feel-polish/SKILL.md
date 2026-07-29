---
name: game-feel-polish
description: Use for input response, animation timing, feedback, transitions, effects and restrained gameplay polish.
---

# Game Feel Polish

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Principle

Polish must improve clarity and responsiveness, not conceal weak mechanics or violate platform layout/performance requirements.

## Review sequence

1. Measure input-to-feedback delay.
2. Verify anticipation before major state changes where useful.
3. Confirm impact through motion, sound, scale, particles or camera response appropriate to the action.
4. Check recovery timing and readiness for the next decision.
5. Standardize easing and motion language across UI and gameplay.
6. Provide reduced-motion behavior for nonessential movement.

## Restraint

Reject continuous shaking, excessive particles, long blocking animations, glow on every element, effects that obscure the board, and feedback that changes the apparent rules.

## Platform checks

Polish must survive low-end/mobile performance, focus loss, ads, pause/resume, orientation changes and repeated scene transitions without leaks.

## Evidence

Write `artifacts/evidence/game-feel-review.json` with observed timings and before/after scenarios.
