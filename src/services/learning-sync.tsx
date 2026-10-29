import { useEffect } from 'react';

import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';
import { useAuthStore } from '@/state/auth-store';
import { useLearningStore } from '@/state/learning-store';

import { supabase } from './supabase';

const syncKinds: ReadonlySet<string> = new Set([
  'session.created',
  'draft.saved',
  'answer.submitted',
  'session.advanced',
  'session.submitted',
  'session.review-marked',
  'bookmark.changed',
  'note.saved',
  'issue.reported',
]);

function isPayload(value: unknown): value is OutboxEvent['payload'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((item) => item === null || typeof item === 'string'
    || typeof item === 'number'
    || typeof item === 'boolean'
    || (Array.isArray(item) && item.every((entry) => typeof entry === 'string')));
}

function parseRemoteEvent(value: unknown): RemoteSyncEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('sequence' in value) || typeof value.sequence !== 'number'
    || !('event_id' in value) || typeof value.event_id !== 'string'
    || !('kind' in value) || typeof value.kind !== 'string' || !syncKinds.has(value.kind)
    || !('entity_id' in value) || typeof value.entity_id !== 'string'
    || !('occurred_at' in value) || typeof value.occurred_at !== 'string'
    || !('payload' in value) || !isPayload(value.payload)) return null;

  return {
    sequence: value.sequence,
    id: value.event_id,
    kind: value.kind as OutboxEvent['kind'],
    entityId: value.entity_id,
    occurredAt: value.occurred_at,
    payload: value.payload,
  };
}

let syncPromise: Promise<void> | null = null;

async function runSync(userId: string): Promise<void> {
  if (!supabase) return;
  const store = useLearningStore.getState();
  const pending = store.outbox;

  if (pending.length > 0) {
    const rows = pending.map((event) => ({
      event_id: event.id,
      user_id: userId,
      kind: event.kind,
      entity_id: event.entityId,
      occurred_at: event.occurredAt,
      payload: event.payload,
    }));
    const { error } = await supabase.from('sync_events').upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });
    if (error) throw new Error('学習履歴の送信に失敗しました。', { cause: error });
    await useLearningStore.getState().markOutboxSynced(pending.map((event) => event.id));
  }

  let cursor = useLearningStore.getState().syncCursor;
  let hasMore = true;
  let blocked = false;
  while (hasMore) {
    const { data, error } = await supabase
      .from('sync_events')
      .select('sequence,event_id,kind,entity_id,occurred_at,payload')
      .eq('user_id', userId)
      .gt('sequence', cursor)
      .order('sequence', { ascending: true })
      .limit(500);
    if (error) throw new Error('学習履歴の受信に失敗しました。', { cause: error });
    const rawRows: unknown = data;
    if (!Array.isArray(rawRows)) throw new Error('受信した学習履歴の形式が不正です。');
    const parsedRows = rawRows.map(parseRemoteEvent);
    if (parsedRows.some((event) => event === null)) throw new Error('受信した学習履歴に不正なイベントがあります。');
    const events = parsedRows.filter((event): event is RemoteSyncEvent => event !== null);
    if (events.length > 0) {
      await useLearningStore.getState().applyRemoteEvents(events);
      const nextCursor = useLearningStore.getState().syncCursor;
      if (nextCursor < (events.at(-1)?.sequence ?? nextCursor)) {
        blocked = true;
        break;
      }
      cursor = nextCursor;
    }
    hasMore = events.length === 500;
  }
  if (!blocked) useLearningStore.getState().setSyncError(null);
}

function scheduleSync(userId: string): void {
  if (syncPromise) return;
  syncPromise = runSync(userId)
    .catch((error: unknown) => {
      useLearningStore.getState().setSyncError(error instanceof Error ? error.message : '同期に失敗しました。');
    })
    .finally(() => { syncPromise = null; });
}

export function LearningSyncCoordinator() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const outboxCount = useLearningStore((state) => state.outbox.length);

  useEffect(() => {
    if (!userId) return undefined;
    const firstSync = setTimeout(() => scheduleSync(userId), outboxCount > 0 ? 800 : 0);
    const periodicSync = setInterval(() => scheduleSync(userId), 30_000);
    return () => {
      clearTimeout(firstSync);
      clearInterval(periodicSync);
    };
  }, [outboxCount, userId]);

  return null;
}
