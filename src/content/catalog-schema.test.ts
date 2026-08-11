import { describe, expect, it } from 'vitest';

import { catalogSnapshotSchema, type CatalogSnapshot } from './catalog-schema';

const HASH = 'a'.repeat(64);

function createSnapshot(overrides: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    schema: 'question-catalog.v1',
    certificationCode: 'JSTQB-FL',
    syllabusVersion: '2023V4.0.J02',
    channel: 'public',
    revision: 1,
    etag: HASH,
    generatedAt: '2026-08-12T01:00:00+09:00',
    fullSnapshot: true,
    questions: [{
      id: 'jfl-2023-0001',
      versionId: 'jfl-2023-0001-v1',
      versionNumber: 1,
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
      prompt: 'この状況で最も適切な対応はどれですか。',
      explanation: 'テスト目的と作業成果物の関係から判断します。',
      sourceReference: 'JSTQB FL 2023V4.0.J02 1.1節 / FL-1.1.1',
      contentHash: HASH,
      choices: [
        {
          id: 'jfl-2023-0001-A',
          label: 'A',
          body: '適切な選択肢',
          explanation: '目的に合致します。',
          isCorrect: true,
        },
        {
          id: 'jfl-2023-0001-B',
          label: 'B',
          body: '不適切な選択肢',
          explanation: '目的に合致しません。',
          isCorrect: false,
        },
      ],
      correctChoiceIds: ['jfl-2023-0001-A'],
    }],
    removedVersionIds: [],
    ...overrides,
  };
}

describe('catalogSnapshotSchema', () => {
  it('正答集合と選択数が整合した完全スナップショットを受理する', () => {
    expect(catalogSnapshotSchema.parse(createSnapshot()).revision).toBe(1);
  });

  it('公開channelへのreviewing問題の混入を拒否する', () => {
    const snapshot = createSnapshot();
    const reviewingQuestion = { ...snapshot.questions[0]!, status: 'reviewing' as const };
    expect(() => catalogSnapshotSchema.parse({
      ...snapshot,
      questions: [reviewingQuestion],
    })).toThrow(/公開カタログ/);
  });

  it('正答集合とisCorrectの不一致を拒否する', () => {
    const snapshot = createSnapshot();
    const invalidQuestion = {
      ...snapshot.questions[0]!,
      correctChoiceIds: ['jfl-2023-0001-B'],
    };
    expect(() => catalogSnapshotSchema.parse({
      ...snapshot,
      questions: [invalidQuestion],
    })).toThrow(/正答集合/);
  });

  it('複数選択の必要選択数と正答数の一致を検証する', () => {
    const snapshot = createSnapshot();
    const choices = snapshot.questions[0]!.choices.map((choice) => ({
      ...choice,
      isCorrect: true,
    }));
    const multipleQuestion = {
      ...snapshot.questions[0]!,
      selectionType: 'multiple' as const,
      requiredChoiceCount: 2,
      choices,
      correctChoiceIds: choices.map((choice) => choice.id),
    };
    expect(catalogSnapshotSchema.parse({
      ...snapshot,
      questions: [multipleQuestion],
    }).questions[0]!.requiredChoiceCount).toBe(2);
  });

  it('完全スナップショットのtombstoneと未知フィールドを拒否する', () => {
    expect(() => catalogSnapshotSchema.parse({
      ...createSnapshot(),
      removedVersionIds: ['jfl-2023-0000-v1'],
    })).toThrow(/完全スナップショット/);
    expect(() => catalogSnapshotSchema.parse({
      ...createSnapshot(),
      createdBy: '漏えいしてはいけない値',
    })).toThrow();
  });
});
