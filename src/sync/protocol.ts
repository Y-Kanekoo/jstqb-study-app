import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';

const syncKinds: ReadonlySet<string> = new Set([
  'session.created', 'draft.saved', 'answer.submitted', 'session.advanced',
  'session.submitted', 'session.review-marked', 'bookmark.changed',
  'note.saved', 'issue.reported',
]);

export const rpcBatchSize = 20;

export function findLocalConflictEvent(
  outbox: OutboxEvent[],
  conflict: { kind: 'draft.saved' | 'note.saved' | 'answer.submitted' | 'session.submitted'; entityId: string; remote: RemoteSyncEvent },
): OutboxEvent | undefined {
  return outbox.filter((event) => conflict.kind === 'answer.submitted'
    ? (event.kind === 'answer.submitted' || event.kind === 'draft.saved')
      && event.payload.sessionId === conflict.remote.payload.sessionId
      && event.payload.questionId === conflict.remote.payload.questionId
    : conflict.kind === 'session.submitted'
      ? event.payload.sessionId === conflict.entityId
      : event.kind === conflict.kind && event.entityId === conflict.entityId).at(-1);
}

function textField(payload: OutboxEvent['payload'], name: string): string {
  const value = payload[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`同期イベントの${name}が不正です。`);
  return value;
}

function stringList(payload: OutboxEvent['payload'], name: string): string[] {
  const value = payload[name];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`同期イベントの${name}が不正です。`);
  }
  return value;
}

function booleanField(payload: OutboxEvent['payload'], name: string): boolean {
  const value = payload[name];
  if (typeof value !== 'boolean') throw new Error(`同期イベントの${name}が不正です。`);
  return value;
}

function expectedRevision(payload: OutboxEvent['payload']): number {
  const value = payload.expectedRevision;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('同期イベントのexpectedRevisionが不正です。');
  }
  return value;
}

function rpcPayload(event: OutboxEvent): OutboxEvent['payload'] {
  const payload = event.payload;
  switch (event.kind) {
    case 'session.created':
      return { sessionId: textField(payload, 'sessionId'), mode: textField(payload, 'mode'),
        title: textField(payload, 'title'), questionIds: stringList(payload, 'questionIds') };
    case 'draft.saved':
      return { sessionId: textField(payload, 'sessionId'), questionId: textField(payload, 'questionId'),
        selectedChoiceIds: stringList(payload, 'selectedChoiceIds'),
        expectedRevision: expectedRevision(payload), deviceId: textField(payload, 'deviceId') };
    case 'answer.submitted':
      return { sessionId: textField(payload, 'sessionId'), questionId: textField(payload, 'questionId'),
        questionVersionId: textField(payload, 'questionVersionId'),
        selectedChoiceIds: stringList(payload, 'selectedChoiceIds') };
    case 'session.advanced':
      return { sessionId: textField(payload, 'sessionId'), questionId: textField(payload, 'questionId') };
    case 'session.submitted':
      return { sessionId: textField(payload, 'sessionId') };
    case 'session.review-marked':
      return { sessionId: textField(payload, 'sessionId'), questionId: textField(payload, 'questionId'),
        marked: booleanField(payload, 'marked') };
    case 'bookmark.changed':
      return { questionId: textField(payload, 'questionId'), enabled: booleanField(payload, 'enabled') };
    case 'note.saved':
      return { questionId: textField(payload, 'questionId'),
        questionVersionId: textField(payload, 'questionVersionId'),
        body: typeof payload.body === 'string' ? payload.body : textField(payload, 'body'),
        expectedRevision: expectedRevision(payload) };
    case 'issue.reported':
      return { issueId: textField(payload, 'issueId'), questionId: textField(payload, 'questionId'),
        questionVersionId: textField(payload, 'questionVersionId'), category: textField(payload, 'category'),
        description: textField(payload, 'description') };
  }
}

