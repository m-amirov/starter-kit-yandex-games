---
name: game-accessibility
description: Use for control accessibility, color, text, motion, audio alternatives and understandable game states.
---

# Game Accessibility

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Scope

Accessibility is a product and quality requirement, but changes must remain compatible with Yandex interaction guards, layout and SDK lifecycle.

## Required review

- essential states are not communicated by color alone;
- text has sufficient contrast and remains readable at configured viewports;
- touch targets and focusable HTML controls are usable;
- keyboard/back/escape behavior is coherent when supported;
- reduced-motion mode removes nonessential motion without breaking rules;
- mute is available when audio ships, and critical information is not audio-only;
- time pressure is justified by the genre and explained;
- errors and blocked actions explain what the player can do next;
- tutorials can be revisited or critical rules remain discoverable;
- localization does not produce clipped or corrupted text.

## Interaction guard exception

Do not globally disable selection or keyboard interaction on legitimate `input`, `textarea`, `select` or `contenteditable` controls. Limit game-surface guards to the intended surface.

## Evidence

Write `artifacts/evidence/accessibility-review.json` with tested modes and known limitations.
