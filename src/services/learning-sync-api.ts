import { z } from 'zod';

import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';
import { validateRemoteEventBatch } from './learning-sync-contract';

const sessionModeSchema = z.enum(['chapter', 'random', 'wrong', 'review', 'exam']);
const stringArraySchema = z.array(z.string().min(1));
const uniqueStringArraySchema = stringArraySchema.superRefine((value, context) => {
  if (new Set(value).size !== value.length) {
    context.addIssue({ code: 'custom', message: '同じIDを重複して指定できません。' });
  }
});
const nonEmptyUniqueStringArraySchema = stringArraySchema.min(1).superRefine((value, context) => {
  if (new Set(value).size !== value.length) {
    context.addIssue({ code: 'custom', message: '同じIDを重複して指定できません。' });
  }
});

const sessionCreatedRequestPayloadSchema = z.object({
  sessionId: z.string().min(1),
  mode: sessionModeSchema,
  title: z.string(),
  questionIds: nonEmptyUniqueStringArraySchema,
}).strict();

const sessionCreatedCanonicalPayloadSchema = z.object({
  sessionId: z.string().min(1),
  mode: sessionModeSchema,
  title: z.string(),
  questionIds: nonEmptyUniqueStringArraySchema,
  questionVersionIds: stringArraySchema,
  createdAt: z.string().min(1),
  startedAt: z.string().min(1),
  durationMinutes: z.number().int().positive().nullable(),
  expiresAt: z.string().min(1).nullable(),
}).strict();

const draftSavedRequestPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  selectedChoiceIds: uniqueStringArraySchema,
  expectedRevision: z.number().int().nonnegative(),
  deviceId: z.string().min(1),
}).strict();

const draftSavedCanonicalPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  selectedChoiceIds: stringArraySchema,
  expectedRevision: z.number().int().nonnegative(),
  deviceId: z.string().min(1),
  questionVersionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
}).strict();

const answerSubmittedRequestPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  selectedChoiceIds: uniqueStringArraySchema,
}).strict();

const answerSubmittedCanonicalPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  selectedChoiceIds: stringArraySchema,
  isCorrect: z.boolean(),
  answeredAt: z.string().min(1),
  invalidated: z.boolean().optional(),
}).strict();

const sessionAdvancedRequestPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
}).strict();

const sessionAdvancedCanonicalPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  currentIndex: z.number().int().nonnegative(),
}).strict();

const sessionSubmittedRequestPayloadSchema = z.object({
  sessionId: z.string().min(1),
}).strict();

const sessionSubmittedCanonicalPayloadSchema = z.object({
  sessionId: z.string().min(1),
  submittedAt: z.string().min(1),
  answeredQuestionIds: stringArraySchema,
  expired: z.boolean(),
}).strict();

const sessionReviewMarkedRequestPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  marked: z.boolean(),
}).strict();

const sessionReviewMarkedCanonicalPayloadSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  marked: z.boolean(),
  updatedAt: z.string().min(1),
}).strict();

const bookmarkChangedRequestPayloadSchema = z.object({
  questionId: z.string().min(1),
  enabled: z.boolean(),
}).strict();

const bookmarkChangedCanonicalPayloadSchema = z.object({
  questionId: z.string().min(1),
  enabled: z.boolean(),
  updatedAt: z.string().min(1),
}).strict();

const noteSavedRequestPayloadSchema = z.object({
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  body: z.string(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

const noteSavedCanonicalPayloadSchema = z.object({
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  body: z.string(),
  expectedRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
}).strict();

const issueReportedRequestPayloadSchema = z.object({
  issueId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  category: z.enum(['incorrect_answer', 'unclear', 'outdated', 'typo', 'other']),
  description: z.string(),
}).strict();

const issueReportedCanonicalPayloadSchema = z.object({
  issueId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  category: z.enum(['incorrect_answer', 'unclear', 'outdated', 'typo', 'other']),
  description: z.string(),
  createdAt: z.string().min(1),
}).strict();

const requestPayloadSchemas: Record<OutboxEvent['kind'], z.ZodType> = {
  'session.created': sessionCreatedRequestPayloadSchema,
  'draft.saved': draftSavedRequestPayloadSchema,
  'answer.submitted': answerSubmittedRequestPayloadSchema,
  'session.advanced': sessionAdvancedRequestPayloadSchema,
  'session.submitted': sessionSubmittedRequestPayloadSchema,
  'session.review-marked': sessionReviewMarkedRequestPayloadSchema,
  'bookmark.changed': bookmarkChangedRequestPayloadSchema,
  'note.saved': noteSavedRequestPayloadSchema,
  'issue.reported': issueReportedRequestPayloadSchema,
};

const remoteEventBaseSchema = {
  sequence: z.number().int().nonnegative(),
  event_id: z.string().min(1),
  entity_id: z.string().min(1),
  occurred_at: z.string().min(1),
};

const remoteEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.created'), payload: sessionCreatedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('draft.saved'), payload: draftSavedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('answer.submitted'), payload: answerSubmittedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.advanced'), payload: sessionAdvancedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.submitted'), payload: sessionSubmittedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.review-marked'), payload: sessionReviewMarkedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('bookmark.changed'), payload: bookmarkChangedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('note.saved'), payload: noteSavedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('issue.reported'), payload: issueReportedCanonicalPayloadSchema }).strict(),
]);

