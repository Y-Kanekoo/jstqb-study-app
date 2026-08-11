import { beforeEach, describe, expect, it, vi } from 'vitest';

const storedValues = new Map<string, string>();
const setStoredValueMock = vi.fn(async (key: string, value: string): Promise<void> => {
  storedValues.set(key, value);
});

vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: async (key: string): Promise<string | null> => storedValues.get(key) ?? null,
  setStoredValue: (key: string, value: string): Promise<void> => setStoredValueMock(key, value),
}));

import { useLearningStore } from './learning-store';

describe('学習ストアの利用者分離と保存復旧', () => {
  beforeEach(() => {
    storedValues.clear();
    setStoredValueMock.mockClear();
  });

  it('利用者を切り替えると以前の利用者の状態をアンロードして専用領域を読み込む', async () => {
    const store = useLearningStore.getState();
    await store.initialize('user-a');
    await useLearningStore.getState().startSession('random', 'Aの学習', ['fl-1-1-1-q1']);

    await useLearningStore.getState().initialize('user-b');
    expect(useLearningStore.getState().sessions).toEqual([]);
    expect(useLearningStore.getState().storageOwnerId).toBe('user-b');
    await useLearningStore.getState().startSession('random', 'Bの学習', ['fl-1-1-1-q1']);

    await useLearningStore.getState().initialize('user-a');
    expect(useLearningStore.getState().sessions.map((session) => session.title)).toEqual(['Aの学習']);
    expect([...storedValues.keys()]).toContain('learning-snapshot-v2:user:user-a');
    expect([...storedValues.keys()]).toContain('learning-snapshot-v2:user:user-b');
  });

  it('保存失敗時は最後の保存済み状態へ戻し、次の保存を再試行できる', async () => {
    await useLearningStore.getState().initialize('rollback-user');
    await useLearningStore.getState().setDailyGoal(20);
    setStoredValueMock.mockRejectedValueOnce(new Error('端末ストレージへ書き込めません。'));

    await expect(useLearningStore.getState().setDailyGoal(40)).rejects.toThrow('端末ストレージへ書き込めません。');
    expect(useLearningStore.getState().dailyGoal).toBe(20);
    expect(useLearningStore.getState().storageError).toBe('端末ストレージへ書き込めません。');

    await expect(useLearningStore.getState().setDailyGoal(5)).resolves.toBeUndefined();
    expect(useLearningStore.getState().dailyGoal).toBe(5);
    expect(useLearningStore.getState().storageError).toBeNull();
  });
});
