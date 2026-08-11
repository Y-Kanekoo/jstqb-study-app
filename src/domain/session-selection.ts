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
  const chapterNumbers = [1, 2, 3, 4, 5, 6] as const;
  const kLevels = [1, 2, 3] as const;
  const capacities = chapterNumbers.map((chapterNumber) => kLevels.map((kLevel) => allQuestions.filter(
    (question) => question.chapterNumber === chapterNumber && question.kLevel === kLevel,
  ).length));
  const allocations: number[][] = [];

  function allocateChapter(index: number, remainingK: number[]): boolean {
    if (index === chapterNumbers.length) return remainingK.every((count) => count === 0);
    const chapterNumber = chapterNumbers[index];
    if (chapterNumber === undefined) return false;
    const required = examConfig.chapterQuestionCounts[chapterNumber];
    const capacity = capacities[index] ?? [0, 0, 0];
    for (let k1 = 0; k1 <= Math.min(required, capacity[0] ?? 0, remainingK[0] ?? 0); k1 += 1) {
      for (let k2 = 0; k2 <= Math.min(required - k1, capacity[1] ?? 0, remainingK[1] ?? 0); k2 += 1) {
        const k3 = required - k1 - k2;
        if (k3 < 0 || k3 > (capacity[2] ?? 0) || k3 > (remainingK[2] ?? 0)) continue;
        allocations[index] = [k1, k2, k3];
        if (allocateChapter(index + 1, [
          (remainingK[0] ?? 0) - k1,
          (remainingK[1] ?? 0) - k2,
          (remainingK[2] ?? 0) - k3,
        ])) return true;
      }
    }
    allocations[index] = [];
    return false;
  }

  const hasAllocation = allocateChapter(0, [
    examConfig.kLevelQuestionCounts[1],
    examConfig.kLevelQuestionCounts[2],
    examConfig.kLevelQuestionCounts[3],
  ]);
  if (!hasAllocation) return [];

  const selected = chapterNumbers.flatMap((chapterNumber, chapterIndex) => kLevels.flatMap((kLevel, kIndex) => shuffle(
    allQuestions.filter((question) => question.chapterNumber === chapterNumber && question.kLevel === kLevel),
    random,
  ).slice(0, allocations[chapterIndex]?.[kIndex] ?? 0).map((question) => question.id)));
  return selected.length === examConfig.questionCount ? shuffle(selected, random) : [];
}
