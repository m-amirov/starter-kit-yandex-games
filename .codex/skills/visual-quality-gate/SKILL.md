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

Record edge-to-edge measurements on all four viewport edges, document/internal scroll state, text readability, primary-action overlap, and before/after authored visual-event ids. Coverage must reference a current ledger hash/version; stale or missing ledgers are evidence gaps. Playwright hangs, unavailable browsers and inaccessible captures are `BLOCKED`, not PASS.

For games, a new enemy, elite, boss, biome, attack, or Living Arena effect is not production-ready merely because an asset exists, tests pass, collision works, or E2E reaches the state: inspect it in real combat context.

## Multi-character dialogue composition and CG fallback

This rule applies to narrative/dialogue scenes with **two or more visible characters** and a live dialogue/text overlay. It does not require replacing working dynamic sprite staging or apply to unrelated combat formations.

- **Choose the representation at art direction.** Use independently staged sprites when interaction, expression changes or motion requires them. Prefer a unified, scene-specific CG (composite illustration) for a fixed emotional two-shot or group beat when it provides more coherent perspective, lighting and reliable text-safe framing.
- **Escalate repeated mobile failures.** After two materially distinct sprite-position, cue-only CSS, or mask corrections fail actual-runtime mobile visual review for the same character/text overlap or safe-area root cause, **MUST evaluate a unified CG before another staging tweak**. When it is feasible, matches the art bible, has approved provenance, and preserves the authored beat, **MUST prefer the unified CG** unless a concrete product reason for sprite staging is recorded. This is not permission to exceed the global three-attempt escalation limit: if the third materially distinct attempt fails, stop and file `artifacts/ESCALATION_REPORT.md`.
- **Unified CG contract.** Preserve character identity and reference continuity, authored cast and scene meaning. Do not bake dialogue, UI, icons, buttons, navigation, counters, captions or overlays into the artwork. Use a landscape and, where necessary, a separately composed portrait version of the same beat. The portrait composition must reserve sufficient natural negative space for the actual runtime dialogue and mobile safe areas; a deliberate waist-up portrait crop is acceptable, but floating cut-outs, harsh bottom truncation and fading character torsos into dialogue are not acceptable substitutes.
- **Pixel-level acceptance.** In the actual current-HEAD runtime, inspect the relevant desktop and mobile frames, including compact portrait 360×640 and the project's taller portrait target. Verify the **visible character silhouette pixels against the first dialogue glyphs** and UI controls, not just bounding boxes, overflow, mask computed styles or successful screenshot capture. Record screenshot hashes, viewport dimensions, cue/asset mapping, style/reference consistency and independent visual verdict. Any REWORK or missing image provenance remains FAIL/BLOCKED.
- **Scope and ownership.** A scene-specific CG replacement must not silently change other cues, choices, narrative text, character assets or routes. If production image generation or approved references are unavailable, stop with an evidence-based blocker rather than claiming an invented CG or visual PASS. Follow `$asset-provenance-and-rights` and the project-owned art bible.

**Anti-pattern:** repeatedly layering `translateY`, sprite masks, gradients and cue-specific overrides to hide the same silhouette/dialogue overlap while the completed screenshot still fails visual review.

## Generated human-figure anatomy, camera and spatial-continuity gate

Applies to any production illustration, CG, character scene, or key art showing recognizably human figures. Before integration or visual acceptance, **MUST inspect the full image** alongside the established character references and the intended in-game crop; clean runtime layout alone does not prove image quality.

- **Reference-consistent anatomy.** Reject unintended enlarged heads/hands/feet, compressed or implausibly short legs relative to the torso, inconsistent shoulder/hip scale, malformed joints, impossible poses, disconnected limbs, or mismatched proportions between people sharing a plane. Use the project's intended art style and character designs as the baseline, not a fixed universal body-height ratio. Deliberate stylization and authentic individual body variation are valid when consistent with the art bible.
- **Natural perspective.** Reject accidental wide-angle/low-angle distortion that makes heads or upper bodies disproportionately large or legs foreshortened without narrative intent. For grounded cinematic dialogue scenes, prefer a stable human-eye-level perspective and natural-lens framing (approximately 50 mm full-frame equivalent is a useful reference, **not a mandatory numeric camera setting**); all characters must share a coherent camera, horizon, perspective and scale.
- **Grounding and spatial logic.** The full scene **MUST clearly establish what surface supports each character**: consistent footwear/foot placement, contact shadow, scene scale, quay/walkway edge and waterline. Reject a wet reflective foreground that inadvertently reads as floodwater, a seawall that visually traps the actors in the harbor, inconsistent occlusion, or floating/sinking figures. Wet pavement is allowed when its ground plane remains unmistakable.
- **Portrait safety without deformation.** Do not shorten anatomy, stretch characters, shift the horizon unnaturally, invent a blocking parapet, or hide anatomy with masks solely to create dialogue space. If full-body portrait staging does not work, **MUST prefer a consciously composed mid-thigh, waist-up or other reference-consistent crop** with natural negative space rather than forcing distorted full-body figures.
- **Fail-closed art review.** Inspect the generated source *and* fresh current-HEAD runtime screenshots at all affected viewports (including compact **360×640** and the supported taller portrait frame). Explicitly record proportion/reference, camera/perspective, ground/waterline, and UI/text separation verdicts. Any unintended anatomy or spatial-continuity defect is **VISUAL_ACCEPTANCE: FAIL/REWORK**, even if mechanical tests, sprite count, UI overlap and previous Web reviews passed. Reframe or regenerate the art and re-run affected source-bound visual acceptance; do not treat a CSS fix or an old screenshot verdict as a new PASS.

**Anti-pattern:** solving a failed character/ground-plane composition by regenerating a full-body portrait without checking human proportions, perspective and the physically readable supporting surface.

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
