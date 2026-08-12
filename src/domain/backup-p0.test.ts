import { describe, expect, it } from 'vitest';

import type { LearningSnapshot } from './types';
import {
  parseLearningBackup,
  preparePortableRestore,
  serializeAttemptsCsv,
} from './backup';

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
    syncCursor: 91,
    dailyGoal: 10,
    syncMode: 'active',
  };
}

describe('P0バックアップ境界', () => {
  it('envelope形式でもsnapshotの完全性検証を通さないデータを拒否する', () => {
    const snapshot = createSnapshot();
    snapshot.sessions = [{
      id: 'session-1',
      mode: 'random',
      title: '演習',
      questionIds: ['question-1'],
      questionVersionIds: ['question-1-v1'],
      questionSnapshots: [],
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      reviewQuestionIds: [],
      durationMinutes: null,
      expiresAt: null,
      startedAt: '2026-08-12T00:00:00.000Z',
      submittedAt: null,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    }];
    const backup = JSON.stringify({
      format: 'jstqb-learning-backup',
      formatVersion: 1,
      exportedAt: '2026-08-12T00:00:00.000Z',
      snapshot,
    });

    expect(parseLearningBackup(backup)).toBeNull();
  });

  it('問題snapshotに正答情報を混入したバックアップを拒否する', () => {
    const snapshot = createSnapshot();
    const unsafeSnapshot: unknown = JSON.parse(JSON.stringify({
      ...snapshot,
      sessions: [{
      id: 'session-1',
      mode: 'random',
      title: '演習',
      questionIds: ['question-1'],
      questionVersionIds: ['question-1-v1'],
      questionSnapshots: [{
        id: 'question-1',
        versionId: 'question-1-v1',
        chapterNumber: 1,
        chapterTitle: '第1章',
        objectiveCode: 'P0.1',
        prompt: '問題',
        explanation: '解説',
        difficulty: 1,
        sourceReference: 'P0',
        choices: [{ id: 'choice-1', label: 'A', body: '選択肢', isCorrect: true }],
      }],
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
      }],
    }));

    expect(parseLearningBackup(JSON.stringify({
      format: 'jstqb-learning-backup',
      formatVersion: 1,
      exportedAt: '2026-08-12T00:00:00.000Z',
      snapshot: unsafeSnapshot,
    }))).toBeNull();
  });

  it('portable restoreはevent outboxとcursorを再利用せず業務IDだけ保持する', () => {
    const snapshot = createSnapshot();
    snapshot.sessions = [{
      id: 'session-business-id',
      mode: 'random',
      title: '復元演習',
      questionIds: ['question-1'],
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    }];
    snapshot.outbox = [{
      id: 'event-id',
      kind: 'session.created',
      entityId: 'session-business-id',
      occurredAt: '2026-08-12T00:00:00.000Z',
      payload: { sessionId: 'session-business-id', mode: 'random', title: '復元演習', questionIds: ['question-1'] },
    }];
    snapshot.attempts = [{
      id: 'attempt-business-id',
      sessionId: 'session-business-id',
      questionId: 'question-1',
      questionVersionId: 'question-1-v1',
      selectedChoiceIds: ['choice-1'],
      isCorrect: false,
      answeredAt: '2026-08-12T00:01:00.000Z',
    }];

    const restored = preparePortableRestore(snapshot);

    expect(restored.outbox).toEqual([]);
    expect(restored.syncCursor).toBe(0);
    expect(restored.syncMode).toBe('portable-local');
    expect(restored.sessions[0]?.id).toBe('session-business-id');
    expect(restored.attempts[0]?.id).toBe('attempt-business-id');
  });

  it('CSVの式注入先頭文字を文字列として保護する', () => {
    const csv = serializeAttemptsCsv({
      ...createSnapshot(),
      attempts: [{
        id: '=HYPERLINK("https://example.invalid")',
        sessionId: 'session-1',
        questionId: 'question-1',
        questionVersionId: 'question-1-v1',
        selectedChoiceIds: ['choice-1'],
        isCorrect: false,
        answeredAt: '2026-08-12T00:00:00.000Z',
      }],
    });

    expect(csv).toContain("'=HYPERLINK(\"\"https://example.invalid\"\")");
  });
});
