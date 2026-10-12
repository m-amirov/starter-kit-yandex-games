# Narrative scene / visual beat mapping preflight

Use this **optional** pre-production contract for scene-based illustrated games. It verifies declared story-to-asset mapping before expensive independent Web art acceptance. It is not a visual reviewer and never claims actual image content was inspected.

Run:
`node tools/visual/narrative-scene-contract.mjs --project <game-directory> --contract <story-contract.json> --mapping <runtime-mapping.json>`

The authored contract is a JSON object with `schemaVersion:1`, exact `sourceHead`, `sceneId`, `source:{path,sha256}`, and chronologically ordered `beats`. Each beat specifies `id`, `at:[chunk,paragraph]`, `authoredExcerpt` (literal passage in the source file), `requiredCast`, `actor`, `action`, `location`, `assetPath`, `assetSha256`.

The separately exported runtime mapping has `schemaVersion:1`, matching HEAD/sceneId and one beat per cue with `at`, `requiredCast`, `actor`, `action`, `location`, `assetPath`, `assetSha256`, and `presentation` (`cg` or `sprites`). Sprites require `spriteExceptionReason`. The runtime mapping should be generated from actual game state, not copied from the authored contract.

Fail-closed discrepancies include source SHA mismatch, absent/changed authored excerpt, stale HEAD, missing or extra cue, incorrect order, actor/action/location disagreement, cast mismatch, wrong cue-to-asset mapping, unsafe asset paths or missing sprite exception.

**Interpretation:** `PASS_DECLARED_SCENE_MAPPING` is only a mechanical pass. Source narrative semantics are not proven by substring presence. Correct character faces/actions and physical spatial logic in pixels require independent multimodal review of actual source and runtime screenshots. False metadata can still pass. Do not route a `PASS_DECLARED_SCENE_MAPPING` into `ART_COVERAGE_ACCEPTED` or a release gate without independent evidence.

Run fixture regressions:
`node --test tests/starter-kit/narrative-scene-contract.test.mjs`

Historical negative fixtures: S07 actor attribution (Nick/Eric), S65 key discovery before dinner, unexpected mappings, invalid source anchors. No game runtime mutation, archive creation, paid API, or Yandex platform operation occurs.
