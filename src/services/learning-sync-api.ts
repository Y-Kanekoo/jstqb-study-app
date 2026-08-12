import { z } from 'zod';

import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';

const sessionModeSchema = z.enum(['chapter', 'random', 'wrong', 'review', 'exam']);
const stringArraySchema = z.array(z.string());

const sessionCreatedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  mode: sessionModeSchema,
  title: z.string(),
  questionIds: stringArraySchema,
  questionVersionIds: stringArraySchema,
  createdAt: z.string().min(1),
  startedAt: z.string().min(1),
  durationMinutes: z.number().positive().nullable(),
  expiresAt: z.string().min(1).nullable(),
}).strict();

const draftSavedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  selectedChoiceIds: stringArraySchema,
  questionVersionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  deviceId: z.string(),
  updatedAt: z.string().min(1),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict();

const answerSubmittedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  selectedChoiceIds: stringArraySchema,
  isCorrect: z.boolean(),
  answeredAt: z.string().min(1),
  invalidated: z.boolean().optional(),
}).strict();

const sessionAdvancedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  currentIndex: z.number().int().nonnegative(),
}).strict();

const sessionSubmittedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  submittedAt: z.string().min(1),
  answeredQuestionIds: stringArraySchema,
  expired: z.boolean(),
}).strict();

const sessionReviewMarkedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  marked: z.boolean(),
}).strict();

const bookmarkChangedPayloadSchema = z.object({
  questionId: z.string().min(1),
  enabled: z.boolean(),
}).strict();

const noteSavedPayloadSchema = z.object({
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  body: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict();

const issueReportedPayloadSchema = z.object({
  issueId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  category: z.enum(['incorrect_answer', 'unclear', 'outdated', 'typo', 'other']),
  description: z.string(),
  createdAt: z.string().min(1),
}).strict();

const remoteEventBaseSchema = {
  sequence: z.number().int().nonnegative(),
  event_id: z.string().min(1),
  entity_id: z.string().min(1),
  occurred_at: z.string().min(1),
};

const remoteEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.created'), payload: sessionCreatedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('draft.saved'), payload: draftSavedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('answer.submitted'), payload: answerSubmittedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.advanced'), payload: sessionAdvancedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.submitted'), payload: sessionSubmittedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.review-marked'), payload: sessionReviewMarkedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('bookmark.changed'), payload: bookmarkChangedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('note.saved'), payload: noteSavedPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('issue.reported'), payload: issueReportedPayloadSchema }).strict(),
]);

const requestIdentityKeys: Record<OutboxEvent['kind'], readonly string[]> = {
  'session.created': ['sessionId', 'mode', 'title', 'questionIds'],
  'draft.saved': ['sessionId', 'questionId', 'selectedChoiceIds'],
  'answer.submitted': ['sessionId', 'questionId', 'questionVersionId', 'selectedChoiceIds'],
  'session.advanced': ['sessionId', 'questionId'],
  'session.submitted': ['sessionId'],
  'session.review-marked': ['sessionId', 'questionId', 'marked'],
  'bookmark.changed': ['questionId', 'enabled'],
  'note.saved': ['questionId', 'questionVersionId', 'body'],
  'issue.reported': ['issueId', 'questionId', 'questionVersionId', 'category', 'description'],
};

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

export function parseRemoteEvent(value: unknown): RemoteSyncEvent | null {
  const result = remoteEventSchema.safeParse(value);
  if (!result.success) return null;
  return {
    sequence: result.data.sequence,
    id: result.data.event_id,
    kind: result.data.kind,
    entityId: result.data.entity_id,
    occurredAt: result.data.occurred_at,
    payload: result.data.payload as OutboxEvent['payload'],
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
  if (events.length !== value.length) {
    throw new LearningSyncError('NETWORK_ERROR', '学習履歴の件数を確認できませんでした。');
  }
  return events;
}

function samePayloadValue(left: OutboxEvent['payload'], right: OutboxEvent['payload'], key: string): boolean {
  const leftValue = left[key];
  const rightValue = right[key];
  if (Array.isArray(leftValue)) {
    return Array.isArray(rightValue)
      && leftValue.length === rightValue.length
      && leftValue.every((value, index) => value === rightValue[index]);
  }
  return leftValue === rightValue;
}

export function isCanonicalEventForRequest(canonical: RemoteSyncEvent, request: OutboxEvent): boolean {
  if (canonical.id !== request.id || canonical.kind !== request.kind || canonical.entityId !== request.entityId) return false;
  return requestIdentityKeys[request.kind].every((key) => samePayloadValue(request.payload, canonical.payload, key));
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
  if (parsed.some((event, index) => !event || !isCanonicalEventForRequest(event, events[index]!))) {
    throw new LearningSyncError('INVALID_EVENT', '同期サーバーの回答が要求イベントと一致しません。');
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
