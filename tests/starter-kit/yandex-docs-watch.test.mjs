import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../tools/starter-kit/lib.mjs';
import {
  assertNoUnresolvedUpstreamChanges,
  buildSemanticSnapshot,
  compareSnapshots,
  evaluatePreSubmitFreshness,
  runDocumentationWatch
} from '../../tools/yandex/docs-watch.mjs';

const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'yandex-docs');
const URLS = {
  requirements: 'https://yandex.ru/dev/games/doc/ru/concepts/requirements',
  draft: 'https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft',
  moderation: 'https://yandex.ru/dev/games/doc/ru/concepts/moderation',
  detail: 'https://yandex.ru/dev/games/doc/ru/requirements/1/1'
};

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function documents(overrides = {}) {
  return {
    [URLS.requirements]: fixture('requirements.md'),
    [URLS.draft]: fixture('draft.md'),
    [URLS.moderation]: fixture('moderation.md'),
    [URLS.detail]: fixture('detail-1-1.md'),
    ...overrides
  };
}

function snapshot(overrides = {}) {
  return buildSemanticSnapshot({
    documents: documents(overrides),
    sources: URLS,
    fetchedAt: '2026-08-28T09:00:00.000Z',
    reviewedAt: '2026-08-28'
  });
}

function verdicts(overrides = {}) {
  return compareSnapshots(snapshot(), snapshot(overrides));
}

test('unchanged semantic documents pass', () => {
  const result = verdicts();
  assert.deepEqual(result.verdicts, ['UNCHANGED']);
  assert.equal(result.status, 'PASS');
  assert.equal(result.reviewRequired, false);
});

test('third-party documentation sources cannot become authoritative', () => {
  assert.throws(() => buildSemanticSnapshot({
    documents: documents(),
    sources: { ...URLS, requirements: 'https://example.com/dev/games/doc/ru/concepts/requirements' }
  }), /Non-authoritative documentation host/);
});

test('metadata/date-only changes are classified without semantic review', () => {
  const changed = fixture('requirements.md')
    .replace('fixture-1', 'fixture-2')
    .replace('18 августа 2026', '19 августа 2026');
  const result = verdicts({ [URLS.requirements]: changed });
  assert.deepEqual(result.verdicts, ['METADATA_ONLY']);
  assert.equal(result.status, 'PASS');
});

test('clause text change is found when clause count does not change', () => {
  const changed = fixture('requirements.md').replace('Игра сохраняет прогресс.', 'Игра сохраняет прогресс немедленно.');
  const result = verdicts({ [URLS.requirements]: changed });
  assert.ok(result.verdicts.includes('CLAUSE_CHANGED'));
  assert.equal(result.diffs.requirements.clauseCount.before, result.diffs.requirements.clauseCount.after);
  assert.equal(result.status, 'BLOCK');
});

test('new clause is classified', () => {
  const changed = fixture('requirements.md').replace('</div>', '4. <span class="hidden-text">Пункт 1.4.</span> Новое требование. {#1-4}\n\n</div>');
  assert.ok(verdicts({ [URLS.requirements]: changed }).verdicts.includes('CLAUSE_ADDED'));
});

test('removed active clause is classified as repealed', () => {
  const changed = fixture('requirements.md').replace(/^2\. .*Пункт 1\.2.*\r?\n/m, '');
  assert.ok(verdicts({ [URLS.requirements]: changed }).verdicts.includes('CLAUSE_REPEALED'));
});

test('explicitly repealed clause is classified', () => {
  const changed = fixture('requirements.md').replace('Игра сохраняет прогресс. {#1-2}', '(Упразднен.) {#1-2 .deprecated}');
  assert.ok(verdicts({ [URLS.requirements]: changed }).verdicts.includes('CLAUSE_REPEALED'));
});

test('reactivated clause is classified', () => {
  const changed = fixture('requirements.md').replace('(Упразднен.) {#1-3 .deprecated}', 'Требование снова действует. {#1-3}');
  assert.ok(verdicts({ [URLS.requirements]: changed }).verdicts.includes('CLAUSE_REACTIVATED'));
});

