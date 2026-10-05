---
name: release-audit
description: Use as an independent final review after all product, platform and production gates have passed.
---

# Release Audit

## Yandex precedence

This skill is subordinate to the current official Yandex Games requirements, `config/yandex-requirements.yaml`, `$yandex-release-validation`, `AGENTS.md`, and `PROJECT_RULES.md`. It may add stricter quality checks, but it may not weaken platform requirements, mark compliance as passed, or authorize a release candidate.



## FINAL_RELEASE_HEAD and HEAD-bound evidence

Finish all source/config/tool repairs before the final freeze. Commit them, define `FINAL_RELEASE_HEAD`, push it, and verify local release HEAD equals the remote release HEAD. From that point create no more commits. Generate HEAD-bound runtime/art/media evidence only after the freeze; committing such evidence afterward invalidates its HEAD binding.

Release verification must inspect the actual packaged RC ZIP/runtime from `FINAL_RELEASE_HEAD`, not only the source tree. Keep external Yandex Draft evidence as a separate gate from bounded local-freeze acceptance.

See `docs/HEAD_BOUND_RELEASE_EVIDENCE.md`.

## Independence

Do not trust the implementation summary. Re-run required commands and inspect the production build, evidence files, ZIP entries and current worktree.

## Order

1. verify commit/worktree and starter-kit status; run `npm run yandex:contract:validate` and block stale release declarations;
2. validate evidence freshness against the current build/commit, including current-HEAD `SCREENSHOT_VISUAL_GATE` evidence and `artifacts/evidence/final-gameplay-videos.json` when `yandex.publication.type` is `first-publication`;
3. inspect `config/yandex-doc-snapshot.json`: record parser/schema versions, reviewed/fetched timestamps and canonical URLs; run the requirements/Console snapshot-alignment audit;
4. inspect the latest live `yandex:docs:check` evidence and confirm there are no unresolved semantic changes. `FETCH_FAILED` requires explicit current-document manual review evidence and is never automatic PASS;
5. run the required automated gates;
6. inspect P0/P1 defect status;
7. execute `$yandex-release-validation` independently;
8. inspect ZIP root, POSIX paths, size, `/sdk.js` handling and SHA-256; independently prove that no promotional MP4 is inside the game ZIP;
9. when external runtime evidence is present, independently verify the pinned provider version, validated and actual manifest hashes, every runtimeClosure hash, provenance metadata, game OOPIF identity, zero mutation ledger, redaction status, full/partial stage history and every FAIL/WARN conflict;
10. prove that the game ZIP contains no Harness, observer, provider module, `debugcheck.js`, `YGDebugChecker`, raw provider report/evidence, or browser profile;
11. confirm the game was not published or submitted;
12. issue only `PASS` or `ESCALATE_BLOCKED`.

## Prohibition

Missing, stale, fabricated, skipped or manually assumed evidence blocks the release.
Automated functional/E2E PASS does not replace actual-runtime screenshot review.
An unresolved watcher verdict blocks with `BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED`; unknown or parser-drift output may not be downgraded to PASS.
External evidence is advisory and optional. Its absence alone does not block,
but supplied evidence must pass integrity and conflict audit. Never run an
authenticated Draft browser implicitly during this audit.
