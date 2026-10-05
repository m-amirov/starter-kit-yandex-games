---
name: yandex-release-validation
description: Use before packaging any Yandex Games release candidate. Verifies every active official requirement, SDK lifecycle, interaction guards, responsive rotation, metadata, content, media, ads, saves and archive structure.
---

# Yandex Release Validation

## Yandex precedence

This platform skill implements the highest local compliance layer beneath the current official Yandex Games documentation. Other local or adapted skills may add stricter quality checks, but may not weaken, bypass, self-approve or replace this validation.

Validate the final production build, not only the dev server.

## Sources of truth

1. `config/yandex-requirements.yaml` — complete numbered-clause registry for the official requirements revision dated 18 August 2026.
2. `config/yandex-console-requirements.yaml` — Console-only rules that have no numbered requirement of their own.
3. `config/yandex-doc-sources.yaml` and explicitly reviewed `config/yandex-doc-snapshot.json` — canonical upstream sources and semantic baseline.
4. `docs/YANDEX_REQUIREMENTS_CHECKLIST.md` — operational interpretation.
5. `game-spec.yaml` — declared draft metadata and applicability flags, including `yandex.publication.type`.
6. Actual final-build runtime and media evidence.

Do not rely on memory when the official requirements may have changed. Before producing a real moderation candidate, compare the registry revision with the current official documentation and promote any change into the starter kit.

## Mandatory procedure

1. Generate `artifacts/evidence/yandex-requirements-compliance.json` from the full registry. Every active clause must be present.
2. Mark an applicable required clause `PASS` only with concrete evidence. Mark a genuinely inapplicable clause `N/A` with a reason. Recommended clauses must be `PASS` or a reasoned `WARN`.
3. Run `npm run yandex:sdk:validate`, `npm run yandex:contract:validate`, `npm run yandex:requirements:audit` and `npm run yandex:console:audit`; any failure blocks RC.
4. For real pre-submit, run live `npm run yandex:docs:check`; deterministic offline tests do not replace it.
5. Run `npm run yandex:media:validate -- --zip <release.zip>` against `artifacts/evidence/final-gameplay-videos.json`; any failure blocks RC.
6. Perform an independent final review and write `artifacts/evidence/yandex-release-validation.json`.

## Optional external Draft runtime evidence

`yandex-draft-runtime-hardened` is an advisory, optional, non-official provider
for post-upload Draft evidence. Never start its authenticated browser as a side
effect of this procedure. Recommend the visible `yandex:external:run` step before
submission; the default is `ephemeral`, while a real authenticated Draft uses
only the Harness-owned `dedicated-auth` profile.

When external evidence is supplied, run `yandex:external:verify`, normalize the
existing reports, and apply the documented conflict policy. Provider integrity,
actual manifest/runtimeClosure hashes, OOPIF identity, zero mutation ledger,
redaction and stage history must pass before an external PASS is accepted.
Outer `yandex.ru` shell evidence is never game-runtime proof. External PASS is
supporting only: it cannot override official failures or incomplete manual
clauses. External FAIL/WARN against Starter PASS requires review; provider ERROR
is a separate tooling problem; optional UNAVAILABLE/not-run does not block by
itself. `yandex:docs:check` remains independent and authoritative for docs
freshness.

## Upstream documentation freshness gate

Before a real Yandex submission, record `artifacts/evidence/yandex-docs-freshness.json` and prove one of these states:

- the live watcher returned only `UNCHANGED` or `METADATA_ONLY` against `config/yandex-doc-snapshot.json`;
- a detected semantic change was reviewed, requirements and Console audits plus targeted watcher tests passed, and `yandex:docs:accept-snapshot -- --reviewed-at YYYY-MM-DD --policy-reviewed` explicitly accepted the new snapshot;
- the official upstream was unavailable and explicit manual current-document review covers all three canonical sources. This is `MANUAL_PASS`, never automatic PASS.

`FETCH_FAILED` is not PASS. Any unresolved semantic verdict, parser drift or unclassified change emits `BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED`. The watcher must not modify `config/yandex-requirements.yaml` or `config/yandex-console-requirements.yaml`. Treat generated `artifacts/upstream/yandex-docs/<run-id>/CODEX_UPDATE_TASK.md` only as a bounded review task.

## First-publication horizontal gameplay video — P0

`CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO` applies only when `yandex.publication.type` is `first-publication`. It is a release blocker. An `update` is not blocked solely because this Console-only video is absent.

