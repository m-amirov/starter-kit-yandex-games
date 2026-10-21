# Optional narrative-game profile

This is a project opt-in for visual novels/interactive fiction. It does **not** change the Starter Kit target updater profile, Yandex release gates, or production game runtime.

The managed `config/optional-profiles/narrative-game.json` template starts with `enabled:false`. To use it, copy the file to a **project-owned** location (e.g. `config/narrative-game.local.json`), set `enabled:true` there, and point `modelPath` and `savesPath` to actual game-derived JSON files. Do not edit the managed template or automatically enable it for unrelated games.

Run: `node tools/narrative/narrative-game-check.mjs --project . --profile config/narrative-game.local.json --require-enabled`.

Model schema v1:
- `start`: initial scene ID; `locales`: required languages; `characters`: allowed speaker IDs.
- `stateSchema`: finite state keys, each `{type:"boolean"|"string"|"number",values:[...]}` (values mandatory for non-boolean); `initialState`: all state keys.
- `scenes[]`: unique `id`, `dialogue` map of locale → `[{speaker,text}]` where narrator is `null`.
- Each scene has exactly one exit: `ending:true`, `next:"sceneId"`, or `choices:[{id,label:{ru,en},to,requires?:{key:value},effects?:{key:value}}]`.

Saves schema v1: `{schemaVersion:1,samples:[{schemaVersion:1,sceneId,state,locale,dialogueIndex}]}`. Fixture states must be reachable from the initial state and cursor valid for the selected locale. Include every relevant save/route variant. The validator checks structural JSON round-trip; actual storage persistence, SDK cloud sync, migrations, rollback and browser restore require separate live runtime tests.

Coverage: all declared scenes reachable, all endings reachable, finite state-space no dead ends, guards and effects valid, valid speakers and localized dialogue/choice labels, save samples valid. If bounded exploration exceeds 4096 unique states, report BLOCKED rather than inventing PASS. Identical choice destinations and resulting states are warnings for human editorial review, not automatic defects.

A passing model is `PASS_DECLARED_NARRATIVE_GRAPH`, **not** proof of a real runtime route or true narrative comprehension. Export input from real source/engine; never simply copy a hand-written model from a sample to manufacture coverage. Combine with CEOS `romance-narrative`, `narrative-dialogue-editor`, `narrative-continuity-engine`, `reader-experience-review` for semantic checks.

No automatic packaging, ZIP creation, network/Web calls or files written by this check.

## Optional story-promise references (future projects only)

The existing `narrative-game` opt-in remains disabled by default. To also check a story-promise ledger, add `"promisesPath": "narrative/story-promises.json"` to the **project-owned enabled** profile. No existing profile requires this field. The path uses the same project-confined realpath checks as graph/save inputs; missing or unsafe paths block rather than falling back.

Schema v1 example:

```json
{
  "schemaVersion": 1,
  "promises": [
    {
      "id": "nick-key",
      "status": "authored",
      "setup": {"sceneId": "search", "requires": {"route": "nick"}},
      "payoff": {"sceneId": "nick-end", "requires": {"hasKey": true}}
    },
    {
      "id": "future-thread",
      "status": "planned"
    },
    {
      "id": "open-ending",
      "status": "intentionally-open",
      "setup": {"sceneId": "independent", "requires": {"route": "self"}},
      "authorDecision": "Consciously unresolved in this route"
    }
  ]
}
```

`setup` and `payoff` point to existing declared **scene IDs** for `authored`, `runtime-verified` and `intentionally-open` records; guards use exact finite-state keys and values from the narrative model. An authored claim requires a payoff on **every reachable terminal path after a setup state matching its guard** (a single successful branch is not sufficient). If only one branch resolves, split into route-conditioned entries or explicitly mark the other route intentionally open. Invalid IDs, invalid guards, dangling scene references or unreachable conditional payoff **BLOCK** the optional check.

Statuses: `planned` can refer to unwritten future material and cannot earn PASS; `unresolved` needs editorial work; `authored` means *declared scene references structurally match*, never that the prose actually delivered the payoff. `runtime-verified` is an external claim and is marked **NOT_VERIFIED** by this validator because model JSON does not attest executed gameplay. `intentionally-open` requires an explicit `authorDecision` and no `payoff`.

The response includes an independent `storyPromises.status`: `SKIPPED_OPTIONAL_STORY_PROMISES`, `PASS_DECLARED_PROMISE_REFERENCES`, `NOT_VERIFIED_PROMISE_EVIDENCE` or `BLOCKED_PROMISE_REFERENCES`. Even when the main result is `PASS_DECLARED_NARRATIVE_GRAPH`, it **never proves artistic quality, emotional credibility, actually authored cues, real runtime saves, or that all planned promises are fulfilled**. For those, use CEOS `romance-narrative`, `narrative-continuity-engine` and `reader-experience-review`.

This feature adds no mandatory release gate, new user questionnaire, art generation, runtime scripts, or changes to existing game content.

## Optional independent wardrobe pixel validation

After explicitly enabling `narrative-game` in a **project-owned**
`config/narrative-game.local.json`, you may enable
`wardrobeVisualAcceptance.enabled:true` for art-heavy visual novels.
It is opt-in and does **not** create a release gate or run Web/CEOS automatically.

The reusable, source-HEAD-bound `WARDROBE_VISUAL_ACCEPTANCE_V1` contract
requires attached original/runtime portrait and landscape image pixels,
canonical character references and actual independent reviewer observations
of appearance, costume, cross-format consistency, neighboring-scene continuity
and unjustified garment reuse. Its separate CLI verifies SHA-256,
provenance and the Web receipt/raw response chain. Static briefs alone
cannot earn an artistic PASS. See `docs/WARDROBE_VISUAL_ACCEPTANCE.md`.

For existing accepted EP1/EP2 artwork, keep historical receipts and
original PNGs unchanged; this additional contract is prospective.
