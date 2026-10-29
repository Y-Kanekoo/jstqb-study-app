import { useEffect } from 'react';

import { getQuestion } from '@/content/questions';
import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';
import { useAuthStore } from '@/state/auth-store';
import { useLearningStore } from '@/state/learning-store';
import { parseRemoteEvent, parseRpcAcknowledgements, rpcBatchSize, toRpcEvent } from '@/sync/protocol';

import { supabase } from './supabase';

let syncPromise: Promise<void> | null = null;

function assertPinnedVersion(event: OutboxEvent): void {
  if (event.kind !== 'draft.saved' && event.kind !== 'answer.submitted') return;
  const sessionId = event.payload.sessionId;
  const session = useLearningStore.getState().sessions.find((item) => item.id === sessionId);
  if (!session?.questionVersionIds) return;
  for (const [index, id] of session.questionIds.entries()) {
    if (event.payload.questionId !== id) continue;
    if (getQuestion(id)?.versionId !== session.questionVersionIds[index]) {
      throw new Error('サーバーで固定された問題版と端末の問題版が異なります。問題データを更新してから再開してください。');
    }
  }
}

function assertBatchCurrent(batch: OutboxEvent[], userId: string): void {
  const state = useLearningStore.getState();
  if (state.syncOwnerId !== userId || batch.some((event) => {
    const current = state.outbox.find((item) => item.id === event.id);
    return !current || JSON.stringify(current) !== JSON.stringify(event);
  })) throw new Error('同期中に端末データが変更されました。再同期してください。');
}

export async function runSync(userId: string): Promise<void> {
  if (!supabase) return;
  if (useLearningStore.getState().syncConflict) return;
  if (useAuthStore.getState().session?.user.id !== userId) throw new Error('同期中にアカウントが切り替わりました。');
  await useLearningStore.getState().ensureSyncOwner(userId);
  await useLearningStore.getState().flushNoteBuffer();
  await useLearningStore.getState().prepareOutboxForRpc();
  const pending = useLearningStore.getState().outbox;
  let sendFailure: Error | null = null;

  if (pending.length > 0) {
    for (let index = 0; index < pending.length;) {
      if (useAuthStore.getState().session?.user.id !== userId) throw new Error('同期中にアカウントが切り替わりました。');
      let batch = pending.slice(index, index + rpcBatchSize);
      const createdIndex = batch.findIndex((event) => event.kind === 'session.created');
      if (createdIndex >= 0) batch = batch.slice(0, createdIndex + 1);
      assertBatchCurrent(batch, userId);
      batch.forEach(assertPinnedVersion);
      const { data, error } = await supabase.rpc('ingest_learning_sync_events', {
        p_events: batch.map(toRpcEvent),
      });
      if (error) {
        const message = error.message.includes('REVISION_CONFLICT')
          ? '別端末の変更と競合しました。未送信データは端末に保持しています。'
          : error.message.includes('IDEMPOTENCY_KEY_REUSED')
            ? '同期イベントIDが既存データと一致しません。未送信データを保持しています。'
            : error.message.includes('AUTH_REQUIRED')
              ? '同期には再ログインが必要です。'
              : error.message.includes('SESSION_FROZEN')
                ? '模試の期限が過ぎたため、選択の送信を停止しました。'
          : '学習履歴の送信に失敗しました。';
        sendFailure = new Error(message, { cause: error });
        break;
      }
      const canonical = parseRpcAcknowledgements(data, batch);
      if (useAuthStore.getState().session?.user.id !== userId) throw new Error('同期中にアカウントが切り替わりました。');
      await useLearningStore.getState().markOutboxSynced(batch.map((event) => event.id), canonical);
      index += batch.length;
    }
  }

  let cursor = useLearningStore.getState().syncCursor;
  let hasMore = true;
  let blocked = false;
  while (hasMore) {
    if (useAuthStore.getState().session?.user.id !== userId) throw new Error('同期中にアカウントが切り替わりました。');
    const { data, error } = await supabase
      .from('sync_events')
      .select('sequence,event_id,kind,entity_id,occurred_at,payload')
      .eq('user_id', userId)
      .gt('sequence', cursor)
      .order('sequence', { ascending: true })
      .limit(500);
    if (useAuthStore.getState().session?.user.id !== userId) throw new Error('同期中にアカウントが切り替わりました。');
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
  if (sendFailure) throw sendFailure;
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
  const hasConflict = useLearningStore((state) => state.syncConflict !== null);

  useEffect(() => {
    if (!userId || hasConflict) return undefined;
    const firstSync = setTimeout(() => scheduleSync(userId), outboxCount > 0 ? 800 : 0);
    const periodicSync = setInterval(() => scheduleSync(userId), 30_000);
    return () => {
      clearTimeout(firstSync);
      clearInterval(periodicSync);
    };
  }, [hasConflict, outboxCount, userId]);

  return null;
}
