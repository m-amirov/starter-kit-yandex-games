# Yandex Games Requirements Checklist

Authoritative source: `https://yandex.ru/dev/games/doc/ru/concepts/requirements`\
Source revision reviewed by this kit: **18 August 2026** (audit: 28 August 2026).\
Machine-readable registry: `config/yandex-requirements.yaml`.

Console fields without their own numbered requirement are tracked separately in `config/yandex-console-requirements.yaml`; they are never assigned invented requirement numbers.

Every active clause must be represented in `artifacts/evidence/yandex-requirements-compliance.json` as `PASS` or, only when truly inapplicable, `N/A` with an explicit reason. Recommended clauses must also be reviewed. Repealed clauses remain in the registry for traceability.

## Mandatory release groups

### Technical and platform

- Official `/sdk.js` integration, correct initialization and local failure handling.
- `LoadingAPI.ready()` only after the first interactive screen is usable.
- Correct GameplayAPI and platform pause/resume lifecycle when those APIs are used.
- Save progress immediately at meaningful boundaries and preserve it after reload.
- Stop sound on focus loss, visibility loss and fullscreen ads.
- No crashes, dead ends, technical overlays, browser alerts or console errors.
- Unpacked build below 100 MB; `index.html` at ZIP root; ASCII file/folder names without spaces.
- No interactive AI inside the game. Pre-generated assets are allowed.

### Mobile and desktop interaction

- All declared platforms and orientations are tested.
- Portrait → landscape → portrait and landscape → portrait → landscape transitions must be exercised in one browser session.
- No clipped buttons, text, indicators, gameplay objects or ad warnings.
- No overlaps that reduce readability or clickability.
- No browser scrollbar, overscroll or swipe-to-refresh.
- Long press, right click, drag and selection on the game surface must not open a context menu or select game content.
- Mobile gameplay is gesture-complete; desktop gameplay has mouse or keyboard control by default.
- Touch targets are large enough and separated enough to avoid accidental taps.

### Product and metadata

- Actual gameplay must match the declared genre and every selected category.
- The draft category list is treated as product behavior, not marketing decoration.
- A category/genre review must cite concrete gameplay evidence and final-build screenshots.
- Main content must exceed 10 minutes and have rising difficulty, progression or record saving as appropriate.
- Controls, age rating, setting, localization and auto-detected language must match the draft.

### Ads, purchases and links

- Requirement 1.12 requires monetization through ads **or** in-app purchases. Ads-only and IAP-only are valid; neither path is a release blocker.
- Ads are only from the Yandex SDK and shown only in logical pauses.
- Fullscreen ads pause audio and gameplay; return restores the exact state.
- Rewarded ads are voluntary, disclose the exact reward and never gate basic continuation.
- External URLs, third-party ads, YouTube players and external-store links are prohibited.

### Content, text and media

- Rights for every asset are recorded.
- The game is original and not a duplicate of another catalog title.
- Text is correct, truthful, translated and free from prohibited material.
- Icon and cover are dedicated marketing art, not gameplay screenshots.
- Screenshots show at least 70% real gameplay; videos show at least 70% real gameplay duration.
- Media has no compression defects, accidental generated text, external frames, rounded outer corners, system UI or Yandex Games UI.

### Console first-publication video

- `CONSOLE-FIRST-PUBLICATION-HORIZONTAL-GAMEPLAY-VIDEO` blocks `first-publication`; it does not block an `update` solely because the video is absent.
- File contract: MP4, 16:9, height ≥ 400 px, duration ≤ 28 seconds, size ≤ 100 MB; 1920×1080 and 20–25 seconds are preferred.
- At least 70% of duration is manually verified real gameplay. File metadata cannot auto-approve this requirement.
- Manual evidence also confirms no system UI, Yandex Games UI or artificial black bars and confirms that gameplay/UI language matches the Draft locale.
- Localized gameplay text requires one video per declared locale. A shared file requires evidence that no language-dependent gameplay text exists.
- Record only the final production build with real interaction. Mockups, fake animation, dev/debug footage and substituted gameplay are prohibited.
- Portrait-only gameplay may use a 16:9 composition with the game's own artwork/background, but the embedded gameplay recording remains real.
- Promotional MP4 files are Console media and must remain outside the Yandex game ZIP. Transcoding tools are development-only and must not enter the production bundle.
- Linked numbered clauses: 5.1.1.3, 5.1.2, 5.3, 8.2.3, 8.3.1, 8.3.2 and 8.3.4.

## Regression requirements from Stack Sort Lab moderation

These are explicit P0 checks in this kit:

1. **2.3 Genre/category match** — selected categories require an independent `genre-category-review.json` based on the final build.
2. **1.10.1 No clipping** — every configured viewport and both orientation-transition sequences require bounds checks and screenshots.
3. **1.10.3 No overlap after rotation** — the game must re-layout after every resize/orientation event; stale layout is a release blocker.
4. **1.6.2.7 Desktop interaction guard** — right click, drag and select-start are prevented on the game surface.
5. **1.6.1.8 Mobile interaction guard** — long tap cannot select content or open a browser context menu.

## Evidence files

- `artifacts/evidence/yandex-requirements-compliance.json`
- `artifacts/evidence/genre-category-review.json`
- `artifacts/evidence/responsive-layout-report.json`
- `artifacts/evidence/interaction-guard-report.json`
- `artifacts/evidence/content-duration-report.json`
- `artifacts/evidence/rights-manifest.json`
- `artifacts/evidence/draft-metadata-checklist.json`
- `artifacts/evidence/final-screenshots.json`
- `artifacts/evidence/final-gameplay-videos.json`

The Yandex validation skill must not mark an item `PASS` based only on source-code intent. It must cite a command, runtime scenario, screenshot, trace or manually reviewed artifact from the final production build.
