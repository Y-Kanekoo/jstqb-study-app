import type { OutboxEvent, RemoteSyncEvent } from '@/domain/types';

export type LearningSyncContractViolationCode = 'INVALID_EVENT' | 'LEGACY_EVENT';

export interface LearningSyncContractViolation {
  code: LearningSyncContractViolationCode;
  message: string;
}

type Payload = OutboxEvent['payload'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isUniqueStringArray(value: unknown): value is string[] {
  return isStringArray(value) && new Set(value).size === value.length;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasCanonicalString(payload: Payload, key: string): boolean {
  return isNonEmptyString(payload[key]);
}

function hasCanonicalInteger(payload: Payload, key: string): boolean {
  return isNonNegativeInteger(payload[key]);
}

function legacy(message: string): LearningSyncContractViolation {
  return { code: 'LEGACY_EVENT', message: `旧形式の同期イベントです。DB upgrade後のcanonical eventを要求します: ${message}` };
}

function invalid(message: string): LearningSyncContractViolation {
  return { code: 'INVALID_EVENT', message };
}

export function validateRemoteEvent(event: RemoteSyncEvent): LearningSyncContractViolation | null {
  const payload = event.payload;

  if (event.kind === 'session.created') {
    if (!hasCanonicalString(payload, 'createdAt')
      || !hasCanonicalString(payload, 'startedAt')
      || !('questionVersionIds' in payload)
      || !('durationMinutes' in payload)
      || !('expiresAt' in payload)) {
      return legacy('session.createdのserver-owned fieldが不足しています。');
    }
    if (payload.sessionId !== event.entityId) return invalid('entityId と sessionId が一致しません。');
    if (!isUniqueStringArray(payload.questionIds)
      || payload.questionIds.length === 0
      || !isUniqueStringArray(payload.questionVersionIds)
      || payload.questionVersionIds.length === 0
      || payload.questionIds.length !== payload.questionVersionIds.length) {
      return invalid('session.createdのquestionIdsとquestionVersionIdsは同数・非空・一意で指定してください。');
    }
    if (payload.durationMinutes !== null && !isNonNegativeInteger(payload.durationMinutes)) {
      return invalid('session.createdのdurationMinutesが不正です。');
    }
    if (payload.expiresAt !== null && !isNonEmptyString(payload.expiresAt)) {
      return invalid('session.createdのexpiresAtが不正です。');
    }
    return null;
  }

  if (event.kind === 'draft.saved') {
    if (!hasCanonicalString(payload, 'questionVersionId')
      || !hasCanonicalInteger(payload, 'revision')
      || !hasCanonicalString(payload, 'updatedAt')) {
      return legacy('draft.savedのquestionVersionId・revision・updatedAtが不足しています。');
    }
    if (payload.entityId !== undefined) return invalid('draft.saved payloadにentityIdは指定できません。');
    if (!isNonEmptyString(payload.sessionId)
      || !isNonEmptyString(payload.questionId)
      || !isStringArray(payload.selectedChoiceIds)
      || !isNonEmptyString(payload.deviceId)
      || new Set(payload.selectedChoiceIds).size !== payload.selectedChoiceIds.length) {
      return invalid('draft.savedのpayloadまたはselectedChoiceIdsが不正です。');
    }
    if (event.entityId !== `${payload.sessionId}:${payload.questionId}`) {
      return invalid('entityId とドラフト対象が一致しません。');
    }
    return null;
  }

  if (event.kind === 'answer.submitted') {
    if (typeof payload.isCorrect !== 'boolean') {
      return legacy('answer.submittedのisCorrectが不足しています。');
    }
    if (!hasCanonicalString(payload, 'answeredAt')) {
      return legacy('answer.submittedのansweredAtが不足しています。');
    }
    if (!isUuid(event.entityId)) return invalid('answer.submittedのentityIdはattempt UUIDで指定してください。');
    if (!isNonEmptyString(payload.sessionId)
      || !isNonEmptyString(payload.questionId)
      || !isNonEmptyString(payload.questionVersionId)
      || !isStringArray(payload.selectedChoiceIds)
      || new Set(payload.selectedChoiceIds).size !== payload.selectedChoiceIds.length
      || typeof payload.isCorrect !== 'boolean') {
      return invalid('answer.submittedのpayloadまたはselectedChoiceIdsが不正です。');
    }
    return null;
  }

  if (event.kind === 'session.advanced') {
    if (!hasCanonicalInteger(payload, 'currentIndex')) {
      return legacy('session.advancedのcurrentIndexが不足しています。');
    }
    if (payload.sessionId !== event.entityId) return invalid('entityId と sessionId が一致しません。');
    if (!isNonEmptyString(payload.questionId)) return invalid('session.advancedのquestionIdが不正です。');
    return null;
  }

  if (event.kind === 'session.submitted') {
    if (!hasCanonicalString(payload, 'submittedAt')
      || !('answeredQuestionIds' in payload)
      || !isBoolean(payload.expired)) {
      return legacy('session.submittedのsubmittedAt・answeredQuestionIds・expiredが不足しています。');
    }
    if (payload.sessionId !== event.entityId) return invalid('entityId と sessionId が一致しません。');
    if (!isStringArray(payload.answeredQuestionIds)
      || new Set(payload.answeredQuestionIds).size !== payload.answeredQuestionIds.length) {
      return invalid('session.submittedのansweredQuestionIdsが不正です。');
    }
    return null;
  }

  if (event.kind === 'session.review-marked') {
    if (!hasCanonicalString(payload, 'updatedAt')) return legacy('session.review-markedのupdatedAtが不足しています。');
    if (event.entityId !== `${payload.sessionId}:${payload.questionId}`) {
      return invalid('entityId と復習マーク対象が一致しません。');
    }
    if (!isNonEmptyString(payload.sessionId) || !isNonEmptyString(payload.questionId) || !isBoolean(payload.marked)) {
      return invalid('session.review-markedのpayloadが不正です。');
    }
    return null;
  }

  if (event.kind === 'bookmark.changed') {
    if (!hasCanonicalString(payload, 'updatedAt')) return legacy('bookmark.changedのupdatedAtが不足しています。');
    if (event.entityId !== payload.questionId) return invalid('entityId と questionId が一致しません。');
    if (!isNonEmptyString(payload.questionId) || !isBoolean(payload.enabled)) {
      return invalid('bookmark.changedのpayloadが不正です。');
    }
    return null;
  }

  if (event.kind === 'note.saved') {
    if (!hasCanonicalInteger(payload, 'revision') || !hasCanonicalString(payload, 'updatedAt')) {
      return legacy('note.savedのrevision・updatedAtが不足しています。');
    }
    if (event.entityId !== payload.questionId) return invalid('entityId とquestionIdが一致しません。');
    if (!isNonEmptyString(payload.questionId)
      || !isNonEmptyString(payload.questionVersionId)
      || typeof payload.body !== 'string') {
      return invalid('note.savedのpayloadが不正です。');
    }
    return null;
  }

  if (event.kind === 'issue.reported') {
    if (!hasCanonicalString(payload, 'createdAt')) return legacy('issue.reportedのcreatedAtが不足しています。');
    if (event.entityId !== payload.issueId) return invalid('entityId と issueId が一致しません。');
    if (!isNonEmptyString(payload.issueId)
      || !isNonEmptyString(payload.questionId)
      || !isNonEmptyString(payload.questionVersionId)
      || !isNonEmptyString(payload.category)
      || typeof payload.description !== 'string') {
      return invalid('issue.reportedのpayloadが不正です。');
    }
    return null;
  }

  return invalid('対応していないkindです。');
}

export function validateRemoteEventBatch(events: readonly RemoteSyncEvent[]): LearningSyncContractViolation | null {
  for (const event of events) {
    const violation = validateRemoteEvent(event);
    if (violation) return violation;
  }
  return null;
}
