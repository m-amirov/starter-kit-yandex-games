---
name: release-audit
description: Use as an independent final review after all product, platform and production gates have passed.
---

# Release Audit

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.

## Independence

Do not trust the implementation summary. Re-run required commands and inspect the production build, evidence files, ZIP entries and current worktree.

## Order

1. verify commit/worktree and starter-kit status;
2. validate evidence freshness against the current build/commit, including current-HEAD `SCREENSHOT_VISUAL_GATE` evidence for every production-visible accepted pass;
3. run the required automated gates;
4. inspect P0/P1 defect status;
5. execute `$yandex-release-validation` independently;
6. inspect ZIP root, POSIX paths, size, `/sdk.js` handling and SHA-256;
7. confirm the game was not published or submitted;
8. issue only `PASS` or `ESCALATE_BLOCKED`.

## Prohibition

Missing, stale, fabricated, skipped or manually assumed evidence blocks the release.
Automated functional/E2E PASS does not replace actual-runtime screenshot review.
