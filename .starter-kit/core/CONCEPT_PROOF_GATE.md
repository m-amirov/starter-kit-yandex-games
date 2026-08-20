# Concept Proof Gate

This managed contract is the product-development barrier between a playable
prototype and production. Technical correctness, a solver, test count, visual
polish, and content volume do not satisfy this gate.

## Concept proof requirements

Before mass production, the vertical slice must demonstrate:

1. one primary gameplay screen;
2. one principal player action;
3. a goal understandable without long text within 5–10 seconds;
4. a first correct move possible without oral explanation;
5. only 3–6 levels or challenges in the first playable slice;
6. each new mechanic introduced only after the previous one is understood;
7. no full campaign production before a blind playtest;
8. solver and automated tests treated as correctness evidence, never as evidence
   of comprehension or interest;
9. no release-ready status before a manual product review;
10. one explicit owner decision after the vertical slice:
    `CONTINUE_PRODUCTION`, `REDESIGN_CORE`, or `STOP_PROJECT`.

The pre-review status is `CONCEPT_PROOF_REVIEW_READY`. It means only that the
slice can be reviewed; it does not mean release readiness.

## First-prototype complexity budget

The default first prototype has:

- one primary mechanic;
- at most one mandatory resource;
- one persistent gameplay field;
- at most two decision types in the first session;
- no mandatory journal;
- no multiple core-loop tabs;
- one vertical scroll-chain on mobile;
- immediate perceptible feedback for the primary action;
- the cause of an error visible next to the action;
- a first level that teaches through action, not a long instruction.

An exception requires an explicit product-owner decision recorded before the
complexity is introduced.

## Blind playtest gate

Use `templates/product-validation/BLIND_PLAYTEST.md`,
`OBSERVATIONS.md`, and `DECISION.md`. A valid tester has not read the game spec,
has not seen development prompts, receives no oral explanation, and begins with
a clean save.

Stop or redesign when any kill criterion in the decision template is met.
Manual product review must precede mass content production.

## Production barrier

Until concept proof is manually approved, do not:

- produce dozens of levels or a complete campaign;
- build the complete meta-system;
- build Daily, Endless, or procedural modes;
- mass-generate content;
- create a release ZIP;
- run a full release audit;
- assign `RELEASE_CANDIDATE_READY`.

Also forbidden:

- treating test count as evidence that the game is interesting;
- treating a solver as evidence that the game is intuitive;
- claiming that a helper improves an outcome without an outcome-level test;
- claiming leak freedom from constant metrics;
- claiming viewport compatibility when the test opens only a menu;
- continuing production after an explicit `STOP_PROJECT`.
