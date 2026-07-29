---
name: product-quality-review
description: Use for product thesis, vertical-slice review, progression, retention and final product-quality assessment.
---

# Product Quality Review

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Adapted source

Derived from the useful game-design concepts in `game-design-v3`; see `ORIGIN.md`.

## Required evidence

Create `artifacts/evidence/product-quality-review.json` containing the build/commit, reviewed scenarios, findings, status and evidence paths.

## Review sequence

### 1. Thirty-second loop

Describe and observe:

`player action → immediate feedback → meaningful consequence/reward → next decision`.

Fail when the loop depends on waiting, unclear input, purely decorative feedback or rewards unrelated to decisions.

### 2. Player fantasy and mechanical signature

The game must communicate what the player is doing and contain at least one specific interaction or decision pattern that distinguishes it from a generic template.

### 3. First minute

Check that the player can begin without reading a wall of text, learns through action, receives an early success, and understands the next objective.

### 4. Decisions and mastery

Confirm that outcomes are not determined only by repeated tapping, trivial busywork or opaque randomness. Difficulty must rise through understanding, planning, execution or controlled complexity.

### 5. Progression and pacing

Validate early wins, rising challenge, rest beats, mechanic introduction, meaningful unlocks and absence of filler content. Meta systems must change decisions or goals rather than merely add screens.

### 6. Category truthfulness

Every declared Yandex genre/category must be supported by the actual core loop and evidence. Reject categories chosen only for reach or theme.

### 7. Vertical-slice barrier

Do not mass-produce levels, assets or meta content until one representative slice passes the product, visual, feel, mobile, accessibility and performance gates.

## Release blockers

- unclear core loop;
- genre/category mismatch;
- repetitive content before intended session length;
- tutorial teaches buttons but not decisions;
- progression is cosmetic or economically coercive;
- first session lacks an understandable goal and result;
- product review is based only on documents rather than the production runtime.