Validate automatically from the actual file: MP4 container/extension, 16:9, height at least 400 px, duration at most 28 seconds, size at most 100 MB, evidence metadata equality and SHA-256. Prefer 1920×1080 and 20–25 seconds. Never infer the real-gameplay share from duration metadata: at least 70% real gameplay, absence of system/Yandex Games UI, absence of artificial black bars and Draft-locale correctness require explicit manual visual evidence. Missing or `NOT_REVIEWED` evidence blocks first publication.

For every Draft locale, create a locale-specific video when gameplay contains localized text. Reuse of one file is allowed only with evidence that gameplay contains no language-dependent text. Promotional MP4 files are external Console media and must not occur inside the Yandex game release ZIP.

## Standard gameplay-video production task

1. Run the final production build and record the actual production runtime with the existing browser/video tooling.
2. Play the game for real and select a meaningful segment where the core mechanic is clearly visible. Target 20–25 seconds, preferably 100% gameplay, with no or minimal intro/outro.
3. Do not use a mockup, synthetic animation, dev/debug build or substituted footage. Do not add a game runtime dependency. Dev-only transcoding to MP4 is allowed.
4. For portrait-only games, a 16:9 composition may combine the real portrait recording with the game's own artwork/background; the gameplay recording itself must remain real and visually primary.
5. Produce locale-specific files as required, then record locale, path, dimensions, duration, size, reviewed gameplay ratio and SHA-256 in `artifacts/evidence/final-gameplay-videos.json`.
6. Complete the manual visual-review fields and run media validation before packaging. Keep every promotional MP4 outside the release ZIP.

## Stack Sort Lab moderation regressions — P0

- **2.3 Genre/category:** compare actual gameplay with every category selected in the draft. Write `genre-category-review.json` with screenshots and mechanical evidence. Never select an adjacent category merely for reach.
- **1.10.1 Clipping:** verify critical bounds and screenshots at every configured viewport.
- **1.10.3 Overlap after rotation:** execute both orientation-transition sequences in one session; relayout must complete after each resize.
- **1.6.2.7 Desktop context menu/selection:** right click, select-start and drag-start on the game surface must be prevented.
- **1.6.1.8 Mobile long tap:** long press must not select content or open the native context menu.

## Release declaration consistency

Before RC, `artifacts/evidence/release-contract.json` must prove that mutable product declarations in `game-spec.yaml` still match the actual build: episode/content count when declared, every declared locale has complete localization evidence, and enabled production features such as audio have corresponding production evidence. First-publication localized gameplay media must cover every declared locale. Stale declarations block rather than being silently normalized.

## Required checks

- Explicit production `<script src="/sdk.js"></script>` appears before application module execution; `YaGames.init()` is reachable exactly once; any dynamic loader is duplicate-safe; production SDK failure is fail-closed while localhost/file fallback remains allowed; `sdk.js` itself is absent from dist/ZIP.
- `LoadingAPI.ready()` once after an interactive screen exists.
- `ysdk.environment.i18n.lang` read at startup for all games, including single-language games; fallback tested.
- Gameplay start/stop, pause/resume, audio, ads, focus loss and scene transitions follow actual control state.
- Saves, purchases, rewarded callbacks, leaderboards and ad policies match all applicable clauses.
- No browser scroll, overscroll, swipe-to-refresh, clipping, overlap, stale orientation layout or distorted elements.
- Touch targets and desktop/mobile controls are usable on all declared platforms.
- Genre, categories, title, description, tags, age rating, controls and orientation match the final build.
- Main content evidence exceeds 10 minutes and shows rising difficulty/no filler duplication.
- Rights manifest is complete; no interactive AI, external links, third-party ads, YouTube player or prohibited content.
- Marketing screenshots/video meet the 70% real-gameplay rule; first-publication horizontal gameplay video has current file and manual evidence; icon/cover are dedicated art and meet media constraints.
- Requirement 1.12 passes with ads or in-app purchases and blocks when neither monetization path exists.
- Actual ZIP entries use forward slashes and ASCII names without spaces; `index.html` is at root; unpacked size is at most 100 MB.
- No promotional MP4 from `final-gameplay-videos.json` is present in the game ZIP.

Write `artifacts/evidence/yandex-release-validation.json` with status, build ID, commands, scenarios, evidence paths and open defects. Any failed mandatory item blocks RC.
