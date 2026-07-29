---
name: web-game-playtest
description: Use for browser runtime, lifecycle, loading, cleanup, production smoke and cross-browser game playtesting.
---

# Web Game Playtest

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Adapted source

Derived from the useful browser-game concepts in `web-games-v2`; see `ORIGIN.md`.

## Yandex-specific filters

Do not introduce service workers, PWA install flows, CDN runtime assets or a WebGPU-only renderer unless explicitly enabled and independently proven compliant. Do not replace the official `/sdk.js` lifecycle.

## Required scenarios

- cold load with normal and throttled network;
- local/no-SDK fallback and Yandex SDK mock;
- focus loss, visibility change, platform pause and resume;
- scene transitions and repeated entry/exit;
- orientation changes without reload;
- browser back/escape behavior where applicable;
- production build with zero critical console errors and runtime 404s.

## Runtime leak checks

After repeated transitions, verify no growth in:

- scene listeners;
- timers and tweens;
- particle emitters;
- RenderTextures, masks and post effects;
- audio nodes;
- global input handlers;
- retained DOM overlays.

## Loading and assets

- load only what the current flow needs;
- prefer scene/feature-specific preload;
- validate every manifest path in the production build;
- keep gameplay-critical assets inside the archive;
- do not allocate disposable objects every frame without measurement.

## Evidence

Write `artifacts/evidence/web-game-playtest.json` with browsers, devices, scenarios, console findings, lifecycle assertions and performance observations.
