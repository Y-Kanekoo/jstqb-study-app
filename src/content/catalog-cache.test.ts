import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildCatalogCacheKey,
  CatalogCacheRepository,
  createCatalogCacheScope,
  type CatalogCacheScope,
} from './catalog-cache';
import type { CatalogCacheStorage } from './catalog-cache-storage';
import type { CatalogQuestion, CatalogSnapshot } from './catalog-schema';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

class TestStorage implements CatalogCacheStorage {
  readonly values = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async writeAtomic(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }

  async removeByPrefix(prefix: string): Promise<void> {
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        this.values.delete(key);
      }
    }
  }
}

function hash(value: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(value).digest('hex'));
}

function createQuestion(id: string, versionNumber = 1): CatalogQuestion {
  const versionId = `${id}-v${versionNumber}`;
  return {
    id,
    versionId,
    versionNumber,
    status: 'published',
    syllabusVersion: '2023V4.0.J02',
    chapterNumber: 1,
    chapterTitle: 'テストの基礎',
    objectiveCode: 'FL-1.1.1',
    objectiveTitle: 'テストの目的を識別する',
    kLevel: 2,
    difficulty: 2,
    selectionType: 'single',
    requiredChoiceCount: 1,
    shuffleChoices: true,
    prompt: `${id}の設問です。`,
    explanation: `${id}の総合解説です。`,
    sourceReference: 'JSTQB FL 2023V4.0.J02 1.1節 / FL-1.1.1',
    contentHash: createHash('sha256').update(versionId).digest('hex'),
    choices: [
      {
        id: `${versionId}-A`,
        label: 'A',
        body: '正しい選択肢',
        explanation: '正答の根拠です。',
        isCorrect: true,
      },
      {
        id: `${versionId}-B`,
        label: 'B',
        body: '誤った選択肢',
        explanation: '誤答の根拠です。',
        isCorrect: false,
      },
    ],
    correctChoiceIds: [`${versionId}-A`],
  };
}

function createSnapshot(
  revision: number,
  questions: CatalogQuestion[],
  overrides: Partial<CatalogSnapshot> = {},
): CatalogSnapshot {
  return {
    schema: 'question-catalog.v1',
    certificationCode: 'JSTQB-FL',
    syllabusVersion: '2023V4.0.J02',
    channel: 'public',
    revision,
    etag: createHash('sha256').update(`revision:${revision}`).digest('hex'),
    generatedAt: `2026-08-12T0${revision}:00:00+09:00`,
    fullSnapshot: true,
    questions,
    removedVersionIds: [],
    ...overrides,
  };
}

function publicScope(userId: string | null = null): CatalogCacheScope {
  return createCatalogCacheScope({
    certificationCode: 'JSTQB-FL',
    syllabusVersion: '2023V4.0.J02',
    channel: 'public',
    userId,
  });
}

function previewScope(userId: string): CatalogCacheScope {
  return createCatalogCacheScope({
    certificationCode: 'JSTQB-FL',
    syllabusVersion: '2023V4.0.J02',
    channel: 'personal_preview',
    userId,
  });
}

