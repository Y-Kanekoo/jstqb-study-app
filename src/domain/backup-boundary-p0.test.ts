import { describe, expect, it } from 'vitest';

import type { LearningSnapshot, PreAnswerQuestionSnapshot } from './types';
import { parseLearningBackup, parseLearningSnapshot, serializeLearningBackup } from './backup';

function createSnapshot(): LearningSnapshot {
  return {
    schemaVersion: 2,
    sessions: [],
    drafts: {},
    attempts: [],
    questionStates: {},
    bookmarks: [],
    notes: {},
    issues: [],
    outbox: [],
    syncCursor: 0,
    dailyGoal: 10,
  };
}

function createLegacySnapshot() {
  return {
    schemaVersion: 1,
    sessions: [{
      id: 'session-legacy',
      mode: 'random',
      title: '旧形式の演習',
      questionIds: ['question-legacy'],
      questionVersionIds: ['question-legacy-v1'],
      questionSnapshots: [{
        id: 'question-legacy',
        versionId: 'question-legacy-v1',
        chapterNumber: 1,
        chapterTitle: '第1章',
        objectiveCode: 'FL-1.1',
        prompt: '問題文',
        explanation: '正答を推測できる旧解説',
        correctChoiceIds: ['choice-a'],
        difficulty: 1,
        sourceReference: 'FL',
        choices: [
          { id: 'choice-a', label: 'A', body: '選択肢A', explanation: '正答の解説', isCorrect: true },
          { id: 'choice-b', label: 'B', body: '選択肢B', explanation: '誤答の解説', isCorrect: false },
        ],
      }],
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    }],
    drafts: {},
    attempts: [],
    questionStates: {},
    bookmarks: [],
    outbox: [],
    dailyGoal: 10,
  };
}

describe('回答前snapshotのbackup境界', () => {
  it('旧schemaのactive snapshotから解説・正答属性をmigrationで破棄する', () => {
    const migrated = parseLearningSnapshot(createLegacySnapshot());
    const question = migrated?.sessions[0]?.questionSnapshots?.[0];

    expect(question).toBeDefined();
    if (!question) return;
    expect(migrated?.schemaVersion).toBe(2);
    expect(Object.hasOwn(question, 'explanation')).toBe(false);
    expect(Object.hasOwn(question, 'correctChoiceIds')).toBe(false);
    expect(question.choices).toEqual([
      { id: 'choice-a', label: 'A', body: '選択肢A' },
      { id: 'choice-b', label: 'B', body: '選択肢B' },
    ]);
    expect(question.choices.every((choice) => !Object.hasOwn(choice, 'isCorrect'))).toBe(true);
  });

  it('旧schema backupのmigration後も秘密フィールドを再保存しない', () => {
    const backup = parseLearningBackup(JSON.stringify({
      format: 'jstqb-learning-backup',
      formatVersion: 1,
      exportedAt: '2026-08-12T00:00:00.000Z',
      snapshot: createLegacySnapshot(),
    }));

    expect(backup).not.toBeNull();
    expect(JSON.stringify(backup)).not.toContain('正答を推測できる旧解説');
    expect(JSON.stringify(backup)).not.toContain('isCorrect');
  });

  it('runtimeで混入した秘密フィールドもbackup JSONへ出力しない', () => {
    const safeQuestion: PreAnswerQuestionSnapshot = {
      id: 'question-runtime',
      versionId: 'question-runtime-v1',
      chapterNumber: 1,
      chapterTitle: '第1章',
      objectiveCode: 'FL-1.1',
      prompt: '問題文',
      difficulty: 1,
      sourceReference: 'FL',
      choices: [{ id: 'choice-a', label: 'A', body: '選択肢A' }],
    };
    const unsafeSnapshot = {
      ...createSnapshot(),
      sessions: [{
        id: 'session-runtime',
        mode: 'random',
        title: 'runtime混入',
        questionIds: [safeQuestion.id],
        questionVersionIds: [safeQuestion.versionId],
        questionSnapshots: [{
          ...safeQuestion,
          explanation: 'runtime秘密解説',
          correctChoiceIds: ['choice-a'],
          choices: [{ ...safeQuestion.choices[0], explanation: 'runtime選択肢解説', isCorrect: true }],
        }],
        currentIndex: 0,
        answeredQuestionIds: [],
        status: 'active',
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      }],
    } as unknown as LearningSnapshot;

    const serialized = serializeLearningBackup(unsafeSnapshot, '2026-08-12T00:00:00.000Z');

    expect(serialized).not.toContain('runtime秘密解説');
    expect(serialized).not.toContain('runtime選択肢解説');
    expect(serialized).not.toContain('correctChoiceIds');
    expect(serialized).not.toContain('isCorrect');
  });
});
