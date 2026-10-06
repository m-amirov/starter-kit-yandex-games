# Yandex Games development postmortem and regression registry

This registry consolidates recurring failures confirmed across Starter Kit / CEOS / Yandex Games development from July through October 2026. It is reusable engineering memory, not game-specific canon. A row records a confirmed failure class; project-specific symptoms are examples, not assumptions about every game.

Closure rule: reproduce → classify → root cause → repair → regression coverage → durable rule/gate → fresh verification. Unknown root causes remain UNKNOWN.

| Defect class | Confirmed historical failure mode | Durable prevention |
| --- | --- | --- |
| Wrong CEOS/project profile | A Yandex Games project was initialized with the `twork-desktop` profile, producing irrelevant/missing gates. | Resolve profile from repository evidence before work; wrong profile is CONFIGURATION_ERROR. |
| Missing/invented skills or capabilities | Workflows referenced skills/tools that were not actually installed or callable. | Only claim active skills/routes/capabilities proven in the current environment; unavailable required capability is BLOCKED. |
| Unsafe mature-project update | Starter Kit 0.4.0 mixed init/update semantics, Windows URL path handling and mature ownership. | Mature projects use target-aware update, explicit profile, dry-run, ownership classes and no init seeds. |
| Second skill root / ownership conflict | Mature projects could receive a second active skill root or Starter Kit content over project-owned files. | One configured skill root; semantic merge for shared contracts; project runtime/content remains project-owned. |
| Managed-file drift hidden to obtain green status | Managed Yandex files conflicted during migration/release. | Never substitute hashes, roll back policy, or overwrite project content merely to pass self-test. Resolve drift explicitly. |
| Windows EOL / EOF byte drift | `core.autocrlf`, missing `.gitattributes` and trailing-blank differences broke managed hashes and `git diff --check`. | Deterministic LF policy, exact final-newline contract and byte-level migration regressions. |
| Incoming semantic content could not be materialized | Accept-current existed but target-mapped incoming content could not be explicitly taken. | Keep accept-current and take-incoming as separate operations and regression-test both. |
| Dirty/parallel worktree damage risk | Recovery work encountered unrelated local state and parallel branches. | Record repo/worktree/branch/HEAD; preserve unrelated work; no blind reset/clean/stash/checkout. |
| Release base mismatch | Recovery worktree HEAD was not the frozen release HEAD/descendant. | Freeze release source identity and ancestry; mismatch is BLOCKED_BASE_MISMATCH, not permission to switch branches silently. |
| Missing npm command misclassified as product failure | Required `test:e2e` was absent in a pilot project. | Distinguish CONFIGURATION_ERROR from TEST_FAILURE and COMMAND_FAILURE before execution. |
| Locale-assuming E2E false failure | A cloud warning test asserted RU text while the app actually started EN. | Assert the active locale/configuration; reproduce baseline before modifying runtime. |
| Stale narrative fixtures | Tests referenced obsolete scene/choice fixtures after authored content changed. | Treat stale fixtures as fixture defects unless current product behavior violates the accepted contract. |
| Harness instability changed production behavior | UI/E2E instability risked product changes made only to satisfy the driver. | Use TEST_HARNESS_ADJUDICATION: minimal fixture, bounds, hit target, overlays, emitted events, product-vs-harness classification. |
| Runtime control reinitialized/destroyed the game root | A settings/slider interaction destroyed/recreated Phaser/canvas/DOM, producing flicker and lost drag/input continuity. | UI/settings changes must mutate owned state without recreating the runtime root unless explicitly required; regression-test canvas/scene/input continuity. |
| Persistent UI obscured gameplay | HUD/panel layout hid wave/clue/gameplay information on some states/viewports. | Visual gate must inspect gameplay-critical visibility and persistent-panel overlap in real runtime states. |
| Functional PASS promoted to visual/product PASS | Unit/E2E/save/route checks were treated as broader acceptance. | Evidence domains are separate. Narrow PASS cannot satisfy visual, narrative, platform/manual, media or release gates. |
| Visual acceptance without actual pixels | Text/DOM/path claims were accepted without proving the reviewer received screenshot/reference pixels. | Current-runtime pixels plus hash/bytes/dimensions plus independent pixel receipt are mandatory; otherwise BLOCKED. |
| Blank bands / edge-to-edge defects | S27/S28/S49-style bands survived DOM/overflow checks. | Four-edge coverage, document/internal scroll and actual screenshot review are mandatory for affected full-bleed viewports. |
| Compact viewport overlap/scroll | Responsive UI passed broad checks but overlapped or internally scrolled on compact viewports including 1280×720. | Record primary-action overlap, readability and scroll state at declared compact desktop/mobile viewports. |
| Orientation clipping/overlap | Resize/orientation transitions caused clipping/overlap. | Exercise every supported orientation transition in one runtime session; re-layout must complete after each resize. |
| Portrait cover crop lost a subject | S38 mapping was correct, but source composition plus `object-fit: cover` cropped Alice at 390×844. | Diagnose global layout vs source-asset/focal-point defect; verify focal metadata and actual crop before changing shared CSS. |
| Asset exists but is not valid runtime art | Generated files/placeholders were counted as completion without correct integration or readable staging. | File existence, mapping, runtime visibility and visual acceptance are separate checks. First generation is never automatically final. |
| Generic/debug-like visuals | Functional gameplay could remain placeholder/generic or weakly staged. | Art bible + integration pass + anti-neuroslop visual gate + real runtime screenshots. |
| Stale cue/coverage ledger | Asset presence or old coverage data was confused with the active authored event. | Tie expected/observed event IDs and asset hashes to a current ledger hash/version. |
| Capture/Playwright failure treated as success | Missing screenshots/timeouts sometimes left visual work looking green. | Capture/browser failure is BLOCKED/EVIDENCE_GAP, never visual PASS. |
| Default-path narrative audit missed alternate branches | Deterministic first-option playthrough missed chronology, consent, duplicate-action and route/status defects. | Semantic verification must be branch-complete for affected reachability; verify chronology, knowledge, boundaries, route/status predicates and ending causality. |
| Structural narrative tests missed reader comprehension | Full route/count checks did not catch missing introductions, time/place transitions and natural reminders. | Add cold-read comprehension review as a distinct authored-content gate; scene counts are not reader understanding. |
| Localization/state coupling risk | Locale and authored state could drift from Yandex SDK/runtime expectations. | SDK locale is authoritative at startup; generated localization remains managed; save/progression state is locale-independent unless explicitly designed otherwise. |
| Web route assumed local tools | Web High was initially treated as if it could inspect local repository/tool state. | Web routes are reasoning-only over supplied evidence; repository/tool proof stays native. Preflight READY is not completed review. |
| Web/bridge transport failure | Local bridge 404/503, attachment failure and rate limits interrupted review. | Classify transport separately; use bounded retries/cooldowns; semantic FAIL/REWORK is not transport failure. |
| Missing/stale native image capability trust | Production-art runs were blocked by absent producer API, missing trusted session markers or stale attestation. | Fresh run/session/turn capability challenge only; manual/env/old-session evidence cannot unlock generation. |
| Optional external provider confused with authority | Draft harness/provider PASS risked being treated as official Yandex compliance. | External evidence is supporting/advisory unless explicitly required; official/manual failures always win. |
| Yandex docs changed after local rules were written | Requirements revisions changed details, including monetization interpretation. | Live docs watcher + reviewed semantic snapshot + explicit acceptance; FETCH_FAILED is not automatic PASS. |
| First-publication gameplay video under-specified | Release required real horizontal MP4 plus manual content review; metadata alone was insufficient. | Validate metadata/hash and separately review real-gameplay share, locale, first/last frames and absence of system/debug chrome. |
| Release ZIP contamination | Harness/provider/debug/promotional media could leak into the game archive. | Independently enumerate final ZIP; forbid Harness/provider/debug/browser-profile/promotional MP4 content. |
| Release artifact incompleteness | RC could lack ZIP/manifest/SHA/media/current evidence despite green local tests. | Release readiness requires exact packaged source plus artifact inventory, SHA-256, media proof and all mandatory domains. |
| Infrastructure outage confused with product state | GitHub/DNS/provider outages blocked gates. | Report infrastructure BLOCKED separately; never convert an outage into product PASS or product FAIL. |
| Repeated broad checks / oversized prompts | Time/context was wasted by repeated green suites, redundant diagnostics and overlong orchestration. | Targeted iteration checks, one final barrier after relevant state change, compact checkpoints and no redundant agents/reads. |

## Evidence-domain rule

Maintain separate verdicts for functional/tests, runtime behavior, visual pixels, authored narrative/content, Yandex platform/manual portal evidence, media, package/artifact integrity and external infrastructure. A PASS in one domain never substitutes for a required gate in another.

## Incident promotion contract

For every newly confirmed reusable defect, update this registry and `lessons/known-failures.yaml`, add or strengthen the nearest rule/skill, and add regression coverage when the invariant is deterministic. Do not add a root cause that was not reproduced or supported by evidence.
