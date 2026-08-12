import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { examConfig } from '@/config/exam';
import { parseLearningSnapshot, preparePortableRestore, sanitizeLearningSnapshot } from '@/domain/backup';
import { advanceSession, updateQuestionState } from '@/domain/learning';
import { createQuestionSnapshots, getSessionQuestion } from '@/domain/session-question';
import { fetchLearningEventsAfter, ingestLearningEvents } from '@/services/learning-sync-api';
import type {
  AnswerAttempt,
  ConflictAction,
  ContentIssueCategory,
  ExamResult,
  LearningSession,
  LearningSnapshot,
  OutboxEvent,
  QuestionNote,
  RemoteSyncEvent,
  SessionMode,
  SubmitAnswerResult,
  SyncStatus,
} from '@/domain/types';
import { getStoredValue, setStoredValue } from '@/storage/persistence';

const legacySnapshotKey = 'learning-snapshot-v1';
const snapshotKeyPrefix = 'learning-snapshot-v2';
const deviceIdKey = 'learning-device-id-v1';

const initialSnapshot: LearningSnapshot = {
  schemaVersion: 2,
  sessions: [],
  drafts: {},
  attempts: [],
  questionStates: {},
  bookmarks: [],
  notes: {},
  issues: [],
  outbox: [],
  syncCursor: 0,
  dailyGoal: 10,
  conflicts: [],
  syncMode: 'active',
};

interface LearningStore extends LearningSnapshot {
  hydrated: boolean;
  storageOwnerId: string | null;
  deviceId: string;
  saving: boolean;
  storageError: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  initialize: (userId?: string | null) => Promise<void>;
  startSession: (mode: SessionMode, title: string, questionIds: string[]) => Promise<string>;
  startExam: (questionIds: string[]) => Promise<string>;
  selectChoice: (sessionId: string, questionId: string, choiceId: string) => Promise<void>;
  submitAnswer: (sessionId: string, questionId: string) => Promise<SubmitAnswerResult>;
  submitExam: (sessionId: string) => Promise<ExamResult>;
  moveToNext: (sessionId: string, questionId: string) => Promise<void>;
  goToQuestion: (sessionId: string, index: number) => Promise<void>;
  toggleReviewMark: (sessionId: string, questionId: string) => Promise<void>;
  toggleBookmark: (questionId: string) => Promise<void>;
  saveNote: (questionId: string, questionVersionId: string, body: string) => Promise<void>;
  reportIssue: (questionId: string, questionVersionId: string, category: ContentIssueCategory, description: string) => Promise<string>;
  setDailyGoal: (goal: number) => Promise<void>;
  restoreSnapshot: (snapshot: LearningSnapshot) => Promise<void>;
  clearLearningData: () => Promise<void>;
  markOutboxSynced: (eventIds: string[]) => Promise<void>;
  blockOutboxEvent: (eventId: string, reason: string) => Promise<void>;
  resolveConflict: (conflictId: string, action: ConflictAction, mergedValue?: string | string[]) => Promise<void>;
  applyRemoteEvents: (events: RemoteSyncEvent[], source?: 'ack' | 'pull') => Promise<void>;
  setSyncState: (status: SyncStatus, message?: string | null) => void;
}

function extractSnapshot(store: LearningStore): LearningSnapshot {
  return sanitizeLearningSnapshot({
    schemaVersion: 2,
    sessions: store.sessions,
    drafts: store.drafts,
    attempts: store.attempts,
    questionStates: store.questionStates,
    bookmarks: store.bookmarks,
    notes: store.notes,
    issues: store.issues,
    outbox: store.outbox,
    syncCursor: store.syncCursor,
    dailyGoal: store.dailyGoal,
    conflicts: store.conflicts,
    syncMode: store.syncMode,
  });
}

function pendingOutboxCount(snapshot: LearningSnapshot): number {
  return snapshot.outbox.filter((event) => !event.blocked && !event.resolved).length;
}

let persistenceChain = Promise.resolve();
let activeStorageKey = `${snapshotKeyPrefix}:guest`;
let initializationRevision = 0;
let mutationRevision = 0;
let activeDeviceId = '';
const durableSnapshots = new Map<string, LearningSnapshot>();

function getSnapshotKey(userId: string | null): string {
  return userId ? `${snapshotKeyPrefix}:user:${encodeURIComponent(userId)}` : `${snapshotKeyPrefix}:guest`;
}

function queueSnapshot(storageKey: string, snapshot: LearningSnapshot): Promise<void> {
  return queueStoredValue(storageKey, JSON.stringify(snapshot));
}

function queueStoredValue(storageKey: string, value: string): Promise<void> {
  const operation = persistenceChain
    .catch(() => undefined)
    .then(() => setStoredValue(storageKey, value));
  persistenceChain = operation.then(() => undefined, () => undefined);
  return operation;
}

async function persistCurrentState(
  get: () => LearningStore,
  set: (partial: Partial<LearningStore>) => void,
  fallbackMessage: string,
): Promise<void> {
  const storageKey = activeStorageKey;
  const revision = ++mutationRevision;
  const snapshot = extractSnapshot(get());

  try {
    await queueSnapshot(storageKey, snapshot);
    durableSnapshots.set(storageKey, snapshot);
    if (storageKey === activeStorageKey && revision === mutationRevision) {
      set({ saving: false, storageError: null });
    }
  } catch (error: unknown) {
    if (storageKey === activeStorageKey && revision === mutationRevision) {
      const durableSnapshot = durableSnapshots.get(storageKey) ?? initialSnapshot;
      const message = error instanceof Error ? error.message : fallbackMessage;
      set({ ...durableSnapshot, saving: false, storageError: message });
    }
    throw error;
  }
}

function createOutboxEvent(
  kind: OutboxEvent['kind'],
  entityId: string,
  occurredAt: string,
  payload: OutboxEvent['payload'],
): OutboxEvent {
  return { id: randomUUID(), kind, entityId, occurredAt, payload };
}

function getPinnedQuestionVersionId(session: LearningSession, questionId: string): string | null {
  const questionIndex = session.questionIds.indexOf(questionId);
  return session.questionVersionIds?.[questionIndex] ?? getSessionQuestion(session, questionId)?.versionId ?? null;
}

