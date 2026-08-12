import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxEvent } from '@/domain/types';
import { getCurrentLearningSnapshot, useLearningStore } from '@/state/learning-store';
import {
  isCanonicalEventForRequest,
  parseRemoteEvent,
} from './learning-sync-api';
import { validateRemoteEventBatch } from './learning-sync-contract';

const storedValues = new Map<string, string>();
const sessionId = '40000000-0000-4000-8000-000000000001';
const attemptId = '50000000-0000-4000-8000-000000000001';
const issueId = '60000000-0000-4000-8000-000000000001';

vi.mock('expo-crypto', () => ({
  randomUUID: () => '70000000-0000-4000-8000-000000000001',
}));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: async (key: string): Promise<string | null> => storedValues.get(key) ?? null,
  setStoredValue: async (key: string, value: string): Promise<void> => {
    storedValues.set(key, value);
  },
}));

const requestEvents: OutboxEvent[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    kind: 'session.created',
    entityId: sessionId,
    occurredAt: '2026-08-12T00:00:00.000Z',
    payload: {
      sessionId,
      mode: 'random',
      title: '契約試験',
      questionIds: ['fl-001', 'fl-002'],
    },
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    kind: 'draft.saved',
    entityId: `${sessionId}:fl-001`,
    occurredAt: '2026-08-12T00:00:01.000Z',
    payload: {
      sessionId,
      questionId: 'fl-001',
      selectedChoiceIds: ['fl-001-A'],
      expectedRevision: 0,
      deviceId: 'contract-device',
    },
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    kind: 'answer.submitted',
    entityId: attemptId,
    occurredAt: '2026-08-12T00:00:02.000Z',
    payload: {
      sessionId,
      questionId: 'fl-001',
      questionVersionId: 'fl-001-v1',
      selectedChoiceIds: ['fl-001-A'],
    },
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    kind: 'session.advanced',
    entityId: sessionId,
    occurredAt: '2026-08-12T00:00:03.000Z',
    payload: { sessionId, questionId: 'fl-002' },
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    kind: 'session.submitted',
    entityId: sessionId,
    occurredAt: '2026-08-12T00:00:04.000Z',
    payload: { sessionId },
  },
  {
    id: '30000000-0000-4000-8000-000000000006',
    kind: 'session.review-marked',
    entityId: `${sessionId}:fl-001`,
    occurredAt: '2026-08-12T00:00:05.000Z',
    payload: { sessionId, questionId: 'fl-001', marked: true },
  },
  {
    id: '30000000-0000-4000-8000-000000000007',
    kind: 'bookmark.changed',
    entityId: 'fl-001',
    occurredAt: '2026-08-12T00:00:06.000Z',
    payload: { questionId: 'fl-001', enabled: true },
  },
  {
    id: '30000000-0000-4000-8000-000000000008',
    kind: 'note.saved',
    entityId: 'fl-001',
    occurredAt: '2026-08-12T00:00:07.000Z',
    payload: {
      questionId: 'fl-001',
      questionVersionId: 'fl-001-v1',
      body: '契約fixture',
      expectedRevision: 0,
    },
  },
  {
    id: '30000000-0000-4000-8000-000000000009',
    kind: 'issue.reported',
    entityId: issueId,
    occurredAt: '2026-08-12T00:00:08.000Z',
    payload: {
      issueId,
      questionId: 'fl-001',
      questionVersionId: 'fl-001-v1',
      category: 'unclear',
      description: '契約fixtureの報告です。',
    },
  },
];

const canonicalRows: unknown[] = [
  {
    sequence: 1,
    event_id: requestEvents[0]?.id,
    kind: 'session.created',
    entity_id: sessionId,
    occurred_at: '2026-08-12T00:00:00.100Z',
    payload: {
      sessionId,
      mode: 'random',
      title: '契約試験',
      questionIds: ['fl-001', 'fl-002'],
      questionVersionIds: ['fl-001-v1', 'fl-002-v1'],
      createdAt: '2026-08-12T00:00:00.100Z',
      startedAt: '2026-08-12T00:00:00.100Z',
      durationMinutes: null,
      expiresAt: null,
    },
  },
  {
    sequence: 2,
    event_id: requestEvents[1]?.id,
    kind: 'draft.saved',
    entity_id: `${sessionId}:fl-001`,
    occurred_at: '2026-08-12T00:00:01.100Z',
    payload: {
      sessionId,
      questionId: 'fl-001',
      selectedChoiceIds: ['fl-001-A'],
      expectedRevision: 0,
      deviceId: 'contract-device',
      questionVersionId: 'fl-001-v1',
      revision: 1,
      updatedAt: '2026-08-12T00:00:01.100Z',
    },
  },
  {
    sequence: 3,
    event_id: requestEvents[2]?.id,
    kind: 'answer.submitted',
    entity_id: attemptId,
    occurred_at: '2026-08-12T00:00:02.100Z',
    payload: {
      sessionId,
      questionId: 'fl-001',
      questionVersionId: 'fl-001-v1',
      selectedChoiceIds: ['fl-001-A'],
      isCorrect: false,
      answeredAt: '2026-08-12T00:00:02.100Z',
    },
  },
  {
    sequence: 4,
    event_id: requestEvents[3]?.id,
    kind: 'session.advanced',
    entity_id: sessionId,
    occurred_at: '2026-08-12T00:00:03.100Z',
    payload: { sessionId, questionId: 'fl-002', currentIndex: 1 },
  },
  {
    sequence: 5,
    event_id: requestEvents[4]?.id,
    kind: 'session.submitted',
    entity_id: sessionId,
    occurred_at: '2026-08-12T00:00:04.100Z',
    payload: {
      sessionId,
      submittedAt: '2026-08-12T00:00:04.100Z',
      answeredQuestionIds: ['fl-001'],
      expired: false,
    },
  },
  {
    sequence: 6,
    event_id: requestEvents[5]?.id,
    kind: 'session.review-marked',
    entity_id: `${sessionId}:fl-001`,
    occurred_at: '2026-08-12T00:00:05.100Z',
    payload: {
      sessionId,
      questionId: 'fl-001',
      marked: true,
      updatedAt: '2026-08-12T00:00:05.100Z',
    },
  },
  {
    sequence: 7,
    event_id: requestEvents[6]?.id,
    kind: 'bookmark.changed',
    entity_id: 'fl-001',
    occurred_at: '2026-08-12T00:00:06.100Z',
    payload: {
      questionId: 'fl-001',
      enabled: true,
      updatedAt: '2026-08-12T00:00:06.100Z',
    },
  },
  {
    sequence: 8,
    event_id: requestEvents[7]?.id,
    kind: 'note.saved',
    entity_id: 'fl-001',
    occurred_at: '2026-08-12T00:00:07.100Z',
    payload: {
      questionId: 'fl-001',
      questionVersionId: 'fl-001-v1',
      body: '契約fixture',
      expectedRevision: 0,
      revision: 1,
      updatedAt: '2026-08-12T00:00:07.100Z',
    },
  },
  {
    sequence: 9,
    event_id: requestEvents[8]?.id,
    kind: 'issue.reported',
    entity_id: issueId,
    occurred_at: '2026-08-12T00:00:08.100Z',
    payload: {
      issueId,
      questionId: 'fl-001',
      questionVersionId: 'fl-001-v1',
      category: 'unclear',
      description: '契約fixtureの報告です。',
      createdAt: '2026-08-12T00:00:08.100Z',
    },
  },
];

