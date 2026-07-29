---
name: visual-quality-gate
description: Use for art direction, generated assets, UI composition, marketing media and final visual review.
---

# Visual Quality Gate

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Adapted source

Derived from the useful game-art concepts in `game-art-v2`; see `ORIGIN.md`.

## Required artifacts

Before mass asset production create:

- `artifacts/art-direction/ART_BIBLE.md`;
- `artifacts/art-direction/VISUAL_LANGUAGE.json`;
- a concept/contact sheet comparing the main assets together;
- a list of prohibited visual patterns for this project.

## Three-pass pipeline

1. **Concept pass:** silhouette, world logic, mood, value hierarchy and references.
2. **Integration pass:** assets inside real gameplay and UI at target viewports.
3. **Polish pass:** consistency, edges, spacing, animation, compression and final screenshot review.

The first generated image is never automatically final.

## Review criteria

- coherent perspective, materials, lighting, outlines and scale;
- important gameplay objects remain readable at gameplay distance;
- value and color hierarchy express gameplay priority;
- backgrounds support rather than compete with the board and controls;
- UI belongs to the game world instead of resembling a generic AI dashboard;
- states are visibly distinct without relying only on hue;
- generated text, malformed anatomy, broken symbols and inconsistent details are removed;
- marketing assets represent actual gameplay and comply with Yandex media rules;
- all RU/EN text fits after orientation changes.

## Anti-neuroslop blockers

Reject random glassmorphism, universal purple-blue gradients, excessive glow, unrelated pill cards, mixed rendering styles, arbitrary decorative particles, generic fantasy/tech motifs and unedited first-generation assets.

## Platform safety

Visual polish may not introduce clipping, overlap, hidden controls, browser scroll, tiny touch targets, misleading screenshots or excessive archive weight.
