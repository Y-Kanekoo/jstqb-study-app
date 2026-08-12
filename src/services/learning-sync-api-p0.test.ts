import { describe, expect, it } from 'vitest';

import { LearningSyncError, parseRemoteEventRows } from './learning-sync-api';

const validEvent = {
  sequence: 10,
  event_id: 'event-1',
  kind: 'bookmark.changed',
  entity_id: 'question-1',
  occurred_at: '2026-08-12T00:00:00.000Z',
  payload: { questionId: 'question-1', enabled: true },
};

describe('P0同期応答境界', () => {
  it('raw件数とparse件数が一致しない応答をfail-closedにする', () => {
    expect(() => parseRemoteEventRows([validEvent, { sequence: 11 }])).toThrow(LearningSyncError);
    expect(() => parseRemoteEventRows([validEvent, { sequence: 11 }])).toThrow('不正なイベント');
  });

  it('配列でないpull応答をcursor更新対象にしない', () => {
    expect(() => parseRemoteEventRows({})).toThrow('応答形式');
  });
});
