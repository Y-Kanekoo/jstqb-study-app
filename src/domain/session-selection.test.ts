import { describe, expect, it } from 'vitest';

import type { Question, UserQuestionState } from './types';
import { getPracticeCandidates, sectionCodeFor, selectExamQuestionIds, selectPracticeQuestionIds } from './session-selection';

function createQuestion(id: string, chapterNumber: number, kLevel: 1 | 2 | 3 = 1): Question {
  return {
    id,
    versionId: `${id}-v1`,
    chapterNumber,
    chapterTitle: `第${chapterNumber}章`,
    objectiveCode: `FL-${chapterNumber}.1.1`,
    kLevel,
    prompt: '問題文',
    explanation: '解説',
    difficulty: 1,
    sourceReference: '参照',
    choices: [],
  };
}

function createState(questionId: string, correctCount: number, attemptCount: number): UserQuestionState {
  return {
    questionId,
    wrongEver: correctCount < attemptCount,
    latestOutcome: correctCount < attemptCount ? 'wrong' : 'correct',
    consecutiveCorrectAfterWrong: 0,
    recoveredAt: null,
    reviewStage: 0,
    nextReviewAt: null,
    firstAttemptAt: '2026-08-12T00:00:00.000Z',
    lastAttemptAt: '2026-08-12T00:00:00.000Z',
    lastAttemptSessionId: 'session-1',
    attemptCount,
    correctCount,
  };
}

describe('出題選択', () => {
  const random = () => 0.5;
  const questions = Array.from({ length: 50 }, (_, index) => createQuestion(`q-${index + 1}`, (index % 6) + 1));

  it('未回答だけから指定数を重複なしで選ぶ', () => {
    const states = { 'q-1': createState('q-1', 1, 1) };
    const selected = selectPracticeQuestionIds(questions, states, {
      count: 10,
      chapterNumber: null,
      strategy: 'unanswered',
    }, random);

    expect(selected).toHaveLength(10);
    expect(selected).not.toContain('q-1');
    expect(new Set(selected).size).toBe(10);
  });

  it('弱点優先では誤答中の問題を先に含める', () => {
    const states = {
      'q-1': createState('q-1', 0, 1),
      'q-2': createState('q-2', 1, 1),
    };
    const selected = selectPracticeQuestionIds(questions, states, {
      count: 10,
      chapterNumber: null,
      strategy: 'weak',
    }, random);

    expect(selected).toContain('q-1');
  });

  it('章、節、学習目標を正確に絞り、選択後に範囲外へ漏れない', () => {
    const catalog = [
      createQuestion('a', 1),
      { ...createQuestion('b', 1), objectiveCode: 'FL-1.1.2' },
      { ...createQuestion('c', 1), objectiveCode: 'FL-1.2.1' },
      { ...createQuestion('d', 2), objectiveCode: 'FL-2.1.1' },
    ];
    const options = { count: 10 as const, chapterNumber: 1, sectionCode: 'FL-1.1', objectiveCode: 'FL-1.1.2', strategy: 'random' as const };
    expect(getPracticeCandidates(catalog, {}, options).map((item) => item.id)).toEqual(['b']);
    expect(selectPracticeQuestionIds(catalog, {}, options, random)).toEqual(['b']);
    expect(sectionCodeFor({ ...catalog[0]!, objectiveCode: 'FL-2.1.1' })).toBeNull();
  });

  it('ブックマークと未回答の積集合だけを選び、候補不足でも水増ししない', () => {
    const catalog = [createQuestion('a', 1), createQuestion('b', 1), createQuestion('c', 1), createQuestion('b', 1)];
    const options = { count: 20 as const, chapterNumber: null, pool: 'bookmarked' as const, bookmarkedQuestionIds: ['a', 'b', 'missing'], strategy: 'unanswered' as const };
    const states = { a: createState('a', 1, 1) };
    expect(getPracticeCandidates(catalog, states, options).map((item) => item.id)).toEqual(['b']);
    expect(selectPracticeQuestionIds(catalog, states, options, random)).toEqual(['b']);
  });

  it('復習期限の同時刻を含み、未来・未回答・日時未指定を除外する', () => {
    const catalog = [createQuestion('due', 1), createQuestion('future', 1), createQuestion('unanswered', 1)];
    const states = {
      due: { ...createState('due', 1, 1), nextReviewAt: '2026-10-29T10:00:00.000Z' },
      future: { ...createState('future', 1, 1), nextReviewAt: '2026-10-29T10:00:00.001Z' },
    };
    const options = { count: 10 as const, chapterNumber: null, pool: 'review-due' as const, strategy: 'random' as const, nowIso: '2026-10-29T10:00:00.000Z' };
    expect(selectPracticeQuestionIds(catalog, states, options, random)).toEqual(['due']);
    expect(selectPracticeQuestionIds(catalog, states, { count: 10, chapterNumber: null, pool: 'review-due', strategy: 'random' }, random)).toEqual([]);
  });

  it('模試は章構成を満たす40問が揃った場合だけ作る', () => {
    const chapterCounts = [8, 6, 4, 11, 9, 2];
    let generatedCount = 0;
    const examQuestions = chapterCounts.flatMap((count, chapterIndex) => Array.from(
      { length: count },
      (_, index) => {
        generatedCount += 1;
        const kLevel = generatedCount <= 8 ? 1 : generatedCount <= 32 ? 2 : 3;
        return createQuestion(`chapter-${chapterIndex + 1}-${index + 1}`, chapterIndex + 1, kLevel);
      },
    ));
    const selected = selectExamQuestionIds(examQuestions, random);

    expect(selected).toHaveLength(40);
    expect(new Set(selected).size).toBe(40);
    expect(selected.filter((id) => examQuestions.find((question) => question.id === id)?.kLevel === 1)).toHaveLength(8);
    expect(selected.filter((id) => examQuestions.find((question) => question.id === id)?.kLevel === 2)).toHaveLength(24);
    expect(selected.filter((id) => examQuestions.find((question) => question.id === id)?.kLevel === 3)).toHaveLength(8);
    expect(selectExamQuestionIds(examQuestions.slice(0, -1), random)).toEqual([]);
  });
});
