import { useEffect } from 'react';

import { useAuthStore } from '@/state/auth-store';
import { useLearningStore } from '@/state/learning-store';

import { fetchLearningEventsAfter, ingestLearningEvents, LearningSyncError } from './learning-sync-api';
import { supabase } from './supabase';

let syncPromise: Promise<void> | null = null;

function isCurrentOwner(userId: string): boolean {
  const state = useLearningStore.getState();
  return state.hydrated && state.storageOwnerId === userId;
}

async function pushOutbox(userId: string): Promise<void> {
  while (isCurrentOwner(userId)) {
    const pending = useLearningStore.getState().outbox
      .filter((event) => !event.blocked && !event.resolved)
      .slice(0, 100);
    if (pending.length === 0) return;

    for (const event of pending) {
      try {
        const canonicalEvents = await ingestLearningEvents([event]);
        if (!isCurrentOwner(userId)) return;
        await useLearningStore.getState().applyRemoteEvents(canonicalEvents, 'ack');
        if (!isCurrentOwner(userId)) return;
        await useLearningStore.getState().markOutboxSynced([event.id]);
      } catch (error: unknown) {
        if (error instanceof LearningSyncError
          && ['INVALID_EVENT', 'IDEMPOTENCY_KEY_REUSED', 'REVISION_CONFLICT', 'SESSION_FROZEN'].includes(error.syncCode)) {
          await useLearningStore.getState().blockOutboxEvent(event.id, error.message);
          continue;
        }
        throw error;
      }
    }
  }
}

export async function pullRemoteEvents(userId: string): Promise<void> {
  if (!supabase) return;
  if (useLearningStore.getState().syncMode !== 'active') return;
  let cursor = useLearningStore.getState().syncCursor;
  let hasMore = true;
  while (hasMore && isCurrentOwner(userId)) {
    const events = await fetchLearningEventsAfter(userId, cursor);
    if (events.length > 0) {
      if (!isCurrentOwner(userId)) return;
      await useLearningStore.getState().applyRemoteEvents(events, 'pull');
      cursor = events.at(-1)?.sequence ?? cursor;
    }
    hasMore = events.length === 500;
  }
}

function syncErrorState(error: unknown): { status: 'auth-required' | 'conflict' | 'error'; message: string } {
  if (error instanceof LearningSyncError) {
    if (error.syncCode === 'AUTH_REQUIRED') {
      return { status: 'auth-required', message: '認証の有効期限が切れました。再度ログインしてください。' };
    }
    if (error.syncCode === 'REVISION_CONFLICT') {
      return { status: 'conflict', message: '別の端末で途中回答またはメモが更新されています。同期の復旧操作が必要です。' };
    }
    if (error.syncCode === 'SESSION_FROZEN') {
      return { status: 'conflict', message: '模試の制限時間がサーバー上で終了しました。保存済み回答を提出してください。' };
    }
    if (error.syncCode === 'INVALID_EVENT' || error.syncCode === 'IDEMPOTENCY_KEY_REUSED') {
      return { status: 'error', message: `${error.message} 未同期データを保持しています。` };
    }
  }
  return { status: 'error', message: '同期できませんでした。端末への保存は維持し、通信回復後に再試行します。' };
}

async function runSync(userId: string): Promise<void> {
  if (!supabase || !isCurrentOwner(userId)) return;
  useLearningStore.getState().setSyncState('syncing');
  try {
    await pushOutbox(userId);
    await pullRemoteEvents(userId);
    if (isCurrentOwner(userId)) {
      const state = useLearningStore.getState();
      const hasBlocked = state.outbox.some((event) => event.blocked && !event.resolved);
      const hasPending = state.outbox.some((event) => !event.blocked && !event.resolved);
      useLearningStore.getState().setSyncState(
        hasBlocked || (state.conflicts?.length ?? 0) > 0 ? 'conflict' : hasPending ? 'queued' : 'synced',
      );
    }
  } catch (error: unknown) {
    if (isCurrentOwner(userId)) {
      const syncError = syncErrorState(error);
      useLearningStore.getState().setSyncState(syncError.status, syncError.message);
    }
  }
}

function scheduleSync(userId: string): void {
  if (syncPromise) return;
  syncPromise = runSync(userId).finally(() => { syncPromise = null; });
}

export function LearningSyncCoordinator() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const outboxCount = useLearningStore((state) => state.outbox.length);
  const storageOwnerId = useLearningStore((state) => state.storageOwnerId);
  const hydrated = useLearningStore((state) => state.hydrated);
  const syncMode = useLearningStore((state) => state.syncMode);

  useEffect(() => {
    if (!userId || !hydrated || storageOwnerId !== userId || syncMode !== 'active') return undefined;
    const firstSync = setTimeout(() => scheduleSync(userId), outboxCount > 0 ? 800 : 0);
    const periodicSync = setInterval(() => scheduleSync(userId), 30_000);
    return () => {
      clearTimeout(firstSync);
      clearInterval(periodicSync);
    };
  }, [hydrated, outboxCount, storageOwnerId, syncMode, userId]);

  return null;
}
