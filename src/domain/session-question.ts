import { getQuestion } from '@/content/questions';

import type { LearningSession, PreAnswerQuestionSnapshot, Question } from './types';

export function getSessionQuestion(session: LearningSession, questionId: string): PreAnswerQuestionSnapshot | undefined {
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

function toPreAnswerQuestionSnapshot(question: Question): PreAnswerQuestionSnapshot {
  const snapshot: PreAnswerQuestionSnapshot = {
    id: question.id,
    versionId: question.versionId,
    chapterNumber: question.chapterNumber,
    chapterTitle: question.chapterTitle,
    objectiveCode: question.objectiveCode,
    prompt: question.prompt,
    difficulty: question.difficulty,
    sourceReference: question.sourceReference,
    choices: question.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      body: choice.body,
    })),
  };
  if (question.kLevel !== undefined) snapshot.kLevel = question.kLevel;
  if (question.selectionType !== undefined) snapshot.selectionType = question.selectionType;
  if (question.requiredChoiceCount !== undefined) snapshot.requiredChoiceCount = question.requiredChoiceCount;
  return snapshot;
}

export function createQuestionSnapshots(questionIds: string[]): PreAnswerQuestionSnapshot[] {
  const snapshots: PreAnswerQuestionSnapshot[] = [];
  for (const questionId of questionIds) {
    const question = getQuestion(questionId);
    if (!question) return [];
    snapshots.push(toPreAnswerQuestionSnapshot(question));
  }
  return snapshots;
}
