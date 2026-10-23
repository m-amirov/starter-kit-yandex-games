# NARRATIVE_ART_ACCEPTANCE_V3 — unified story-first visual acceptance

V3 is the opt-in acceptance contract for new narrative-game reviews. It emits
one independent verdict over identity, appearance, wardrobe, story action,
scene continuity, portrait/landscape framing and runtime readability:

- `PASS` — the image is suitable;
- `PASS_WITH_NOTES` — suitable with non-material P2/P3 notes; no regeneration;
- `REWORK` — a substantiated P0/P1 contradiction needs correction.

The player must understand who is shown, what is happening and whether the
image agrees with the authored scene. Cosmetic anatomy, folds, small color or
lighting differences, minor accessories, background detail and justified
repeated clothing are notes, not automatic rework.

Every P0/P1 finding must cite the authored cue, actual received pixel evidence,
an observation and concrete player impact. A text brief, preview, configuration
flag or wardrobe declaration cannot substitute for actual pixels. The receipt
must remain bound to the current source HEAD, original/runtime image SHA-256
values, browser-only transport evidence and the immutable raw reviewer response.

`wardrobeAssessments` are structured observations inside the same V3 receipt;
they are not a second independent veto. The historical
`WARDROBE_VISUAL_ACCEPTANCE_V1` and V2 receipts remain readable and are not
rewritten or retroactively reclassified. A previous `REWORK` requires a fresh
independent review and resolution evidence before an accepted verdict.

The managed optional profile stays disabled by default. A project may opt in
through a project-owned profile and must use the shared gate:

```sh
node tools/production-art/wardrobe-visual-gate.mjs \
  --project . \
  --packet artifacts/evidence/narrative-art-review-packet.json \
  --receipt artifacts/evidence/narrative-art-review-receipt.json \
  --raw artifacts/evidence/narrative-art-review.raw.txt
```

This contract is an art-acceptance gate only. It does not imply release PASS,
episode finalization, generation authorization, provenance rights approval or
Yandex submission readiness.
