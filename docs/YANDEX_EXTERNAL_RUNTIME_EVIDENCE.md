# Optional external Yandex Draft runtime evidence

Starter Kit 0.5.7 includes the pinned `yandex-draft-runtime-hardened` provider as local release tooling. It is an independently reviewed, advisory provider; it is not an official Yandex tool and never replaces current official requirements, documentation freshness, manual clauses, or the authoritative release validation.

## Pin and integrity

- Provider: `hardened-draft-runtime-harness-1.3.0`.
- Validated manifest SHA-256: `3a73a9feb15de4b38f2ecd57bec167f5c280d8e0780f394b7d5a122e45a3755a`.
- Validated controlled live run: `2026-08-29T03-32-01-617Z-551358`.
- Provider-validation verdict: `PASS_LIVE_HARDENED_PROVIDER_VALIDATION`.
- Runtime closure is stored under `tools/yandex/external-runtime-provider/` with unchanged relative imports. Every use fails closed unless the manifest and all six raw-byte hashes match the pin.
- `provenanceInputs` stay inside the manifest as history metadata. The original checker, original passive harness, reconstructed bundles, patch chains, old reports, and authentication profiles are not distributed runtime dependencies.

`npm run yandex:docs:check` checks authoritative Yandex documentation freshness. `npm run yandex:external:verify` checks the reviewed external provider pin. They are independent gates.

## Explicit workflow

```text
npm run yandex:external:verify
npm run yandex:external:run -- --url https://yandex.ru/games/app/<App-ID>
npm run yandex:external:normalize -- --run artifacts/evidence/external/yandex-runtime/<run-id>
npm run yandex:external:audit -- --run artifacts/evidence/external/yandex-runtime/<run-id> --zip <release.zip>
```

The default run uses a Harness-owned ephemeral profile. A real authenticated Draft run requires the visible `--dedicated-auth` step; interactive observation additionally requires `--interactive`. Never point the Harness at a normal user browser profile. The dedicated profile stays in an ignored local `.state/` directory, outside evidence and release artifacts. The authenticated Harness is never a hidden side effect of ordinary release validation.

Provider runs are moved to the project-owned `artifacts/evidence/external/yandex-runtime/<run-id>/` tree. The provider guarantees `report.json`, `evidence.json`, `console.json`, `chrome.log`, `panel.txt`, and `run-state.json`; error and timeout runs retain partial content and stage history. These artifacts are local-sensitive and are never published automatically.

## Passive runtime and OOPIF policy

The pinned executable closure permits no remote executable fetch, floating ref, CSP bypass, artificial user gesture, synthetic input, project resolver callback, save/leaderboard/purchase/consume write, provider-triggered ad, or SDK mutation. `mutationCapableOperationCount` must remain zero.

External PASS requires an actual game `iframe` OOPIF, exact expected game origin, observer origin, `targetId`, `cdpSessionId`, `executionContextId`, and pinned `gameSessionSha256`. The outer `yandex.ru` page is never game evidence. Missing proof produces `EXTERNAL_EVIDENCE_NOT_VERIFIED`, not PASS.

## Normalization and conflicts

The closed status set is `EXTERNAL_EVIDENCE_PASS`, `EXTERNAL_EVIDENCE_WARN`, `EXTERNAL_EVIDENCE_FAIL`, `EXTERNAL_EVIDENCE_NOT_VERIFIED`, `EXTERNAL_EVIDENCE_UNAVAILABLE`, and `EXTERNAL_EVIDENCE_ERROR`. Normalized evidence retains raw status, classification, advisory requirement mapping, heuristic flag, provenance, artifact paths, runtime identity, mutation ledger, and stage history. Heuristic mappings are explicitly marked and no synthetic requirement IDs are created.

- Starter PASS + External PASS: Starter PASS remains, with supporting evidence.
- Starter PASS + External FAIL/WARN: `REVIEW_REQUIRED`.
- Starter FAIL + External PASS: Starter FAIL remains.
- Manual clause + External PASS: manual remains unless the evidence proves the full clause.
- NOT VERIFIED never counts as provider PASS.
- ERROR is a provider/tooling problem, separate from a game defect.
- UNAVAILABLE or not run does not block while the provider remains optional.

## Redaction and release contamination

Profile paths, cookies, `Set-Cookie`, authorization/bearer/JWT values, OAuth/session credentials, CSRF values, credential query parameters, storage contents, and sensitive command-line values are redacted. Safe technical provenance such as App ID, target/session/context IDs, game-session hash, provider hashes, and manifest hash remains available.

The production ZIP gate blocks the Harness, observer, provider modules, `debugcheck.js`, `YGDebugChecker`, provider signatures, raw external evidence, reports, and browser profiles. Provider tooling is never game runtime.

## Provider update policy

Pins never update automatically. A new upstream version or commit is only detected and reported. Updating requires a source diff audit and deterministic security suite; any executable-runtime byte change also requires a controlled live validation. Only a passing review may update the version and manifest pin. Floating `latest` or branch execution is forbidden.