// 既存のparse境界だけは旧fixtureを識別して読み取れる。同期・適用境界では
// validateRemoteEventがLEGACY_EVENTとして必ず拒否するため、旧shapeを黙って適用しない。
const legacyRemoteEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.created'), payload: sessionCreatedCanonicalPayloadSchema }).strict(),
  z.object({
    ...remoteEventBaseSchema,
    kind: z.literal('draft.saved'),
    payload: draftSavedCanonicalPayloadSchema.extend({ expectedRevision: z.number().int().nonnegative().optional() }),
  }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('answer.submitted'), payload: answerSubmittedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.advanced'), payload: sessionAdvancedCanonicalPayloadSchema }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('session.submitted'), payload: sessionSubmittedCanonicalPayloadSchema }).strict(),
  z.object({
    ...remoteEventBaseSchema,
    kind: z.literal('session.review-marked'),
    payload: sessionReviewMarkedCanonicalPayloadSchema.extend({ updatedAt: z.string().min(1).optional() }),
  }).strict(),
  z.object({
    ...remoteEventBaseSchema,
    kind: z.literal('bookmark.changed'),
    payload: bookmarkChangedCanonicalPayloadSchema.extend({ updatedAt: z.string().min(1).optional() }),
  }).strict(),
  z.object({
    ...remoteEventBaseSchema,
    kind: z.literal('note.saved'),
    payload: noteSavedCanonicalPayloadSchema.extend({ expectedRevision: z.number().int().nonnegative().optional() }),
  }).strict(),
  z.object({ ...remoteEventBaseSchema, kind: z.literal('issue.reported'), payload: issueReportedCanonicalPayloadSchema }).strict(),
]);

// 002のserver-owned fieldはidentity比較の対象外です。request側のfieldは全てcanonicalで不変です。
export const clientOwnedRequiredFields: Record<OutboxEvent['kind'], readonly string[]> = {
  'session.created': ['sessionId', 'mode', 'title', 'questionIds'],
  'draft.saved': ['sessionId', 'questionId', 'selectedChoiceIds', 'expectedRevision', 'deviceId'],
  'answer.submitted': ['sessionId', 'questionId', 'questionVersionId', 'selectedChoiceIds'],
  'session.advanced': ['sessionId', 'questionId'],
  'session.submitted': ['sessionId'],
  'session.review-marked': ['sessionId', 'questionId', 'marked'],
  'bookmark.changed': ['questionId', 'enabled'],
  'note.saved': ['questionId', 'questionVersionId', 'body', 'expectedRevision'],
  'issue.reported': ['issueId', 'questionId', 'questionVersionId', 'category', 'description'],
};

export const serverOwnedFields: Record<OutboxEvent['kind'], readonly string[]> = {
  'session.created': ['questionVersionIds', 'createdAt', 'startedAt', 'durationMinutes', 'expiresAt'],
  'draft.saved': ['questionVersionId', 'revision', 'updatedAt'],
  'answer.submitted': ['isCorrect', 'answeredAt', 'invalidated'],
  'session.advanced': ['currentIndex'],
  'session.submitted': ['submittedAt', 'answeredQuestionIds', 'expired'],
  'session.review-marked': ['updatedAt'],
  'bookmark.changed': ['updatedAt'],
  'note.saved': ['revision', 'updatedAt'],
  'issue.reported': ['createdAt'],
};

