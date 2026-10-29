import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';
import { runSync } from './learning-sync';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), learning: vi.fn(), auth: vi.fn(),
}));

vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/state/learning-store', () => ({ useLearningStore: { getState: mocks.learning } }));
vi.mock('@/state/auth-store', () => ({ useAuthStore: { getState: mocks.auth } }));

function outgoing(): OutboxEvent {
  return { id: crypto.randomUUID(), kind: 'bookmark.changed', entityId: 'fl-001',
    occurredAt: '2026-10-29T00:00:00.000Z', payload: { questionId: 'fl-001', enabled: true } };
}

function canonical(event: OutboxEvent) {
  return { sequence: 1, event_id: event.id, kind: event.kind,
    entity_id: event.entityId, occurred_at: '2026-10-29T00:00:01.000Z', payload: event.payload };
}

describe('同期送信', () => {
  let pending: OutboxEvent[];
  let cursor: number;
  let acked: string[];
  let syncError: string | null;

  beforeEach(() => {
    vi.clearAllMocks();
    pending = [outgoing()];
    cursor = 0;
    acked = [];
    syncError = null;
    mocks.auth.mockImplementation(() => ({ session: { user: { id: 'user-1' } } }));
    mocks.learning.mockImplementation(() => ({
      outbox: pending,
      syncOwnerId: 'user-1',
      syncCursor: cursor,
      ensureSyncOwner: async () => undefined,
      prepareOutboxForRpc: async () => undefined,
      flushNoteBuffer: async () => undefined,
      markOutboxSynced: async (ids: string[], _events: RemoteSyncEvent[]) => {
        acked.push(...ids);
        pending = pending.filter((event) => !ids.includes(event.id));
      },
      applyRemoteEvents: async (events: RemoteSyncEvent[]) => { cursor = events.at(-1)?.sequence ?? cursor; },
      setSyncError: (message: string | null) => { syncError = message; },
    }));
    const query = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gt.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue(query);
  });

  it('権限のあるRPCへ送信し、完全一致する応答後だけOutboxをACKする', async () => {
    const event = pending[0];
    if (!event) throw new Error('missing event');
    mocks.rpc.mockResolvedValue({ data: [canonical(event)], error: null });
    await runSync('user-1');
    expect(mocks.rpc).toHaveBeenCalledWith('ingest_learning_sync_events', { p_events: [{
      eventId: event.id, kind: event.kind, entityId: event.entityId,
      occurredAt: event.occurredAt, payload: event.payload,
    }] });
    expect(acked).toEqual([event.id]);
    expect(pending).toEqual([]);
    expect(syncError).toBeNull();
    expect(mocks.from).toHaveBeenCalledWith('sync_events');
    expect(mocks.from.mock.results[0]?.value.upsert).toBeUndefined();
  });

  it('通信失敗や不一致応答ではイベントを保持し、同じIDで再送する', async () => {
    const event = pending[0];
    if (!event) throw new Error('missing event');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
      .mockResolvedValueOnce({ data: [canonical(event)], error: null });
    await expect(runSync('user-1')).rejects.toThrow('送信に失敗');
    expect(pending.map((item) => item.id)).toEqual([event.id]);
    await runSync('user-1');
    expect(mocks.rpc.mock.calls[0]?.[1]).toEqual(mocks.rpc.mock.calls[1]?.[1]);
    expect(acked).toEqual([event.id]);
  });

  it('不一致応答と認証主体の変更をACKせず止める', async () => {
    const event = pending[0];
    if (!event) throw new Error('missing event');
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...canonical(event), event_id: crypto.randomUUID() }], error: null });
    await expect(runSync('user-1')).rejects.toThrow('一致しません');
    expect(acked).toEqual([]);
    mocks.auth.mockImplementation(() => ({ session: { user: { id: 'user-2' } } }));
    await expect(runSync('user-1')).rejects.toThrow('アカウント');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('20件単位で送信し、イベント順を維持する', async () => {
    pending = Array.from({ length: 21 }, (_, index) => ({ ...outgoing(), entityId: `fl-${index}` }));
    mocks.rpc.mockImplementation(async (_name: string, args: { p_events: { eventId: string }[] }) => ({
      data: args.p_events.map((item, index) => {
        const event = pending.find((candidate) => candidate.id === item.eventId);
        if (!event) throw new Error('missing event');
        return { ...canonical(event), sequence: index + 1 };
      }),
      error: null,
    }));
    const ids = pending.map((event) => event.id);
    await runSync('user-1');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0]?.[1].p_events).toHaveLength(20);
    expect(mocks.rpc.mock.calls[1]?.[1].p_events).toHaveLength(1);
    expect(acked).toEqual(ids);
  });

  it('途中で端末データを削除したら後続バッチを送信しない', async () => {
    pending = Array.from({ length: 21 }, (_, index) => ({ ...outgoing(), entityId: `fl-${index}` }));
    mocks.rpc.mockImplementation(async (_name: string, args: { p_events: { eventId: string }[] }) => {
      const data = args.p_events.map((item) => {
        const event = pending.find((candidate) => candidate.id === item.eventId);
        if (!event) throw new Error('missing event');
        return canonical(event);
      });
      pending = [];
      return { data, error: null };
    });
    await expect(runSync('user-1')).rejects.toThrow('端末データが変更');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('revision競合はOutboxを残して利用者向けに通知する', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'REVISION_CONFLICT' } });
    await expect(runSync('user-1')).rejects.toThrow('別端末の変更と競合');
    expect(acked).toEqual([]);
    expect(pending).toHaveLength(1);
  });

  it('revision競合でも受信を試み、衝突イベント以降のカーソルを進めない', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'REVISION_CONFLICT' } });
    const query = mocks.from();
    query.limit.mockResolvedValueOnce({ data: [{ sequence: 1, event_id: crypto.randomUUID(),
      kind: 'bookmark.changed', entity_id: 'fl-001', occurred_at: '2026-10-29T00:00:00.000Z',
      payload: { questionId: 'fl-001', enabled: true } }], error: null });
    mocks.from.mockReturnValue(query);
    await expect(runSync('user-1')).rejects.toThrow('別端末の変更と競合');
    expect(mocks.from).toHaveBeenCalledWith('sync_events');
    expect(acked).toEqual([]);
    expect(cursor).toBe(1);
  });

  it('受信待ちの間にアカウントが変わると旧アカウントの履歴を端末へ適用しない', async () => {
    pending = [];
    let resolveQuery: ((value: { data: unknown[]; error: null }) => void) | undefined;
    const query = mocks.from();
    query.limit.mockImplementation(() => new Promise((resolve) => { resolveQuery = resolve; }));
    mocks.from.mockReturnValue(query);
    const apply = vi.fn();
    mocks.learning.mockImplementation(() => ({ outbox: pending, syncCursor: cursor,
      syncOwnerId: 'user-1',
      ensureSyncOwner: async () => undefined, prepareOutboxForRpc: async () => undefined,
      flushNoteBuffer: async () => undefined,
      applyRemoteEvents: apply, setSyncError: vi.fn() }));
    const sync = runSync('user-1');
    await vi.waitFor(() => expect(resolveQuery).toBeDefined());
    mocks.auth.mockImplementation(() => ({ session: { user: { id: 'user-2' } } }));
    resolveQuery?.({ data: [canonical(outgoing())], error: null });
    await expect(sync).rejects.toThrow('アカウント');
    expect(apply).not.toHaveBeenCalled();
  });
});
