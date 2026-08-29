Разработай игру с нуля по `game-spec.yaml` и доведи её до качественного release candidate для Яндекс Игр.

Работай автономно без промежуточных подтверждений, но строго соблюдай `AGENTS.md`, `.starter-kit/core/AGENTS_CORE.md`, `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`, `PROJECT_RULES.md`, `docs/SKILL_PRECEDENCE.md`, `config/skill-policy.json` и полный реестр требований Яндекс Игр.

## Обязательный порядок

1. Проверь starter-kit version/state, Git и отсутствие конфликтов обновления.
2. Прочитай спецификацию, проектные правила, реестр навыков и требования Яндекса. Проверь reviewed semantic snapshot официальной документации и его соответствие authoritative registry.
3. Используй `$codex-engineering-system` для каждой нетривиальной задачи; он маршрутизирует работу через `$implementation-cycle` и только релевантные локальные skills.
4. Сформулируй продуктовую гипотезу и выполни `$product-quality-review`.
5. Создай один vertical slice. До массового производства он должен пройти:
   - `$product-quality-review`;
   - `$visual-quality-gate`;
   - `$game-feel-polish`;
   - `$mobile-game-ux` для мобильной игры;
   - `$game-accessibility`;
   - `$game-performance-budget`.
6. Создай арт-библию и визуальный язык. Первая генерация ассетов не является финальной.
7. Для каждого ассета используй `$asset-provenance-and-rights`.
8. Для уровней/генерации используй `$level-design-quality`.
9. Если игра содержит звук, используй `$game-audio-quality` и проверь рекламу, focus/pause/resume и audio unlock.
10. Для браузерной сборки и повторных переходов используй `$web-game-playtest`.
11. Не применяй внешние рекомендации про PWA, service worker, CDN, WebGPU-only, app-store packaging или autoplay, если они не разрешены проектом и не доказаны безопасными для Яндекс Игр.
12. Экономь контекст и токены: читай только ближайшие к задаче файлы и skills, не перечитывай неизменённую архитектуру, веди компактный checkpoint в `.loop/`, используй минимально достаточный уровень reasoning и не подключай дополнительные модели/subagents без доказанной необходимости.
13. Во время итераций запускай targeted tests; более широкую regression suite — один раз на task barrier, а полные cross-browser/viewports/compliance suites — на release barrier или когда задача прямо меняет эти поверхности.
14. На acceptance boundary каждого production-visible pass выполни `SCREENSHOT_VISUAL_GATE`: actual-runtime screenshots current HEAD для затронутых states, visual inspection по ART_BIBLE/VISUAL_LANGUAGE, correction/recheck и только затем acceptance token. Для gameplay/UI обязательны desktop и настоящий touch-path mobile; unit/integration/E2E PASS не заменяют gate.
15. Проверь RU/EN и все viewports/orientation sequences, long tap, context menu, selection, scroll and safe areas.
16. После final production build и final screenshots для `first-publication` создай horizontal gameplay video из настоящего геймплея final production build. Цель — 20–25 секунд и желательно 100% gameplay; intro/outro минимальны. Не используй fake mockup, отдельную анимацию, dev/debug footage или runtime dependency. Для portrait-only допустима 16:9 композиция реальной portrait-записи с собственным artwork/background игры.
17. Для каждого заявленного языка создай locale-specific video, если в gameplay есть локализованный текст. Один файл разрешён только при доказанном отсутствии language-dependent текста. Заполни `artifacts/evidence/final-gameplay-videos.json`, выполни ручной visual review доли real gameplay ≥70%, UI/локали/чёрных полей и запусти media validation.
18. Создай проверяемый Yandex game ZIP без promotional MP4; dev-only recording/transcoding tooling не должно попадать в production bundle.
19. Перед реальной отправкой выполни live `yandex:docs:check`. `UNCHANGED`/`METADATA_ONLY` допускают продолжение; unresolved semantic diff блокирует с `BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED`. `FETCH_FAILED` требует явного ручного evidence review всех canonical sources и не является автоматическим PASS.
20. Выполни полный authoritative compliance audit и `$yandex-release-validation`. Перед финальной submission отдельно проверь docs freshness. После загрузки Draft рекомендуется явно запустить только pinned validated external provider, сохранить normalized evidence и передать его `$release-audit`; authenticated browser никогда не запускается скрытым side effect.
21. Затем независимо выполни `$release-audit`, включая snapshot/registry alignment, отсутствие unresolved upstream changes, external evidence conflicts и provider/report/profile contamination; проверь ZIP и SHA-256. Не публикуй и не отправляй на модерацию.

Допустимые итоги:

- `RELEASE_CANDIDATE_READY`
- `ESCALATE_BLOCKED`

Формально работающая, но шаблонная, плохо читаемая, неполированная, неадаптивная или не подтверждённая доказательствами игра не является release candidate.
