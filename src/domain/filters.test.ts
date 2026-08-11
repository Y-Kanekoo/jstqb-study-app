import { describe, expect, it } from 'vitest';

import { filterWrongQuestionIds } from './filters';
import type { AnswerAttempt, UserQuestionState } from './types';

const baseState: UserQuestionState = {
  questionId: 'q1',
  wrongEver: true,
  latestOutcome: 'correct',
  consecutiveCorrectAfterWrong: 1,
  recoveredAt: null,
  reviewStage: 1,
  nextReviewAt: '2026-08-02T00:00:00.000Z',
  firstAttemptAt: '2026-08-01T00:00:00.000Z',
  lastAttemptAt: '2026-08-10T00:00:00.000Z',
  lastAttemptSessionId: 's2',
  attemptCount: 2,
  correctCount: 1,
};

const attempt: AnswerAttempt = {
  id: 'a1', sessionId: 's1', questionId: 'q1', questionVersionId: 'q1-v1',
  selectedChoiceIds: ['b'], isCorrect: false, answeredAt: '2026-08-01T00:00:00.000Z',
};

describe('誤答フィルター', () => {
  it('未克服と克服済みを区別する', () => {
    expect(filterWrongQuestionIds({ q1: baseState }, [attempt], 'unresolved', '2026-08-11T00:00:00.000Z')).toEqual(['q1']);
    expect(filterWrongQuestionIds({ q1: { ...baseState, recoveredAt: '2026-08-10T00:00:00.000Z' } }, [attempt], 'recovered', '2026-08-11T00:00:00.000Z')).toEqual(['q1']);
  });

  it('指定期間内の誤答履歴から抽出する', () => {
    expect(filterWrongQuestionIds({ q1: baseState }, [attempt], 'last-7-days', '2026-08-11T00:00:00.000Z')).toEqual([]);
    expect(filterWrongQuestionIds({ q1: baseState }, [attempt], 'last-30-days', '2026-08-11T00:00:00.000Z')).toEqual(['q1']);
  });
});
