import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getQuestion } from '@/content/questions';
import { scoreAnswer } from '@/domain/learning';
import type { LearningSnapshot, OutboxEvent } from '@/domain/types';
import { useLearningStore } from '@/state/learning-store';

import { runSync } from './learning-sync';

type RpcInput = { eventId: string; kind: OutboxEvent['kind']; entityId: string; occurredAt: string; payload: OutboxEvent['payload'] };
type ServerRow = { sequence: number; event_id: string; kind: OutboxEvent['kind']; entity_id: string;
  occurred_at: string; payload: OutboxEvent['payload'] };

const fixture = vi.hoisted(() => ({
  stored: null as string | null,
  userId: 'account-a',
  failAckOnce: false,
  loseReplyOnce: false,
  serverRows: [] as ServerRow[],
  received: [] as RpcInput[][],
  rpc: vi.fn(),
  from: vi.fn(),
  getStored: vi.fn(),
  compareAndSet: vi.fn(),
}));

vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: fixture.getStored,
  compareAndSetStoredValue: fixture.compareAndSet,
}));
vi.mock('@/state/auth-store', () => ({ useAuthStore: { getState: () => ({ session: { user: { id: fixture.userId } } }) } }));
vi.mock('./supabase', () => ({ supabase: { rpc: fixture.rpc, from: fixture.from } }));

function persisted(): LearningSnapshot {
  if (!fixture.stored) throw new Error('snapshot was not stored');
  return JSON.parse(fixture.stored) as LearningSnapshot;
}

function serverAccept(event: RpcInput): ServerRow {
  const existing = fixture.serverRows.find((row) => row.event_id === event.eventId);
  if (existing) return existing;
  const now = '2026-10-30T00:00:00.000Z';
  let payload = { ...event.payload };
  if (event.kind === 'session.created') {
    const questionIds = event.payload.questionIds;
    if (!Array.isArray(questionIds)) throw new Error('missing question ids');
    payload = { ...payload, createdAt: now, questionVersionIds: questionIds.map((id) => getQuestion(id)?.versionId ?? ''),
      durationMinutes: event.payload.mode === 'exam' ? 60 : null,
      expiresAt: event.payload.mode === 'exam' ? '2026-10-30T01:00:00.000Z' : null };
  }
  if (event.kind === 'draft.saved' || event.kind === 'note.saved') {
    const prior = fixture.serverRows.filter((row) => row.kind === event.kind && row.entity_id === event.entityId);
    if (event.payload.expectedRevision !== prior.length) throw new Error('REVISION_CONFLICT');
    payload = { ...payload, revision: prior.length + 1, updatedAt: now };
  }
  if (event.kind === 'answer.submitted') {
    payload = { ...payload, isCorrect: false, answeredAt: now };
  }
  if (event.kind === 'session.submitted') {
    const created = fixture.serverRows.find((row) => row.kind === 'session.created' && row.entity_id === event.entityId);
    const questionIds = created?.payload.questionIds;
    if (!Array.isArray(questionIds)) throw new Error('missing exam session fixture');
    const latestDrafts = new Map<string, ServerRow>();
    for (const row of fixture.serverRows) {
      if (row.kind === 'draft.saved' && row.payload.sessionId === event.payload.sessionId
        && typeof row.payload.questionId === 'string') latestDrafts.set(row.payload.questionId, row);
    }
    const answeredQuestionIds: string[] = [];
    for (const questionId of questionIds) {
      const draft = latestDrafts.get(questionId);
      if (!draft) continue;
      const sessionId = draft.payload.sessionId;
      const selectedChoiceIds = draft.payload.selectedChoiceIds;
      const question = getQuestion(questionId);
      if (typeof sessionId !== 'string' || !Array.isArray(selectedChoiceIds) || !question) {
        throw new Error('invalid draft fixture');
      }
      if (selectedChoiceIds.length !== (question.requiredChoiceCount ?? 1)) continue;
      answeredQuestionIds.push(questionId);
      const id = crypto.randomUUID();
      fixture.serverRows.push({ sequence: fixture.serverRows.length + 1, event_id: id,
        kind: 'answer.submitted', entity_id: id, occurred_at: now, payload: {
          sessionId, questionId,
          questionVersionId: question.versionId,
          selectedChoiceIds, isCorrect: scoreAnswer(question, selectedChoiceIds),
          answeredAt: now, invalidated: false,
        } });
    }
    payload = { ...payload, submittedAt: now, answeredQuestionIds };
  }
  const row: ServerRow = { sequence: fixture.serverRows.length + 1, event_id: event.eventId, kind: event.kind,
    entity_id: event.entityId, occurred_at: now, payload };
  fixture.serverRows.push(row);
  return row;
}