test('Draft duration 28 to 20 seconds is a constraint change', () => {
  const changed = fixture('draft.md').replace(/до 28 секунд/g, 'до 20 секунд');
  const result = verdicts({ [URLS.draft]: changed });
  assert.ok(result.verdicts.includes('DRAFT_CONSTRAINT_CHANGED'));
  assert.equal(result.diffs.draft.changed.horizontalGameplayVideo.constraints.maxDurationSeconds.after, 20);
});

test('Draft MP4 format change is a constraint change', () => {
  const changed = fixture('draft.md').replace(/Формат — MP4/g, 'Формат — WEBM');
  const result = verdicts({ [URLS.draft]: changed });
  assert.ok(result.verdicts.includes('DRAFT_CONSTRAINT_CHANGED'));
  assert.deepEqual(result.diffs.draft.changed.horizontalGameplayVideo.constraints.formats.after, ['WEBM']);
});

test('field becoming required is classified separately', () => {
  const changed = fixture('draft.md').replace(
    '### Горизонтальное видео {#field-horizontal-video}',
    '### Горизонтальное видео <span class="red">*</span> {#field-horizontal-video}'
  );
  assert.ok(verdicts({ [URLS.draft]: changed }).verdicts.includes('DRAFT_REQUIREDNESS_CHANGED'));
});

test('new Draft field is discovered and classified without an invented registry number', () => {
  const changed = fixture('draft.md') + '\n### Новый параметр {#field-new-policy}\nНовое ограничение Консоли.\n';
  const result = verdicts({ [URLS.draft]: changed });
  assert.ok(result.verdicts.includes('DRAFT_FIELD_ADDED'));
  assert.ok(result.diffs.draft.added['official:new-policy']);
});

test('current horizontal gameplay video constraints remain regression-locked', () => {
  const field = snapshot().documents.draft.fields.horizontalGameplayVideo;
  assert.deepEqual(field.constraints.formats, ['MP4']);
  assert.deepEqual(field.constraints.aspectRatios, ['16:9']);
  assert.equal(field.constraints.minHeightPx, 400);
  assert.equal(field.constraints.maxDurationSeconds, 28);
  assert.equal(field.constraints.maxSizeBytes, 100_000_000);
});

test('new requirement detail page is classified', () => {
  const requirements = fixture('requirements.md').replace(
    'Игра сохраняет прогресс.',
    'Игра сохраняет прогресс. [Подробнее](https://yandex.ru/dev/games/doc/ru/requirements/1/2.md).'
  );
  const result = compareSnapshots(snapshot(), buildSemanticSnapshot({
    documents: documents({
      [URLS.requirements]: requirements,
      'https://yandex.ru/dev/games/doc/ru/requirements/1/2': '# Требование 1.2\n\nНовая detail page.'
    }),
    sources: URLS,
    fetchedAt: '2026-08-28T10:00:00.000Z',
    reviewedAt: '2026-08-28'
  }));
  assert.ok(result.verdicts.includes('NEW_DETAIL_PAGE'));
});

test('detail page semantic change is classified', () => {
  const result = verdicts({
    [URLS.detail]: fixture('detail-1-1.md').replace('официальным способом', 'официальным проверенным способом')
  });
  assert.ok(result.verdicts.includes('DETAIL_PAGE_CHANGED'));
});

test('navigation-only HTML change is ignored', () => {
  const base = `<html><body><nav>Первое меню</nav><main>${fixture('moderation.md')}</main><footer>2026</footer></body></html>`;
  const changed = base.replace('Первое меню', 'Новое меню').replace('2026', '2027');
  const left = buildSemanticSnapshot({ documents: documents({ [URLS.moderation]: base }), sources: URLS });
  const right = buildSemanticSnapshot({ documents: documents({ [URLS.moderation]: changed }), sources: URLS });
  assert.deepEqual(compareSnapshots(left, right).verdicts, ['UNCHANGED']);
});

test('whitespace-only change is ignored', () => {
  const changed = fixture('moderation.md')
    .replace('Перед отправкой', 'Перед     отправкой')
    .replace('## Этапы модерации', '\n\n## Этапы модерации');
  assert.deepEqual(verdicts({ [URLS.moderation]: changed }).verdicts, ['UNCHANGED']);
});

test('parser drift never becomes PASS', () => {
  const changed = fixture('requirements.md').replaceAll('Пункт ', 'Требование ');
  const result = verdicts({ [URLS.requirements]: changed });
  assert.ok(result.verdicts.includes('PARSE_DRIFT'));
  assert.notEqual(result.status, 'PASS');
});

