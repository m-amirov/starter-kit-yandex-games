# Changelog

## 0.5.3 — 2026-08-20

- Made managed text content profile-aware through explicit manifest `contentTemplate` materialization.
- Materialized `QUALITY_CONSTITUTION.md` links through each profile's configured `skillRoot`, preserving `.codex/skills` for new projects and `.agents/skills` for mature Phaser projects.
- Made the 0.4.1 semantic-accepted to managed transition baseline-safe when the materialized target bytes already match, without creating a second skill root or touching product-owned runtime.
- Added migration, init, apply, status, ownership-transition, and idempotency regression coverage.

## 0.5.2 — 2026-08-20

- Fixed the stale `autonomy/state.json` new-project seed so its `starterKitVersion` matches the released Starter Kit version.
- Regenerated the manifest from committed source so new-project bootstrap and manifest validation stay aligned.

## 0.5.1 — 2026-08-10

- Added the canonical mandatory `SCREENSHOT_VISUAL_GATE` for production-visible passes, with actual current-HEAD runtime evidence and impact-based state matrices.
- Wired the gate into the engineering acceptance sequence, visual and product barriers, release audit, policy, template rules, self-tests, and target-aware updater.
- Blocked implementation, acceptance, owner-review, visual, and product completion tokens when the required visual evidence is absent or failing.
- Added the 0.5.0 → 0.5.1 migration guide; managed drift remains explicit and project-owned visual rules remain preserved.

## 0.5.0 — 2026-07-29

- Added the managed Concept Proof Gate and first-prototype complexity budget.
- Added blind-playtest observation and decision templates with kill criteria.
- Blocked mass content, meta systems, procedural modes, release ZIPs, audits,
  and release-ready status until manual concept-proof approval.
- Added the `$project-termination` workflow for terminal `STOP_PROJECT` decisions.
- Added UI test-harness adjudication before production runtime changes.
- Made silent single-agent execution, medium reasoning, targeted evidence, and
  one final task barrier enforceable through self-tests and policy.
- Added the 0.4.2 → 0.5.0 migration contract.

## 0.4.2 — 2026-07-28

- Added explicit mandatory `$codex-engineering-system` orchestration instead of relying only on partial `$implementation-cycle` behavior.
- Added a managed engineering-system contract that stays outside product runtime and release archives.
- Added relevant-only context/skill loading, compact `.loop/` checkpoints, fresh-evidence reuse, bounded retries, and concise log rules.
- Added lowest-sufficient reasoning guidance and disabled generic subagents/multiple models by default for routine scoped tasks.
- Added a verification ladder: targeted checks during iteration, broader regression once at the task barrier, and full cross-browser/compliance suites at the release barrier or for directly affected surfaces.
- Added migration and automated contract tests for engineering-system and token-economy enforcement.

## 0.4.1 — 2026-07-26

- Fixed Windows module-path resolution by using `fileURLToPath(import.meta.url)`.
- Added target profile schema and explicit `new-project` and
  `mature-yandex-phaser` profiles.
- Added manifest schema 2 with `managed`, `project-owned`, `semantic-merge`,
  `new-project-seed`, `target-mapped`, and `ephemeral` ownership.
- Changed `index.html`, `game-spec.yaml`, product examples, and autonomy seeds
  to init-only project-owned seeds.
- Changed `AGENTS.md`, `package.json`, project-wide Yandex contracts, and
  existing same-name skills to non-overwriting semantic/structural merge flows.
- Added configurable skill-root mapping and second-root rejection.
- Added target-aware state, status, manifest snapshots, migration tracking,
  conflict proposals, merge notes, and explicit semantic resolution.
- Added deterministic updater fixtures and cross-platform ownership,
  idempotency, status, package-merge, and read-only-plan tests.
- Marked 0.4.0 unsafe for mature-project update without the 0.4.1 updater.

## 0.4.0 — 2026-07-24

- Added strict skill precedence with official Yandex requirements as highest authority.
- Added five adapted external-method sources with provenance: game design, game art, web games, game audio and mobile games.
- Added seven production skills: audio quality, mobile UX, level design, game feel, performance budget, asset provenance/rights and accessibility.
- Added filtered conflict rules for PWA, service workers, CDN assets, WebGPU-only rendering, autoplay and native app-store guidance.
- Added functional starter-kit manifest, self-test, status, init and packaging tools.
- Added migration guide `0.4.0-production-skills.md`.
- New-project initialization remains supported, but the 0.4.0 updater must not
  be used for mature-project integration; use the 0.4.1 updater and profile.

## 0.2.0 — 2026-07-22

- Added project-local Codex skills for the engineering cycle, Yandex validation, independent release audit, product quality and visual quality.
- Split starter-owned infrastructure from project-owned game code.
- Added a versioned starter-kit manifest, baseline snapshots, safe initialization and update tools.
- Added conflict-safe updates: locally modified managed files are never overwritten silently.
- Added a lessons registry for promoting reusable fixes from finished games back into the starter kit.
- Added an art-direction constitution and anti-neuroslop release barriers.
- Added mandatory product, visual and art-direction evidence before release packaging.
- Added quality-audit and starter-kit self-test commands.

## 0.1.0 — 2026-07-22

- Initial autonomous Yandex Games starter kit.
