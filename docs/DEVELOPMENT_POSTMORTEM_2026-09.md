# Yandex Games development postmortem and regression registry

This registry consolidates recurring failures confirmed across Starter Kit / CEOS / Yandex Games development from July through October 2026. It is reusable engineering memory, not game-specific canon. Project-specific symptoms are examples, not assumptions about every game.

Closure rule: reproduce -> classify -> root cause -> repair -> regression coverage -> durable rule/gate -> fresh verification. Unknown root causes remain UNKNOWN.

| Defect class | Confirmed cause/effect | Existing protection and why it failed | Required change | Regression test |
| --- | --- | --- | --- | --- |
| Visual acceptance without pixel review | Text/DOM/runtime claims were treated as visual proof; visual identity and composition defects survived. | Screenshot gate existed, but reviewer-input pixels were not mechanically proven. | Require image bytes/content, hash, dimensions and independent multimodal input proof; otherwise BLOCKED. | Evidence fixture with path-only or text-only input must not yield visual PASS. |
| Blank bands/fullscreen and action/text overlap | Responsive composition was inspected through functional checks without edge/overflow/overlap measurements. | Visual skill named clipping/overflow but lacked mandatory four-edge measurements. | Add edge-to-edge, no-scroll, readability and primary-action overlap assertions to visual evidence. | Viewport matrix rejects any non-zero unexplained band, scroll chain or overlap. |
| Wrong character/story cue or stale coverage | Filename/asset presence and stale ledgers were confused with active authored event routing. | Art/runtime checks did not require before/after cue event IDs and current ledger hash. | Tie cue pairs to expected/observed event IDs, asset hashes and fresh ledger. | Mismatched event/asset or stale ledger is not COVERED/PASS. |
| Playwright hangs/unavailable screenshots | Harness/infrastructure failure was conflated with product success. | Existing rules called this an evidence gap but did not enforce the verdict in all visual paths. | Classify timeout, inaccessible capture and missing pixel transfer as BLOCKED/EVIDENCE_GAP. | Simulated timeout/capture-unavailable fixture cannot pass visual gate. |
| Premature PASS / narrow checks | Green functional, pagination, save/load or route checks were promoted to product/visual/release acceptance. | Verification contract did not force evidence-domain separation. | Require criterion-to-evidence map and exact overall PASS/FAIL/BLOCKED. | Functional-only evidence fails broader visual/release verdict. |
| Oversized batches and release-material errors | Generation/release review accepted convenience and incomplete material inventories. | Existing production-art/release checks lacked explicit fresh re-audit and artifact completeness linkage. | Keep bounded batches, fresh ledger re-audit, and release material inventory in evidence. | Manifest/ledger/hash mismatch or missing required release artifact fails. |

| Unsafe mature-project update | Starter Kit update logic could mix init seeds with mature ownership or hide semantic drift. | Profile and ownership rules existed but were not all failure-memory-backed. | Use explicit profile, dry-run, semantic merge, product-owned runtime protection and idempotency tests. | Existing game dry-run must not write product files or silently accept unresolved conflicts. |
| Release base mismatch | Recovery worktree HEAD was not the frozen release HEAD/descendant. | Release review checked artifacts but not always ancestry first. | Freeze repository/worktree/branch/HEAD and required base; mismatch is BLOCKED. | A non-descendant release source cannot pass source-identity review. |
| SDK bootstrap drift | Static SDK reference, duplicate dynamic injection or multiple init calls could be missed by generic release checks. | Platform checklist required SDK but had no reusable static validator. | Require explicit /sdk.js, one init, duplicate-safe fallback and production fail-closed behavior. | SDK fixtures reject missing/late bootstrap, duplicate init and unguarded fallback. |
| Semantic snapshot drift | A reviewed upstream snapshot could be treated as immutable managed content, creating false conflicts or hidden edits. | Updater had semantic state but no durable acceptance helper/status audit. | Model reviewed snapshot as semantic-merge; record accepted target hash; report unreviewed edits. | Acceptance remains clean; tampering is modified/conflict. |
| First-publication video evidence gap | Metadata-only video evidence omitted exact source identity, opening-frame review or locale-distinct media proof. | Container checks existed without complete provenance and frame contract. | Bind evidence to current HEAD and final file hash; review opening frame and duplicate locale media. | Stale HEAD, identical localized files and missing opening review block. |
| Infrastructure outage misclassified | GitHub, DNS, provider or bridge failure was reported as product correctness. | Evidence domains were not always separated in recovery reports. | Classify external outage as infrastructure BLOCKED and preserve product verdict independently. | Provider outage never produces product PASS or product FAIL. |

The default-path narrative audit is a separate regression surface: verify the first-run authored route, locale, save state and reader-facing choice timing before relying on alternate-route or fixture coverage.

## Evidence-domain rule

Maintain separate verdicts for functional/tests, runtime behavior, visual pixels, authored narrative/content, Yandex platform/manual portal evidence, media, package/artifact integrity and external infrastructure. A PASS in one domain never substitutes for a required gate in another.

## Incident promotion contract

For every newly confirmed reusable defect, update this registry and lessons/known-failures.yaml, add or strengthen the nearest rule/skill, and add regression coverage when the invariant is deterministic. Do not add a root cause that was not reproduced or supported by evidence.
