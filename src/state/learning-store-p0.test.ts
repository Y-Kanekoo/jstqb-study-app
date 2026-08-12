import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxEvent, RemoteSyncEvent, SessionQuestionSnapshot } from '@/domain/types';
import { getCurrentLearningSnapshot, useLearningStore } from './learning-store';

const mocks = vi.hoisted(() => ({
  ingestLearningEvents: vi.fn(),
  fetchLearningEventsAfter: vi.fn(),
  uuidCounter: { value: 0 },
}));
const storedValues = new Map<string, string>();

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: async (key: string): Promise<string | null> => storedValues.get(key) ?? null,
  setStoredValue: async (key: string, value: string): Promise<void> => {
    storedValues.set(key, value);
  },
}));
vi.mock('@/services/learning-sync-api', () => ({
  ingestLearningEvents: mocks.ingestLearningEvents,
  fetchLearningEventsAfter: mocks.fetchLearningEventsAfter,
}));
vi.mock('@/domain/session-question', () => ({
  createQuestionSnapshots: (questionIds: string[]): SessionQuestionSnapshot[] => questionIds.map((id) => ({
    id,
    versionId: `${id}-v1`,
    chapterNumber: 1,
    chapterTitle: '第1章',
    objectiveCode: 'P0.1',
    prompt: `問題 ${id}`,
    explanation: 'サーバー確定後に表示する解説',
    difficulty: 1,
    sourceReference: 'P0',
    selectionType: 'single',
    requiredChoiceCount: 1,
    choices: [
      { id: `${id}-a`, label: 'A', body: '選択肢A' },
      { id: `${id}-b`, label: 'B', body: '選択肢B' },
    ],
  })),
  getSessionQuestion: (session: { questionIds: string[]; questionSnapshots?: SessionQuestionSnapshot[] }, questionId: string): SessionQuestionSnapshot | undefined => {
    const index = session.questionIds.indexOf(questionId);
    return session.questionSnapshots?.[index];
  },
}));

function canonicalSessionEvent(event: OutboxEvent): RemoteSyncEvent {
  const questionIds = event.payload.questionIds;
  if (!Array.isArray(questionIds) || !questionIds.every((id): id is string => typeof id === 'string')) {
    throw new Error('テストイベントの問題IDが不正です。');
  }
  return {
    sequence: 100,
    id: event.id,
    kind: 'session.created',
    entityId: event.entityId,
    occurredAt: '2026-08-12T00:00:01.000Z',
    payload: {
      ...event.payload,
      createdAt: '2026-08-12T00:00:01.000Z',
      startedAt: '2026-08-12T00:00:01.000Z',
      durationMinutes: 60,
      expiresAt: '2026-08-12T01:00:01.000Z',
      questionVersionIds: questionIds.map((id) => `${id}-v1`),
    },
  };
}

