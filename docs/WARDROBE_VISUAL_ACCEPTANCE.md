# WARDROBE_VISUAL_ACCEPTANCE_V1 (legacy compatibility contract)

New narrative art reviews use `NARRATIVE_ART_ACCEPTANCE_V3`; see
`docs/NARRATIVE_ART_ACCEPTANCE_V3.md`. V1 remains available only to validate
historical receipts and must not create a second artistic veto for a V3 review.

This reusable Starter Kit contract extends the **optional** `narrative-game` profile.
The managed template `config/optional-profiles/narrative-game.json` remains disabled
for unrelated games. Enabling `wardrobeVisualAcceptance.enabled` in an
**independently opted-in, project-owned** profile activates the workflow;
installing the kit alone does not run browser turns or mandate CEOS runs.

## Production sequence

1. Keep a source-bound garment declaration per character and visual family:
   `continuityType` (`new-outfit`, `same-outfit`,
   `variant-of-previous`), scene/day/location/weather/context, named outfit,
   palette, silhouette, accessories and reason for any change.
2. Attach **real** canonical reference PNGs, portrait + landscape original
   production PNGs and their current-HEAD runtime captures. Where story time
   is continuous, attach relevant adjacent scene pixels in the same bounded
   review (up to 10 images) or conduct a separate evidence-linked review.
3. Have an **independent** DEV Web High reviewer (GPT-6 Sol High, browser-only)
   observe the actual images, compare apparent age, face, hair, clothing,
   props and character silhouettes, and return
   `wardrobeAssessments` per cast member in the **same JSON response** as
   `NARRATIVE_ART_ACCEPTANCE_V2`. This is the extra schema supplied by
   `buildWardrobeWebReviewAddendum(packet)`; append it to the source-bound
   `request.context` before launching the Web reviewer.
4. Preserve append-only reviewer raw text and standard Web High receipt.
   Independently run the existing CEOS `web-review-verify` and then this
   project-local gate, which binds the raw observations to the receipt SHA,
   current Git HEAD and on-disk PNG bytes.
5. An image that has mechanical/provenance PASS but no real reviewer
   observation stays `NOT_VERIFIED_WARDROBE_VISUAL_ACCEPTANCE`. A mapping
   or CSS-only correction is preferred where the source PNG is correct.

## Verification packet

JSON schema v1 example below is deliberately incomplete until actual
project-owned scene refs, SHA-256 values, image files and reviewer inputs
are supplied. Do not fabricate a successful receipt for testing.

```json
{
  "schemaVersion": 1,
  "ruleId": "WARDROBE_VISUAL_ACCEPTANCE_V1",
  "requiredCast": ["nika", "giulia"],
  "evidenceRoles": {
    "portraitOriginal": "p-original",
    "portraitRuntime": "p-runtime",
    "landscapeOriginal": "l-original",
    "landscapeRuntime": "l-runtime",
    "characterReferences": {
      "nika": "nika-reference",
      "giulia": "giulia-reference"
    }
  },
  "adjacentScenes": [
    {
      "sceneId": "ep3_previous",
      "transition": "continuous",
      "characters": ["nika"],
      "evidenceRef": "previous-original"
    }
  ],
  "request": {
    "schemaVersion": 1,
    "sceneId": "ep3_example",
    "sourceHead": "<actual-40-character-git-sha>",
    "context": "<real authored scene beat, wardrobe brief and addendum>",
    "images": [
      {
        "ref": "p-original",
        "kind": "original",
        "path": "assets/production/cg/example.png",
        "sha256": "<actual-64-character-sha256>"
      }
    ]
  }
}
```

The example's `images` list shows one item only. Real packets must supply
all four format roles, each cast reference and required neighboring pixels
as unique project-relative paths, valid SHA-256 and `original`/`runtime`
image kinds. Source HEAD must equal the **actual** current project Git HEAD.

For breaks, set `transition` to `time-break` or `context-change` and
supply a nontrivial `reason`. Uniforms and continuous scenes may legitimately
reuse clothes. New-time/location/formality/weather shifts require appropriate
variation or an explicit authored justification.

## Run

```sh
node tools/production-art/wardrobe-visual-gate.mjs \
  --project . \
  --packet artifacts/evidence/wardrobe-review-packet.json \
  --receipt artifacts/evidence/wardrobe-web-receipt.json \
  --raw artifacts/evidence/wardrobe-web-review.raw.txt
```

The module also exports `validateWardrobeVisualAcceptance` and
`buildWardrobeWebReviewAddendum` for native project orchestration.
Tests: `node --test tests/starter-kit/wardrobe-visual-gate.test.mjs`.
For a project that already has its own validator, reconcile contracts
explicitly: do not overwrite project-owned evidence, manifests or artwork.

## Severity and assurance

- **P0/P1:** wrong identity, apparent age, facial/hair reference, essential
  costume/prop, unsupported sudden wardrobe change or cropped critical
  character. These require a scoped fix and fresh visual verification.
- **P2/P3:** subjective color/texture/style preferences. Never launch
  endless regeneration over them or punish context-appropriate repeated clothes.
- The gate requires independent **actual pixels**, original/runtime dual
  format, truthful `receivedEvidenceRefs`, per-character scene/reference/
  continuity observations and `PASS` status for the four wardrobe dimensions.
  Missing raw reviewer evidence and transport interruption fail closed.
- No release ZIP, Yandex SDK, production art, graphics generator or network
  operation is changed by this template. Existing accepted assets are not
  retroactively invalidated by the new optional contract.