export const useLearningStore = create<LearningStore>((set, get) => ({
  ...initialSnapshot,
  hydrated: false,
  storageOwnerId: null,
  deviceId: '',
  saving: false,
  storageError: null,
  syncStatus: 'synced',
  syncError: null,

  initialize: async (userId = null) => {
    const storageKey = getSnapshotKey(userId);
    const revision = ++initializationRevision;
    activeStorageKey = storageKey;
    mutationRevision += 1;
    set({
      ...initialSnapshot,
      hydrated: false,
      storageOwnerId: userId,
      deviceId: activeDeviceId,
      saving: false,
      storageError: null,
      syncStatus: 'synced',
      syncError: null,
    });

    try {
      await persistenceChain;
      if (revision !== initializationRevision || storageKey !== activeStorageKey) return;

      let deviceId = await getStoredValue(deviceIdKey);
      if (!deviceId) {
        deviceId = randomUUID();
        await queueStoredValue(deviceIdKey, deviceId);
      }
      activeDeviceId = deviceId;

      let stored = await getStoredValue(storageKey);
      if (stored === null && userId === null) {
        stored = await getStoredValue(legacySnapshotKey);
      }
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        const snapshot = parseLearningSnapshot(parsed);
        if (snapshot) {
          if (revision !== initializationRevision || storageKey !== activeStorageKey) return;
          durableSnapshots.set(storageKey, snapshot);
          if (userId === null && await getStoredValue(storageKey) === null) {
            await queueSnapshot(storageKey, snapshot);
          }
          set({
            ...snapshot,
            conflicts: snapshot.conflicts ?? [],
            syncMode: snapshot.syncMode ?? 'active',
            hydrated: true,
            storageOwnerId: userId,
            deviceId,
            storageError: null,
            syncStatus: snapshot.conflicts && snapshot.conflicts.length > 0
              ? 'conflict'
              : pendingOutboxCount(snapshot) > 0 ? 'queued' : 'synced',
            syncError: null,
          });
          return;
        }
      }
      durableSnapshots.set(storageKey, initialSnapshot);
      set({ hydrated: true, storageOwnerId: userId, deviceId, storageError: null });
    } catch (error: unknown) {
      if (revision !== initializationRevision || storageKey !== activeStorageKey) return;
      const message = error instanceof Error ? error.message : '保存データを読み込めませんでした。';
      set({ hydrated: true, storageOwnerId: userId, storageError: message });
    }
  },

  startSession: async (mode, title, questionIds) => {
    if (questionIds.length === 0) {
      throw new Error('学習できる問題がありません。');
    }
    if (questionIds.length > 40 || new Set(questionIds).size !== questionIds.length) {
      throw new Error('セッションの問題は重複のない40問以内で指定してください。');
    }
    if (title.trim().length === 0 || title.length > 200) {
      throw new Error('セッション名は1〜200文字で指定してください。');
    }
    const now = new Date().toISOString();
    const sessionQuestionIds = [...questionIds];
    const questionSnapshots = createQuestionSnapshots(sessionQuestionIds);
    const hasCompleteSnapshot = questionSnapshots.length === sessionQuestionIds.length;
    const session: LearningSession = {
      id: randomUUID(),
      mode,
      title,
      questionIds: sessionQuestionIds,
      questionVersionIds: hasCompleteSnapshot ? questionSnapshots.map((question) => question.versionId) : undefined,
      questionSnapshots: hasCompleteSnapshot ? questionSnapshots : undefined,
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      reviewQuestionIds: [],
      durationMinutes: null,
      expiresAt: null,
      startedAt: now,
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const event = createOutboxEvent('session.created', session.id, now, {
      sessionId: session.id,
      mode,
      title,
      questionIds: sessionQuestionIds,
      createdAt: now,
    });
    set((state) => ({
      sessions: [session, ...state.sessions],
      outbox: [...state.outbox, event],
      saving: true,
      storageError: null,
      syncStatus: 'queued',
      syncError: null,
    }));
    try {
      await persistCurrentState(get, set, 'セッションを保存できませんでした。');
      return session.id;
    } catch (error: unknown) {
      throw error;
    }
  },

  startExam: async (questionIds) => {
    if (get().syncMode === 'portable-local') {
      throw new Error('portable-localの復元データでは、サーバー接続が必要な模試を開始できません。');
    }
    if (questionIds.length !== examConfig.questionCount) {
      throw new Error(`模試を開始するには${examConfig.questionCount}問必要です。`);
    }
    if (new Set(questionIds).size !== questionIds.length) {
      throw new Error('模試の問題は重複なしで指定してください。');
    }
    const now = new Date().toISOString();
    const sessionQuestionIds = [...questionIds];
    const questionSnapshots = createQuestionSnapshots(sessionQuestionIds);
    const sessionId = randomUUID();
    const event = createOutboxEvent('session.created', sessionId, now, {
      sessionId,
      mode: 'exam',
      title: '模擬試験',
      questionIds: sessionQuestionIds,
    });

    set({ saving: true, storageError: null, syncStatus: 'syncing', syncError: null });
    let canonicalEvent: RemoteSyncEvent;
    try {
      const canonicalEvents = await ingestLearningEvents([event]);
      const received = canonicalEvents[0];
      if (!received || received.kind !== 'session.created' || received.entityId !== sessionId) {
        throw new Error('模試開始のサーバー応答を確認できませんでした。');
      }
      canonicalEvent = received;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '模試を開始できませんでした。';
      set({ saving: false, syncStatus: 'error', syncError: message });
      throw error;
    }

    const payload = canonicalEvent.payload;
    const canonicalQuestionIds = payload.questionIds;
    const canonicalQuestionVersionIds = payload.questionVersionIds;
    const createdAt = payload.createdAt;
    const startedAt = payload.startedAt;
    const expiresAt = payload.expiresAt;
    const durationMinutes = payload.durationMinutes;
    if (payload.sessionId !== sessionId
      || payload.mode !== 'exam'
      || payload.title !== '模擬試験'
      || !Array.isArray(canonicalQuestionIds)
      || canonicalQuestionIds.length !== sessionQuestionIds.length
      || !canonicalQuestionIds.every((questionId, index) => questionId === sessionQuestionIds[index])
      || !Array.isArray(canonicalQuestionVersionIds)
      || canonicalQuestionVersionIds.length !== questionSnapshots.length
      || !canonicalQuestionVersionIds.every((versionId, index) => versionId === questionSnapshots[index]?.versionId)
      || typeof createdAt !== 'string' || typeof startedAt !== 'string' || typeof expiresAt !== 'string'
      || durationMinutes !== examConfig.durationMinutes) {
      const message = 'サーバーの公開問題版または試験設定が端末と一致しません。問題データを更新して再試行してください。';
      set({ saving: false, syncStatus: 'conflict', syncError: message });
      throw new Error(message);
    }

    const session: LearningSession = {
      id: sessionId,
      mode: 'exam',
      title: '模擬試験',
      questionIds: sessionQuestionIds,
      questionVersionIds: canonicalQuestionVersionIds,
      questionSnapshots,
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      reviewQuestionIds: [],
      durationMinutes,
      expiresAt,
      startedAt,
      submittedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      saving: true,
      storageError: null,
      syncStatus: 'synced',
      syncError: null,
    }));
    try {
      await get().applyRemoteEvents([canonicalEvent], 'pull');
      return session.id;
    } catch (error: unknown) {
      throw error;
    }
  },

  selectChoice: async (sessionId, questionId, choiceId) => {
    const now = new Date().toISOString();
    const key = `${sessionId}:${questionId}`;
    const selectedSession = get().sessions.find((item) => item.id === sessionId);
    if (!selectedSession || selectedSession.status !== 'active') {
      throw new Error('このセッションは回答受付を終了しています。');
    }
    const selectedQuestion = getSessionQuestion(selectedSession, questionId);
    if (!selectedQuestion || !selectedQuestion.choices.some((choice) => choice.id === choiceId)) {
      throw new Error('セッションに含まれない選択肢です。');
    }
    const selectionType = selectedQuestion.selectionType ?? 'single';
    const requiredChoiceCount = selectedQuestion.requiredChoiceCount ?? 1;
    set((state) => {
      const session = state.sessions.find((item) => item.id === sessionId);
      if (!session || session.status !== 'active') return state;
      const previous = state.drafts[key];
      const isSelected = previous?.selectedChoiceIds.includes(choiceId) ?? false;
      if (selectionType === 'multiple' && !isSelected && (previous?.selectedChoiceIds.length ?? 0) >= requiredChoiceCount) {
        return state;
      }
      const selectedChoiceIds = selectionType === 'multiple'
        ? isSelected
          ? (previous?.selectedChoiceIds ?? []).filter((id) => id !== choiceId)
          : [...(previous?.selectedChoiceIds ?? []), choiceId]
        : isSelected ? [] : [choiceId];
      const questionVersionId = getPinnedQuestionVersionId(session, questionId);
      const draft = {
        sessionId,
        questionId,
        selectedChoiceIds,
        questionVersionId,
        revision: previous?.revision ?? 0,
        deviceId: state.deviceId,
        updatedAt: now,
      };
      const event = createOutboxEvent('draft.saved', key, now, {
        sessionId,
        questionId,
        selectedChoiceIds,
        expectedRevision: draft.revision,
        deviceId: state.deviceId,
      });
      const otherDraftEvents = state.outbox.filter((item) => !(
        item.kind === 'draft.saved' && item.entityId === key && !item.blocked && !item.resolved
      ));
      return {
        drafts: { ...state.drafts, [key]: draft },
        outbox: [...otherDraftEvents, event],
        saving: true,
        storageError: null,
        syncStatus: 'queued',
        syncError: null,
      };
    });
    try {
      await persistCurrentState(get, set, '回答の選択を保存できませんでした。');
    } catch (error: unknown) {
      throw error;
    }
  },

  submitAnswer: async (sessionId, questionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const question = session ? getSessionQuestion(session, questionId) : undefined;
    const draft = get().drafts[`${sessionId}:${questionId}`];
    const requiredChoiceCount = question?.requiredChoiceCount ?? 1;
    if (!session || session.status !== 'active') {
      throw new Error('このセッションは回答受付を終了しています。');
    }
    if (session.mode === 'exam') {
      throw new Error('模試の回答は提出時に一括で確定します。');
    }
    if (!question || !draft || draft.selectedChoiceIds.length !== requiredChoiceCount) {
      throw new Error(`${requiredChoiceCount}つの選択肢を選んでください。`);
    }
    const questionVersionId = getPinnedQuestionVersionId(session, questionId);
    if (!questionVersionId) {
      throw new Error('セッション開始時の問題版を確認できませんでした。');
    }
    const availableChoiceIds = new Set(question.choices.map((choice) => choice.id));
    if (new Set(draft.selectedChoiceIds).size !== draft.selectedChoiceIds.length
      || draft.selectedChoiceIds.some((choiceId) => !availableChoiceIds.has(choiceId))) {
      throw new Error('選択肢を確認できませんでした。');
    }
    const existing = get().attempts.find((item) => item.sessionId === sessionId && item.questionId === questionId);
    if (existing) {
      const existingState = get().questionStates[questionId];
      if (!existingState) {
        throw new Error('学習状態を復元できませんでした。');
      }
      return { attempt: existing, questionState: existingState };
    }

    const blockedAnswerEvent = get().outbox.find((item) => item.kind === 'answer.submitted'
      && item.payload.sessionId === sessionId
      && item.payload.questionId === questionId
      && item.blocked && !item.resolved);
    if (blockedAnswerEvent) {
      throw new Error('この回答は同期の恒久エラーで保留されています。データ管理から復旧してください。');
    }
    const now = new Date().toISOString();
    const pendingAnswerEvent = get().outbox.find((item) => item.kind === 'answer.submitted'
      && item.payload.sessionId === sessionId
      && item.payload.questionId === questionId
      && !item.blocked && !item.resolved);
    const attemptId = pendingAnswerEvent?.entityId ?? randomUUID();
    const selectedChoiceIds = pendingAnswerEvent && Array.isArray(pendingAnswerEvent.payload.selectedChoiceIds)
      ? pendingAnswerEvent.payload.selectedChoiceIds
      : draft.selectedChoiceIds;
    const event = pendingAnswerEvent ?? createOutboxEvent('answer.submitted', attemptId, now, {
      sessionId,
      questionId,
      questionVersionId,
      selectedChoiceIds,
    });
    set((state) => ({
      outbox: [...state.outbox, event],
      saving: true,
      storageError: null,
      syncStatus: 'syncing',
      syncError: null,
    }));
    try {
      await persistCurrentState(get, set, '回答を保存できませんでした。次の問題へは進めません。');
      const canonicalEvents = await ingestLearningEvents([event]);
      const canonical = canonicalEvents[0];
      if (!canonical || canonical.kind !== 'answer.submitted' || canonical.entityId !== attemptId) {
        throw new Error('サーバーの回答結果を確認できませんでした。');
      }
      const canonicalPayload = canonical.payload;
      const canonicalSelectedChoiceIds = canonicalPayload.selectedChoiceIds;
      const expectedChoiceIds = new Set(selectedChoiceIds);
      if (canonicalPayload.sessionId !== sessionId
        || canonicalPayload.questionId !== questionId
        || canonicalPayload.questionVersionId !== questionVersionId
        || !Array.isArray(canonicalSelectedChoiceIds)
        || !canonicalSelectedChoiceIds.every((choiceId) => typeof choiceId === 'string')
        || canonicalSelectedChoiceIds.length !== selectedChoiceIds.length
        || new Set(canonicalSelectedChoiceIds).size !== canonicalSelectedChoiceIds.length
        || canonicalSelectedChoiceIds.some((choiceId) => !expectedChoiceIds.has(choiceId))
        || typeof canonicalPayload.isCorrect !== 'boolean'
        || typeof canonicalPayload.answeredAt !== 'string') {
        throw new Error('サーバーの採点結果が不完全なため、回答を確定できません。');
      }
      await get().applyRemoteEvents([canonical], 'ack');
      await get().markOutboxSynced([event.id]);
      const authoritativeAttempt = get().attempts.find((item) => item.id === attemptId);
      const authoritativeState = get().questionStates[questionId];
      if (!authoritativeAttempt || !authoritativeState) {
        throw new Error('サーバー確定後の学習状態を復元できませんでした。');
      }
      return { attempt: authoritativeAttempt, questionState: authoritativeState };
    } catch (error: unknown) {
      set({ syncStatus: 'queued', syncError: error instanceof Error ? error.message : '回答確定を保留しています。' });
      throw error;
    }
  },

  submitExam: async (sessionId) => {
    if (get().syncMode === 'portable-local') {
      throw new Error('portable-localの復元データでは、サーバー採点が必要な模試を提出できません。');
    }
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session || session.mode !== 'exam') {
      throw new Error('模試セッションが見つかりません。');
    }
    const existingAttempts = get().attempts.filter((attempt) => attempt.sessionId === sessionId);
    if (session.status === 'completed') {
      const validAttempts = existingAttempts.filter((attempt) => !attempt.invalidated);
      const correctCount = validAttempts.filter((attempt) => attempt.isCorrect).length;
      return { correctCount, totalCount: Math.max(0, session.questionIds.length - existingAttempts.filter((attempt) => attempt.invalidated).length), passed: correctCount >= examConfig.passScore };
    }
    const now = new Date().toISOString();
    const pendingSubmittedEvent = get().outbox.find((event) => (
      event.kind === 'session.submitted' && event.entityId === sessionId && !event.resolved
    ));
    if (pendingSubmittedEvent?.blocked) {
      throw new Error('模試提出は同期の恒久エラーで保留されています。データ管理から復旧してください。');
    }
    const submittedEvent = pendingSubmittedEvent ?? createOutboxEvent('session.submitted', sessionId, now, { sessionId });
    set((state) => ({
      sessions: state.sessions.map((item) => item.id === sessionId
        ? {
          ...item,
          status: 'submitting',
          submittedAt: item.submittedAt ?? now,
          updatedAt: now,
        }
        : item),
      outbox: [
        ...state.outbox.filter((event) => !(event.kind === 'session.submitted' && event.entityId === sessionId)),
        submittedEvent,
      ],
      saving: true,
      storageError: null,
      syncStatus: 'syncing',
      syncError: null,
    }));
    try {
      await persistCurrentState(get, set, '模試の提出状態を保存できませんでした。');
      const canonicalEvents = await ingestLearningEvents([submittedEvent]);
      const canonicalSubmitted = canonicalEvents[0];
      if (!canonicalSubmitted || canonicalSubmitted.kind !== 'session.submitted' || canonicalSubmitted.entityId !== sessionId) {
        throw new Error('サーバーの模試提出結果を確認できませんでした。');
      }
      const remoteEvents = await fetchLearningEventsAfter(get().storageOwnerId ?? '', get().syncCursor);
      if (!remoteEvents.some((event) => event.kind === 'session.submitted' && event.entityId === sessionId)) {
        throw new Error('サーバーの模試採点結果を取得できませんでした。');
      }
      await get().applyRemoteEvents(remoteEvents, 'pull');
      await get().markOutboxSynced([submittedEvent.id]);
      const completedSession = get().sessions.find((item) => item.id === sessionId);
      const completedAttempts = get().attempts.filter((attempt) => attempt.sessionId === sessionId && !attempt.invalidated);
      if (!completedSession || completedSession.status !== 'completed') {
        throw new Error('模試の完了状態を確認できませんでした。');
      }
      const correctCount = completedAttempts.filter((attempt) => attempt.isCorrect).length;
      return {
        correctCount,
        totalCount: Math.max(0, session.questionIds.length - get().attempts.filter((attempt) => attempt.sessionId === sessionId && attempt.invalidated).length),
        passed: correctCount >= examConfig.passScore,
      };
    } catch (error: unknown) {
      set({ syncStatus: 'queued', syncError: error instanceof Error ? error.message : '模試提出を保留しています。' });
      throw error;
    }
  },

  moveToNext: async (sessionId, questionId) => {
    const now = new Date().toISOString();
    const currentSession = get().sessions.find((session) => session.id === sessionId);
    if (!currentSession) throw new Error('学習セッションが見つかりません。');
    const nextSession = advanceSession(currentSession, questionId, now);
    const destinationQuestionId = nextSession.questionIds[nextSession.currentIndex];
    if (!destinationQuestionId) throw new Error('移動先の問題が見つかりません。');
    set((state) => ({
      sessions: state.sessions.map((session) => session.id === sessionId
        ? nextSession
        : session),
      outbox: [
        ...state.outbox.filter((event) => !(event.kind === 'session.advanced' && event.entityId === sessionId)),
        createOutboxEvent('session.advanced', sessionId, now, { sessionId, questionId: destinationQuestionId }),
      ],
      saving: true,
      storageError: null,
      syncStatus: 'queued',
      syncError: null,
    }));
    try {
      await persistCurrentState(get, set, '進捗を保存できませんでした。');
    } catch (error: unknown) {
      throw error;
    }
  },

  goToQuestion: async (sessionId, index) => {
    const now = new Date().toISOString();
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error('学習セッションが見つかりません。');
    const currentIndex = Math.max(0, Math.min(index, session.questionIds.length - 1));
    const destinationQuestionId = session.questionIds[currentIndex];
    if (!destinationQuestionId) throw new Error('移動先の問題が見つかりません。');
    set((state) => ({
      sessions: state.sessions.map((item) => item.id === sessionId
        ? { ...item, currentIndex, updatedAt: now }
        : item),
      outbox: [
        ...state.outbox.filter((event) => !(event.kind === 'session.advanced' && event.entityId === sessionId)),
        createOutboxEvent('session.advanced', sessionId, now, { sessionId, questionId: destinationQuestionId }),
      ],
      saving: true,
      storageError: null,
      syncStatus: 'queued',
      syncError: null,
    }));
    await persistCurrentState(get, set, '進捗を保存できませんでした。');
  },

  toggleReviewMark: async (sessionId, questionId) => {
    const now = new Date().toISOString();
    let marked = false;
    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const reviewQuestionIds = session.reviewQuestionIds ?? [];
        marked = !reviewQuestionIds.includes(questionId);
        return {
          ...session,
          reviewQuestionIds: marked
            ? [...reviewQuestionIds, questionId]
            : reviewQuestionIds.filter((id) => id !== questionId),
          updatedAt: now,
        };
      }),
      outbox: [
        ...state.outbox.filter((event) => !(event.kind === 'session.review-marked' && event.entityId === `${sessionId}:${questionId}`)),
        createOutboxEvent('session.review-marked', `${sessionId}:${questionId}`, now, { sessionId, questionId, marked }),
      ],
      saving: true,
      storageError: null,
      syncStatus: 'queued',
      syncError: null,
    }));
    try {
      await persistCurrentState(get, set, '見直し印を保存できませんでした。');
    } catch (error: unknown) {
      throw error;
    }
  },

  toggleBookmark: async (questionId) => {
    const now = new Date().toISOString();
    set((state) => {
      const enabled = !state.bookmarks.includes(questionId);
      return {
        bookmarks: enabled
          ? [...state.bookmarks, questionId]
          : state.bookmarks.filter((id) => id !== questionId),
        outbox: [...state.outbox, createOutboxEvent('bookmark.changed', questionId, now, { questionId, enabled })],
        saving: true,
        storageError: null,
        syncStatus: 'queued',
        syncError: null,
      };
    });
    await persistCurrentState(get, set, 'ブックマークを保存できませんでした。');
  },

  saveNote: async (questionId, questionVersionId, body) => {
    if (body.length > 10_000) {
      throw new Error('メモは10,000文字以内で入力してください。');
    }
    const now = new Date().toISOString();
    set((state) => {
      const previous = state.notes[questionId];
      const note = {
        questionId,
        questionVersionId,
        body,
        revision: previous?.revision ?? 0,
        updatedAt: now,
      };
      const event = createOutboxEvent('note.saved', questionId, now, {
        questionId,
        questionVersionId,
        body,
        expectedRevision: note.revision,
      });
      return {
        notes: { ...state.notes, [questionId]: note },
        outbox: [
          ...state.outbox.filter((item) => !(
            item.kind === 'note.saved' && item.entityId === questionId && !item.blocked && !item.resolved
          )),
          event,
        ],
        saving: true,
        storageError: null,
        syncStatus: 'queued',
        syncError: null,
      };
    });
    try {
      await persistCurrentState(get, set, 'メモを保存できませんでした。');
    } catch (error: unknown) {
      throw error;
    }
  },

  reportIssue: async (questionId, questionVersionId, category, description) => {
    const normalizedDescription = description.trim();
    if (normalizedDescription.length < 5) {
      throw new Error('報告内容を5文字以上で入力してください。');
    }
    if (normalizedDescription.length > 4_000) {
      throw new Error('報告内容は4,000文字以内で入力してください。');
    }
    const now = new Date().toISOString();
    const issueId = randomUUID();
    const event = createOutboxEvent('issue.reported', issueId, now, {
      issueId,
      questionId,
      questionVersionId,
      category,
      description: normalizedDescription,
      createdAt: now,
    });
    set((state) => ({
      issues: [...state.issues, {
        id: issueId,
        eventId: event.id,
        questionId,
        questionVersionId,
        category,
        description: normalizedDescription,
        createdAt: now,
        syncStatus: 'queued',
      }],
      outbox: [...state.outbox, event],
      saving: true,
      storageError: null,
      syncStatus: 'queued',
      syncError: null,
    }));
    try {
      await persistCurrentState(get, set, '問題報告を保存できませんでした。');
      return issueId;
    } catch (error: unknown) {
      throw error;
    }
  },

  setDailyGoal: async (goal) => {
    set({ dailyGoal: Math.max(1, Math.min(100, goal)), saving: true });
    await persistCurrentState(get, set, '1日の目標を保存できませんでした。');
  },

  restoreSnapshot: async (snapshot) => {
    const validatedSnapshot = parseLearningSnapshot(snapshot);
    if (!validatedSnapshot) {
      throw new Error('バックアップの整合性を確認できませんでした。');
    }
    const portableSnapshot = preparePortableRestore(validatedSnapshot);
    set({
      ...portableSnapshot,
      saving: true,
      storageError: null,
      syncStatus: 'synced',
      syncError: 'バックアップは端末内へ復元しました。別アカウントのサーバー履歴へは自動同期しません。',
    });
    try {
      await persistCurrentState(get, set, 'バックアップを復元できませんでした。');
    } catch (error: unknown) {
      throw error;
    }
  },

  clearLearningData: async () => {
    set({ ...initialSnapshot, saving: true, storageError: null, syncStatus: 'synced', syncError: null });
    try {
      await persistCurrentState(get, set, '端末の学習データを削除できませんでした。');
    } catch (error: unknown) {
      throw error;
    }
  },

  markOutboxSynced: async (eventIds) => {
    const eventIdSet = new Set(eventIds);
    set((state) => {
      const outbox = state.outbox.filter((event) => !eventIdSet.has(event.id));
      return {
      outbox,
      issues: state.issues.map((issue) => eventIdSet.has(issue.eventId) ? { ...issue, syncStatus: 'synced' } : issue),
      saving: true,
      syncStatus: pendingOutboxCount({ ...state, outbox }) > 0 ? 'queued' : 'synced',
      syncError: null,
      };
    });
    await persistCurrentState(get, set, '同期済み状態を保存できませんでした。');
  },

  blockOutboxEvent: async (eventId, reason) => {
    set((state) => ({
      outbox: state.outbox.map((event) => event.id === eventId
        ? { ...event, blocked: true, blockedReason: reason }
        : event),
      saving: true,
      syncStatus: 'conflict',
      syncError: reason,
    }));
    await persistCurrentState(get, set, '同期復旧状態を保存できませんでした。');
  },

  resolveConflict: async (conflictId, action, mergedValue) => {
    const conflict = (get().conflicts ?? []).find((item) => item.id === conflictId);
    if (!conflict) throw new Error('同期競合が見つかりません。');
    const now = new Date().toISOString();
    set((state) => {
      const conflicts = (state.conflicts ?? []).filter((item) => item.id !== conflictId);
      let outbox = [...state.outbox];
      if (conflict.kind === 'draft') {
        const pending = outbox.find((event) => (
          event.kind === 'draft.saved' && event.entityId === conflict.entityId && !event.resolved
        ));
        if (action === 'accept-remote') {
          outbox = outbox.map((event) => event.id === pending?.id
            ? { ...event, resolved: true, blocked: false }
            : event);
          return {
            drafts: { ...state.drafts, [conflict.entityId]: conflict.remote },
            conflicts,
            outbox,
            saving: true,
            syncStatus: pendingOutboxCount({ ...state, outbox }) > 0 ? 'queued' : 'synced',
            syncError: null,
          };
        }
        const selectedChoiceIds = action === 'merge'
          ? (Array.isArray(mergedValue) ? mergedValue : null)
          : conflict.local.selectedChoiceIds;
        if (!selectedChoiceIds) throw new Error('ドラフトのmergeには選択肢配列が必要です。');
        const resolvedDraft = {
          ...conflict.local,
          selectedChoiceIds,
          revision: conflict.remote.revision,
          updatedAt: now,
        };
        const replacement = createOutboxEvent('draft.saved', conflict.entityId, now, {
          sessionId: resolvedDraft.sessionId,
          questionId: resolvedDraft.questionId,
          selectedChoiceIds,
          expectedRevision: conflict.remote.revision,
          deviceId: resolvedDraft.deviceId,
        });
        outbox = pending
          ? outbox.map((event) => event.id === pending.id
            ? { ...event, resolved: true }
            : event)
          : outbox;
        outbox.push(replacement);
        return {
          drafts: { ...state.drafts, [conflict.entityId]: resolvedDraft },
          conflicts,
          outbox,
          saving: true,
          syncStatus: 'queued',
          syncError: null,
        };
      }

      const pending = outbox.find((event) => (
        event.kind === 'note.saved' && event.entityId === conflict.entityId && !event.resolved
      ));
      if (action === 'accept-remote') {
        outbox = outbox.map((event) => event.id === pending?.id
          ? { ...event, resolved: true, blocked: false }
          : event);
        return {
          notes: { ...state.notes, [conflict.entityId]: conflict.remote },
          conflicts,
          outbox,
          saving: true,
          syncStatus: pendingOutboxCount({ ...state, outbox }) > 0 ? 'queued' : 'synced',
          syncError: null,
        };
      }
      const body = action === 'merge'
        ? (typeof mergedValue === 'string' ? mergedValue : null)
        : conflict.local.body;
      if (body === null) throw new Error('メモのmergeには文字列が必要です。');
      const resolvedNote: QuestionNote = { ...conflict.local, body, revision: conflict.remote.revision, updatedAt: now };
      const replacement = createOutboxEvent('note.saved', conflict.entityId, now, {
        questionId: resolvedNote.questionId,
        questionVersionId: resolvedNote.questionVersionId,
        body,
        expectedRevision: conflict.remote.revision,
      });
      outbox = pending
        ? outbox.map((event) => event.id === pending.id
          ? { ...event, resolved: true }
          : event)
        : outbox;
      outbox.push(replacement);
      return {
        notes: { ...state.notes, [conflict.entityId]: resolvedNote },
        conflicts,
        outbox,
        saving: true,
        syncStatus: 'queued',
        syncError: null,
      };
    });
    await persistCurrentState(get, set, '競合解決を保存できませんでした。');
  },

  applyRemoteEvents: async (events, source = 'pull') => {
    if (events.length === 0) return;
    const sortedEvents = [...events].sort((left, right) => left.sequence - right.sequence);
    set((state) => {
      let sessions = [...state.sessions];
      let drafts = { ...state.drafts };
      let attempts = [...state.attempts];
      let bookmarks = [...state.bookmarks];
      let notes = { ...state.notes };
      let issues = [...state.issues];
      let outbox = [...state.outbox];
      let conflicts = [...(state.conflicts ?? [])];
      let conflictMessage: string | null = null;

      for (const event of sortedEvents) {
        const payload = event.payload;

        if (event.kind === 'session.created') {
          const mode = payload.mode;
          const title = payload.title;
          const questionIds = payload.questionIds;
          const questionVersionIds = payload.questionVersionIds;
          const createdAt = payload.createdAt;
          const startedAt = payload.startedAt;
          if ((mode === 'chapter' || mode === 'random' || mode === 'wrong' || mode === 'review' || mode === 'exam')
            && typeof title === 'string' && Array.isArray(questionIds)
            && questionIds.every((questionId): questionId is string => typeof questionId === 'string')
            && typeof createdAt === 'string'
            && Array.isArray(questionVersionIds)
            && questionVersionIds.length === questionIds.length
            && questionVersionIds.every((versionId): versionId is string => typeof versionId === 'string')) {
            const durationMinutes = typeof payload.durationMinutes === 'number' ? payload.durationMinutes : null;
            const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : null;
            const canonicalStartedAt = typeof startedAt === 'string' ? startedAt : createdAt;
            const catalogSnapshots = createQuestionSnapshots(questionIds);
            const hasSafeCatalogSnapshots = catalogSnapshots.length === questionIds.length
              && catalogSnapshots.every((question, index) => question.versionId === questionVersionIds[index]);
            const existing = sessions.find((session) => session.id === event.entityId);
            if (existing) {
              const localQuestionVersionIds = existing.questionVersionIds
                ?? existing.questionSnapshots?.map((question) => question.versionId);
              const snapshotsMatch = existing.questionIds.length === questionIds.length
                && existing.questionIds.every((questionId, index) => questionId === questionIds[index])
                && (!localQuestionVersionIds
                  || (localQuestionVersionIds.length === questionVersionIds.length
                    && localQuestionVersionIds.every((versionId, index) => versionId === questionVersionIds[index])))
                && (!existing.questionSnapshots || existing.questionSnapshots.every(
                  (question, index) => question.id === questionIds[index] && question.versionId === questionVersionIds[index],
                ));
              if (!snapshotsMatch) {
                conflictMessage = 'セッション開始時の問題版とサーバーの公開版が一致しません。問題データの更新が必要です。';
              } else {
                sessions = sessions.map((session) => session.id === event.entityId
                  ? {
                    ...session,
                    durationMinutes,
                    expiresAt,
                    startedAt: canonicalStartedAt,
                    createdAt,
                    questionVersionIds,
                    questionSnapshots: existing.questionSnapshots ?? (hasSafeCatalogSnapshots ? catalogSnapshots : undefined),
                    updatedAt: event.occurredAt,
                  }
                  : session);
              }
            } else {
              sessions = [{
                id: event.entityId,
                mode,
                title,
                questionIds,
                questionVersionIds,
                questionSnapshots: hasSafeCatalogSnapshots ? catalogSnapshots : undefined,
                currentIndex: 0,
                answeredQuestionIds: [],
                status: 'active',
                reviewQuestionIds: [],
                durationMinutes,
                expiresAt,
                startedAt: canonicalStartedAt,
                submittedAt: null,
                createdAt,
                updatedAt: createdAt,
              }, ...sessions];
            }
          }
        }

        if (event.kind === 'draft.saved') {
          const sessionId = payload.sessionId;
          const questionId = payload.questionId;
          const selectedChoiceIds = payload.selectedChoiceIds;
          const revision = payload.revision;
          const updatedAt = payload.updatedAt;
          const questionVersionId = payload.questionVersionId;
          const deviceId = payload.deviceId;
          if (typeof sessionId === 'string' && typeof questionId === 'string' && Array.isArray(selectedChoiceIds)
            && typeof revision === 'number' && Number.isInteger(revision) && revision >= 0
            && typeof updatedAt === 'string' && typeof questionVersionId === 'string') {
            const key = `${sessionId}:${questionId}`;
            const pending = outbox.find((item) => item.kind === 'draft.saved' && item.entityId === key);
            if (source === 'pull' && pending && pending.id !== event.id) {
              conflictMessage = '別の端末で途中回答が更新されました。ローカルの選択を保持しています。';
              const local = drafts[key];
              if (local) {
                const remote = {
                  sessionId,
                  questionId,
                  selectedChoiceIds: selectedChoiceIds.filter((value): value is string => typeof value === 'string'),
                  questionVersionId,
                  revision,
                  deviceId: typeof deviceId === 'string' ? deviceId : state.deviceId,
                  updatedAt,
                };
                const conflict = {
                  id: `draft:${key}:${event.id}`,
                  kind: 'draft' as const,
                  entityId: key,
                  local,
                  remote,
                  createdAt: event.occurredAt,
                };
                conflicts = [...conflicts.filter((item) => item.id !== conflict.id), conflict];
                outbox = outbox.map((item) => item.id === pending.id
                  ? { ...item, blocked: true, blockedReason: conflictMessage ?? '同期競合が発生しました。' }
                  : item);
              }
            } else if (source === 'ack' && pending && pending.id !== event.id) {
              const current = drafts[key];
              if (current) {
                drafts[key] = { ...current, questionVersionId, revision };
              }
              outbox = outbox.map((item) => item.id === pending.id
                ? { ...item, payload: { ...item.payload, expectedRevision: revision } }
                : item);
            } else {
              drafts[key] = {
                sessionId,
                questionId,
                selectedChoiceIds,
                questionVersionId,
                revision,
                deviceId: typeof deviceId === 'string' ? deviceId : state.deviceId,
                updatedAt,
              };
            }
          }
        }

        if (event.kind === 'answer.submitted') {
          const sessionId = payload.sessionId;
          const questionId = payload.questionId;
          const questionVersionId = payload.questionVersionId;
          const selectedChoiceIds = payload.selectedChoiceIds;
          const isCorrect = payload.isCorrect;
          const answeredAt = payload.answeredAt;
          const invalidated = payload.invalidated === true;
          if (typeof sessionId === 'string' && typeof questionId === 'string' && typeof questionVersionId === 'string'
            && Array.isArray(selectedChoiceIds) && typeof isCorrect === 'boolean' && typeof answeredAt === 'string') {
            const attempt: AnswerAttempt = {
              id: event.entityId,
              sessionId,
              questionId,
              questionVersionId,
              selectedChoiceIds,
              isCorrect,
              invalidated,
              answeredAt,
            };
            attempts = [
              ...attempts.filter((item) => item.id !== event.entityId
                && !(item.sessionId === sessionId && item.questionId === questionId)),
              attempt,
            ];
            sessions = sessions.map((session) => {
              if (session.id !== sessionId) return session;
              const answeredQuestionIds = session.answeredQuestionIds.includes(questionId)
                ? session.answeredQuestionIds
                : [...session.answeredQuestionIds, questionId];
              return {
                ...session,
                answeredQuestionIds,
                status: session.mode !== 'exam' && answeredQuestionIds.length >= session.questionIds.length
                  ? 'completed'
                  : session.status,
                updatedAt: answeredAt,
              };
            });
          }
        }

        if (event.kind === 'session.advanced') {
          const questionId = payload.questionId;
          const currentIndex = payload.currentIndex;
          if (typeof questionId === 'string') {
            sessions = sessions.map((session) => {
              if (session.id !== event.entityId) return session;
              const canonicalIndex = typeof currentIndex === 'number' && Number.isInteger(currentIndex)
                ? currentIndex
                : session.questionIds.indexOf(questionId);
              if (canonicalIndex < 0 || canonicalIndex >= session.questionIds.length) return session;
              return { ...session, currentIndex: canonicalIndex, updatedAt: event.occurredAt };
            });
          }
        }

        if (event.kind === 'session.submitted') {
          const submittedAt = payload.submittedAt;
          const answeredQuestionIds = payload.answeredQuestionIds;
          if (typeof submittedAt === 'string' && Array.isArray(answeredQuestionIds)) {
            sessions = sessions.map((session) => session.id === event.entityId
              ? {
                ...session,
                answeredQuestionIds,
                status: 'completed',
                submittedAt,
                updatedAt: submittedAt,
              }
              : session);
          }
        }

        if (event.kind === 'session.review-marked') {
          const sessionId = payload.sessionId;
          const questionId = payload.questionId;
          const marked = payload.marked;
          if (typeof sessionId === 'string' && typeof questionId === 'string' && typeof marked === 'boolean') {
            sessions = sessions.map((session) => session.id === sessionId
              ? {
                ...session,
                reviewQuestionIds: marked
                  ? [...new Set([...(session.reviewQuestionIds ?? []), questionId])]
                  : (session.reviewQuestionIds ?? []).filter((id) => id !== questionId),
                updatedAt: event.occurredAt,
              }
              : session);
          }
        }

        if (event.kind === 'bookmark.changed') {
          const enabled = payload.enabled;
          if (typeof enabled === 'boolean') {
            bookmarks = enabled
              ? [...new Set([...bookmarks, event.entityId])]
              : bookmarks.filter((questionId) => questionId !== event.entityId);
          }
        }

        if (event.kind === 'note.saved') {
          const questionId = payload.questionId;
          const questionVersionId = payload.questionVersionId;
          const body = payload.body;
          const revision = payload.revision;
          const updatedAt = payload.updatedAt;
          if (typeof questionId === 'string' && typeof questionVersionId === 'string' && typeof body === 'string'
            && typeof revision === 'number' && Number.isInteger(revision) && revision >= 0
            && typeof updatedAt === 'string') {
            const pending = outbox.find((item) => item.kind === 'note.saved' && item.entityId === questionId);
            if (source === 'pull' && pending && pending.id !== event.id) {
              conflictMessage = '別の端末で問題メモが更新されました。ローカルの内容を保持しています。';
              const local = notes[questionId];
              if (local) {
                const remote = { questionId, questionVersionId, body, revision, updatedAt };
                const conflict = {
                  id: `note:${questionId}:${event.id}`,
                  kind: 'note' as const,
                  entityId: questionId,
                  local,
                  remote,
                  createdAt: event.occurredAt,
                };
                conflicts = [...conflicts.filter((item) => item.id !== conflict.id), conflict];
                outbox = outbox.map((item) => item.id === pending.id
                  ? { ...item, blocked: true, blockedReason: conflictMessage ?? '同期競合が発生しました。' }
                  : item);
              }
            } else if (source === 'ack' && pending && pending.id !== event.id) {
              const current = notes[questionId];
              if (current) notes[questionId] = { ...current, revision };
              outbox = outbox.map((item) => item.id === pending.id
                ? { ...item, payload: { ...item.payload, expectedRevision: revision } }
                : item);
            } else {
              notes[questionId] = { questionId, questionVersionId, body, revision, updatedAt };
            }
          }
        }

        if (event.kind === 'issue.reported') {
          const issueId = payload.issueId;
          const questionId = payload.questionId;
          const questionVersionId = payload.questionVersionId;
          const category = payload.category;
          const description = payload.description;
          const createdAt = payload.createdAt;
          const validCategory: ContentIssueCategory | null = category === 'incorrect_answer' || category === 'unclear'
            || category === 'outdated' || category === 'typo' || category === 'other'
            ? category
            : null;
          if (typeof issueId === 'string' && typeof questionId === 'string' && typeof questionVersionId === 'string'
            && validCategory !== null && typeof description === 'string' && typeof createdAt === 'string') {
            const issue = {
              id: issueId,
              eventId: event.id,
              questionId,
              questionVersionId,
              category: validCategory,
              description,
              createdAt,
              syncStatus: 'synced' as const,
            };
            issues = [...issues.filter((item) => item.id !== issueId), issue];
          }
        }
      }

      const questionStates: LearningSnapshot['questionStates'] = {};
      for (const attempt of [...attempts]
        .filter((item) => !item.invalidated)
        .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt) || left.id.localeCompare(right.id))) {
        questionStates[attempt.questionId] = updateQuestionState(questionStates[attempt.questionId], attempt);
      }

      return {
        sessions,
        drafts,
        attempts,
        questionStates,
        bookmarks,
        notes,
        issues,
        outbox,
        conflicts,
        syncCursor: source === 'pull' ? sortedEvents.at(-1)?.sequence ?? state.syncCursor : state.syncCursor,
        saving: true,
        syncStatus: conflictMessage ? 'conflict' : state.syncStatus,
        syncError: conflictMessage ?? state.syncError,
      };
    });
    await persistCurrentState(get, set, '同期データを保存できませんでした。');
  },

  setSyncState: (status, message = null) => {
    set({ syncStatus: status, syncError: message });
  },
}));

export function getCurrentLearningSnapshot(): LearningSnapshot {
  return extractSnapshot(useLearningStore.getState());
}
