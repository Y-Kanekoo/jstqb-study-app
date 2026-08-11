import type {
  AnswerAttempt,
  LearningSession,
  Question,
  UserQuestionState,
} from './types';

const reviewIntervalsInDays = [1, 3, 7, 14, 30, 90] as const;

function normalizeChoiceIds(choiceIds: string[]): string[] {
  return [...new Set(choiceIds)].sort((left, right) => left.localeCompare(right));
}

export function scoreAnswer(question: Question, selectedChoiceIds: string[]): boolean {
  const correctChoiceIds = question.choices
    .filter((choice) => choice.isCorrect)
    .map((choice) => choice.id);

  return JSON.stringify(normalizeChoiceIds(correctChoiceIds)) === JSON.stringify(normalizeChoiceIds(selectedChoiceIds));
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function updateQuestionState(
  previous: UserQuestionState | undefined,
  attempt: AnswerAttempt,
): UserQuestionState {
  if (!previous) {
    const reviewStage = attempt.isCorrect ? 1 : 0;
    return {
      questionId: attempt.questionId,
      wrongEver: !attempt.isCorrect,
      latestOutcome: attempt.isCorrect ? 'correct' : 'wrong',
      consecutiveCorrectAfterWrong: 0,
      recoveredAt: null,
      reviewStage,
      nextReviewAt: addDays(attempt.answeredAt, reviewIntervalsInDays[reviewStage] ?? 90),
      firstAttemptAt: attempt.answeredAt,
      lastAttemptAt: attempt.answeredAt,
      lastAttemptSessionId: attempt.sessionId,
      attemptCount: 1,
      correctCount: attempt.isCorrect ? 1 : 0,
    };
  }

  const isSeparateSession = previous.lastAttemptSessionId !== attempt.sessionId;
  const nextCorrectStreak = attempt.isCorrect && previous.wrongEver && isSeparateSession
    ? Math.min(previous.consecutiveCorrectAfterWrong + 1, 2)
    : attempt.isCorrect
      ? previous.consecutiveCorrectAfterWrong
      : 0;
  const recovered = previous.wrongEver && attempt.isCorrect && nextCorrectStreak >= 2;
  const reviewStage = attempt.isCorrect
    ? Math.min(previous.reviewStage + 1, reviewIntervalsInDays.length - 1)
    : 0;

  return {
    ...previous,
    wrongEver: previous.wrongEver || !attempt.isCorrect,
    latestOutcome: attempt.isCorrect ? 'correct' : 'wrong',
    consecutiveCorrectAfterWrong: nextCorrectStreak,
    recoveredAt: recovered ? attempt.answeredAt : attempt.isCorrect ? previous.recoveredAt : null,
    reviewStage,
    nextReviewAt: addDays(attempt.answeredAt, reviewIntervalsInDays[reviewStage] ?? 90),
    lastAttemptAt: attempt.answeredAt,
    lastAttemptSessionId: attempt.sessionId,
    attemptCount: previous.attemptCount + 1,
    correctCount: previous.correctCount + (attempt.isCorrect ? 1 : 0),
  };
}

export function isUnresolvedWrong(state: UserQuestionState): boolean {
  return state.wrongEver && state.recoveredAt === null;
}

export function isReviewDue(state: UserQuestionState, nowIso: string): boolean {
  return state.nextReviewAt !== null && state.nextReviewAt <= nowIso;
}

export function advanceSession(session: LearningSession, questionId: string, nowIso: string): LearningSession {
  const answeredQuestionIds = session.answeredQuestionIds.includes(questionId)
    ? session.answeredQuestionIds
    : [...session.answeredQuestionIds, questionId];
  const isCompleted = answeredQuestionIds.length >= session.questionIds.length;

  return {
    ...session,
    answeredQuestionIds,
    currentIndex: isCompleted
      ? Math.max(session.questionIds.length - 1, 0)
      : Math.min(session.currentIndex + 1, session.questionIds.length - 1),
    status: isCompleted ? 'completed' : 'active',
    updatedAt: nowIso,
  };
}
