import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';
import { LearningSyncError } from './learning-sync-api';
import { pullRemoteEvents, pushOutbox } from './learning-sync';

const mocks = vi.hoisted(() => ({
  ingestLearningEvents: vi.fn(),
  fetchLearningEventsAfter: vi.fn(),
  applyRemoteEvents: vi.fn(),
  markOutboxSynced: vi.fn(),
  blockOutboxEvent: vi.fn(),
  setSyncState: vi.fn(),
  state: {
    hydrated: true,
    storageOwnerId: 'user-1' as string | null,
    syncMode: 'active' as const,
    syncCursor: 42,
    outbox: [] as OutboxEvent[],
  },
}));

vi.mock('@/state/auth-store', () => ({
  useAuthStore: () => ({ session: null }),
}));
vi.mock('@/state/learning-store', () => ({
  useLearningStore: {
    getState: () => ({
      ...mocks.state,
      applyRemoteEvents: mocks.applyRemoteEvents,
      markOutboxSynced: mocks.markOutboxSynced,
      blockOutboxEvent: mocks.blockOutboxEvent,
      setSyncState: mocks.setSyncState,
    }),
  },
}));
vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('./learning-sync-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./learning-sync-api')>();
  return {
    ...actual,
    ingestLearningEvents: mocks.ingestLearningEvents,
    fetchLearningEventsAfter: mocks.fetchLearningEventsAfter,
  };
});

const pendingEvent: OutboxEvent = {
  id: 'event-bookmark',
  kind: 'bookmark.changed',
  entityId: 'question-1',
  occurredAt: '2026-08-12T00:00:00.000Z',
  payload: { questionId: 'question-1', enabled: true },
};

describe('background同期のfail-closed境界', () => {
  beforeEach(() => {
    mocks.ingestLearningEvents.mockReset();
    mocks.fetchLearningEventsAfter.mockReset();
    mocks.applyRemoteEvents.mockReset();
    mocks.markOutboxSynced.mockReset();
    mocks.blockOutboxEvent.mockReset();
    mocks.setSyncState.mockReset();
    mocks.state.storageOwnerId = 'user-1';
    mocks.state.syncCursor = 42;
    mocks.state.outbox = [{ ...pendingEvent, payload: { ...pendingEvent.payload } }];
    mocks.blockOutboxEvent.mockImplementation(async (eventId: string) => {
      mocks.state.outbox = mocks.state.outbox.map((event) => event.id === eventId ? { ...event, blocked: true } : event);
    });
  });

  it('push応答のkind/entity意味不一致ではapplyもmark syncedも実行しない', async () => {
    const invalidCanonical: RemoteSyncEvent = {
      sequence: 100,
      id: pendingEvent.id,
      kind: pendingEvent.kind,
      entityId: 'another-question',
      occurredAt: pendingEvent.occurredAt,
      payload: { questionId: 'another-question', enabled: true },
    };
    mocks.ingestLearningEvents.mockResolvedValue([invalidCanonical]);

    await pushOutbox('user-1');

    expect(mocks.applyRemoteEvents).not.toHaveBeenCalled();
    expect(mocks.markOutboxSynced).not.toHaveBeenCalled();
    expect(mocks.blockOutboxEvent).toHaveBeenCalledWith(pendingEvent.id, expect.stringContaining('一致しません'));
    expect(mocks.state.outbox[0]?.blocked).toBe(true);
  });

  it('pull batchのparse失敗ではcursorもoutboxも変更せずapplyしない', async () => {
    mocks.fetchLearningEventsAfter.mockRejectedValue(new LearningSyncError(
      'NETWORK_ERROR',
      '学習履歴に不正なイベントが含まれています。',
    ));
    const beforeOutbox = mocks.state.outbox;

    await expect(pullRemoteEvents('user-1')).rejects.toThrow('不正なイベント');

    expect(mocks.applyRemoteEvents).not.toHaveBeenCalled();
    expect(mocks.markOutboxSynced).not.toHaveBeenCalled();
    expect(mocks.state.syncCursor).toBe(42);
    expect(mocks.state.outbox).toEqual(beforeOutbox);
  });
});
