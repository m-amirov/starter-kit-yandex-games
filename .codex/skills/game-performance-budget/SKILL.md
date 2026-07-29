---
name: game-performance-budget
description: Use for startup, frame time, memory, asset weight, cleanup and performance regression control.
---

# Game Performance Budget

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Budget source

Read the explicit budgets in `game-spec.yaml`. Do not invent looser limits during implementation.

## Measure before optimizing

Capture production-build evidence for startup, frame pacing, long tasks, active object counts, texture/audio weight and repeated scene transitions.

## Required controls

- no critical runtime asset 404s;
- initial loading budget respected;
- stable frame pacing at declared mobile and desktop viewports;
- no unbounded listener, timer, tween, particle, RenderTexture or audio growth;
- texture dimensions and compression match display needs;
- object pooling used only for measured high-churn objects;
- heavy work is not repeated every frame when event-driven updates suffice;
- cleanup is explicit and idempotent.

## Yandex protection

Performance changes may not remove SDK lifecycle calls, interaction guards, responsive checks, accessibility, save durability or required evidence. External CDN offloading is forbidden by default.

## Evidence

Write `artifacts/evidence/performance-budget.json` with budgets, measurements, tools and verdicts.
