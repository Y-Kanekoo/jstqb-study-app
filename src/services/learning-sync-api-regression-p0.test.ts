import { describe, expect, it, vi } from 'vitest';

import type { OutboxEvent } from '@/domain/types';
import { ingestLearningEvents, LearningSyncError, parseRemoteEventRows } from './learning-sync-api';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    rpc: mocks.rpc,
  },
}));

const validRows: unknown[] = [
  {
    sequence: 10,
    event_id: 'event-session',
    kind: 'session.created',
    entity_id: 'session-1',
    occurred_at: '2026-08-12T00:00:00.000Z',
    payload: {
      sessionId: 'session-1',
      mode: 'random',
      title: '演習',
      questionIds: ['question-1'],
      questionVersionIds: ['question-1-v1'],
      createdAt: '2026-08-12T00:00:00.000Z',
      startedAt: '2026-08-12T00:00:00.000Z',
      durationMinutes: null,
      expiresAt: null,
    },
  },
  {
    sequence: 11,
    event_id: 'event-draft',
    kind: 'draft.saved',
    entity_id: 'session-1:question-1',
    occurred_at: '2026-08-12T00:00:01.000Z',
    payload: {
      sessionId: 'session-1',
      questionId: 'question-1',
      selectedChoiceIds: ['choice-a'],
      questionVersionId: 'question-1-v1',
      revision: 1,
      deviceId: 'device-1',
      updatedAt: '2026-08-12T00:00:01.000Z',
    },
  },
  {
    sequence: 12,
    event_id: 'event-answer',
    kind: 'answer.submitted',
    entity_id: 'attempt-1',
    occurred_at: '2026-08-12T00:00:02.000Z',
    payload: {
      sessionId: 'session-1',
      questionId: 'question-1',
      questionVersionId: 'question-1-v1',
      selectedChoiceIds: ['choice-a'],
      isCorrect: true,
      answeredAt: '2026-08-12T00:00:02.000Z',
    },
  },
  {
    sequence: 13,
    event_id: 'event-advanced',
    kind: 'session.advanced',
    entity_id: 'session-1',
    occurred_at: '2026-08-12T00:00:03.000Z',
    payload: { sessionId: 'session-1', questionId: 'question-2', currentIndex: 1 },
  },
  {
    sequence: 14,
    event_id: 'event-submitted',
    kind: 'session.submitted',
    entity_id: 'session-1',
    occurred_at: '2026-08-12T00:00:04.000Z',
    payload: {
      sessionId: 'session-1',
      submittedAt: '2026-08-12T00:00:04.000Z',
      answeredQuestionIds: ['question-1'],
      expired: false,
    },
  },
  {
    sequence: 15,
    event_id: 'event-review',
    kind: 'session.review-marked',
    entity_id: 'session-1:question-1',
    occurred_at: '2026-08-12T00:00:05.000Z',
    payload: { sessionId: 'session-1', questionId: 'question-1', marked: true },
  },
  {
    sequence: 16,
    event_id: 'event-bookmark',
    kind: 'bookmark.changed',
    entity_id: 'question-1',
    occurred_at: '2026-08-12T00:00:06.000Z',
    payload: { questionId: 'question-1', enabled: true },
  },
  {
    sequence: 17,
    event_id: 'event-note',
    kind: 'note.saved',
    entity_id: 'question-1',
    occurred_at: '2026-08-12T00:00:07.000Z',
    payload: {
      questionId: 'question-1',
      questionVersionId: 'question-1-v1',
      body: 'メモ',
      revision: 1,
      updatedAt: '2026-08-12T00:00:07.000Z',
    },
  },
  {
    sequence: 18,
    event_id: 'event-issue',
    kind: 'issue.reported',
    entity_id: 'issue-1',
    occurred_at: '2026-08-12T00:00:08.000Z',
    payload: {
      issueId: 'issue-1',
      questionId: 'question-1',
      questionVersionId: 'question-1-v1',
      category: 'unclear',
      description: '表現を確認してください。',
      createdAt: '2026-08-12T00:00:08.000Z',
    },
  },
];

describe('同期remote eventのstrict境界', () => {
  it('全kindを必須payload付きでparseし、camelCaseへ正規化する', () => {
    const parsed = parseRemoteEventRows(validRows);

    expect(parsed).toHaveLength(validRows.length);
    expect(parsed.map((event) => event.kind)).toEqual([
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
    expect(parsed[0]).toMatchObject({ id: 'event-session', entityId: 'session-1', occurredAt: '2026-08-12T00:00:00.000Z' });
  });

  it('kind別payloadの欠損・余剰・不正型をfail-closedにする', () => {
    const answerRow = validRows[2] as {
      payload: { selectedChoiceIds: string[]; [key: string]: unknown };
      [key: string]: unknown;
    };
    const { selectedChoiceIds: _selectedChoiceIds, ...payloadWithoutChoices } = answerRow.payload;
    const missingPayloadRow = { ...answerRow, payload: payloadWithoutChoices };
    const extraPayloadRow = {
      ...validRows[6] as Record<string, unknown>,
      payload: {
        ...(validRows[6] as { payload: Record<string, unknown> }).payload,
        unexpected: '拒否対象',
      },
    };
    const invalidTypeRow = {
      ...validRows[6] as Record<string, unknown>,
      payload: {
        ...(validRows[6] as { payload: Record<string, unknown> }).payload,
        enabled: 'true',
      },
    };

    expect(() => parseRemoteEventRows([missingPayloadRow])).toThrow(LearningSyncError);
    expect(() => parseRemoteEventRows([extraPayloadRow])).toThrow('不正なイベント');
    expect(() => parseRemoteEventRows([invalidTypeRow])).toThrow('不正なイベント');
  });

  it('parseできるが要求eventと意味が異なるpush応答をINVALID_EVENTにする', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    mocks.rpc.mockResolvedValue({
      data: [{
        ...(validRows[6] as Record<string, unknown>),
        entity_id: 'another-question',
      }],
      error: null,
    });
    const request: OutboxEvent = {
      id: 'event-bookmark',
      kind: 'bookmark.changed',
      entityId: 'question-1',
      occurredAt: '2026-08-12T00:00:06.000Z',
      payload: { questionId: 'question-1', enabled: true },
    };

    await expect(ingestLearningEvents([request])).rejects.toMatchObject({ syncCode: 'INVALID_EVENT' });
  });
});
