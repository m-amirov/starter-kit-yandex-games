---
name: asset-provenance-and-rights
description: Use whenever creating, importing, transforming or shipping visual, audio, font or marketing assets.
---

# Asset Provenance And Rights

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Asset ledger

Every shipped asset must record:

- path and stable asset ID;
- purpose and dimensions/duration;
- creation method;
- generation prompt/model/date when AI-generated;
- original source and license when provided;
- transformations and derivative relationship;
- checksum;
- approval status and build usage.

## Rights and safety

Reject assets with unknown ownership, copied brand characters, unlicensed music/fonts, watermarks, embedded signatures, accidental readable text, prohibited content or unexplained third-party downloads.

## Quality integration

An asset is not approved merely because provenance is valid. It must also pass `$visual-quality-gate` or `$game-audio-quality`, production path validation and Yandex media/content requirements.

## Marketing truthfulness

Icons, covers, screenshots and videos must represent the actual final game, use dedicated compositions where allowed, and satisfy the Yandex real-gameplay/media rules.

## Evidence

Maintain `artifacts/evidence/rights-manifest.json` and fail RC for missing entries or mismatched checksums.
