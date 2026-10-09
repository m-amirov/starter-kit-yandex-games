# Screenshot Visual Gate

Use this compact template at the acceptance boundary of a production-visible pass. Do not use it for an unchanged runtime or as a substitute for project art contracts.

## Scope

- Pass / affected production-visible surfaces:
- Current HEAD:
- Runtime/build command and environment:
- Bootstrap used to reach a state (if any, mark it as non-production):
- ART_BIBLE / VISUAL_LANGUAGE / asset manifest / accepted baseline consulted:
- Coverage ledger path + SHA-256/version:
- Independent reviewer input: actual image content supplied? `YES` / `NO` (paths or text claims alone are `NO`)

## Screenshot matrix

| Surface or state | Production-runtime condition | Desktop | Mobile (actual touch where gameplay) | Result |
| --- | --- | --- | --- | --- |
| | | | | |

Use only affected states. Enemy work normally includes normal and pressure or attack states; include elite/boss when affected. Boss work includes introduction/readability, materially different attacks/phases and crowded combat. Biome work includes environment, ordinary combat, interaction and pressure. UI includes normal, long RU/EN text, interactive and relevant modal/result state.

## Multi-character dialogue / mobile composition (when applicable)

- Characters visible / scene cue / sprite or unified CG mode:
- Existing sprite overlap rework count and CG-fallback decision (why feasible or why retained sprites):
- Screenshot visual separation: visible silhouette pixels vs first dialogue glyphs (not only DOM rectangles); record overlap/gap at compact **360×640** and taller portrait viewport:
- If a unified CG is used: character identity/reference match, landscape/portrait continuity, natural framing, portrait dialogue-safe negative space, no embedded UI/text/icons:
- If prior mobile REWORK was reported: fresh current-HEAD before/after captures, role-specific independent reviewer verdict, and remaining findings:
- If repeated fixes fail: stop under the global three-attempt limit and link `artifacts/ESCALATION_REPORT.md`:

## Visual review verdict

- Verdict: `PASS` / `FAIL` / `EVIDENCE_GAP`
- Findings and corrections:
- Screenshot paths:
- Before/after contact sheet (only if useful):
- Evidence gaps or capture failures:
- Pixel evidence records: path, SHA-256, bytes, width×height, current HEAD, viewport, state/cue, observed visual-event id and asset hash:
- Mechanical measurements: edge-to-edge on all edges, document/internal scroll, readability, primary-action overlap:
- Cue before/after pair and expected-versus-observed event:

`PASS` is unavailable for mockups, isolated asset previews, editor images, DEV-only scenes, inactive effects, mouse/keyboard substitution for mobile gameplay, stale HEAD, or any material visual defect. If functional work is complete but this review fails, record `FUNCTIONALLY_IMPLEMENTED` and `VISUAL_ACCEPTANCE: FAIL`; do not issue an acceptance or owner-review token.
If actual screenshot/reference pixels were not supplied to the independent multimodal reviewer, use `BLOCKED`/`EVIDENCE_GAP`; DOM checks cannot promote the verdict.
