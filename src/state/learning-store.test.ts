import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setStoredValue } from '@/storage/persistence';

import { useLearningStore } from './learning-store';

vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: vi.fn().mockResolvedValue(null),
  setStoredValue: vi.fn().mockResolvedValue(undefined),
}));

describe('セッション開始時の保存失敗', () => {
  beforeEach(() => {
    vi.mocked(setStoredValue).mockReset().mockResolvedValue(undefined);
    useLearningStore.setState({ sessions: [], outbox: [], storageError: null, saving: false });
  });

  it('失敗した開始を画面と同期キューから除き、次の開始を保存できる', async () => {
    vi.mocked(setStoredValue).mockRejectedValueOnce(new Error('disk full'));

    await expect(useLearningStore.getState().startSession('random', '練習', ['fl-001'])).rejects.toThrow('disk full');
    expect(useLearningStore.getState().sessions).toEqual([]);
    expect(useLearningStore.getState().outbox).toEqual([]);
    expect(useLearningStore.getState().storageError).toBe('disk full');

    const sessionId = await useLearningStore.getState().startSession('random', '再試行', ['fl-001']);
    expect(useLearningStore.getState().sessions.map((session) => session.id)).toEqual([sessionId]);
    expect(useLearningStore.getState().outbox).toHaveLength(1);
    expect(setStoredValue).toHaveBeenCalledTimes(2);
  });

  it('模試開始の保存失敗でもセッションと同期イベントを残さない', async () => {
    vi.mocked(setStoredValue).mockRejectedValueOnce(new Error('disk full'));
    const questionIds = Array.from({ length: 40 }, (_, index) => `fl-${index + 1}`);

    await expect(useLearningStore.getState().startExam(questionIds)).rejects.toThrow('disk full');
    expect(useLearningStore.getState().sessions).toEqual([]);
    expect(useLearningStore.getState().outbox).toEqual([]);
  });
});
