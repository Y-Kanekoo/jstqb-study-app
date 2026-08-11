import { describe, expect, it } from 'vitest';

import { advanceSession, isReviewDue, isUnresolvedWrong, scoreAnswer, updateQuestionState } from './learning';
import type { AnswerAttempt, LearningSession, Question } from './types';

const question: Question = {
  id: 'q1',
  versionId: 'q1-v1',
  chapterNumber: 1,
  chapterTitle: 'テストの基礎',
  objectiveCode: 'FL-1.1.1',
  prompt: '正しい選択肢を選んでください。',
  explanation: '解説です。',
  difficulty: 1,
  sourceReference: 'JSTQB FL 1.1',
  choices: [
    { id: 'a', label: 'A', body: '正答', explanation: '', isCorrect: true },
    { id: 'b', label: 'B', body: '誤答', explanation: '', isCorrect: false },
  ],
};

function createAttempt(overrides: Partial<AnswerAttempt>): AnswerAttempt {
  return {
    id: 'attempt-1',
    sessionId: 'session-1',
    questionId: 'q1',
    questionVersionId: 'q1-v1',
    selectedChoiceIds: ['b'],
    isCorrect: false,
    answeredAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('学習ロジック', () => {
  it('選択順にかかわらず完全一致で採点する', () => {
    const multiQuestion: Question = {
      ...question,
      choices: [
        ...question.choices,
        { id: 'c', label: 'C', body: 'もう一つの正答', explanation: '', isCorrect: true },
      ],
    };
    expect(scoreAnswer(multiQuestion, ['c', 'a'])).toBe(true);
    expect(scoreAnswer(multiQuestion, ['a'])).toBe(false);
  });

  it('誤答後は別セッションで2回連続正解すると克服になる', () => {
    const wrong = updateQuestionState(undefined, createAttempt({}));
    const firstCorrect = updateQuestionState(wrong, createAttempt({
      id: 'attempt-2',
      sessionId: 'session-2',
      isCorrect: true,
      selectedChoiceIds: ['a'],
      answeredAt: '2026-08-02T00:00:00.000Z',
    }));
    const recovered = updateQuestionState(firstCorrect, createAttempt({
      id: 'attempt-3',
      sessionId: 'session-3',
      isCorrect: true,
      selectedChoiceIds: ['a'],
      answeredAt: '2026-08-03T00:00:00.000Z',
    }));

    expect(isUnresolvedWrong(firstCorrect)).toBe(true);
    expect(isUnresolvedWrong(recovered)).toBe(false);
    expect(recovered.recoveredAt).toBe('2026-08-03T00:00:00.000Z');
  });

  it('同一セッション内の正解は克服連続数へ加算しない', () => {
    const wrong = updateQuestionState(undefined, createAttempt({}));
    const correct = updateQuestionState(wrong, createAttempt({
      id: 'attempt-2',
      isCorrect: true,
      selectedChoiceIds: ['a'],
    }));
    expect(correct.consecutiveCorrectAfterWrong).toBe(0);
  });

  it('復習予定日を判定する', () => {
    const state = updateQuestionState(undefined, createAttempt({}));
    expect(isReviewDue(state, '2026-08-02T00:00:00.000Z')).toBe(true);
  });

  it('1問回答するたびにセッション位置を進める', () => {
    const session: LearningSession = {
      id: 'session-1',
      mode: 'random',
      title: 'ランダム10問',
      questionIds: ['q1', 'q2'],
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const next = advanceSession(session, 'q1', '2026-08-01T00:01:00.000Z');
    expect(next.currentIndex).toBe(1);
    expect(next.answeredQuestionIds).toEqual(['q1']);
  });
});
