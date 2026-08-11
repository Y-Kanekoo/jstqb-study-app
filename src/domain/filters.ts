import { isUnresolvedWrong } from './learning';
import type { AnswerAttempt, UserQuestionState, WrongFilter } from './types';

const recentDays: Partial<Record<WrongFilter, number>> = {
  'last-7-days': 7,
  'last-30-days': 30,
  'last-90-days': 90,
};

export function filterWrongQuestionIds(
  states: Record<string, UserQuestionState>,
  attempts: AnswerAttempt[],
  filter: WrongFilter,
  nowIso: string,
): string[] {
  const allStates = Object.values(states);

  if (filter === 'unresolved') {
    return allStates.filter(isUnresolvedWrong).map((state) => state.questionId);
  }
  if (filter === 'latest-wrong') {
    return allStates.filter((state) => state.latestOutcome === 'wrong').map((state) => state.questionId);
  }
  if (filter === 'ever') {
    return allStates.filter((state) => state.wrongEver).map((state) => state.questionId);
  }
  if (filter === 'recovered') {
    return allStates.filter((state) => state.recoveredAt !== null).map((state) => state.questionId);
  }

  const days = recentDays[filter];
  if (days === undefined) {
    return [];
  }
  const threshold = new Date(nowIso);
  threshold.setUTCDate(threshold.getUTCDate() - days);
  const thresholdIso = threshold.toISOString();
  return [...new Set(
    attempts
      .filter((attempt) => !attempt.isCorrect && attempt.answeredAt >= thresholdIso)
      .map((attempt) => attempt.questionId),
  )];
}