describe('CatalogCacheRepository', () => {
  it('hash検証済みの完全スナップショットを読み書きする', async () => {
    const storage = new TestStorage();
    const repository = new CatalogCacheRepository({ storage, hash });
    const snapshot = createSnapshot(1, [createQuestion('question-1')]);

    await repository.write(publicScope(), snapshot);

    await expect(repository.read(publicScope())).resolves.toEqual({
      status: 'hit',
      snapshot,
    });
  });

  it('personal_previewをユーザー別に隔離しログアウト時に削除する', async () => {
    const storage = new TestStorage();
    const repository = new CatalogCacheRepository({ storage, hash });
    const snapshot = createSnapshot(1, [createQuestion('question-1')], {
      channel: 'personal_preview',
    });

    await repository.write(previewScope(USER_A), snapshot);

    await expect(repository.read(previewScope(USER_B))).resolves.toEqual({
      status: 'miss',
      snapshot: null,
    });
    await repository.clearPrivatePreview(USER_A);
    await expect(repository.read(previewScope(USER_A))).resolves.toEqual({
      status: 'miss',
      snapshot: null,
    });
    expect(() => createCatalogCacheScope({
      certificationCode: 'JSTQB-FL',
      syllabusVersion: '2023V4.0.J02',
      channel: 'personal_preview',
      userId: null,
    })).toThrow(/ユーザーID/);
  });

  it('hash不一致の破損キャッシュを削除する', async () => {
    const storage = new TestStorage();
    const repository = new CatalogCacheRepository({ storage, hash });
    const scope = publicScope();
    const snapshot = createSnapshot(1, [createQuestion('question-1')]);
    await repository.write(scope, snapshot);
    const key = buildCatalogCacheKey(scope);
    const raw = storage.values.get(key)!;
    storage.values.set(key, raw.replace('question-1の設問', '改ざんされた設問'));

    await expect(repository.read(scope)).resolves.toEqual({
      status: 'corrupt',
      snapshot: null,
    });
    expect(storage.values.has(key)).toBe(false);
  });

  it('cache-firstで即時値を返しrevision差分とtombstoneを原子的に統合する', async () => {
    const storage = new TestStorage();
    const repository = new CatalogCacheRepository({ storage, hash });
    const scope = publicScope(USER_A);
    const oldQuestion = createQuestion('question-1');
    const retainedQuestion = createQuestion('question-2');
    await repository.write(scope, createSnapshot(1, [oldQuestion, retainedQuestion]));
    const replacementQuestion = createQuestion('question-3');

    const result = await repository.loadCacheFirst(scope, async ({ sinceRevision }) => {
      expect(sinceRevision).toBe(1);
      return createSnapshot(2, [replacementQuestion], {
        fullSnapshot: false,
        removedVersionIds: [oldQuestion.versionId],
      });
    });

    expect(result.cacheStatus).toBe('hit');
    expect(result.cached?.revision).toBe(1);
    const refreshed = await result.refresh;
    expect(refreshed.status).toBe('updated');
    if (refreshed.status !== 'updated') {
      throw new Error('カタログ差分を更新できませんでした。');
    }
    expect(refreshed.snapshot.questions.map((question) => question.id)).toEqual([
      'question-2',
      'question-3',
    ]);
    expect(refreshed.snapshot.fullSnapshot).toBe(true);
    expect(refreshed.snapshot.removedVersionIds).toEqual([]);
    expect((await repository.read(scope)).snapshot?.revision).toBe(2);
  });

  it('破損時は完全取得へfallbackし、offline時は直前cacheを維持する', async () => {
    const storage = new TestStorage();
    const repository = new CatalogCacheRepository({ storage, hash });
    const scope = publicScope();
    storage.values.set(buildCatalogCacheKey(scope), '{broken');
    const fullSnapshot = createSnapshot(1, [createQuestion('question-1')]);

    const recovered = await repository.loadCacheFirst(scope, async ({ sinceRevision }) => {
      expect(sinceRevision).toBeNull();
      return fullSnapshot;
    });
    expect(recovered.cacheStatus).toBe('corrupt');
    await expect(recovered.refresh).resolves.toEqual({
      status: 'updated',
      snapshot: fullSnapshot,
    });

    const offline = await repository.loadCacheFirst(scope, () => {
      throw new Error('ネットワークに接続できません。');
    });
    const offlineRefresh = await offline.refresh;
    expect(offlineRefresh.status).toBe('offline');
    expect(offlineRefresh.snapshot?.revision).toBe(1);
  });

  it('サーバーから返った古い完全スナップショットでcacheを巻き戻さない', async () => {
    const storage = new TestStorage();
    const repository = new CatalogCacheRepository({ storage, hash });
    const scope = publicScope();
    const current = createSnapshot(2, [createQuestion('question-2')]);
    await repository.write(scope, current);

    const refresh = await repository.refresh(
      scope,
      () => Promise.resolve(createSnapshot(1, [createQuestion('question-1')])),
      current,
    );

    expect(refresh.status).toBe('offline');
    expect(refresh.snapshot?.revision).toBe(2);
    expect((await repository.read(scope)).snapshot?.revision).toBe(2);
  });
});
