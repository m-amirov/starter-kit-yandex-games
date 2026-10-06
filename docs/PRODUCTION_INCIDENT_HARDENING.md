# Production Incident Hardening Contract

This contract captures release failures that previously escaped ordinary build/test success.
It supplements the numbered Yandex requirements; it does not replace them.

## Verdict boundary

A project may report `LOCAL_RC_READY` only after the local release evidence aggregator passes.
It may report `PRE_SUBMIT_READY` only after the same current-HEAD evidence also contains the
required manual/external platform-runtime proof.

Do not emit `RELEASE_READY` as a free-form agent conclusion.

The machine gate is:

```bash
npm run yandex:release:evidence -- --file artifacts/evidence/yandex-release-readiness.json
```

Unknown, unproven, unavailable, not-run, blocked, warning, stale-HEAD, dirty-worktree, partial
coverage, or missing-assertion states are non-PASS.

## Required dimensions

The aggregator keeps independent dimensions for requirements/docs freshness, SDK lifecycle,
localization, desktop functionality, mobile touch input, desktop visuals, mobile visuals,
production art, package integrity, media, hardware performance, feature-necessity telemetry,
and independent final review.

Desktop evidence never proves mobile. Functional/DOM evidence never proves visuals. A synthetic
renderer never proves hardware performance. Winning a gameplay run never proves that a required
mechanic was exercised.

Production-art PASS requires all of: complete manifest, physical production files, runtime mapping,
runtime reachability/use, and integrated visual acceptance. Manifest-only evidence is insufficient.

## Provenance

Every positive required gate is tied to the exact source HEAD used for the release build. The CLI independently reads the actual Git HEAD and dirty state, hashes the actual `source.releaseBuildPath`, and rejects disagreement with the declared SHA-256. For `pre-submit`, `source.remoteRef` is required and the CLI proves current HEAD is contained by that remote-tracking ref. Evidence from a previous HEAD or a local-only commit must be regenerated/pushed and reverified.

## External/manual isolation

Local automated checks cannot satisfy the `platform-runtime` gate for `pre-submit`. That gate
requires explicit `MANUAL_PASS` or `EXTERNAL_PASS` evidence. The optional hardened Draft provider
remains advisory and cannot override official failures or incomplete manual clauses.

## Historical failures covered

- false PASS from zero counters without executable assertions;
- partial branch/scope coverage presented as full coverage;
- art/runtime acceptance captured from a different HEAD;
- release recovery from the wrong baseline branch;
- desktop PASS inferred as mobile PASS;
- DOM/test PASS inferred as visual PASS;
- mobile crop and mobile-input regressions;
- production assets declared complete from manifest entries only;
- local evidence substituted for Yandex/manual/external evidence;
- SwiftShader/synthetic performance presented as hardware evidence;
- natural gameplay victory without the mechanic under test being exercised;
- stale Yandex requirement snapshots;
- managed Starter Kit drift;
- missing scripts misclassified as product test failures;
- stale capability/session evidence.
