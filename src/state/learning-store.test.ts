import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getQuestion } from '@/content/questions';
import type { LearningSession, LearningSnapshot } from '@/domain/types';
import { setStoredValue } from '@/storage/persistence';

import { useLearningStore } from './learning-store';

vi.mock('@/storage/persistence', () => ({
  getStoredValue: vi.fn(),
  setStoredValue: vi.fn(),
}));

vi.mock('expo-crypto', () => {
  let nextId = 0;
  return { randomUUID: () => `test-id-${++nextId}` };
});

const session: LearningSession = {
  id: 'session-1',
  mode: 'random',
  title: '確認用セッション',
  questionIds: ['fl-001'],
  currentIndex: 0,
  answeredQuestionIds: [],
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const questionId = 'fl-001';
const question = getQuestion(questionId);
if (!question) throw new Error('テスト用の問題がありません。');
const choiceId = question.choices[0]?.id;
if (!choiceId) throw new Error('テスト用の選択肢がありません。');

beforeEach(() => {
  vi.mocked(setStoredValue).mockReset();
  useLearningStore.setState({
    schemaVersion: 1,
    sessions: [session],
    drafts: {
      [`${session.id}:${questionId}`]: {
        sessionId: session.id,
        questionId,
        selectedChoiceIds: [choiceId],
        updatedAt: session.updatedAt,
      },
    },
    attempts: [],
    questionStates: {},
    bookmarks: [],
    outbox: [],
    syncCursor: 0,
    dailyGoal: 10,
    hydrated: true,
    saving: false,
    storageError: null,
  });
});

describe('回答保存の失敗', () => {
  it('楽観更新を戻し、失敗後の再試行で回答を保存できる', async () => {
    const write = vi.mocked(setStoredValue);
    write.mockRejectedValueOnce(new Error('端末の保存に失敗しました。'));
    write.mockResolvedValue(undefined);

    await expect(useLearningStore.getState().submitAnswer(session.id, questionId))
      .rejects.toThrow('端末の保存に失敗しました。');

    const failedState = useLearningStore.getState();
    expect(failedState.attempts).toEqual([]);
    expect(failedState.questionStates).toEqual({});
    expect(failedState.sessions).toEqual([session]);
    expect(failedState.outbox).toEqual([]);
    expect(failedState.saving).toBe(false);
    expect(failedState.storageError).toBe('端末の保存に失敗しました。');
    expect(write).toHaveBeenCalledTimes(2);
    const rollbackSnapshot = JSON.parse(write.mock.calls[1]?.[1] ?? '{}') as LearningSnapshot;
    expect(rollbackSnapshot.attempts).toEqual([]);
    expect(rollbackSnapshot.outbox).toEqual([]);

    await useLearningStore.getState().submitAnswer(session.id, questionId);

    const retriedState = useLearningStore.getState();
    expect(retriedState.attempts).toHaveLength(1);
    expect(retriedState.sessions[0]?.answeredQuestionIds).toEqual([questionId]);
    expect(retriedState.outbox).toHaveLength(1);
    expect(retriedState.storageError).toBeNull();
    expect(write).toHaveBeenCalledTimes(3);
  });
});