describe('P0学習ストアのserver-authoritative境界', () => {
  beforeEach(async () => {
    storedValues.clear();
    mocks.ingestLearningEvents.mockReset();
    mocks.fetchLearningEventsAfter.mockReset();
    mocks.uuidCounter.value = 0;
    await useLearningStore.getState().initialize('p0-user');
  });

  it('模試canonical適用で同一sessionを二重化せずローカルsnapshotを保持する', async () => {
    mocks.ingestLearningEvents.mockImplementation(async (events: OutboxEvent[]) => [canonicalSessionEvent(events[0] as OutboxEvent)]);
    const questionIds = Array.from({ length: 40 }, (_, index) => `exam-${index + 1}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const session = useLearningStore.getState().sessions.find((item) => item.id === sessionId);

    expect(useLearningStore.getState().sessions).toHaveLength(1);
    expect(session?.questionSnapshots).toHaveLength(40);
    expect(session?.questionSnapshots?.[0]?.prompt).toBe('問題 exam-1');
    expect(session?.questionVersionIds?.[0]).toBe('exam-1-v1');
    expect(useLearningStore.getState().syncCursor).toBe(100);
  });

  it('通常回答はoffline時にattemptを作らず、canonical採点後だけfeedbackを作る', async () => {
    await useLearningStore.getState().startSession('random', '通常演習', ['fl-001']);
    const session = useLearningStore.getState().sessions[0];
    const question = session?.questionSnapshots?.[0];
    if (!session || !question) throw new Error('テストセッションを作成できませんでした。');
    await useLearningStore.getState().selectChoice(session.id, question.id, question.choices[0]?.id ?? '');

    mocks.ingestLearningEvents.mockRejectedValueOnce(new Error('offline'));
    await expect(useLearningStore.getState().submitAnswer(session.id, question.id)).rejects.toThrow('offline');
    expect(useLearningStore.getState().attempts).toHaveLength(0);
    expect(useLearningStore.getState().outbox.filter((event) => event.kind === 'answer.submitted')).toHaveLength(1);

    mocks.ingestLearningEvents.mockImplementationOnce(async (events: OutboxEvent[]) => [{
      sequence: 101,
      id: events[0]?.entityId ?? 'missing-attempt',
      kind: 'answer.submitted',
      entityId: events[0]?.entityId ?? 'missing-attempt',
      occurredAt: '2026-08-12T00:00:02.000Z',
      payload: {
        sessionId: session.id,
        questionId: question.id,
        questionVersionId: question.versionId,
        selectedChoiceIds: [question.choices[0]?.id ?? ''],
        isCorrect: false,
        answeredAt: '2026-08-12T00:00:02.000Z',
      },
    }]);
    const result = await useLearningStore.getState().submitAnswer(session.id, question.id);

    expect(result.attempt.isCorrect).toBe(false);
    expect(useLearningStore.getState().attempts).toHaveLength(1);
    expect(getCurrentLearningSnapshot().outbox.some((event) => event.kind === 'answer.submitted')).toBe(false);
  });

  it('模試提出はcanonical answerとsession.submittedを適用してから完了する', async () => {
    mocks.ingestLearningEvents.mockImplementationOnce(async (events: OutboxEvent[]) => [canonicalSessionEvent(events[0] as OutboxEvent)]);
    const questionIds = Array.from({ length: 40 }, (_, index) => `exam-submit-${index + 1}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const session = useLearningStore.getState().sessions.find((item) => item.id === sessionId);
    const question = session?.questionSnapshots?.[0];
    if (!session || !question) throw new Error('模試セッションを作成できませんでした。');
    await useLearningStore.getState().selectChoice(session.id, question.id, question.choices[0]?.id ?? '');

    mocks.ingestLearningEvents.mockImplementationOnce(async (events: OutboxEvent[]) => [{
      sequence: 102,
      id: events[0]?.id ?? 'missing-event',
      kind: 'session.submitted',
      entityId: session.id,
      occurredAt: '2026-08-12T01:00:00.000Z',
      payload: {
        sessionId: session.id,
        submittedAt: '2026-08-12T01:00:00.000Z',
        answeredQuestionIds: [question.id],
        expired: false,
      },
    }]);
    mocks.fetchLearningEventsAfter.mockResolvedValueOnce([
      {
        sequence: 101,
        id: '00000000-0000-4000-8000-000000000301',
        kind: 'answer.submitted',
        entityId: '00000000-0000-4000-8000-000000000302',
        occurredAt: '2026-08-12T01:00:00.000Z',
        payload: {
          sessionId: session.id,
          questionId: question.id,
          questionVersionId: question.versionId,
          selectedChoiceIds: [question.choices[0]?.id ?? ''],
          isCorrect: true,
          answeredAt: '2026-08-12T01:00:00.000Z',
        },
      },
      {
        sequence: 102,
        id: '00000000-0000-4000-8000-000000000303',
        kind: 'session.submitted',
        entityId: session.id,
        occurredAt: '2026-08-12T01:00:00.000Z',
        payload: {
          sessionId: session.id,
          submittedAt: '2026-08-12T01:00:00.000Z',
          answeredQuestionIds: [question.id],
          expired: false,
        },
      },
    ]);

    const result = await useLearningStore.getState().submitExam(session.id);

    expect(result.correctCount).toBe(1);
    expect(useLearningStore.getState().sessions[0]?.status).toBe('completed');
    expect(useLearningStore.getState().attempts[0]?.isCorrect).toBe(true);
  });

  it('draft競合はkeep-localでrevisionをremote基準へ更新し再送を1回だけ許可する', async () => {
    await useLearningStore.getState().startSession('random', '競合演習', ['fl-001']);
    const session = useLearningStore.getState().sessions[0];
    const question = session?.questionSnapshots?.[0];
    if (!session || !question) throw new Error('テストセッションを作成できませんでした。');
    await useLearningStore.getState().selectChoice(session.id, question.id, question.choices[0]?.id ?? '');
    const originalEventId = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved' && event.entityId === `${session.id}:${question.id}`)?.id;
    const key = `${session.id}:${question.id}`;
    const remoteEvent: RemoteSyncEvent = {
      sequence: 200,
      id: '00000000-0000-4000-8000-000000000200',
      kind: 'draft.saved',
      entityId: key,
      occurredAt: '2026-08-12T00:00:03.000Z',
      payload: {
        sessionId: session.id,
        questionId: question.id,
        selectedChoiceIds: [question.choices[1]?.id ?? ''],
        questionVersionId: question.versionId,
        revision: 4,
        deviceId: 'other-device',
        updatedAt: '2026-08-12T00:00:03.000Z',
      },
    };
    await useLearningStore.getState().applyRemoteEvents([remoteEvent], 'pull');
    const conflict = useLearningStore.getState().conflicts?.[0];
    if (!conflict) throw new Error('競合が記録されませんでした。');
    await useLearningStore.getState().resolveConflict(conflict.id, 'keep-local');

    expect(useLearningStore.getState().conflicts).toEqual([]);
    expect(useLearningStore.getState().drafts[key]?.revision).toBe(4);
    const pending = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved' && event.entityId === key && !event.resolved);
    expect(pending?.blocked).not.toBe(true);
    expect(pending?.payload.expectedRevision).toBe(4);
    expect(pending?.id).not.toBe(originalEventId);
    expect(useLearningStore.getState().outbox.some((event) => event.kind === 'draft.saved' && event.entityId === key && event.resolved)).toBe(true);
  });

  it('offline模試提出は同じevent IDを再利用して接続回復後に確定できる', async () => {
    mocks.ingestLearningEvents.mockImplementationOnce(async (events: OutboxEvent[]) => [canonicalSessionEvent(events[0] as OutboxEvent)]);
    const questionIds = Array.from({ length: 40 }, (_, index) => `exam-retry-${index + 1}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const session = useLearningStore.getState().sessions.find((item) => item.id === sessionId);
    const question = session?.questionSnapshots?.[0];
    if (!session || !question) throw new Error('模試セッションを作成できませんでした。');
    await useLearningStore.getState().selectChoice(session.id, question.id, question.choices[0]?.id ?? '');

    mocks.ingestLearningEvents.mockRejectedValueOnce(new Error('offline'));
    await expect(useLearningStore.getState().submitExam(session.id)).rejects.toThrow('offline');
    const submittedEvent = useLearningStore.getState().outbox.find((event) => event.kind === 'session.submitted' && event.entityId === session.id);
    if (!submittedEvent) throw new Error('模試提出イベントが保存されませんでした。');

    mocks.ingestLearningEvents.mockResolvedValueOnce([{
      sequence: 103,
      id: submittedEvent.id,
      kind: 'session.submitted',
      entityId: session.id,
      occurredAt: '2026-08-12T01:00:00.000Z',
      payload: {
        sessionId: session.id,
        submittedAt: '2026-08-12T01:00:00.000Z',
        answeredQuestionIds: [question.id],
        expired: false,
      },
    }]);
    mocks.fetchLearningEventsAfter.mockResolvedValueOnce([
      {
        sequence: 104,
        id: '00000000-0000-4000-8000-000000000304',
        kind: 'answer.submitted',
        entityId: '00000000-0000-4000-8000-000000000305',
        occurredAt: '2026-08-12T01:00:00.000Z',
        payload: {
          sessionId: session.id,
          questionId: question.id,
          questionVersionId: question.versionId,
          selectedChoiceIds: [question.choices[0]?.id ?? ''],
          isCorrect: true,
          answeredAt: '2026-08-12T01:00:00.000Z',
        },
      },
      {
        sequence: 105,
        id: '00000000-0000-4000-8000-000000000306',
        kind: 'session.submitted',
        entityId: session.id,
        occurredAt: '2026-08-12T01:00:00.000Z',
        payload: {
          sessionId: session.id,
          submittedAt: '2026-08-12T01:00:00.000Z',
          answeredQuestionIds: [question.id],
          expired: false,
        },
      },
    ]);

    const result = await useLearningStore.getState().submitExam(session.id);

    expect(result.correctCount).toBe(1);
    expect(useLearningStore.getState().sessions[0]?.status).toBe('completed');
    const retryCall = mocks.ingestLearningEvents.mock.calls.at(-1)?.[0] as OutboxEvent[] | undefined;
    expect(retryCall?.[0]?.id).toBe(submittedEvent.id);
  });

  it('note競合のaccept-remoteは端末イベントを解決済みにして再送を止める', async () => {
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '端末のメモ');
    const remoteEvent: RemoteSyncEvent = {
      sequence: 201,
      id: '00000000-0000-4000-8000-000000000201',
      kind: 'note.saved',
      entityId: 'fl-001',
      occurredAt: '2026-08-12T00:00:04.000Z',
      payload: {
        questionId: 'fl-001',
        questionVersionId: 'fl-001-v1',
        body: 'サーバーのメモ',
        revision: 3,
        updatedAt: '2026-08-12T00:00:04.000Z',
      },
    };
    await useLearningStore.getState().applyRemoteEvents([remoteEvent], 'pull');
    const conflict = useLearningStore.getState().conflicts?.[0];
    if (!conflict) throw new Error('メモ競合が記録されませんでした。');
    await useLearningStore.getState().resolveConflict(conflict.id, 'accept-remote');

    expect(useLearningStore.getState().notes['fl-001']?.body).toBe('サーバーのメモ');
    expect(useLearningStore.getState().outbox.some((event) => event.kind === 'note.saved' && event.entityId === 'fl-001' && !event.resolved)).toBe(false);
  });
});
