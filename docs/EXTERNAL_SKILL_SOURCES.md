# Adapted External Skill Sources

These sources were reviewed on 24 July 2026. The starter kit contains original, Yandex-specific adaptations rather than verbatim copies.

| Source | Upstream path | Adapted local skill | Retained ideas | Removed or constrained |
|---|---|---|---|---|
| `game-design-v3` | `diegosouzapw/awesome-omni-skills/skills/game-design-v3/SKILL.md` | `$product-quality-review` | 30-second action-feedback-reward loop, progression, pacing, player motivation, prototype-before-polish | generic reward-schedule advice cannot override child safety, platform rules or project economy |
| `game-art-v2` | `.../skills/game-art-v2/SKILL.md` | `$visual-quality-gate` | art-direction choice, silhouette/value hierarchy, coherent asset pipeline, scale and naming | no generic style roulette; no first-pass acceptance; no visual treatment that breaks responsive layout |
| `game-audio-v2` | `.../skills/game-audio-v2/SKILL.md` | `$game-audio-quality` | audio categories, mix hierarchy, variation, adaptive transitions | no autoplay; no audio behavior outside Yandex ad/pause/focus lifecycle |
| `web-games-v2` | `.../skills/web-games-v2/SKILL.md` | `$web-game-playtest` | browser lifecycle, progressive loading, asset optimization, object cleanup | PWA/service worker/CDN/WebGPU-only recommendations disabled by default |
| `mobile-games-v2` | `.../skills/mobile-games-v2/SKILL.md` | `$mobile-game-ux` | thumb-first controls, touch feedback, orientation, mobile performance | App Store/Google Play/native packaging omitted; browser/Yandex lifecycle used instead |

Upstream catalog repository: `https://github.com/diegosouzapw/awesome-omni-skills`.

Each adapted skill contains an `ORIGIN.md` with its source boundary and Yandex-specific modifications.
