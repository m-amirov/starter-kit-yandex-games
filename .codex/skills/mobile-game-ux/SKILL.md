---
name: mobile-game-ux
description: Use for touch interaction, mobile layout, safe areas, orientation changes and mobile browser behavior.
---

# Mobile Game Ux

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Adapted source

Derived from the useful touch and mobile-performance concepts in `mobile-games-v2`; see `ORIGIN.md`. Native app-store packaging guidance is intentionally excluded.

## Touch-first controls

- hit areas must be larger than decorative bounds where needed;
- feedback begins immediately on touch/pointer down;
- the finger must not hide essential information during drag;
- support pointer cancel, drag outside the canvas and interrupted gestures;
- prevent accidental double activation and repeated reward/submit actions;
- do not require hover, right click or precision gestures for core play.

## Yandex moderation regressions

- long press does not select text or open native callout/context menus;
- `selectstart`, `dragstart` and game-surface context menus are prevented;
- browser scroll, overscroll and pull-to-refresh do not interrupt play;
- portrait ↔ landscape transitions work without reload;
- safe areas do not cover controls;
- 360×640 remains usable in RU and EN;
- 390×844 is verified for portrait/full-bleed changes that can alter crop, safe-area or action/text composition;
- every orientation the game actually declares is tested; do not require unsupported orientation transitions.

## Narrative multi-character mobile safety

For static narrative dialogue scenes, start with a **full-scene CG-first** composition, including intentional portrait-safe framing and negative space for the actual dialogue overlay. Use layered sprites only when meaningful dynamic interaction, pose changes or verified constraints justify them, and record that exception. Apply the `$visual-quality-gate` multi-character dialogue and CG fallback rules: repeated sprite overlap may never be addressed by unlimited CSS masks/offsets. Check the actual silhouette pixels and first dialogue glyphs at **360×640** and the taller portrait viewport; mechanical overflow checks alone cannot pass visual acceptance.

## Portrait CG human-figure framing

For mobile dialogue CG containing human figures, apply the `$visual-quality-gate` **generated human-figure anatomy, camera and spatial-continuity gate** in addition to dialogue safe-area checks. A clear lower UI zone cannot compensate for shortened legs, oversized heads, perspective distortion or an ambiguous quay/waterline. Prefer a natural deliberate crop when full-body framing causes deformation; inspect source pixels and actual runtime at 360×640 and the taller supported portrait viewport.

## Image-transition reliability (when the game uses CG/background swaps)

Check bounded **preload/crossfade** behavior using the actual mobile runtime, not only a still screenshot: keep the last valid frame on Slow 3G, decode before transition, cancel stale scene loads, handle missing/failed assets gracefully and honor reduced-motion. Verify Back/Next rapid navigation and mobile-memory/request budgets; no blank frame or unintended duplicated dialogue activation. These checks are scoped to image-driven games; do not require a CG transition system for unrelated game genres.

## Evidence

For affected full-bleed/responsive surfaces record four-edge coverage, document/internal scroll state, primary-action overlap, text readability and the actual input path. Do not infer crop quality from DOM bounds alone.

Run mobile-emulated Chromium plus WebKit where available and record `artifacts/evidence/mobile-ux-review.json`.