describe('server #7同期contract', () => {
  beforeEach(async () => {
    storedValues.clear();
    await useLearningStore.getState().initialize('contract-user');
  });

  it('全9 kindを実request→実canonicalとしてparse・identity検証し、atomicにapplyする', async () => {
    const parsed = canonicalRows.map((row) => {
      const event = parseRemoteEvent(row);
      if (!event) throw new Error('canonical fixtureをparseできません。');
      return event;
    });

    expect(parsed).toHaveLength(9);
    expect(parsed.every((event, index) => isCanonicalEventForRequest(event, requestEvents[index]!))).toBe(true);
    expect(validateRemoteEventBatch(parsed)).toBeNull();

    await useLearningStore.getState().applyRemoteEvents(parsed, 'pull');

    const snapshot = getCurrentLearningSnapshot();
    expect(snapshot.syncCursor).toBe(9);
    expect(snapshot.sessions[0]).toMatchObject({
      id: sessionId,
      questionVersionIds: ['fl-001-v1', 'fl-002-v1'],
      currentIndex: 1,
      answeredQuestionIds: ['fl-001'],
      status: 'completed',
      reviewQuestionIds: ['fl-001'],
    });
    expect(snapshot.drafts[`${sessionId}:fl-001`]).toMatchObject({ revision: 1, questionVersionId: 'fl-001-v1' });
    expect(snapshot.attempts[0]).toMatchObject({ id: attemptId, isCorrect: false });
    expect(snapshot.bookmarks).toEqual(['fl-001']);
    expect(snapshot.notes['fl-001']).toMatchObject({ revision: 1, body: '契約fixture' });
    expect(snapshot.issues[0]).toMatchObject({ id: issueId, syncStatus: 'synced' });
  });

  it('request側fieldの書換えは拒否し、server-owned追加fieldの差分は許可する', () => {
    const draft = parseRemoteEvent(canonicalRows[1]);
    if (!draft) throw new Error('draft canonical fixtureをparseできません。');
    const changedRequestField = {
      ...draft,
      payload: { ...draft.payload, deviceId: 'server-rewrite' },
    };
    const changedServerField = {
      ...draft,
      payload: { ...draft.payload, questionVersionId: 'server-pinned-v2', revision: 9, updatedAt: '2026-08-12T00:09:00.000Z' },
    };

    expect(isCanonicalEventForRequest(changedRequestField, requestEvents[1]!)).toBe(false);
    expect(isCanonicalEventForRequest(changedServerField, requestEvents[1]!)).toBe(true);
  });

  it('review/bookmarkの旧canonical shapeをstrict parseで受け付けない', () => {
    const legacyReview = {
      ...(canonicalRows[5] as Record<string, unknown>),
      payload: { sessionId, questionId: 'fl-001', marked: true },
    };
    const legacyBookmark = {
      ...(canonicalRows[6] as Record<string, unknown>),
      payload: { questionId: 'fl-001', enabled: true },
    };

    expect(parseRemoteEvent(legacyReview)).toBeNull();
    expect(parseRemoteEvent(legacyBookmark)).toBeNull();
  });

  it('semantic不正batchはapply前に拒否しcursorを進めない', async () => {
    const parsed = canonicalRows.map((row) => {
      const event = parseRemoteEvent(row);
      if (!event) throw new Error('canonical fixtureをparseできません。');
      return event;
    });
    const invalidBookmark = {
      ...parsed[6]!,
      payload: { ...parsed[6]!.payload, questionId: 'fl-002' },
    };

    await expect(useLearningStore.getState().applyRemoteEvents([parsed[5]!, invalidBookmark], 'pull'))
      .rejects.toThrow('entityId と questionId が一致しません');
    expect(getCurrentLearningSnapshot().syncCursor).toBe(0);
    expect(getCurrentLearningSnapshot().bookmarks).toEqual([]);
  });
});