describe('端末保存とRPCの結合', () => {
  beforeEach(async () => {
    fixture.stored = null;
    fixture.userId = 'account-a';
    fixture.failAckOnce = false;
    fixture.loseReplyOnce = false;
    fixture.serverRows = [];
    fixture.received = [];
    vi.clearAllMocks();
    fixture.getStored.mockImplementation(async () => fixture.stored);
    fixture.compareAndSet.mockImplementation(async (_key: string, expected: string | null, next: string) => {
      if (fixture.stored !== expected) throw new Error('stale tab');
      if (fixture.failAckOnce && fixture.stored && JSON.parse(next).outbox.length < JSON.parse(fixture.stored).outbox.length) {
        fixture.failAckOnce = false;
        throw new Error('disk full');
      }
      fixture.stored = next;
    });
    fixture.rpc.mockImplementation(async (_name: string, args: { p_events: RpcInput[] }) => {
      fixture.received.push(args.p_events);
      try {
        const rows = args.p_events.map(serverAccept);
        if (fixture.loseReplyOnce && args.p_events.some((event) => event.kind === 'answer.submitted' || event.kind === 'session.submitted')) {
          fixture.loseReplyOnce = false;
          return { data: null, error: { message: 'network' } };
        }
        return { data: rows, error: null };
      } catch (error: unknown) {
        return { data: null, error: { message: error instanceof Error ? error.message : 'server error' } };
      }
    });
    fixture.from.mockImplementation(() => {
      let cursor = 0;
      const query = {
        select: () => query,
        eq: () => query,
        gt: (_field: string, value: number) => { cursor = value; return query; },
        order: () => query,
        limit: async (count: number) => ({ data: fixture.serverRows.filter((row) => row.sequence > cursor).slice(0, count), error: null }),
      };
      return query;
    });
    await useLearningStore.getState().initialize();
    await useLearningStore.getState().ensureSyncOwner('account-a');
  });

  it('サーバー受理後の応答消失を再送し、回答IDと確定採点を一度だけ反映する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '演習', ['fl-001']);
    const correctChoiceId = getQuestion('fl-001')?.choices.find((choice) => choice.isCorrect)?.id;
    if (!correctChoiceId) throw new Error('missing correct choice');
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', correctChoiceId);
    expect((await useLearningStore.getState().submitAnswer(sessionId, 'fl-001')).attempt.isCorrect).toBe(true);
    fixture.loseReplyOnce = true;

    await expect(runSync('account-a')).rejects.toThrow('送信に失敗');
    expect(fixture.serverRows).toHaveLength(3);
    expect(persisted().outbox.filter((event) => event.kind === 'answer.submitted')).toHaveLength(1);
    expect(useLearningStore.getState().syncConflict).toBeNull();
    await useLearningStore.getState().initialize();
    await runSync('account-a');

    expect(fixture.serverRows).toHaveLength(3);
    expect(fixture.received.filter((batch) => batch.some((event) => event.kind === 'answer.submitted'))).toHaveLength(2);
    expect(persisted().outbox).toHaveLength(0);
    expect(persisted().attempts).toHaveLength(1);
    expect(persisted().attempts[0]?.provisional).toBe(false);
    expect(persisted().attempts[0]?.isCorrect).toBe(false);
    expect(persisted().syncCursor).toBe(3);
  });

  it('ACKの端末保存に失敗しても同じイベントIDで再送する', async () => {
    await useLearningStore.getState().startSession('random', '演習', ['fl-001']);
    const eventId = persisted().outbox[0]?.id;
    fixture.failAckOnce = true;
    await expect(runSync('account-a')).rejects.toThrow('disk full');
    expect(persisted().outbox[0]?.id).toBe(eventId);
    await useLearningStore.getState().initialize();
    await runSync('account-a');
    expect(fixture.serverRows).toHaveLength(1);
    expect(fixture.received.flat().filter((event) => event.eventId === eventId)).toHaveLength(2);
    expect(persisted().outbox).toHaveLength(0);
  });

  it('同じ設問を編集した模試の応答消失でも最終ドラフトだけを採点し再送できる', async () => {
    const questionIds = Array.from({ length: 40 }, (_, index) => `fl-${String(index + 1).padStart(3, '0')}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A');
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-B');
    await useLearningStore.getState().submitExam(sessionId);
    fixture.loseReplyOnce = true;

    await expect(runSync('account-a')).rejects.toThrow('送信に失敗');
    expect(useLearningStore.getState().syncConflict).toBeNull();
    expect(persisted().attempts).toHaveLength(1);
    expect(persisted().attempts[0]?.provisional).toBe(false);
    expect(persisted().attempts[0]?.selectedChoiceIds).toEqual(['fl-001-B']);
    await useLearningStore.getState().initialize();
    await runSync('account-a');

    expect(fixture.serverRows.filter((row) => row.kind === 'draft.saved')).toHaveLength(2);
    expect(fixture.serverRows.filter((row) => row.kind === 'answer.submitted')).toHaveLength(1);
    expect(persisted().attempts).toHaveLength(1);
    expect(persisted().attempts[0]?.selectedChoiceIds).toEqual(['fl-001-B']);
    expect(persisted().outbox).toHaveLength(0);
    expect(persisted().sessions[0]?.serverConfirmed).toBe(true);
  });

  it('メモのrevision競合から受信・採用・再送まで同じ端末状態で復旧する', async () => {
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', 'この端末');
    fixture.serverRows.push({ sequence: 1, event_id: crypto.randomUUID(), kind: 'note.saved', entity_id: 'fl-001',
      occurred_at: '2026-10-30T00:00:00.000Z', payload: { questionId: 'fl-001', questionVersionId: 'fl-001-v1',
        body: '別端末', revision: 1, updatedAt: '2026-10-30T00:00:00.000Z' } });

    await expect(runSync('account-a')).rejects.toThrow('別端末の変更と競合');
    expect(useLearningStore.getState().syncConflict?.kind).toBe('note.saved');
    expect(persisted().syncCursor).toBe(0);
    await useLearningStore.getState().resolveSyncConflict('local');
    await runSync('account-a');

    expect(persisted().outbox).toHaveLength(0);
    expect(persisted().notes['fl-001']?.body).toBe('この端末');
    expect(persisted().syncRevisions['note.saved:fl-001']).toBe(2);
    expect(persisted().syncCursor).toBe(2);
    expect(persisted().syncConflictHistory).toHaveLength(1);
  });

  it('受信待ちにアカウントが変わると旧アカウントのイベントを適用しない', async () => {
    let release: ((rows: { data: ServerRow[]; error: null }) => void) | undefined;
    fixture.from.mockImplementation(() => {
      const query = { select: () => query, eq: () => query, gt: () => query, order: () => query,
        limit: () => new Promise((resolve) => { release = resolve; }) };
      return query;
    });
    const sync = runSync('account-a');
    await vi.waitFor(() => expect(release).toBeDefined());
    fixture.userId = 'account-b';
    release?.({ data: [{ sequence: 1, event_id: crypto.randomUUID(), kind: 'bookmark.changed',
      entity_id: 'fl-001', occurred_at: '2026-10-30T00:00:00.000Z', payload: { questionId: 'fl-001', enabled: true } }], error: null });
    await expect(sync).rejects.toThrow('アカウント');
    expect(persisted().syncCursor).toBe(0);
    expect(persisted().bookmarks).toEqual([]);
  });
});