function isPayload(value: unknown): value is OutboxEvent['payload'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((item) => item === null || typeof item === 'string'
    || typeof item === 'number' || typeof item === 'boolean'
    || (Array.isArray(item) && item.every((entry) => typeof entry === 'string')));
}

function validCanonicalPayload(kind: OutboxEvent['kind'], payload: OutboxEvent['payload']): boolean {
  const hasText = (name: string) => typeof payload[name] === 'string' && payload[name] !== '';
  const hasList = (name: string) => Array.isArray(payload[name]);
  const hasRevision = typeof payload.revision === 'number' && Number.isSafeInteger(payload.revision) && payload.revision > 0;
  switch (kind) {
    case 'session.created':
      return hasText('sessionId') && hasText('mode') && hasText('title') && hasList('questionIds') && hasText('createdAt')
        && hasList('questionVersionIds')
        && (payload.questionVersionIds as string[]).length === (payload.questionIds as string[]).length;
    case 'draft.saved':
      return hasText('sessionId') && hasText('questionId') && hasList('selectedChoiceIds')
        && hasText('updatedAt') && hasRevision;
    case 'answer.submitted':
      return hasText('sessionId') && hasText('questionId') && hasText('questionVersionId')
        && hasList('selectedChoiceIds') && typeof payload.isCorrect === 'boolean' && hasText('answeredAt')
        && (payload.invalidated === undefined || typeof payload.invalidated === 'boolean');
    case 'session.advanced':
      return hasText('sessionId') && hasText('questionId') && typeof payload.currentIndex === 'number'
        && Number.isSafeInteger(payload.currentIndex) && payload.currentIndex >= 0;
    case 'session.submitted':
      return hasText('sessionId') && hasText('submittedAt') && hasList('answeredQuestionIds');
    case 'session.review-marked':
      return hasText('sessionId') && hasText('questionId') && typeof payload.marked === 'boolean';
    case 'bookmark.changed':
      return hasText('questionId') && typeof payload.enabled === 'boolean';
    case 'note.saved':
      return hasText('questionId') && hasText('questionVersionId') && typeof payload.body === 'string'
        && hasText('updatedAt') && hasRevision;
    case 'issue.reported':
      return hasText('issueId') && hasText('questionId') && hasText('questionVersionId')
        && hasText('category') && hasText('description') && hasText('createdAt');
  }
}

export function parseRemoteEvent(value: unknown): RemoteSyncEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('sequence' in value) || typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence)
    || value.sequence < 0 || !('event_id' in value) || typeof value.event_id !== 'string'
    || !('kind' in value) || typeof value.kind !== 'string' || !syncKinds.has(value.kind)
    || !('entity_id' in value) || typeof value.entity_id !== 'string'
    || !('occurred_at' in value) || typeof value.occurred_at !== 'string'
    || !('payload' in value) || !isPayload(value.payload)) return null;
  const kind = value.kind as OutboxEvent['kind'];
  if (!validCanonicalPayload(kind, value.payload)) return null;
  return {
    sequence: value.sequence,
    id: value.event_id,
    kind,
    entityId: value.entity_id,
    occurredAt: value.occurred_at,
    payload: value.payload,
  };
}

export function toRpcEvent(event: OutboxEvent) {
  return { eventId: event.id, kind: event.kind, entityId: event.entityId,
    occurredAt: event.occurredAt, payload: rpcPayload(event) };
}

export function parseRpcAcknowledgements(value: unknown, batch: OutboxEvent[]): RemoteSyncEvent[] {
  if (!Array.isArray(value) || value.length !== batch.length) throw new Error('同期応答の件数が一致しません。');
  return value.map((row: unknown, index) => {
    const event = parseRemoteEvent(row);
    const expected = batch[index];
    if (!event || !expected || event.id !== expected.id || event.kind !== expected.kind
      || event.entityId !== expected.entityId) throw new Error('同期応答のイベントが一致しません。');
    return event;
  });
}
