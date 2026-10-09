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
- 360×640 remains usable in RU and EN.

## Narrative multi-character mobile safety

For dialogue scenes with two or more visible characters, apply the `$visual-quality-gate` **multi-character dialogue composition and CG fallback** rule. When repeated sprite-framing fixes cannot separate the visible silhouettes from dialogue text, evaluate a unified scene CG with a portrait-safe composition instead of stacking masks or transforms. Verify actual screenshot pixels and readable text at **360×640** and the taller supported portrait viewport; mechanical overflow checks alone cannot pass visual acceptance.

## Evidence

Run mobile-emulated Chromium plus WebKit where available and record `artifacts/evidence/mobile-ux-review.json`.
