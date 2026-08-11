import { examConfig } from '@/config/exam';

import type { Question, UserQuestionState } from './types';

export type PracticeStrategy = 'random' | 'unanswered' | 'weak';

interface PracticeSelectionOptions {
  count: 10 | 20 | 30 | 40;
  chapterNumber: number | null;
  strategy: PracticeStrategy;
}

type RandomSource = () => number;

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const current = result[index];
    const replacement = result[target];
    if (current !== undefined && replacement !== undefined) {
      result[index] = replacement;
      result[target] = current;
    }
  }
  return result;
}

function weaknessScore(questionId: string, states: Record<string, UserQuestionState>): number {
  const state = states[questionId];
  if (!state) return 2;
  if (state.latestOutcome === 'wrong' && state.recoveredAt === null) return 0;
  if (state.attemptCount === 0) return 2;
  return 1 + state.correctCount / state.attemptCount;
}

export function selectPracticeQuestionIds(
  allQuestions: Question[],
  states: Record<string, UserQuestionState>,
  options: PracticeSelectionOptions,
  random: RandomSource = Math.random,
): string[] {
  const inRange = options.chapterNumber === null
    ? allQuestions
    : allQuestions.filter((question) => question.chapterNumber === options.chapterNumber);

  if (options.strategy === 'unanswered') {
    return shuffle(inRange.filter((question) => !states[question.id]), random)
      .slice(0, options.count)
      .map((question) => question.id);
  }
  if (options.strategy === 'weak') {
    return shuffle(inRange, random)
      .sort((left, right) => weaknessScore(left.id, states) - weaknessScore(right.id, states))
      .slice(0, options.count)
      .map((question) => question.id);
  }
  return shuffle(inRange, random).slice(0, options.count).map((question) => question.id);
}

export function selectExamQuestionIds(allQuestions: Question[], random: RandomSource = Math.random): string[] {
  const selected = Object.entries(examConfig.chapterQuestionCounts).flatMap(([chapter, count]) => {
    const chapterNumber = Number(chapter);
    return shuffle(allQuestions.filter((question) => question.chapterNumber === chapterNumber), random)
      .slice(0, count)
      .map((question) => question.id);
  });
  return selected.length === examConfig.questionCount ? shuffle(selected, random) : [];
}
