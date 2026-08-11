import { describe, expect, it } from 'vitest';

import type { LearningSnapshot } from './types';
import { parseLearningBackup, parseLearningSnapshot, serializeAttemptsCsv, serializeLearningBackup } from './backup';

const emptySnapshot: LearningSnapshot = {
  schemaVersion: 2,
  sessions: [],
  drafts: {},
  attempts: [],
  questionStates: {},
  bookmarks: [],
  notes: {},
  issues: [],
  outbox: [],
  syncCursor: 0,
  dailyGoal: 10,
};

describe('学習バックアップ', () => {
  it('JSONへ出力したデータを同じ状態へ復元できる', () => {
    const text = serializeLearningBackup(emptySnapshot, '2026-08-12T00:00:00.000Z');
    const backup = parseLearningBackup(text);

    expect(backup?.snapshot).toEqual(emptySnapshot);
  });

  it('旧schemaを不足値の既定値付きで読み込める', () => {
    const snapshot = parseLearningSnapshot({
      schemaVersion: 1,
      sessions: [{
        id: 'session-1',
        mode: 'random',
        title: '演習',
        questionIds: ['question-1'],
        currentIndex: 0,
        answeredQuestionIds: [],
        status: 'active',
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      }],
      drafts: {},
      attempts: [],
      questionStates: {},
      bookmarks: [],
      outbox: [],
      dailyGoal: 10,
    });

    expect(snapshot?.schemaVersion).toBe(2);
    expect(snapshot?.sessions[0]?.reviewQuestionIds).toEqual([]);
    expect(snapshot?.notes).toEqual({});
  });

  it('壊れたバックアップを拒否する', () => {
    expect(parseLearningBackup('{"format":"unknown"}')).toBeNull();
    expect(parseLearningBackup('{')).toBeNull();
  });

  it('回答履歴をExcel互換のCSVへ出力する', () => {
    const csv = serializeAttemptsCsv({
      ...emptySnapshot,
      attempts: [{
        id: 'attempt-1',
        sessionId: 'session-1',
        questionId: 'question-1',
        questionVersionId: 'question-1-v1',
        selectedChoiceIds: ['choice-A'],
        isCorrect: true,
        answeredAt: '2026-08-12T00:00:00.000Z',
      }],
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"question-1-v1"');
    expect(csv).toContain('"正解"');
  });
});
