import type { PreAnswerQuestionSnapshot } from './types';

export function clonePreAnswerQuestionSnapshot(question: PreAnswerQuestionSnapshot): PreAnswerQuestionSnapshot {
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
