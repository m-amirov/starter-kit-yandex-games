# Horizontal Gameplay Video Task

Use this task after the final production build and final screenshots when `yandex.publication.type` is `first-publication`.

## Capture

- Record real interaction in the final production runtime with the available browser/video tooling.
- Select a meaningful 20–25 second segment with the core mechanic clearly visible; prefer 100% gameplay and keep intro/outro minimal.
- Do not use a dev/debug build, fake mockup, replacement animation or footage from another build.
- Do not add a runtime dependency to the game. MP4 transcoding is development-only.
- A portrait-only game may place the real portrait recording in a 16:9 composition using the game's own artwork/background.

## Locale coverage

- Produce a locale-specific video for every declared locale when gameplay contains localized text.
- Reuse one file only after a manual review proves there is no language-dependent gameplay text.

## Evidence and validation

- Record the exact production `sourceHead` (40-character Git SHA) and optional build ID that produced the capture. Media evidence is stale when `sourceHead` differs from the current release HEAD.
- Review the opening frame explicitly. Blank/loading/debug/system frames are not an acceptable start when evidence claims gameplay is already ready; record `manualReview.openingFrameReady` with concrete frame/time evidence.
- When gameplay text is localized, RU/EN (or other locale) renders must be genuinely distinct media. Renaming/copying identical bytes does not satisfy locale coverage.

- Record locale, path, width/height, duration, size, reviewed gameplay ratio and SHA-256 in `artifacts/evidence/final-gameplay-videos.json`.
- Manually review real gameplay share (minimum 70%), system/Yandex Games UI absence, artificial black bars and Draft-locale correctness.
- Run `npm run yandex:media:validate -- --zip <release.zip>`.
- Keep promotional MP4 files outside the Yandex game release ZIP.
