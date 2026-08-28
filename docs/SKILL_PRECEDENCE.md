# Skill Precedence and Yandex Compatibility

## Mandatory authority order

1. Current official Yandex Games requirements.
2. Reviewed `config/yandex-doc-snapshot.json`, `config/yandex-requirements.yaml`, `config/yandex-console-requirements.yaml`, and `$yandex-release-validation`.
3. `AGENTS.md`, `PROJECT_RULES.md`, and explicit product constraints.
4. `game-spec.yaml`.
5. Local production skills.
6. Adapted external guidance.

A lower layer may add stricter quality requirements, but it may never weaken, reinterpret away, or mark a Yandex requirement as passed.
The snapshot is a reviewed comparison baseline, not permission to ignore a newer official page. Unresolved watcher changes or parse drift block release review.

## Conflict protocol

When a skill recommendation conflicts with platform requirements:

1. stop the conflicting recommendation;
2. preserve the Yandex-compliant implementation;
3. record the rejected recommendation and reason in the task notes;
4. choose a platform-safe alternative;
5. add a regression test if the conflict could recur.

## Explicitly filtered external advice

The five external sources contain useful general game-development ideas, but this kit discards or disables guidance that does not fit browser-hosted Yandex Games:

- PWA installation and service workers are disabled by default;
- App Store and Google Play packaging is not applicable;
- CDN-hosted gameplay assets are forbidden by default;
- WebGPU cannot be the only renderer;
- audio autoplay is forbidden;
- native mobile lifecycle APIs are replaced by browser visibility, focus and Yandex lifecycle checks;
- generic monetization advice cannot override the Yandex advertising contract;
- visual polish cannot reduce responsive layout safety or readability.

## Release rule

No production skill can issue `RELEASE_CANDIDATE_READY`. Only the sequence

`all production gates → $yandex-release-validation → $release-audit`

may authorize release packaging.

## Delivery ownership is not authority

Target profiles and manifest ownership control only how infrastructure is
delivered. They cannot change the authority order above, mark a requirement
`PASS`, or downgrade an existing project Yandex contract.

For mature projects, project-owned runtime is never updater-managed.
`AGENTS.md`, project-wide compliance contracts and existing same-name skills
use semantic merge. Skill source paths are mapped through the configured
`skillRoot`; a second active root is forbidden unless the reviewed target
profile explicitly allows it.
