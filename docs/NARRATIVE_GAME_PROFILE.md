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
