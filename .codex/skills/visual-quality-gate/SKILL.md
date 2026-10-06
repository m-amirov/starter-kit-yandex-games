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

## Screenshot Visual Gate

`SCREENSHOT_VISUAL_GATE` is the mandatory acceptance part of this skill for every production-visible pass affecting gameplay, biome/environment, enemies/elites/bosses, attacks/telegraphs, VFX, Living Arena presentation, UI/HUD/screens, assets, responsive layout, or visually meaningful states/interactions. A purely non-visual rendered-output-neutral change may skip it only with evidence; ambiguity requires the gate.

Capture screenshots from the actual current-HEAD production runtime, with each affected state/effect active. Do not accept isolated previews, mockups, editor or DEV-only scenes, or inactive effects. Test bootstrap is permitted only to reach a state and must be marked without replacing production semantics.

Before independent visual review, prove that the reviewer received the actual screenshot/reference pixels (image content or readable files with hash, bytes and dimensions). A path, filename, DOM dump, OCR, or "screenshot created" message is not evidence. If pixel transfer is unavailable, classify visual acceptance as `BLOCKED`.

Use an impact-based matrix: affected enemy work covers normal, pressure/attack, and affected elite/boss states; bosses cover introduction/readability, every materially different attack/phase, and crowded combat; biomes cover environment, ordinary combat, interaction, and pressure; UI covers normal, long RU/EN text, interactive, and relevant modal/result states. Gameplay/UI changes require a representative desktop and mobile viewport. Mobile gameplay evidence uses an actual touch path.

Review against project-owned `ART_BIBLE`, `VISUAL_LANGUAGE`, asset manifests, and accepted baseline. Fail on placeholders/debug visuals, generic circles/lines/polygons as the main art language, technical geometry over finished art, indistinguishable role silhouettes, elite-as-tint/ring/glow, debug-like boss attacks, biome reskins without identity, flat environments, poor hierarchy, obscuring VFX, unreadable telegraphs, layout/localization or responsive defects, lost important objects, or style/baseline regressions.

Save only the compact needed evidence: screenshot set, short verdict, checked states/viewports, and current HEAD; add a before/after contact sheet for rework when useful. An infrastructure timeout/failure is an evidence gap, not a visual PASS. Before the gate passes, do not issue `*_IMPLEMENTED`, `*_ACCEPTED`, `*_OWNER_REVIEW_READY`, or visual/product completion tokens. Use `FUNCTIONALLY_IMPLEMENTED` and `VISUAL_ACCEPTANCE: FAIL` where accurate.

Record edge-to-edge measurements on all four viewport edges, document/internal scroll state, text readability, primary-action overlap, and before/after authored visual-event ids. For `object-fit: cover` or equivalent full-bleed media, inspect the actual crop at target viewports and distinguish a global layout defect from a source-asset/focal-point defect before changing shared CSS. Portrait/full-bleed work should include 360×640 and 390×844 when those viewports are within the declared support matrix. Coverage must reference a current ledger hash/version; stale or missing ledgers are evidence gaps. Playwright hangs, unavailable browsers and inaccessible captures are `BLOCKED`, not PASS.

For games, a new enemy, elite, boss, biome, attack, or Living Arena effect is not production-ready merely because an asset exists, tests pass, collision works, or E2E reaches the state: inspect it in real combat context.

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
