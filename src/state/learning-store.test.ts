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
    await useLearningStore.getState().toggleBookmark('fl-001');
    expect(useLearningStore.getState().storageError).toBe('disk full');
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '再確認する');
    expect(useLearningStore.getState().unsavedNotes).toEqual({});
    expect(persistedSnapshot().notes['fl-001']?.body).toBe('再確認する');
  });

  it('入力途中のメモはOutboxを増やさず端末に残り、再起動後に保存できる', async () => {
    for (const body of ['あ', 'あい', 'あいう']) await useLearningStore.getState().stageNote('fl-001', body);
    expect(persistedSnapshot().noteBuffer['fl-001']).toBe('あいう');
    expect(persistedSnapshot().outbox).toEqual([]);
    await useLearningStore.getState().initialize();
    expect(useLearningStore.getState().unsavedNotes['fl-001']).toBe('あいう');
    await useLearningStore.getState().flushNoteBuffer();
    expect(persistedSnapshot().noteBuffer).toEqual({});
    expect(persistedSnapshot().outbox.filter((item) => item.kind === 'note.saved')).toHaveLength(1);
  });

  it('同じドラフトの変更を順序付きrevisionで残し、ACK後の次回値へ引き継ぐ', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const choices = getQuestion('fl-001')?.choices ?? [];
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choices[0]?.id ?? '');
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choices[1]?.id ?? '');
    const events = useLearningStore.getState().outbox.filter((item) => item.kind === 'draft.saved');
    expect(events.map((item) => item.payload.expectedRevision)).toEqual([0, 1]);
    expect(events[0]?.payload.deviceId).toBe(useLearningStore.getState().deviceId);
    const canonical = events.map((item, index) => ({ ...item, sequence: index + 2,
      payload: { ...item.payload, revision: index + 1 } }));
    await useLearningStore.getState().markOutboxSynced(events.map((item) => item.id), canonical);
    expect(useLearningStore.getState().syncRevisions[`draft.saved:${sessionId}:fl-001`]).toBe(2);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choices[2]?.id ?? '');
    const latest = useLearningStore.getState().outbox.at(-1);
    expect(latest?.payload.expectedRevision).toBe(2);
  });

  it('旧Outboxを送信前に固定形式へ移行し、再試行で同じpayloadを使う', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A');
    const legacy = persistedSnapshot();
    const event = legacy.outbox.find((item) => item.kind === 'draft.saved');
    if (!event) throw new Error('draft event is missing');
    event.payload = { sessionId, questionId: 'fl-001', selectedChoiceIds: ['fl-001-A'] };
    stored = JSON.stringify(legacy);
    await useLearningStore.getState().initialize();
    await useLearningStore.getState().prepareOutboxForRpc();
    const first = JSON.stringify(persistedSnapshot().outbox);
    await useLearningStore.getState().prepareOutboxForRpc();
    expect(JSON.stringify(persistedSnapshot().outbox)).toBe(first);
    expect(persistedSnapshot().outbox.find((item) => item.id === event.id)?.payload.expectedRevision).toBe(0);
  });

  it('サーバーの確定採点を同じ回答IDへ反映し、復習状態を再計算する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const wrongChoice = getQuestion('fl-001')?.choices.find((choice) => !choice.isCorrect)?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', wrongChoice);
    const local = await useLearningStore.getState().submitAnswer(sessionId, 'fl-001');
    expect(local.attempt.isCorrect).toBe(false);
    const event = useLearningStore.getState().outbox.find((item) => item.kind === 'answer.submitted');
    if (!event) throw new Error('answer event is missing');
    await useLearningStore.getState().markOutboxSynced(useLearningStore.getState().outbox
      .filter((item) => item.kind === 'draft.saved' || item.kind === 'answer.submitted').map((item) => item.id));
    await useLearningStore.getState().applyRemoteEvents([{ ...event, sequence: 3,
      payload: { ...event.payload, isCorrect: true, answeredAt: '2099-01-01T00:00:00.000Z' } }]);
    expect(useLearningStore.getState().attempts).toHaveLength(1);
    expect(useLearningStore.getState().attempts[0]?.isCorrect).toBe(true);
    expect(useLearningStore.getState().attempts[0]?.provisional).toBe(false);
    expect(useLearningStore.getState().questionStates['fl-001']?.latestOutcome).toBe('correct');
  });

  it('模試は提出イベントだけを送信し、サーバー生成回答で仮結果を置換する', async () => {
    const questionIds = Array.from({ length: 40 }, (_, index) => `fl-${String(index + 1).padStart(3, '0')}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const choice = getQuestion('fl-001')?.choices[0]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choice);
    await useLearningStore.getState().submitExam(sessionId);
    expect(useLearningStore.getState().outbox.filter((item) => item.kind === 'answer.submitted')).toEqual([]);
    const submitted = useLearningStore.getState().outbox.find((item) => item.kind === 'session.submitted');
    if (!submitted) throw new Error('submit event is missing');
    await useLearningStore.getState().markOutboxSynced([submitted.id]);
    const remoteId = crypto.randomUUID();
    await useLearningStore.getState().applyRemoteEvents([{
      id: remoteId, kind: 'answer.submitted', entityId: remoteId, sequence: 4,
      occurredAt: '2099-01-01T00:00:00.000Z', payload: { sessionId, questionId: 'fl-001',
        questionVersionId: 'fl-001-v1', selectedChoiceIds: [choice], isCorrect: false,
        answeredAt: '2099-01-01T00:00:00.000Z', invalidated: true },
    }]);
    expect(useLearningStore.getState().attempts).toHaveLength(1);
    expect(useLearningStore.getState().attempts[0]?.id).toBe(remoteId);
    expect(useLearningStore.getState().attempts[0]?.invalidated).toBe(true);
    expect(useLearningStore.getState().questionStates['fl-001']).toBeUndefined();
  });

  it('端末の学習データを別アカウントへ自動送信しない', async () => {
    await useLearningStore.getState().ensureSyncOwner('user-1');
    await expect(useLearningStore.getState().ensureSyncOwner('user-2')).rejects.toThrow('別のアカウント');
    expect(persistedSnapshot().syncOwnerId).toBe('user-1');
    await useLearningStore.getState().clearLearningData();
    await useLearningStore.getState().ensureSyncOwner('user-2');
    expect(persistedSnapshot().syncOwnerId).toBe('user-2');
  });

  it('送信中にデータが復元されたら古いACKを適用しない', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A');
    const event = useLearningStore.getState().outbox.find((item) => item.kind === 'draft.saved');
    if (!event) throw new Error('draft event is missing');
    await useLearningStore.getState().clearLearningData();
    await expect(useLearningStore.getState().markOutboxSynced([event.id], [{ ...event, sequence: 1,
      payload: { ...event.payload, revision: 1 } }])).rejects.toThrow('端末データが変更');
    expect(persistedSnapshot().syncRevisions).toEqual({});
  });

  it('旧版の模試回答イベントは誤送信せずOutboxに保持する', async () => {
    const questionIds = Array.from({ length: 40 }, (_, index) => `fl-${String(index + 1).padStart(3, '0')}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const legacy = persistedSnapshot();
    const event = { id: crypto.randomUUID(), kind: 'answer.submitted' as const,
      entityId: crypto.randomUUID(), occurredAt: '2026-10-29T00:00:00.000Z',
      payload: { sessionId, questionId: 'fl-001', questionVersionId: 'fl-001-v1', selectedChoiceIds: ['fl-001-A'] } };
    legacy.outbox.push(event);
    stored = JSON.stringify(legacy);
    await useLearningStore.getState().initialize();
    await expect(useLearningStore.getState().prepareOutboxForRpc()).rejects.toThrow('旧版の模試');
    expect(persistedSnapshot().outbox.some((item) => item.id === event.id)).toBe(true);
  });

  it('ドラフト競合で別端末を採用し、採用しなかった内容をバックアップに保持する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const choices = getQuestion('fl-001')?.choices ?? [];
    const localChoice = choices[0]?.id ?? '';
    const remoteChoice = choices[1]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', localChoice);
    const remote: RemoteSyncEvent = { id: crypto.randomUUID(), kind: 'draft.saved',
      entityId: `${sessionId}:fl-001`, sequence: 4, occurredAt: '2099-01-01T00:00:00.000Z',
      payload: { sessionId, questionId: 'fl-001', selectedChoiceIds: [remoteChoice],
        revision: 1, updatedAt: '2099-01-01T00:00:00.000Z', deviceId: 'other-device' } };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(useLearningStore.getState().syncConflict?.entityId).toBe(remote.entityId);
    expect(useLearningStore.getState().syncCursor).toBe(0);
    await useLearningStore.getState().resolveSyncConflict('remote');
    expect(useLearningStore.getState().drafts[remote.entityId]?.selectedChoiceIds).toEqual([remoteChoice]);
    expect(useLearningStore.getState().outbox.some((item) => item.kind === 'draft.saved')).toBe(false);
    expect(useLearningStore.getState().syncCursor).toBe(4);
    expect(useLearningStore.getState().syncConflictHistory[0]?.localPayload.selectedChoiceIds).toEqual([localChoice]);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', localChoice);
    expect(useLearningStore.getState().outbox.at(-1)?.payload.expectedRevision).toBe(1);
  });

  it('ドラフト競合でこの端末を採用すると新しいevent IDとremote revisionで再送する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const choice = getQuestion('fl-001')?.choices[0]?.id ?? '';
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', choice);
    const old = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved');
    const remote: RemoteSyncEvent = { id: crypto.randomUUID(), kind: 'draft.saved',
      entityId: `${sessionId}:fl-001`, sequence: 5, occurredAt: '2099-01-01T00:00:00.000Z',
      payload: { sessionId, questionId: 'fl-001', selectedChoiceIds: [],
        revision: 3, updatedAt: '2099-01-01T00:00:00.000Z', deviceId: 'other-device' } };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    await useLearningStore.getState().resolveSyncConflict('local');
    const next = useLearningStore.getState().outbox.find((event) => event.kind === 'draft.saved');
    expect(next?.id).not.toBe(old?.id);
    expect(next?.payload.expectedRevision).toBe(3);
    expect(next?.payload.selectedChoiceIds).toEqual([choice]);
    expect(useLearningStore.getState().syncConflictHistory[0]?.remotePayload.selectedChoiceIds).toEqual([]);
  });

  it('メモ競合も内容を比較して解決し、両方を履歴に残す', async () => {
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', 'この端末のメモ');
    const remote: RemoteSyncEvent = { id: crypto.randomUUID(), kind: 'note.saved', entityId: 'fl-001',
      sequence: 2, occurredAt: '2099-01-01T00:00:00.000Z',
      payload: { questionId: 'fl-001', questionVersionId: 'fl-001-v1', body: '別端末のメモ',
        revision: 2, updatedAt: '2099-01-01T00:00:00.000Z' } };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(useLearningStore.getState().syncConflict?.kind).toBe('note.saved');
    await useLearningStore.getState().resolveSyncConflict('local');
    const next = useLearningStore.getState().outbox.find((event) => event.kind === 'note.saved');
    expect(next?.payload.expectedRevision).toBe(2);
    expect(next?.payload.body).toBe('この端末のメモ');
    expect(useLearningStore.getState().syncConflictHistory[0]?.remotePayload.body).toBe('別端末のメモ');
  });

  it('競合中に端末データを削除すると競合状態も解除する', async () => {
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', 'この端末');
    await useLearningStore.getState().applyRemoteEvents([{ id: crypto.randomUUID(), kind: 'note.saved',
      entityId: 'fl-001', sequence: 1, occurredAt: '2026-10-29T00:00:00.000Z', payload: {
        questionId: 'fl-001', questionVersionId: 'fl-001-v1', body: '別端末', revision: 1,
        updatedAt: '2026-10-29T00:00:00.000Z' } }]);
    expect(useLearningStore.getState().syncConflict).not.toBeNull();
    await useLearningStore.getState().clearLearningData();
    expect(useLearningStore.getState().syncConflict).toBeNull();
    expect(useLearningStore.getState().syncError).toBeNull();
  });

  it('端末時計が進んでいてもサーバーの新しいrevisionと移動位置を採用する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001', 'fl-002']);
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '端末の古いメモ');
    const note = useLearningStore.getState().outbox.find((event) => event.kind === 'note.saved');
    if (!note) throw new Error('missing note');
    await useLearningStore.getState().markOutboxSynced([note.id]);
    const future = '2099-01-01T00:00:00.000Z';
    const current = persistedSnapshot();
    current.notes['fl-001'] = { ...current.notes['fl-001']!, updatedAt: future };
    current.sessions[0] = { ...current.sessions[0]!, updatedAt: future };
    stored = JSON.stringify(current);
    await useLearningStore.getState().initialize();
    await useLearningStore.getState().applyRemoteEvents([
      { id: crypto.randomUUID(), kind: 'note.saved', entityId: 'fl-001', sequence: 1,
        occurredAt: '2026-10-29T00:00:00.000Z', payload: { questionId: 'fl-001', questionVersionId: 'fl-001-v1',
          body: 'サーバーの新しいメモ', revision: 2, updatedAt: '2026-10-29T00:00:00.000Z' } },
      { id: crypto.randomUUID(), kind: 'session.advanced', entityId: sessionId, sequence: 2,
        occurredAt: '2026-10-29T00:00:01.000Z', payload: { sessionId, questionId: 'fl-002', currentIndex: 1 } },
    ]);
    expect(useLearningStore.getState().notes['fl-001']?.body).toBe('サーバーの新しいメモ');
    expect(useLearningStore.getState().sessions[0]?.currentIndex).toBe(1);
    expect(useLearningStore.getState().syncCursor).toBe(2);
  });

  it('未送信の後続変更があっても既送信revisionを読み進め、本当の競合で止める', async () => {
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '旧版');
    const first = useLearningStore.getState().outbox.find((event) => event.kind === 'note.saved');
    if (!first) throw new Error('missing note');
    await useLearningStore.getState().markOutboxSynced([first.id], [{ ...first, sequence: 1,
      payload: { ...first.payload, revision: 1 } }]);
    await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', '未送信の新版');
    const previous: RemoteSyncEvent = { ...first, sequence: 1,
      payload: { ...first.payload, revision: 1, updatedAt: first.occurredAt } };
    const competing: RemoteSyncEvent = { ...previous, id: crypto.randomUUID(), sequence: 2,
      payload: { ...previous.payload, body: '別端末', revision: 2 } };
    await useLearningStore.getState().applyRemoteEvents([previous, competing]);
    expect(useLearningStore.getState().syncCursor).toBe(1);
    expect(useLearningStore.getState().notes['fl-001']?.body).toBe('未送信の新版');
    expect(useLearningStore.getState().syncConflict?.remote.id).toBe(competing.id);
  });

  it('20件目を越えた同一メモの競合でも過去の確定イベントを飛ばさない', async () => {
    for (let index = 0; index < 21; index += 1) {
      await useLearningStore.getState().saveNote('fl-001', 'fl-001-v1', `版${index}`);
    }
    const local = useLearningStore.getState().outbox.filter((event) => event.kind === 'note.saved');
    const accepted = local.slice(0, 20).map((event, index) => ({ ...event, sequence: index + 1,
      payload: { ...event.payload, revision: index + 1, updatedAt: event.occurredAt } }));
    await useLearningStore.getState().markOutboxSynced(local.slice(0, 20).map((event) => event.id), accepted);
    const competing: RemoteSyncEvent = { ...accepted[19]!, id: crypto.randomUUID(), sequence: 21,
      payload: { ...accepted[19]!.payload, revision: 21, body: '別端末の版' } };
    await useLearningStore.getState().applyRemoteEvents([...accepted, competing]);
    expect(useLearningStore.getState().syncCursor).toBe(20);
    expect(useLearningStore.getState().syncConflict?.remote.id).toBe(competing.id);
    expect(useLearningStore.getState().notes['fl-001']?.body).toBe('版20');
  });

  it('所有者不明のバックアップを別アカウントへ自動送信せず、競合復元時は同期を再開できる', async () => {
    await useLearningStore.getState().ensureSyncOwner('account-a');
    const imported = { ...persistedSnapshot(), syncOwnerId: null, syncCursor: 35,
      outbox: [{ id: crypto.randomUUID(), kind: 'bookmark.changed' as const, entityId: 'fl-001',
        occurredAt: '2026-10-29T00:00:00.000Z', payload: { questionId: 'fl-001', enabled: true } }] };
    await useLearningStore.getState().restoreSnapshot(imported);
    expect(useLearningStore.getState().syncOwnerId).toBeNull();
    await expect(useLearningStore.getState().ensureSyncOwner('account-a')).rejects.toThrow('設定画面');
    await expect(useLearningStore.getState().claimSyncOwner('account-a')).rejects.toThrow('過去の同期先');
    await useLearningStore.getState().clearLearningData();
    expect(useLearningStore.getState().syncConflict).toBeNull();
    await useLearningStore.getState().ensureSyncOwner('account-a');
  });

  it('メモだけの旧バックアップも所有者を明示するまで送信しない', async () => {
    await useLearningStore.getState().setDailyGoal(10);
    const imported = { ...persistedSnapshot(), sessions: [], outbox: [], notes: { 'fl-001': { questionId: 'fl-001',
      questionVersionId: 'fl-001-v1', body: '旧メモ', revision: 1,
      updatedAt: '2026-10-29T00:00:00.000Z' } } };
    await useLearningStore.getState().restoreSnapshot(imported);
    await expect(useLearningStore.getState().ensureSyncOwner('account-a')).rejects.toThrow('設定画面');
    await useLearningStore.getState().claimSyncOwner('account-a');
    expect(useLearningStore.getState().syncOwnerId).toBe('account-a');
  });

  it('サーバー固定の問題版が端末と違うと回答を止める', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    const created = useLearningStore.getState().outbox.find((event) => event.kind === 'session.created');
    if (!created) throw new Error('missing session');
    await useLearningStore.getState().markOutboxSynced([created.id], [{ ...created, sequence: 1,
      payload: { ...created.payload, questionVersionIds: ['fl-001-v999'], createdAt: created.occurredAt } }]);
    await expect(useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A')).rejects.toThrow('問題版');
  });

  it('別端末の確定回答を採用し、拒否されたローカル回答を履歴へ残す', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A');
    await useLearningStore.getState().submitAnswer(sessionId, 'fl-001');
    const remoteId = crypto.randomUUID();
    const remote: RemoteSyncEvent = { id: remoteId, kind: 'answer.submitted', entityId: remoteId,
      sequence: 10, occurredAt: '2026-10-29T00:00:00.000Z', payload: { sessionId,
        questionId: 'fl-001', questionVersionId: 'fl-001-v1', selectedChoiceIds: ['fl-001-B'],
        isCorrect: true, answeredAt: '2026-10-29T00:00:00.000Z' } };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(useLearningStore.getState().syncConflict?.kind).toBe('answer.submitted');
    await useLearningStore.getState().resolveSyncConflict('remote');
    expect(useLearningStore.getState().attempts[0]?.id).toBe(remoteId);
    expect(useLearningStore.getState().outbox.some((event) => event.kind === 'answer.submitted'
      || event.kind === 'draft.saved')).toBe(false);
    expect(useLearningStore.getState().syncConflictHistory[0]?.localPayload.selectedChoiceIds).toEqual(['fl-001-A']);
  });

  it('未送信の選択だけがあるとき別端末の確定回答で停止し、選択内容を残して復旧する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '練習', ['fl-001']);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A');
    const remoteId = crypto.randomUUID();
    await useLearningStore.getState().applyRemoteEvents([{ id: remoteId, kind: 'answer.submitted', entityId: remoteId,
      sequence: 2, occurredAt: '2026-10-29T00:00:00.000Z', payload: { sessionId, questionId: 'fl-001',
        questionVersionId: 'fl-001-v1', selectedChoiceIds: ['fl-001-B'], isCorrect: true,
        answeredAt: '2026-10-29T00:00:00.000Z' } }]);
    expect(useLearningStore.getState().syncConflict?.kind).toBe('answer.submitted');
    await useLearningStore.getState().resolveSyncConflict('remote');
    expect(useLearningStore.getState().outbox.some((event) => event.kind === 'draft.saved')).toBe(false);
    expect(useLearningStore.getState().syncConflictHistory[0]?.localPayload.selectedChoiceIds).toEqual(['fl-001-A']);
  });

  it('別端末の模試提出を採用すると全ての未送信選択を履歴に残す', async () => {
    const questionIds = Array.from({ length: 40 }, (_, index) => `fl-${String(index + 1).padStart(3, '0')}`);
    const sessionId = await useLearningStore.getState().startExam(questionIds);
    const created = useLearningStore.getState().outbox.find((event) => event.kind === 'session.created');
    if (!created) throw new Error('missing session');
    await useLearningStore.getState().markOutboxSynced([created.id]);
    await useLearningStore.getState().selectChoice(sessionId, 'fl-001', 'fl-001-A');
    await useLearningStore.getState().selectChoice(sessionId, 'fl-002', 'fl-002-A');
    await useLearningStore.getState().submitExam(sessionId);
    const remote: RemoteSyncEvent = { id: crypto.randomUUID(), kind: 'session.submitted', entityId: sessionId,
      sequence: 12, occurredAt: '2026-10-29T00:00:00.000Z', payload: { sessionId,
        submittedAt: '2026-10-29T00:00:00.000Z', answeredQuestionIds: [] } };
    await useLearningStore.getState().applyRemoteEvents([remote]);
    expect(useLearningStore.getState().syncConflict?.kind).toBe('session.submitted');
    await useLearningStore.getState().resolveSyncConflict('remote');
    expect(useLearningStore.getState().outbox).toEqual([]);
    expect(useLearningStore.getState().attempts).toEqual([]);
    expect(useLearningStore.getState().syncConflictHistory.map((item) => item.localPayload.selectedChoiceIds)
      .filter(Boolean)).toEqual([['fl-001-A'], ['fl-002-A']]);
  });
});
