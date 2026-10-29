import { describe, expect, it } from 'vitest';

import type { OutboxEvent } from '@/domain/types';

import { findLocalConflictEvent, parseRemoteEvent, parseRpcAcknowledgements, rpcBatchSize, toRpcEvent } from './protocol';

function draftEvent(): OutboxEvent {
  return {
    id: crypto.randomUUID(), kind: 'draft.saved', entityId: 'session-1:fl-001',
    occurredAt: '2026-10-29T00:00:00.000Z',
    payload: { sessionId: 'session-1', questionId: 'fl-001', selectedChoiceIds: ['fl-001-A'],
      expectedRevision: 0, deviceId: 'device-1' },
  };
}

describe('同期RPC契約', () => {
  it('認証主体やローカル採点をRPC外側へ混ぜずに送る', () => {
    const event = draftEvent();
    expect(toRpcEvent(event)).toEqual({
      eventId: event.id, kind: event.kind, entityId: event.entityId,
      occurredAt: event.occurredAt, payload: event.payload,
    });
    expect(Object.keys(toRpcEvent(event))).toEqual(['eventId', 'kind', 'entityId', 'occurredAt', 'payload']);
    expect(rpcBatchSize).toBeLessThanOrEqual(100);
  });

  it('revisionや端末IDを欠くドラフトは送信前に拒否する', () => {
    const event = draftEvent();
    expect(() => toRpcEvent({ ...event, payload: { sessionId: 'session-1', questionId: 'fl-001', selectedChoiceIds: [] } })).toThrow();
    expect(() => toRpcEvent({ ...event, kind: 'note.saved', payload: { questionId: 'fl-001', body: 'a' } })).toThrow();
  });

  it('ローカルの正誤・回答時刻・模試採点を送信せず、サーバー側の結果を正とする', () => {
    const event = draftEvent();
    const answer: OutboxEvent = { ...event, kind: 'answer.submitted', entityId: crypto.randomUUID(),
      payload: { sessionId: 'session-1', questionId: 'fl-001', questionVersionId: 'fl-001-v1',
        selectedChoiceIds: ['fl-001-A'], isCorrect: true, answeredAt: '2099-01-01T00:00:00.000Z' } };
    expect(toRpcEvent(answer).payload).toEqual({ sessionId: 'session-1', questionId: 'fl-001',
      questionVersionId: 'fl-001-v1', selectedChoiceIds: ['fl-001-A'] });
    const exam: OutboxEvent = { ...event, kind: 'session.submitted', entityId: 'session-1',
      payload: { sessionId: 'session-1', submittedAt: '2099-01-01T00:00:00.000Z', answeredQuestionIds: ['fl-001'] } };
    expect(toRpcEvent(exam).payload).toEqual({ sessionId: 'session-1' });
  });

  it('RPCの応答ID・kind・entityが一致する場合だけACKし、null値を解析する', () => {
    const event = draftEvent();
    const canonical = { sequence: 5, event_id: event.id, kind: event.kind,
      entity_id: event.entityId, occurred_at: event.occurredAt,
      payload: { ...event.payload, revision: 1, updatedAt: event.occurredAt, expiresAt: null } };
    expect(parseRpcAcknowledgements([canonical], [event])[0]?.payload.revision).toBe(1);
    expect(parseRemoteEvent(canonical)?.payload.expiresAt).toBeNull();
    expect(() => parseRpcAcknowledgements([{ ...canonical, event_id: crypto.randomUUID() }], [event])).toThrow();
    expect(() => parseRpcAcknowledgements([], [event])).toThrow();
    expect(() => parseRpcAcknowledgements([{ ...canonical, kind: 'note.saved' }], [event])).toThrow();
    expect(parseRemoteEvent({ ...canonical, payload: { ...canonical.payload, revision: -1 } })).toBeNull();
  });

  it('未送信の選択だけでも別端末の確定回答を解決画面に表示できる', () => {
    const draft = draftEvent();
    const remoteId = crypto.randomUUID();
    const remote = { id: remoteId, kind: 'answer.submitted' as const, entityId: remoteId,
      occurredAt: draft.occurredAt, sequence: 1, payload: { sessionId: 'session-1', questionId: 'fl-001',
        questionVersionId: 'fl-001-v1', selectedChoiceIds: ['fl-001-B'], isCorrect: true,
        answeredAt: draft.occurredAt } };
    expect(findLocalConflictEvent([draft], { kind: 'answer.submitted', entityId: remoteId, remote })?.id).toBe(draft.id);
  });
});
