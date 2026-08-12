import { getQuestion } from '@/content/questions';

import type { LearningSession, SessionQuestionSnapshot } from './types';

export function getSessionQuestion(session: LearningSession, questionId: string): SessionQuestionSnapshot | undefined {
  const questionIndex = session.questionIds.indexOf(questionId);
  if (questionIndex < 0) return undefined;

  const snapshot = session.questionSnapshots?.[questionIndex];
  const pinnedVersionId = session.questionVersionIds?.[questionIndex];
  if (snapshot && snapshot.id === questionId && (!pinnedVersionId || snapshot.versionId === pinnedVersionId)) {
    return snapshot;
  }

  // セッションsnapshotのない問題へcatalogをfallbackすると正答キーを露出するため、表示を停止する。
  return undefined;
}

export function createQuestionSnapshots(questionIds: string[]): SessionQuestionSnapshot[] {
  const snapshots: SessionQuestionSnapshot[] = [];
  for (const questionId of questionIds) {
    const question = getQuestion(questionId);
    if (!question) return [];
    snapshots.push({
      ...question,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        body: choice.body,
      })),
    });
  }
  return snapshots;
}
