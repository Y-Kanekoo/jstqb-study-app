import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';

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

export type LearningSyncErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_EVENT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REVISION_CONFLICT'
  | 'SESSION_FROZEN'
  | 'NETWORK_ERROR';

export class LearningSyncError extends Error {
  readonly syncCode: LearningSyncErrorCode;

  constructor(syncCode: LearningSyncErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'LearningSyncError';
    this.syncCode = syncCode;
  }
}

function classifyError(message: string): LearningSyncErrorCode {
  if (message.includes('AUTH_REQUIRED')) return 'AUTH_REQUIRED';
  if (message.includes('IDEMPOTENCY_KEY_REUSED')) return 'IDEMPOTENCY_KEY_REUSED';
  if (message.includes('REVISION_CONFLICT')) return 'REVISION_CONFLICT';
  if (message.includes('SESSION_FROZEN')) return 'SESSION_FROZEN';
  if (message.includes('INVALID_EVENT')) return 'INVALID_EVENT';
  return 'NETWORK_ERROR';
}

function isPayload(value: unknown): value is OutboxEvent['payload'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((item) => item === null
    || typeof item === 'string'
    || typeof item === 'number'
    || typeof item === 'boolean'
    || (Array.isArray(item) && item.every((entry) => typeof entry === 'string')));
}

export function parseRemoteEvent(value: unknown): RemoteSyncEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('sequence' in value) || typeof value.sequence !== 'number' || !Number.isInteger(value.sequence) || value.sequence < 0
    || !('event_id' in value) || typeof value.event_id !== 'string' || value.event_id.length === 0
    || !('kind' in value) || typeof value.kind !== 'string' || !syncKinds.has(value.kind)
    || !('entity_id' in value) || typeof value.entity_id !== 'string' || value.entity_id.length === 0
    || !('occurred_at' in value) || typeof value.occurred_at !== 'string' || value.occurred_at.length === 0
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

export function parseRemoteEventRows(value: unknown): RemoteSyncEvent[] {
  if (!Array.isArray(value)) {
    throw new LearningSyncError('NETWORK_ERROR', '学習履歴の応答形式を確認できませんでした。');
  }
  const events: RemoteSyncEvent[] = [];
  for (const row of value) {
    const event = parseRemoteEvent(row);
    if (!event) {
      throw new LearningSyncError('NETWORK_ERROR', '学習履歴に不正なイベントが含まれています。');
    }
    events.push(event);
  }
  return events;
}

function toRpcEvent(event: OutboxEvent) {
  return {
    eventId: event.id,
    kind: event.kind,
    entityId: event.entityId,
    occurredAt: event.occurredAt,
    payload: event.payload,
  };
}

export async function ingestLearningEvents(events: OutboxEvent[]): Promise<RemoteSyncEvent[]> {
  const { supabase } = await import('./supabase');
  if (!supabase) {
    throw new LearningSyncError('NETWORK_ERROR', '同期サーバーが設定されていません。');
  }
  if (events.length === 0 || events.length > 100) {
    throw new LearningSyncError('INVALID_EVENT', '同期イベントは1件以上100件以下で送信してください。');
  }

  const request = events.map(toRpcEvent);
  const encodedLength = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  if (encodedLength > 1024 * 1024) {
    throw new LearningSyncError('INVALID_EVENT', '同期データが1MiBを超えています。');
  }
  if (request.some((event) => new TextEncoder().encode(JSON.stringify(event)).byteLength > 64 * 1024)) {
    throw new LearningSyncError('INVALID_EVENT', '1件の同期データが64KiBを超えています。');
  }

  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) {
    throw new LearningSyncError('NETWORK_ERROR', '認証状態を確認できませんでした。', authError);
  }
  if (!authData.session) {
    throw new LearningSyncError('AUTH_REQUIRED', '認証が必要です。');
  }

  const { data, error } = await supabase.rpc('ingest_learning_sync_events', { p_events: request });
  if (error) {
    throw new LearningSyncError(classifyError(error.message), `学習データを同期できませんでした: ${error.message}`, error);
  }
  const rawData: unknown = data;
  const parsed = parseRemoteEventRows(rawData);
  if (parsed.length !== events.length) {
    throw new LearningSyncError('NETWORK_ERROR', '同期サーバーの応答形式を確認できませんでした。');
  }
  return parsed;
}

export async function fetchLearningEventsAfter(userId: string, cursor: number): Promise<RemoteSyncEvent[]> {
  const { supabase } = await import('./supabase');
  if (!supabase) {
    throw new LearningSyncError('NETWORK_ERROR', '同期サーバーが設定されていません。');
  }
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) {
    throw new LearningSyncError('NETWORK_ERROR', '認証状態を確認できませんでした。', authError);
  }
  if (!authData.session || authData.session.user.id !== userId) {
    throw new LearningSyncError('AUTH_REQUIRED', '認証が必要です。');
  }
  const { data, error } = await supabase
    .from('sync_events')
    .select('sequence,event_id,kind,entity_id,occurred_at,payload')
    .eq('user_id', userId)
    .gt('sequence', cursor)
    .order('sequence', { ascending: true })
    .limit(500);
  if (error) throw new LearningSyncError('NETWORK_ERROR', '学習履歴の受信に失敗しました。', error);
  const events = parseRemoteEventRows(data);
  if (events.some((event, index) => event.sequence <= cursor || (index > 0 && event.sequence <= events[index - 1]!.sequence))) {
    throw new LearningSyncError('NETWORK_ERROR', '学習履歴のsequence順序を確認できませんでした。');
  }
  return events;
}