export type LearningSyncErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_EVENT'
  | 'LEGACY_EVENT'
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
  if (message.includes('LEGACY_EVENT')) return 'LEGACY_EVENT';
  if (message.includes('INVALID_EVENT')) return 'INVALID_EVENT';
  return 'NETWORK_ERROR';
}

export function parseRemoteEvent(value: unknown): RemoteSyncEvent | null {
  const result = remoteEventSchema.safeParse(value);
  if (!result.success) return null;
  return toRemoteSyncEvent(result.data);
}

function toRemoteSyncEvent(value: {
  sequence: number;
  event_id: string;
  kind: OutboxEvent['kind'];
  entity_id: string;
  occurred_at: string;
  payload: unknown;
}): RemoteSyncEvent {
  return {
    sequence: value.sequence,
    id: value.event_id,
    kind: value.kind,
    entityId: value.entity_id,
    occurredAt: value.occurred_at,
    payload: value.payload as OutboxEvent['payload'],
  };
}

export function parseRemoteEventRows(value: unknown): RemoteSyncEvent[] {
  if (!Array.isArray(value)) {
    throw new LearningSyncError('NETWORK_ERROR', '学習履歴の応答形式を確認できませんでした。');
  }
  const events: RemoteSyncEvent[] = [];
  for (const row of value) {
    const event = parseRemoteEvent(row) ?? parseLegacyRemoteEvent(row);
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

function parseLegacyRemoteEvent(value: unknown): RemoteSyncEvent | null {
  const result = legacyRemoteEventSchema.safeParse(value);
  if (!result.success) return null;
  return toRemoteSyncEvent(result.data);
}

function samePayloadValue(left: Record<string, unknown>, right: Record<string, unknown>, key: string): boolean {
  const leftValue = left[key];
  const rightValue = right[key];
  if (Array.isArray(leftValue)) {
    return Array.isArray(rightValue)
      && leftValue.length === rightValue.length
      && leftValue.every((value, index) => value === rightValue[index]);
  }
  return leftValue === rightValue;
}

function isRequestEntityConsistent(request: OutboxEvent): boolean {
  const payload = request.payload;
  if (request.kind === 'session.created' || request.kind === 'session.advanced' || request.kind === 'session.submitted') {
    return request.entityId === payload.sessionId;
  }
  if (request.kind === 'draft.saved' || request.kind === 'session.review-marked') {
    return request.entityId === `${payload.sessionId}:${payload.questionId}`;
  }
  if (request.kind === 'answer.submitted') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.entityId);
  }
  if (request.kind === 'bookmark.changed' || request.kind === 'note.saved') {
    return request.entityId === payload.questionId;
  }
  return request.entityId === payload.issueId;
}

export function isCanonicalEventForRequest(canonical: RemoteSyncEvent, request: OutboxEvent): boolean {
  if (canonical.id !== request.id || canonical.kind !== request.kind || canonical.entityId !== request.entityId) return false;
  const requestResult = requestPayloadSchemas[request.kind].safeParse(request.payload);
  if (!requestResult.success) return false;
  if (!isRequestEntityConsistent(request)) return false;
  return clientOwnedRequiredFields[request.kind].every((key) => samePayloadValue(
    requestResult.data as Record<string, unknown>,
    canonical.payload,
    key,
  ));
}

function validateCanonicalEvents(events: readonly RemoteSyncEvent[]): void {
  const violation = validateRemoteEventBatch(events);
  if (violation) {
    throw new LearningSyncError(violation.code, violation.message);
  }
}

function toRpcEvent(event: OutboxEvent) {
  const payloadResult = requestPayloadSchemas[event.kind].safeParse(event.payload);
  if (!payloadResult.success) {
    throw new LearningSyncError('INVALID_EVENT', `${event.kind}のrequest payloadが契約と一致しません。`);
  }
  if (!isRequestEntityConsistent(event)) {
    throw new LearningSyncError('INVALID_EVENT', `${event.kind}のentityIdとpayload対象が一致しません。`);
  }
  return {
    eventId: event.id,
    kind: event.kind,
    entityId: event.entityId,
    occurredAt: event.occurredAt,
    payload: payloadResult.data,
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
  validateCanonicalEvents(parsed);
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
  validateCanonicalEvents(events);
  if (events.some((event, index) => event.sequence <= cursor || (index > 0 && event.sequence <= events[index - 1]!.sequence))) {
    throw new LearningSyncError('NETWORK_ERROR', '学習履歴のsequence順序を確認できませんでした。');
  }
  return events;
}
