---
name: game-audio-quality
description: Use for music, sound effects, audio settings, focus, ads and browser audio lifecycle.
---

# Game Audio Quality

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Adapted source

Derived from the useful audio-system concepts in `game-audio-v2`; see `ORIGIN.md`.

## Audio structure

Classify shipped sounds as music, gameplay SFX, UI SFX, ambience or voice. Define a mix hierarchy so critical gameplay feedback remains audible without clipping or masking.

## Browser and Yandex lifecycle

- unlock audio only after valid user interaction;
- never depend on autoplay;
- pause, mute or duck audio on Yandex ads according to the platform flow;
- handle focus loss, platform pause, scene exit and resume idempotently;
- prevent duplicate music after resume or repeated scene entry;
- persist mute/volume settings without changing the save schema unexpectedly.

## Quality checks

- important actions have timely, semantically correct feedback;
- frequently repeated actions use controlled variation when needed;
- UI sounds are short and do not compete with gameplay cues;
- transitions avoid clicks, abrupt loops and volume jumps;
- sounds match the visual material and scale;
- audio remains understandable at low volume and with music disabled.

## Evidence

Write `artifacts/evidence/audio-quality-review.json`. If the game ships no audio, document that decision and ensure platform behavior remains correct.
