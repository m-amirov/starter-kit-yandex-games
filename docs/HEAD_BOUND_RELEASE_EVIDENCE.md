# HEAD-bound release evidence

Some release evidence is valid only for one exact Git commit/build. Examples include final runtime route evidence, production-art acceptance bound to repository HEAD, packaged-build smoke evidence, and final media provenance.

## Mandatory freeze order

1. Finish every source, config, Starter Kit and release-tool repair.
2. Commit those source/config changes and define `FINAL_RELEASE_HEAD`.
3. Push `FINAL_RELEASE_HEAD` to the target release branch and verify local HEAD equals the remote release HEAD.
4. Make **no more commits**.
5. Generate HEAD-bound art/runtime/media evidence **after** `FINAL_RELEASE_HEAD` is frozen.
6. Run release preflight/local freeze against that exact HEAD plus its local HEAD-bound evidence.
7. Package and smoke-test the actual RC ZIP from the same `FINAL_RELEASE_HEAD`.

Committing refreshed HEAD-bound evidence after the freeze invalidates the evidence immediately because the commit itself changes HEAD. Do not commit such records after freeze unless a project has explicitly redesigned the evidence format to be content-addressed independently of Git HEAD.

## Durable vs HEAD-bound evidence

Durable evidence may be committed when its truth is about stable content or a source commit identified inside the artifact and the commit does not invalidate its own predicate.

HEAD-bound evidence is normally local release evidence and may remain uncommitted/ignored under `artifacts/evidence`. Its validity comes from the exact `FINAL_RELEASE_HEAD`, build/hash provenance, and the authoritative verifier—not from being committed.

## Local and external gates

A bounded local freeze may PASS when all local gates are satisfied and the only remaining blocker is an explicitly external Yandex Draft/runtime evidence step. External evidence must not turn a valid local-freeze PASS into a false local FAIL, and local PASS must not be promoted to external moderation/publish readiness.

## Packaged artifact rule

Source-tree verification is not release verification. Final acceptance must inspect the actual packaged RC ZIP, including archive structure, runtime assets, localization/SDK bootstrap, prohibited-file exclusion, deterministic hash when required, and packaged-runtime smoke.