test('unexpected Draft page structure never becomes PASS', () => {
  const result = verdicts({ [URLS.draft]: '# Неожиданная страница\n\nНет полей.' });
  assert.ok(result.verdicts.includes('PARSE_DRIFT'));
  assert.notEqual(result.status, 'PASS');
});

test('network failure is FETCH_FAILED and requires manual handling', async () => {
  const result = await runDocumentationWatch({
    reviewedSnapshot: snapshot(),
    sourceConfig: {
      fetch: { timeoutMs: 10, retries: 0, retryDelayMs: 0 },
      sources: Object.entries(URLS).filter(([key]) => key !== 'detail').map(([id, url]) => ({ id, url }))
    },
    fetcher: async () => { throw new Error('offline'); },
    writeArtifacts: false
  });
  assert.deepEqual(result.verdicts, ['FETCH_FAILED']);
  assert.equal(result.status, 'MANUAL_REQUIRED');
  assert.equal(result.reviewRequired, true);
});

test('unknown semantic change is UNCLASSIFIED_CHANGE and never PASS', () => {
  const changed = fixture('requirements.md').replace('Вводный текст требований.', 'Неизвестное новое нормативное пояснение.');
  const result = verdicts({ [URLS.requirements]: changed });
  assert.ok(result.verdicts.includes('UNCLASSIFIED_CHANGE'));
  assert.notEqual(result.status, 'PASS');
});

test('pre-submit blocks unresolved semantic change and does not waive FETCH_FAILED', () => {
  assert.equal(evaluatePreSubmitFreshness({
    liveCheck: { status: 'BLOCK', reviewRequired: true, verdicts: ['CLAUSE_CHANGED'] }
  }).blockCode, 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED');
  assert.equal(evaluatePreSubmitFreshness({
    liveCheck: { status: 'MANUAL_REQUIRED', reviewRequired: true, verdicts: ['FETCH_FAILED'] }
  }).status, 'MANUAL_REQUIRED');
});

test('FETCH_FAILED permits only explicit current-document manual review evidence', () => {
  const liveCheck = { status: 'MANUAL_REQUIRED', reviewRequired: true, verdicts: ['FETCH_FAILED'] };
  assert.equal(evaluatePreSubmitFreshness({
    liveCheck,
    manualCurrentDocumentReview: {
      status: 'PASS',
      reviewedAt: '2026-08-28',
      sources: [URLS.requirements, URLS.draft, URLS.moderation]
    }
  }).status, 'MANUAL_PASS');
});

test('Starter Kit packaging rejects unresolved upstream semantic changes', () => {
  assert.throws(() => assertNoUnresolvedUpstreamChanges({
    unresolvedSemanticChanges: true,
    blockCode: 'BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED'
  }), /BLOCK_YANDEX_DOCS_CHANGED_REVIEW_REQUIRED/);
});

test('semantic change writes machine-readable, human-readable and concrete update-task artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yandex-doc-watch-'));
  const changedDocuments = documents({
    [URLS.requirements]: fixture('requirements.md').replace('Игра сохраняет прогресс.', 'Игра сохраняет прогресс немедленно.')
  });
  try {
    const result = await runDocumentationWatch({
      root,
      reviewedSnapshot: snapshot(),
      sourceConfig: {
        fetch: { timeoutMs: 10, retries: 0, retryDelayMs: 0 },
        sources: Object.entries(URLS).filter(([key]) => key !== 'detail').map(([id, url]) => ({ id, url }))
      },
      fetcher: async (url) => ({ text: changedDocuments[url], fetchedUrl: `${url}.md`, httpLastModified: null }),
      now: new Date('2026-08-28T12:00:00.000Z')
    });
    for (const name of [
      'change-report.json', 'change-report.md', 'requirements-diff.json', 'draft-diff.json',
      'moderation-diff.json', 'source-metadata.json', 'CODEX_UPDATE_TASK.md'
    ]) assert.equal(fs.existsSync(path.join(result.artifactDirectory, name)), true, name);
    assert.match(fs.readFileSync(path.join(result.artifactDirectory, 'CODEX_UPDATE_TASK.md'), 'utf8'), /Changed clauses: 1\.2/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.artifactDirectory, 'change-report.json'), 'utf8')).reviewRequired, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
