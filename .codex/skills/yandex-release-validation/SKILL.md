---
name: yandex-release-validation
description: Use before packaging any Yandex Games release candidate. Verifies every active official requirement, SDK lifecycle, interaction guards, responsive rotation, metadata, content, media, ads, saves and archive structure.
---

# Yandex Release Validation

## Yandex precedence

This platform skill implements the highest local compliance layer beneath the current official Yandex Games documentation. Other local or adapted skills may add stricter quality checks, but may not weaken, bypass, self-approve or replace this validation.

Validate the final production build, not only the dev server.

## Sources of truth

1. `config/yandex-requirements.yaml` — complete clause registry for the official requirements revision dated 1 July 2026.
2. `docs/YANDEX_REQUIREMENTS_CHECKLIST.md` — operational interpretation.
3. `game-spec.yaml` — declared draft metadata and applicability flags.
4. Actual final-build runtime evidence.

Do not rely on memory when the official requirements may have changed. Before producing a real moderation candidate, compare the registry revision with the current official documentation and promote any change into the starter kit.

## Mandatory procedure

1. Generate `artifacts/evidence/yandex-requirements-compliance.json` from the full registry. Every active clause must be present.
2. Mark an applicable required clause `PASS` only with concrete evidence. Mark a genuinely inapplicable clause `N/A` with a reason. Recommended clauses must be `PASS` or a reasoned `WARN`.
3. Run `npm run yandex:requirements:audit`; any failure blocks RC.
4. Perform an independent final review and write `artifacts/evidence/yandex-release-validation.json`.

## Stack Sort Lab moderation regressions — P0

- **2.3 Genre/category:** compare actual gameplay with every category selected in the draft. Write `genre-category-review.json` with screenshots and mechanical evidence. Never select an adjacent category merely for reach.
- **1.10.1 Clipping:** verify critical bounds and screenshots at every configured viewport.
- **1.10.3 Overlap after rotation:** execute both orientation-transition sequences in one session; relayout must complete after each resize.
- **1.6.2.7 Desktop context menu/selection:** right click, select-start and drag-start on the game surface must be prevented.
- **1.6.1.8 Mobile long tap:** long press must not select content or open the native context menu.

## Required checks

- Official `/sdk.js` reference; `sdk.js` absent from dist/ZIP; relative asset paths; local fallback.
- `LoadingAPI.ready()` once after an interactive screen exists.
- `ysdk.environment.i18n.lang` read at startup for all games, including single-language games; fallback tested.
- Gameplay start/stop, pause/resume, audio, ads, focus loss and scene transitions follow actual control state.
- Saves, purchases, rewarded callbacks, leaderboards and ad policies match all applicable clauses.
- No browser scroll, overscroll, swipe-to-refresh, clipping, overlap, stale orientation layout or distorted elements.
- Touch targets and desktop/mobile controls are usable on all declared platforms.
- Genre, categories, title, description, tags, age rating, controls and orientation match the final build.
- Main content evidence exceeds 10 minutes and shows rising difficulty/no filler duplication.
- Rights manifest is complete; no interactive AI, external links, third-party ads, YouTube player or prohibited content.
- Marketing screenshots/video meet the 70% real-gameplay rule; icon/cover are dedicated art and meet media constraints.
- Actual ZIP entries use forward slashes and ASCII names without spaces; `index.html` is at root; unpacked size is at most 100 MB.

Write `artifacts/evidence/yandex-release-validation.json` with status, build ID, commands, scenarios, evidence paths and open defects. Any failed mandatory item blocks RC.
