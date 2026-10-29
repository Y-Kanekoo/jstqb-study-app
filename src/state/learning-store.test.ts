import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getQuestion } from '@/content/questions';
import type { LearningSnapshot, RemoteSyncEvent } from '@/domain/types';
import { compareAndSetStoredValue, getStoredValue } from '@/storage/persistence';

import { useLearningStore } from './learning-store';

vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: vi.fn().mockResolvedValue(null),
  compareAndSetStoredValue: vi.fn().mockResolvedValue(undefined),
}));

let stored: string | null = null;

function persistedSnapshot(): LearningSnapshot {
  if (!stored) throw new Error('snapshot is missing');
  return JSON.parse(stored) as LearningSnapshot;
}

describe('端末保存の原子性', () => {
  beforeEach(async () => {
    stored = null;
    vi.mocked(getStoredValue).mockReset().mockImplementation(async () => stored);
    vi.mocked(compareAndSetStoredValue).mockReset().mockImplementation(async (_key, expected, next) => {
      if (stored !== expected) throw new Error('stale tab');
      stored = next;
    });
    useLearningStore.setState({
      sessions: [], drafts: {}, attempts: [], questionStates: {}, bookmarks: [], notes: {},
      issues: [], outbox: [], syncCursor: 0, dailyGoal: 10, hydrated: false,
      saving: false, storageError: null, syncError: null, unsavedNotes: {},
    });
    await useLearningStore.getState().initialize();
  });

  it('回答とOutboxの保存失敗時は両方を残さず、次問へ進ませず、再試行できる', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001', 'fl-002']);
    const choiceId = getQuestion('fl-001')?.choices[0]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    const prior = useLearningStore.getState();
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));

    await expect(useLearningStore.getState().submitAnswer(sessionId, 'fl-001')).rejects.toThrow('disk full');
    expect(useLearningStore.getState().attempts).toEqual([]);
    expect(useLearningStore.getState().outbox).toEqual(prior.outbox);
    expect(persistedSnapshot().attempts).toEqual([]);
    await expect(useLearningStore.getState().moveToNext(sessionId, 'fl-001')).rejects.toThrow();
    expect(useLearningStore.getState().sessions[0]?.currentIndex).toBe(0);

    await useLearningStore.getState().submitAnswer(sessionId, 'fl-001');
    expect(useLearningStore.getState().attempts).toHaveLength(1);
    expect(useLearningStore.getState().outbox.filter((event) => event.kind === 'answer.submitted')).toHaveLength(1);
    expect(persistedSnapshot().attempts).toHaveLength(1);
  });

  it('保存失敗した選択を回答へ流さず、後続の保存は復旧する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001', 'fl-002']);
    const choiceId = getQuestion('fl-001')?.choices[0]?.id ?? '';
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));
    const choice = useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    const answer = useLearningStore.getState().submitAnswer(sessionId, 'fl-001');
    await expect(choice).rejects.toThrow('disk full');
    await expect(answer).rejects.toThrow('選択肢');
    expect(useLearningStore.getState().drafts).toEqual({});
    expect(useLearningStore.getState().attempts).toEqual([]);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    await useLearningStore.getState().submitAnswer(sessionId, 'fl-001');
    expect(persistedSnapshot().attempts).toHaveLength(1);
  });

  it('同期の受信と送信済み処理が交錯しても、未送信の選択を消さない', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const firstChoice = getQuestion('fl-001')?.choices[0]?.id ?? '';
    const secondChoice = getQuestion('fl-001')?.choices[1]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', firstChoice);
    const oldDraftEvent = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved');
    if (!oldDraftEvent) throw new Error('draft event is missing');
    const change = useLearningStore.getState().selectChoice(sessionId, 'fl-001', secondChoice);
    const acknowledge = useLearningStore.getState().markOutboxSynced([oldDraftEvent.id]);
    await Promise.all([change, acknowledge]);
    const newer = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved');
    expect(newer?.id).not.toBe(oldDraftEvent.id);
    const remote: RemoteSyncEvent = {
      ...oldDraftEvent, sequence: 1, occurredAt: '2099-01-01T00:00:00.000Z',
      payload: { sessionId, questionId: 'fl-001', selectedChoiceIds: [firstChoice] },
    };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(useLearningStore.getState().drafts[`${sessionId}:fl-001`]?.selectedChoiceIds).toEqual([secondChoice]);
    expect(persistedSnapshot().outbox.some((event) => event.id === newer?.id)).toBe(true);
    expect(persistedSnapshot().syncCursor).toBe(0);
    expect(useLearningStore.getState().syncError).toContain('競合');
    if (newer) await useLearningStore.getState().markOutboxSynced([newer.id]);
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(persistedSnapshot().syncCursor).toBe(1);
    expect(useLearningStore.getState().syncError).toBeNull();
  });

  it('送信済み進捗の受信で二重に次問へ進まず、復元失敗でも元データを保つ', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001', 'fl-002', 'fl-003']);
    const choiceId = getQuestion('fl-001')?.choices[0]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    await useLearningStore.getState().submitAnswer(sessionId, 'fl-001');
    await useLearningStore.getState().moveToNext(sessionId, 'fl-001');
    const advanced = useLearningStore.getState().outbox.find((event) => event.kind === 'session.advanced');
    if (!advanced) throw new Error('advanced event is missing');
    await useLearningStore.getState().markOutboxSynced([advanced.id]);
    await useLearningStore.getState().applyRemoteEvents([{ ...advanced, sequence: 1 }]);
    expect(useLearningStore.getState().sessions[0]?.currentIndex).toBe(1);
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));
    await expect(useLearningStore.getState().restoreSnapshot({ ...persistedSnapshot(), sessions: [] })).rejects.toThrow('disk full');
    expect(useLearningStore.getState().sessions).toHaveLength(1);
    expect(persistedSnapshot().sessions).toHaveLength(1);
  });

  it('別タブによる更新を上書きせず、再読込後に操作できる', async () => {
    await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const external = { ...persistedSnapshot(), dailyGoal: 20 };
    stored = JSON.stringify(external);
    await expect(useLearningStore.getState().setDailyGoal(30)).rejects.toThrow('stale tab');
    expect(useLearningStore.getState().dailyGoal).toBe(10);
    expect(persistedSnapshot().dailyGoal).toBe(20);
    await useLearningStore.getState().initialize();
    expect(useLearningStore.getState().dailyGoal).toBe(20);
    await useLearningStore.getState().setDailyGoal(30);
    expect(persistedSnapshot().dailyGoal).toBe(30);
  });

  it('模試の選択保存に失敗したら移動と提出を止め、再選択後に進める', async () => {
    const questionIds = Array.from({ length: 40 }, (_, index) => `fl-${String(index + 1).padStart(3, '0')}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const choiceId = getQuestion('fl-001')?.choices[0]?.id ?? '';
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));
    const choice = useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    const move = useLearningStore.getState().goToQuestion(sessionId, 1);
    const submit = useLearningStore.getState().submitExam(sessionId);
    await expect(choice).rejects.toThrow('disk full');
    await expect(move).rejects.toThrow('保存できなかった選択');
    await expect(submit).rejects.toThrow('保存できなかった選択');
    expect(useLearningStore.getState().sessions[0]?.currentIndex).toBe(0);
    await useLearningStore.getState().toggleBookmark('fl-001');
    expect(useLearningStore.getState().storageError).toBe('disk full');
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    await useLearningStore.getState().goToQuestion(sessionId, 1);
    expect(persistedSnapshot().sessions[0]?.currentIndex).toBe(1);
  });

  it('別端末の移動を反映し、未送信選択がある時は現在位置を保持する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001', 'fl-002']);
    const remote: RemoteSyncEvent = {
      id: crypto.randomUUID(), kind: 'session.advanced', entityId: sessionId,
      occurredAt: '2099-01-01T00:00:00.000Z', sequence: 1,
      payload: { sessionId, questionId: 'fl-002', currentIndex: 1 },
    };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(useLearningStore.getState().sessions[0]?.currentIndex).toBe(1);
    await useLearningStore.getState().goToQuestion(sessionId, 0);
    const choiceId = getQuestion('fl-001')?.choices[0]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    await useLearningStore.getState().applyRemoteEvents([{ ...remote, id: crypto.randomUUID(), sequence: 2 }]);
    expect(useLearningStore.getState().sessions[0]?.currentIndex).toBe(0);
    expect(persistedSnapshot().drafts[`${sessionId}:fl-001`]?.selectedChoiceIds).toEqual([choiceId]);
  });

  it('受信途中の競合でカーソルを止め、後続イベントを後で再取得できる', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const choiceId = getQuestion('fl-001')?.choices[0]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choiceId);
    const draftEvent = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved');
    if (!draftEvent) throw new Error('draft event is missing');
    const events: RemoteSyncEvent[] = [
      { id: crypto.randomUUID(), kind: 'bookmark.changed', entityId: 'fl-001',
        occurredAt: '2099-01-01T00:00:00.000Z', sequence: 1, payload: { questionId: 'fl-001', enabled: true } },
      { ...draftEvent, id: crypto.randomUUID(), occurredAt: '2099-01-01T00:00:01.000Z', sequence: 2,
        payload: { sessionId, questionId: 'fl-001', selectedChoiceIds: [choiceId] } },
      { id: crypto.randomUUID(), kind: 'bookmark.changed', entityId: 'fl-002',
        occurredAt: '2099-01-01T00:00:02.000Z', sequence: 3, payload: { questionId: 'fl-002', enabled: true } },
    ];
    await useLearningStore.getState().applyRemoteEvents(events);
    expect(useLearningStore.getState().syncCursor).toBe(1);
    expect(useLearningStore.getState().bookmarks).toEqual(['fl-001']);
    await useLearningStore.getState().markOutboxSynced([draftEvent.id]);
    await useLearningStore.getState().applyRemoteEvents(events.slice(1));
    expect(useLearningStore.getState().syncCursor).toBe(3);
    expect(useLearningStore.getState().bookmarks).toEqual(['fl-001', 'fl-002']);
  });

  it('開始と復元に失敗しても永続化前の状態を表示しない', async () => {
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));
    await expect(useLearningStore.getState().startSession('random', '練習', ['fl-001'])).rejects.toThrow('disk full');
    expect(useLearningStore.getState().sessions).toEqual([]);
    expect(useLearningStore.getState().outbox).toEqual([]);
    const sessionId = await useLearningStore.getState().startSession('random', '再試行', ['fl-001']);
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));
    await expect(useLearningStore.getState().restoreSnapshot({ ...persistedSnapshot(), sessions: [] })).rejects.toThrow('disk full');
    expect(useLearningStore.getState().sessions[0]?.id).toBe(sessionId);
  });

  it('メモ保存失敗時は未保存文を画面をまたぐ一時状態に保ち、再試行で解消する', async () => {
    vi.mocked(compareAndSetStoredValue).mockRejectedValueOnce(new Error('disk full'));
    await expect(useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '再確認する')).rejects.toThrow('disk full');
    expect(useLearningStore.getState().notes).toEqual({});
    expect(useLearningStore.getState().unsavedNotes['fl-001']).toBe('再確認する');
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '再確認する');
    expect(useLearningStore.getState().unsavedNotes).toEqual({});
    expect(persistedSnapshot().notes['fl-001']?.body).toBe('再確認する');
  });
});
