import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { getQuestion } from '@/content/questions';
import { examConfig } from '@/config/exam';
import { parseLearningSnapshot } from '@/domain/backup';
import { advanceSession, scoreAnswer, updateQuestionState } from '@/domain/learning';
import type {
  AnswerAttempt,
  ContentIssueCategory,
  ExamResult,
  LearningSession,
  LearningSnapshot,
  OutboxEvent,
  RemoteSyncEvent,
  SyncConflictRecord,
  SessionMode,
  SubmitAnswerResult,
} from '@/domain/types';
import { compareAndSetStoredValue, getStoredValue } from '@/storage/persistence';

const snapshotKey = 'learning-snapshot-v1';

const initialSnapshot: LearningSnapshot = {
  schemaVersion: 2,
  deviceId: randomUUID(),
  syncRevisions: {},
  syncOwnerId: null,
  syncConflictHistory: [],
  sessions: [],
  drafts: {},
  attempts: [],
  questionStates: {},
  bookmarks: [],
  notes: {},
  noteBuffer: {},
  issues: [],
  outbox: [],
  syncCursor: 0,
  dailyGoal: 10,
};

interface LearningStore extends LearningSnapshot {
  hydrated: boolean;
  saving: boolean;
  storageError: string | null;
  syncError: string | null;
  unsavedNotes: Record<string, string>;
  syncConflict: { kind: 'draft.saved' | 'note.saved' | 'answer.submitted' | 'session.submitted'; entityId: string; remote: RemoteSyncEvent } | null;
  initialize: () => Promise<void>;
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
  stageNote: (questionId: string, body: string) => Promise<void>;
  flushNoteBuffer: () => Promise<void>;
  reportIssue: (questionId: string, questionVersionId: string, category: ContentIssueCategory, description: string) => Promise<string>;
  setDailyGoal: (goal: number) => Promise<void>;
  restoreSnapshot: (snapshot: LearningSnapshot) => Promise<void>;
  clearLearningData: () => Promise<void>;
  prepareOutboxForRpc: () => Promise<void>;
  ensureSyncOwner: (userId: string) => Promise<void>;
  claimSyncOwner: (userId: string) => Promise<void>;
  markOutboxSynced: (eventIds: string[], canonicalEvents?: RemoteSyncEvent[]) => Promise<void>;
  applyRemoteEvents: (events: RemoteSyncEvent[]) => Promise<void>;
  resolveSyncConflict: (decision: 'local' | 'remote') => Promise<void>;
  setSyncError: (message: string | null) => void;
}

function revisionKey(kind: 'draft.saved' | 'note.saved', entityId: string): string {
  return `${kind}:${entityId}`;
}

function assertBundledVersions(session: LearningSession, questionId?: string): void {
  if (!session.questionVersionIds) return;
  for (const [index, id] of session.questionIds.entries()) {
    if (questionId && id !== questionId) continue;
    if (getQuestion(id)?.versionId !== session.questionVersionIds[index]) {
      throw new Error('サーバーで固定された問題版と端末の問題版が異なります。問題データを更新してから再開してください。');
    }
  }
}

function nextExpectedRevision(snapshot: LearningSnapshot, kind: 'draft.saved' | 'note.saved', entityId: string): number {
  const pending = snapshot.outbox.filter((event) => event.kind === kind && event.entityId === entityId);
  const previous = pending.at(-1)?.payload.expectedRevision;
  return typeof previous === 'number'
    ? previous + 1
    : (snapshot.syncRevisions[revisionKey(kind, entityId)] ?? 0) + pending.length;
}

function blocksRemoteEvent(event: RemoteSyncEvent, snapshot: LearningSnapshot): boolean {
  const pending = snapshot.outbox;
  if (event.kind === 'draft.saved' || event.kind === 'note.saved') {
    const local = pending.filter((item) => item.kind === event.kind && item.entityId === event.entityId);
    if (local.length === 0) return false;
    const revision = event.payload.revision;
    const firstExpected = local[0]?.payload.expectedRevision;
    return !(typeof revision === 'number' && typeof firstExpected === 'number'
      && (revision <= firstExpected || local.some((item) => item.id === event.id)));
  }
  if (event.kind === 'answer.submitted') {
    if (snapshot.sessions.some((session) => session.id === event.payload.sessionId && session.mode === 'exam')) return false;
    if (pending.some((item) => item.kind === 'answer.submitted' && item.id === event.id)) return false;
    return pending.some((item) => (item.kind === 'answer.submitted' || item.kind === 'draft.saved') && item.id !== event.id
      && item.payload.sessionId === event.payload.sessionId && item.payload.questionId === event.payload.questionId);
  }
  if (event.kind === 'session.submitted') {
    if (pending.some((item) => item.kind === 'session.submitted' && item.id === event.id)) return false;
    return pending.some((item) =>
      item.id !== event.id && item.payload.sessionId === event.entityId);
  }
  return false;
}

function extractSnapshot(store: LearningStore): LearningSnapshot {
  return {
    schemaVersion: 2,
    deviceId: store.deviceId,
    syncRevisions: store.syncRevisions,
    syncOwnerId: store.syncOwnerId,
    syncConflictHistory: store.syncConflictHistory,
    sessions: store.sessions,
    drafts: store.drafts,
    attempts: store.attempts,
    questionStates: store.questionStates,
    bookmarks: store.bookmarks,
    notes: store.notes,
    noteBuffer: store.noteBuffer,
    issues: store.issues,
    outbox: store.outbox,
    syncCursor: store.syncCursor,
    dailyGoal: store.dailyGoal,
  };
}

export function hasLearningData(state: LearningSnapshot): boolean {
  return state.sessions.length > 0 || Object.keys(state.drafts).length > 0 || state.attempts.length > 0
    || Object.keys(state.questionStates).length > 0 || state.bookmarks.length > 0 || Object.keys(state.notes).length > 0
    || Object.keys(state.noteBuffer).length > 0 || state.issues.length > 0 || state.outbox.length > 0 || state.syncCursor > 0
    || Object.keys(state.syncRevisions).length > 0 || state.syncConflictHistory.length > 0;
}

let persistenceChain: Promise<unknown> = Promise.resolve();
let storedSnapshot: string | null = null;
let pendingWrites = 0;
let storageLoaded = false;
const failedDrafts = new Set<string>();

function commitSnapshot<T>(
  get: () => LearningStore,
  set: (partial: Partial<LearningStore>) => void,
  update: (current: LearningSnapshot) => { snapshot: LearningSnapshot; result: T },
  failureMessage: string,
  afterWrite?: { success?: () => void; failure?: () => void; preserveError?: boolean },
): Promise<T> {
  pendingWrites += 1;
  set({ saving: true });
  const task = persistenceChain.then(async () => {
    if (!storageLoaded) throw new Error('端末の学習データを読み込めませんでした。再読み込みしてください。');
    const current = extractSnapshot(get());
    const { snapshot, result } = update(current);
    if (snapshot === current) return result;
    const serialized = JSON.stringify(snapshot);
    try {
      await compareAndSetStoredValue(snapshotKey, storedSnapshot, serialized);
    } catch (error: unknown) {
      afterWrite?.failure?.();
      set({ storageError: error instanceof Error ? error.message : failureMessage });
      throw error;
    }
    storedSnapshot = serialized;
    afterWrite?.success?.();
    set({ ...snapshot, storageError: afterWrite?.preserveError || failedDrafts.size > 0
      || Object.keys(get().unsavedNotes).length > 0 ? get().storageError : null });
    return result;
  });
  persistenceChain = task.catch(() => undefined);
  return task.finally(() => {
    pendingWrites -= 1;
    set({ saving: pendingWrites > 0 });
  });
}

function createOutboxEvent(
  kind: OutboxEvent['kind'],
  entityId: string,
  occurredAt: string,
  payload: OutboxEvent['payload'],
): OutboxEvent {
  return { id: randomUUID(), kind, entityId, occurredAt, payload };
}

export const useLearningStore = create<LearningStore>((set, get) => ({
  ...initialSnapshot,
  hydrated: false,
  saving: false,
  storageError: null,
  syncError: null,
  unsavedNotes: {},
  syncConflict: null,

  initialize: async () => {
    try {
      await persistenceChain;
      const stored = await getStoredValue(snapshotKey);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        const snapshot = parseLearningSnapshot(parsed);
        if (snapshot) {
          storedSnapshot = stored;
          storageLoaded = true;
          failedDrafts.clear();
          set({ ...snapshot, deviceId: snapshot.deviceId || randomUUID(), hydrated: true, storageError: null, syncError: null, unsavedNotes: snapshot.noteBuffer, syncConflict: null });
          return;
        }
        throw new Error('保存データの形式を読み込めませんでした。');
      }
      storedSnapshot = null;
      storageLoaded = true;
      failedDrafts.clear();
      set({ ...initialSnapshot, hydrated: true, storageError: null, syncError: null, unsavedNotes: {}, syncConflict: null });
    } catch (error: unknown) {
      storageLoaded = false;
      const message = error instanceof Error ? error.message : '保存データを読み込めませんでした。';
      set({ hydrated: true, storageError: message });
    }
  },

  startSession: async (mode, title, questionIds) => {
    if (questionIds.length === 0 || questionIds.length > 40 || new Set(questionIds).size !== questionIds.length) {
      throw new Error('学習問題は重複なしで1〜40問を選んでください。');
    }
    const now = new Date().toISOString();
    const session: LearningSession = {
      id: randomUUID(),
      mode,
      title,
      questionIds,
      questionVersionIds: questionIds.map((id) => getQuestion(id)?.versionId ?? ''),
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      reviewQuestionIds: [],
      durationMinutes: null,
      expiresAt: null,
      submittedAt: null,
      serverConfirmed: false,
      createdAt: now,
      updatedAt: now,
    };
    const event = createOutboxEvent('session.created', session.id, now, {
      sessionId: session.id,
      mode,
      title,
      questionIds,
      questionVersionIds: questionIds.map((id) => getQuestion(id)?.versionId ?? ''),
      createdAt: now,
    });
    return commitSnapshot(get, set, (state) => ({
      snapshot: { ...state, sessions: [session, ...state.sessions], outbox: [...state.outbox, event] },
      result: session.id,
    }), 'セッションを保存できませんでした。');
  },

  startExam: async (questionIds) => {
    if (questionIds.length !== examConfig.questionCount) {
      throw new Error(`模試を開始するには${examConfig.questionCount}問必要です。`);
    }
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const expiresAt = new Date(nowDate.getTime() + examConfig.durationMinutes * 60 * 1000).toISOString();
    const session: LearningSession = {
      id: randomUUID(),
      mode: 'exam',
      title: '模擬試験',
      questionIds,
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      reviewQuestionIds: [],
      durationMinutes: examConfig.durationMinutes,
      expiresAt,
      submittedAt: null,
      serverConfirmed: false,
      createdAt: now,
      updatedAt: now,
    };
    const event = createOutboxEvent('session.created', session.id, now, {
      sessionId: session.id,
      mode: 'exam',
      title: session.title,
      questionIds,
      durationMinutes: examConfig.durationMinutes,
      expiresAt,
      createdAt: now,
    });
    return commitSnapshot(get, set, (state) => ({
      snapshot: { ...state, sessions: [session, ...state.sessions], outbox: [...state.outbox, event] },
      result: session.id,
    }), '模試を保存できませんでした。');
  },

  selectChoice: async (sessionId, questionId, choiceId) => {
    const now = new Date().toISOString();
    const key = `${sessionId}:${questionId}`;
    const selectionType = getQuestion(questionId)?.selectionType ?? 'single';
    return commitSnapshot(get, set, (state) => {
      const session = state.sessions.find((item) => item.id === sessionId);
      if (!session || session.status !== 'active' || !session.questionIds.includes(questionId)) {
        throw new Error('選択できるセッションがありません。');
      }
      assertBundledVersions(session, questionId);
      if (state.attempts.some((attempt) => attempt.sessionId === sessionId && attempt.questionId === questionId)) {
        return { snapshot: state, result: undefined };
      }
      const previous = state.drafts[key];
      const isSelected = previous?.selectedChoiceIds.includes(choiceId) ?? false;
      const selectedChoiceIds = selectionType === 'multiple'
        ? isSelected
          ? (previous?.selectedChoiceIds ?? []).filter((id) => id !== choiceId)
          : [...(previous?.selectedChoiceIds ?? []), choiceId]
        : isSelected ? [] : [choiceId];
      const draft = { sessionId, questionId, selectedChoiceIds, updatedAt: now };
      const event = createOutboxEvent('draft.saved', key, now, {
        sessionId, questionId, selectedChoiceIds,
        expectedRevision: nextExpectedRevision(state, 'draft.saved', key), deviceId: state.deviceId,
      });
      return {
        snapshot: { ...state, drafts: { ...state.drafts, [key]: draft }, outbox: [...state.outbox, event] },
        result: undefined,
      };
    }, '回答の選択を保存できませんでした。', {
      success: () => failedDrafts.delete(key),
      failure: () => failedDrafts.add(key),
    });
  },

  submitAnswer: async (sessionId, questionId) => {
    return commitSnapshot(get, set, (state) => {
      const question = getQuestion(questionId);
      const draft = state.drafts[`${sessionId}:${questionId}`];
      const requiredChoiceCount = question?.requiredChoiceCount ?? 1;
      if (!question || !draft || draft.selectedChoiceIds.length !== requiredChoiceCount) {
        throw new Error(`${requiredChoiceCount}つの選択肢を選んでください。`);
      }
      const session = state.sessions.find((item) => item.id === sessionId);
      if (!session || session.status !== 'active' || !session.questionIds.includes(questionId)) {
        throw new Error('回答できるセッションがありません。');
      }
      assertBundledVersions(session, questionId);
      const existing = state.attempts.find((item) => item.sessionId === sessionId && item.questionId === questionId);
      if (existing) {
        const existingState = state.questionStates[questionId];
        if (!existingState) throw new Error('学習状態を復元できませんでした。');
        return { snapshot: state, result: { attempt: existing, questionState: existingState } };
      }
      const now = new Date().toISOString();
      const attempt: AnswerAttempt = {
        id: randomUUID(), sessionId, questionId, questionVersionId: question.versionId,
        selectedChoiceIds: draft.selectedChoiceIds, isCorrect: scoreAnswer(question, draft.selectedChoiceIds), answeredAt: now,
        provisional: true,
      };
      const questionState = updateQuestionState(state.questionStates[questionId], attempt);
      const event = createOutboxEvent('answer.submitted', attempt.id, now, {
        sessionId, questionId, questionVersionId: question.versionId,
        selectedChoiceIds: draft.selectedChoiceIds, isCorrect: attempt.isCorrect, answeredAt: now,
      });
      return {
        snapshot: {
          ...state,
          attempts: [...state.attempts, attempt],
          questionStates: { ...state.questionStates, [questionId]: questionState },
          sessions: state.sessions.map((item) => item.id === sessionId
            ? { ...item, answeredQuestionIds: [...new Set([...item.answeredQuestionIds, questionId])], updatedAt: now }
            : item),
          outbox: [...state.outbox, event],
        },
        result: { attempt, questionState },
      };
    }, '回答を保存できませんでした。次の問題へは進めません。');
  },

  submitExam: async (sessionId) => {
    return commitSnapshot(get, set, (state) => {
      if ([...failedDrafts].some((key) => key.startsWith(`${sessionId}:`))) {
        throw new Error('保存できなかった選択を再度選んでから提出してください。');
      }
      const session = state.sessions.find((item) => item.id === sessionId);
      if (!session || session.mode !== 'exam') throw new Error('模試セッションが見つかりません。');
      const existingAttempts = state.attempts.filter((attempt) => attempt.sessionId === sessionId);
      if (session.status === 'completed') {
        const correctCount = existingAttempts.filter((attempt) => attempt.isCorrect).length;
        return { snapshot: state, result: { correctCount, totalCount: session.questionIds.length, passed: correctCount >= examConfig.passScore } };
      }
      const now = new Date().toISOString();
      const existingQuestionIds = new Set(existingAttempts.map((attempt) => attempt.questionId));
      const newAttempts: AnswerAttempt[] = [];
      for (const questionId of session.questionIds) {
        const question = getQuestion(questionId);
        const draft = state.drafts[`${sessionId}:${questionId}`];
        const requiredChoiceCount = question?.requiredChoiceCount ?? 1;
        if (!question || !draft || draft.selectedChoiceIds.length !== requiredChoiceCount || existingQuestionIds.has(questionId)) continue;
        newAttempts.push({
          id: randomUUID(), sessionId, questionId, questionVersionId: question.versionId,
          selectedChoiceIds: draft.selectedChoiceIds, isCorrect: scoreAnswer(question, draft.selectedChoiceIds), answeredAt: now,
          provisional: true,
        });
      }
      const questionStates = { ...state.questionStates };
      for (const attempt of newAttempts) questionStates[attempt.questionId] = updateQuestionState(questionStates[attempt.questionId], attempt);
      const answeredQuestionIds = [...new Set([...existingAttempts, ...newAttempts].map((attempt) => attempt.questionId))];
      const submittedEvent = createOutboxEvent('session.submitted', sessionId, now, { sessionId, submittedAt: now, answeredQuestionIds });
      const allAttempts = [...existingAttempts, ...newAttempts];
      const correctCount = allAttempts.filter((attempt) => attempt.isCorrect).length;
      return {
        snapshot: {
          ...state, attempts: [...state.attempts, ...newAttempts], questionStates,
          sessions: state.sessions.map((item) => item.id === sessionId
            ? { ...item, answeredQuestionIds, status: 'completed', submittedAt: now, updatedAt: now }
            : item),
          outbox: [...state.outbox, submittedEvent],
        },
        result: { correctCount, totalCount: session.questionIds.length, passed: correctCount >= examConfig.passScore },
      };
    }, '模試結果を保存できませんでした。');
  },

  moveToNext: async (sessionId, questionId) => {
    return commitSnapshot(get, set, (state) => {
      const session = state.sessions.find((item) => item.id === sessionId);
      if (!session || session.status !== 'active' || session.questionIds[session.currentIndex] !== questionId
        || (session.mode !== 'exam' && !state.attempts.some((attempt) => attempt.sessionId === sessionId && attempt.questionId === questionId))) {
        throw new Error('回答を端末へ保存してから次の問題へ進んでください。');
      }
      const now = new Date().toISOString();
      const nextSession = advanceSession(session, questionId, now);
      const destinationQuestionId = nextSession.questionIds[nextSession.currentIndex] ?? questionId;
      return {
        snapshot: {
          ...state,
          sessions: state.sessions.map((item) => item.id === sessionId ? nextSession : item),
          outbox: [...state.outbox, createOutboxEvent('session.advanced', sessionId, now, { sessionId, questionId: destinationQuestionId })],
        },
        result: undefined,
      };
    }, '進捗を保存できませんでした。');
  },

  goToQuestion: async (sessionId, index) => {
    return commitSnapshot(get, set, (state) => {
      const session = state.sessions.find((item) => item.id === sessionId);
      if (session && session.status === 'active' && [...failedDrafts].some((key) => key.startsWith(`${sessionId}:`))) {
        throw new Error('保存できなかった選択を再度選んでから移動してください。');
      }
      if (!session || session.questionIds.length === 0) throw new Error('移動先のセッションがありません。');
      const targetIndex = Math.max(0, Math.min(index, session.questionIds.length - 1));
      if (targetIndex === session.currentIndex) return { snapshot: state, result: undefined };
      const now = new Date().toISOString();
      const destinationQuestionId = session.questionIds[targetIndex];
      if (!destinationQuestionId) throw new Error('移動先の問題がありません。');
      return {
        snapshot: {
          ...state,
          sessions: state.sessions.map((item) => item.id === sessionId
            ? { ...item, currentIndex: targetIndex, updatedAt: now }
            : item),
          outbox: session.status === 'active'
            ? [...state.outbox, createOutboxEvent('session.advanced', sessionId, now, { sessionId, questionId: destinationQuestionId })]
            : state.outbox,
        },
        result: undefined,
      };
    }, '表示位置を保存できませんでした。');
  },

  toggleReviewMark: async (sessionId, questionId) => {
    const now = new Date().toISOString();
    let marked = false;
    return commitSnapshot(get, set, (state) => ({ snapshot: { ...state,
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
    }, result: undefined }), '見直し印を保存できませんでした。');
  },

  toggleBookmark: async (questionId) => {
    const now = new Date().toISOString();
    return commitSnapshot(get, set, (state) => {
      const enabled = !state.bookmarks.includes(questionId);
      return {
        snapshot: { ...state,
          bookmarks: enabled ? [...state.bookmarks, questionId] : state.bookmarks.filter((id) => id !== questionId),
          outbox: [...state.outbox, createOutboxEvent('bookmark.changed', questionId, now, { questionId, enabled })],
        },
        result: undefined,
      };
    }, 'ブックマークを保存できませんでした。');
  },

  saveNote: async (questionId, questionVersionId, body) => {
    if (Array.from(body).length > 10_000) throw new Error('メモは10,000文字以内で入力してください。');
    const now = new Date().toISOString();
    set((state) => ({ unsavedNotes: { ...state.unsavedNotes, [questionId]: body } }));
    return commitSnapshot(get, set, (state) => {
      const previous = state.notes[questionId];
      const note = {
        questionId,
        questionVersionId,
        body,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: now,
      };
      const event = createOutboxEvent('note.saved', questionId, now, {
        questionId,
        questionVersionId,
        body,
        revision: note.revision,
        updatedAt: now,
        expectedRevision: nextExpectedRevision(state, 'note.saved', questionId),
      });
      const noteBuffer = { ...state.noteBuffer };
      if (noteBuffer[questionId] === body) delete noteBuffer[questionId];
      return {
        snapshot: { ...state,
          notes: { ...state.notes, [questionId]: note }, noteBuffer,
          outbox: [...state.outbox, event],
        },
        result: undefined,
      };
    }, 'メモを保存できませんでした。', {
      success: () => {
        const unsavedNotes = get().unsavedNotes;
        if (unsavedNotes[questionId] === body) {
          const remaining = { ...unsavedNotes };
          delete remaining[questionId];
          set({ unsavedNotes: remaining });
        }
      },
    });
  },

  stageNote: async (questionId, body) => {
    if (Array.from(body).length > 10_000) throw new Error('メモは10,000文字以内で入力してください。');
    set((state) => ({ unsavedNotes: { ...state.unsavedNotes, [questionId]: body } }));
    await commitSnapshot(get, set, (state) => ({ snapshot: { ...state,
      noteBuffer: { ...state.noteBuffer, [questionId]: body } }, result: undefined }), '入力中のメモを保存できませんでした。', { preserveError: true });
  },

  flushNoteBuffer: async () => {
    for (const [questionId, body] of Object.entries(get().noteBuffer)) {
      const versionId = get().notes[questionId]?.questionVersionId ?? getQuestion(questionId)?.versionId;
      if (!versionId) throw new Error('入力途中のメモに対応する問題版を確認できません。');
      await get().saveNote(questionId, versionId, body);
    }
  },

  reportIssue: async (questionId, questionVersionId, category, description) => {
    const normalizedDescription = description.trim();
    if (normalizedDescription.length < 5) {
      throw new Error('報告内容を5文字以上で入力してください。');
    }
    if (Array.from(normalizedDescription).length > 4_000) {
      throw new Error('報告内容を4,000文字以内で入力してください。');
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
    return commitSnapshot(get, set, (state) => ({
      snapshot: { ...state, issues: [...state.issues, {
        id: issueId,
        eventId: event.id,
        questionId,
        questionVersionId,
        category,
        description: normalizedDescription,
        createdAt: now,
        syncStatus: 'queued',
      }],
      outbox: [...state.outbox, event] },
      result: issueId,
    }), '問題報告を保存できませんでした。');
  },

  setDailyGoal: async (goal) => {
    return commitSnapshot(get, set, (state) => ({
      snapshot: { ...state, dailyGoal: Math.max(1, Math.min(100, goal)) }, result: undefined,
    }), '目標を保存できませんでした。');
  },

  restoreSnapshot: async (snapshot) => {
    return commitSnapshot(get, set, (state) => ({ snapshot: { ...snapshot, deviceId: state.deviceId,
      syncOwnerId: snapshot.syncOwnerId }, result: undefined }), 'バックアップを復元できませんでした。', {
      success: () => { failedDrafts.clear(); set({ unsavedNotes: snapshot.noteBuffer, syncConflict: null, syncError: null }); },
    });
  },

  clearLearningData: async () => {
    return commitSnapshot(get, set, (state) => ({ snapshot: { ...initialSnapshot, deviceId: state.deviceId }, result: undefined }), '端末の学習データを削除できませんでした。', {
      success: () => { failedDrafts.clear(); set({ unsavedNotes: {}, syncConflict: null, syncError: null }); },
    });
  },

  ensureSyncOwner: async (userId) => {
    return commitSnapshot(get, set, (state) => {
      if (state.syncOwnerId && state.syncOwnerId !== userId) {
        throw new Error('この端末の学習データは別のアカウントに紐づいています。データを確認してください。');
      }
      if (!state.syncOwnerId && hasLearningData(state)) {
        throw new Error('端末データの同期先を設定画面で確認してください。');
      }
      return { snapshot: state.syncOwnerId === userId ? state : { ...state, syncOwnerId: userId }, result: undefined };
    }, '同期するアカウントを保存できませんでした。', { preserveError: true });
  },

  claimSyncOwner: async (userId) => {
    return commitSnapshot(get, set, (state) => {
      if (state.syncOwnerId && state.syncOwnerId !== userId) throw new Error('別のアカウントに紐づく端末データは移せません。');
      if (state.syncCursor > 0 || Object.keys(state.syncRevisions).length > 0 || state.syncConflictHistory.length > 0) {
        throw new Error('過去の同期先を確認できないバックアップです。バックアップを保存し、端末データを整理してください。');
      }
      return { snapshot: { ...state, syncOwnerId: userId }, result: undefined };
    }, '同期するアカウントを保存できませんでした。');
  },

  prepareOutboxForRpc: async () => {
    return commitSnapshot(get, set, (state) => {
      const examSessionIds = new Set(state.sessions.filter((session) => session.mode === 'exam').map((session) => session.id));
      if (state.outbox.some((event) => event.kind === 'answer.submitted'
        && typeof event.payload.sessionId === 'string' && examSessionIds.has(event.payload.sessionId))) {
        throw new Error('旧版の模試回答イベントが残っています。バックアップを保存し、同期データを確認してください。');
      }
      const revisions = { ...state.syncRevisions };
      let changed = false;
      const outbox = state.outbox.map((event) => {
        if (event.kind !== 'draft.saved' && event.kind !== 'note.saved') return event;
        const key = revisionKey(event.kind, event.entityId);
        const expectedRevision = typeof event.payload.expectedRevision === 'number'
          ? event.payload.expectedRevision : revisions[key] ?? 0;
        revisions[key] = expectedRevision + 1;
        const deviceId = event.kind === 'draft.saved'
          ? typeof event.payload.deviceId === 'string' && event.payload.deviceId.length > 0
            ? event.payload.deviceId : state.deviceId
          : undefined;
        if (event.payload.expectedRevision === expectedRevision
          && (event.kind !== 'draft.saved' || event.payload.deviceId === deviceId)) return event;
        changed = true;
        return { ...event, payload: { ...event.payload, expectedRevision,
          ...(deviceId ? { deviceId } : {}) } };
      });
      return { snapshot: changed ? { ...state, outbox } : state, result: undefined };
    }, '同期イベントを準備できませんでした。', { preserveError: true });
  },

  markOutboxSynced: async (eventIds, canonicalEvents = []) => {
    const eventIdSet = new Set(eventIds);
    return commitSnapshot(get, set, (state) => {
      if (state.outbox.filter((event) => eventIdSet.has(event.id)).length !== eventIdSet.size) {
        throw new Error('同期中に端末データが変更されました。再同期してください。');
      }
      if (canonicalEvents.length > 0 && (canonicalEvents.length !== eventIds.length
        || canonicalEvents.some((event, index) => event.id !== eventIds[index]))) {
        throw new Error('同期応答のイベントが一致しません。');
      }
      const syncRevisions = { ...state.syncRevisions };
      for (const event of canonicalEvents) {
        if (event.kind === 'session.created') {
          const versionIds = event.payload.questionVersionIds;
          if (!Array.isArray(versionIds) || versionIds.length === 0) throw new Error('同期応答の問題版が不正です。');
        }
        if (event.kind !== 'draft.saved' && event.kind !== 'note.saved') continue;
        const revision = event.payload.revision;
        if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
          throw new Error('同期応答のrevisionが不正です。');
        }
        const key = revisionKey(event.kind, event.entityId);
        syncRevisions[key] = Math.max(syncRevisions[key] ?? 0, revision);
      }
      return {
        snapshot: { ...state, syncRevisions,
          sessions: state.sessions.map((session) => {
            const created = canonicalEvents.find((event) => event.kind === 'session.created' && event.entityId === session.id);
            if (!created) return session;
            return { ...session, questionVersionIds: created.payload.questionVersionIds as string[],
              createdAt: created.payload.createdAt as string,
              durationMinutes: typeof created.payload.durationMinutes === 'number' ? created.payload.durationMinutes : null,
              expiresAt: typeof created.payload.expiresAt === 'string' ? created.payload.expiresAt : null };
          }),
          outbox: state.outbox.filter((event) => !eventIdSet.has(event.id)),
          issues: state.issues.map((issue) => eventIdSet.has(issue.eventId) ? { ...issue, syncStatus: 'synced' } : issue),
        },
        result: undefined,
      };
    }, '同期状態を保存できませんでした。', { preserveError: true });
  },

  applyRemoteEvents: async (events) => {
    if (events.length === 0) return;
    const sortedEvents = [...events].sort((left, right) => left.sequence - right.sequence);
    const blocked = await commitSnapshot(get, set, (state) => {
      let sessions = [...state.sessions];
      let drafts = { ...state.drafts };
      let attempts = [...state.attempts];
      let bookmarks = [...state.bookmarks];
      let notes = { ...state.notes };
      let issues = [...state.issues];
      const syncRevisions = { ...state.syncRevisions };
      const processedEvents: RemoteSyncEvent[] = [];
      let blockedEvent: RemoteSyncEvent | null = null;

      for (const event of sortedEvents) {
        if (blocksRemoteEvent(event, state)) {
          blockedEvent = event;
          break;
        }
        processedEvents.push(event);
        const payload = event.payload;
        if (event.kind === 'session.created') {
          const mode = payload.mode;
          const title = payload.title;
          const questionIds = payload.questionIds;
          const createdAt = payload.createdAt;
          if ((mode === 'chapter' || mode === 'random' || mode === 'wrong' || mode === 'review' || mode === 'exam')
            && typeof title === 'string' && Array.isArray(questionIds) && typeof createdAt === 'string') {
            const questionVersionIds = Array.isArray(payload.questionVersionIds) ? payload.questionVersionIds : undefined;
            const durationMinutes = typeof payload.durationMinutes === 'number' ? payload.durationMinutes : null;
            const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : null;
            if (sessions.some((session) => session.id === event.entityId)) {
              sessions = sessions.map((session) => session.id === event.entityId
                ? { ...session, questionVersionIds, createdAt, durationMinutes, expiresAt }
                : session);
            } else {
              sessions = [{
                id: event.entityId, mode, title, questionIds, questionVersionIds, currentIndex: 0,
                answeredQuestionIds: [], status: 'active', reviewQuestionIds: [],
                durationMinutes, expiresAt, submittedAt: null, serverConfirmed: false, createdAt, updatedAt: createdAt,
              }, ...sessions];
            }
          }
        }

        if (event.kind === 'draft.saved') {
          const sessionId = payload.sessionId;
          const questionId = payload.questionId;
          const selectedChoiceIds = payload.selectedChoiceIds;
          if (typeof sessionId === 'string' && typeof questionId === 'string' && Array.isArray(selectedChoiceIds)) {
            const key = `${sessionId}:${questionId}`;
            if (typeof payload.revision === 'number' && Number.isInteger(payload.revision) && payload.revision > 0) {
              const revision = revisionKey('draft.saved', key);
              syncRevisions[revision] = Math.max(syncRevisions[revision] ?? 0, payload.revision);
            }
            const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : event.occurredAt;
            if (!state.outbox.some((item) => item.kind === 'draft.saved' && item.entityId === key)) {
              drafts[key] = { sessionId, questionId, selectedChoiceIds, updatedAt };
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
          if (typeof sessionId === 'string' && typeof questionId === 'string' && typeof questionVersionId === 'string'
            && Array.isArray(selectedChoiceIds) && typeof isCorrect === 'boolean' && typeof answeredAt === 'string') {
            const attempt: AnswerAttempt = {
              id: event.entityId,
              sessionId,
              questionId,
              questionVersionId,
              selectedChoiceIds,
              isCorrect,
              answeredAt,
              provisional: false,
              invalidated: payload.invalidated === true,
            };
            const existingIndex = attempts.findIndex((item) => item.id === event.entityId);
            const examProvisionalIndex = sessions.some((item) => item.id === sessionId && item.mode === 'exam')
              ? attempts.findIndex((item) => item.sessionId === sessionId && item.questionId === questionId && item.provisional)
              : -1;
            const replaceIndex = existingIndex >= 0 ? existingIndex : examProvisionalIndex;
            if (replaceIndex >= 0) attempts[replaceIndex] = attempt;
            else attempts = [...attempts, attempt];
            sessions = sessions.map((session) => session.id === sessionId
              ? {
                ...session,
                answeredQuestionIds: session.answeredQuestionIds.includes(questionId)
                  ? session.answeredQuestionIds
                  : [...session.answeredQuestionIds, questionId],
                status: session.mode !== 'exam' && new Set([...session.answeredQuestionIds, questionId]).size >= session.questionIds.length
                  ? 'completed' : session.status,
                updatedAt: answeredAt,
              }
              : session);
          }
        }

        if (event.kind === 'session.advanced') {
          const questionId = payload.questionId;
          if (typeof questionId === 'string') {
            sessions = sessions.map((session) => {
              if (session.id !== event.entityId || session.status !== 'active') return session;
              const targetIndex = typeof payload.currentIndex === 'number'
                ? payload.currentIndex : session.questionIds.indexOf(questionId);
              if (targetIndex < 0 || targetIndex >= session.questionIds.length
                || session.questionIds[targetIndex] !== questionId
                || state.outbox.some((item) => item.kind === 'session.advanced' && item.entityId === session.id)) return session;
              return { ...session, currentIndex: targetIndex, updatedAt: event.occurredAt };
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
                serverConfirmed: true,
                updatedAt: submittedAt,
              }
              : session);
          }
        }

        if (event.kind === 'session.review-marked') {
          const sessionId = payload.sessionId;
          const questionId = payload.questionId;
          const marked = payload.marked;
          if (typeof sessionId === 'string' && typeof questionId === 'string' && typeof marked === 'boolean'
            && !state.outbox.some((item) => item.kind === 'session.review-marked' && item.entityId === event.entityId)) {
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
            if (!state.outbox.some((item) => item.kind === 'bookmark.changed' && item.entityId === event.entityId)) {
              bookmarks = enabled
                ? [...new Set([...bookmarks, event.entityId])]
                : bookmarks.filter((questionId) => questionId !== event.entityId);
            }
          }
        }


        if (event.kind === 'note.saved') {
          const questionId = payload.questionId;
          const questionVersionId = payload.questionVersionId;
          const body = payload.body;
          const revision = payload.revision;
          const updatedAt = payload.updatedAt;
          if (typeof questionId === 'string' && typeof questionVersionId === 'string' && typeof body === 'string'
            && typeof revision === 'number' && typeof updatedAt === 'string') {
            const key = revisionKey('note.saved', questionId);
            syncRevisions[key] = Math.max(syncRevisions[key] ?? 0, revision);
            if (!state.outbox.some((item) => item.kind === 'note.saved' && item.entityId === questionId)) {
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
          const validCategory = category === 'incorrect_answer' || category === 'unclear' || category === 'outdated'
            || category === 'typo' || category === 'other';
          if (typeof issueId === 'string' && typeof questionId === 'string' && typeof questionVersionId === 'string'
            && validCategory && typeof description === 'string' && typeof createdAt === 'string'
            && !issues.some((issue) => issue.id === issueId)) {
            issues = [...issues, {
              id: issueId,
              eventId: event.id,
              questionId,
              questionVersionId,
              category,
              description,
              createdAt,
              syncStatus: 'synced',
            }];
          }
        }
      }

      const questionStates: LearningSnapshot['questionStates'] = {};
      for (const attempt of [...attempts].filter((item) => !item.invalidated)
        .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))) {
        questionStates[attempt.questionId] = updateQuestionState(questionStates[attempt.questionId], attempt);
      }

      if (processedEvents.length === 0) return { snapshot: state, result: blockedEvent };
      return {
        snapshot: { ...state, sessions, drafts, attempts, questionStates, bookmarks, notes, issues, syncRevisions,
          syncCursor: Math.max(state.syncCursor, processedEvents.at(-1)?.sequence ?? state.syncCursor) },
        result: blockedEvent,
      };
    }, '受信した学習履歴を保存できませんでした。', { preserveError: true });
    const localConflict = blocked && (
      (blocked.kind === 'draft.saved' || blocked.kind === 'note.saved')
        && get().outbox.some((event) => event.kind === blocked.kind && event.entityId === blocked.entityId)
      || blocked.kind === 'answer.submitted'
        && get().outbox.some((event) => (event.kind === 'answer.submitted' || event.kind === 'draft.saved')
          && event.payload.sessionId === blocked.payload.sessionId && event.payload.questionId === blocked.payload.questionId)
      || blocked.kind === 'session.submitted'
        && get().outbox.some((event) => event.payload.sessionId === blocked.entityId)
    )
      ? { kind: blocked.kind, entityId: blocked.entityId, remote: blocked } : null;
    set({
      syncError: blocked ? '別端末の変更と未送信の学習データが競合しています。未同期データを確認してください。' : null,
      syncConflict: localConflict,
    });
  },

  resolveSyncConflict: async (decision) => {
    const conflict = get().syncConflict;
    if (!conflict) throw new Error('解決する同期競合がありません。');
    if (conflict.kind === 'draft.saved' && failedDrafts.has(conflict.entityId)) {
      throw new Error('保存に失敗した選択を再度保存してから競合を解決してください。');
    }
    if (conflict.kind === 'note.saved' && Object.prototype.hasOwnProperty.call(get().unsavedNotes, conflict.entityId)) {
      throw new Error('保存に失敗したメモを再保存してから競合を解決してください。');
    }
    await commitSnapshot(get, set, (state) => {
      const finalConflict = conflict.kind === 'answer.submitted' || conflict.kind === 'session.submitted';
      const matching = state.outbox.filter((event) => finalConflict
        ? event.payload.sessionId === conflict.remote.payload.sessionId
          && (conflict.kind === 'session.submitted' || event.payload.questionId === conflict.remote.payload.questionId)
        : event.kind === conflict.kind && event.entityId === conflict.entityId);
      const latest = matching.at(-1);
      const revision = conflict.remote.payload.revision;
      if (!latest || state.syncCursor >= conflict.remote.sequence
        || !finalConflict && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)) {
        throw new Error('競合の状態が変わりました。もう一度同期してください。');
      }
      if (finalConflict && decision !== 'remote') throw new Error('サーバーで確定済みの回答は上書きできません。');
      if (decision === 'remote' && conflict.kind === 'draft.saved'
        && state.outbox.some((event) => event.kind === 'answer.submitted'
          && event.payload.sessionId === conflict.remote.payload.sessionId
          && event.payload.questionId === conflict.remote.payload.questionId)) {
        throw new Error('確定済みの未送信回答があります。バックアップを保存してから同期状態を確認してください。');
      }
      const now = new Date().toISOString();
      const resolvedRevision = typeof revision === 'number' ? revision : 0;
      const replacement = decision === 'local' && !finalConflict
        ? createOutboxEvent(conflict.kind, conflict.entityId, now, {
          ...latest.payload, expectedRevision: resolvedRevision,
          ...(conflict.kind === 'draft.saved' ? { deviceId: state.deviceId } : {}),
        }) : null;
      let inserted = false;
      const matchedIds = new Set(matching.map((event) => event.id));
      const outbox = state.outbox.flatMap((event) => {
        if (!matchedIds.has(event.id)) return [event];
        if (replacement && !inserted) { inserted = true; return [replacement]; }
        return [];
      });
      const record: SyncConflictRecord = {
        id: randomUUID(), kind: conflict.kind, entityId: conflict.entityId,
        localEventIds: matching.map((event) => event.id), localPayload: latest.payload,
        remoteEventId: conflict.remote.id, remotePayload: conflict.remote.payload,
        decision, resolvedAt: now,
      };
      const records = conflict.kind === 'session.submitted'
        ? matching.map((event) => ({ ...record, id: randomUUID(), entityId: event.entityId,
          localEventIds: [event.id], localPayload: event.payload }))
        : [record];
      const drafts = { ...state.drafts };
      const notes = { ...state.notes };
      let attempts = state.attempts;
      let sessions = state.sessions;
      if (decision === 'remote' && conflict.kind === 'answer.submitted') {
        const payload = conflict.remote.payload;
        if (typeof payload.sessionId !== 'string' || typeof payload.questionId !== 'string'
          || typeof payload.questionVersionId !== 'string' || !Array.isArray(payload.selectedChoiceIds)
          || typeof payload.isCorrect !== 'boolean' || typeof payload.answeredAt !== 'string') {
          throw new Error('別端末の確定回答が不正です。');
        }
        attempts = [
          ...state.attempts.filter((item) => item.sessionId !== payload.sessionId || item.questionId !== payload.questionId),
          { id: conflict.remote.entityId, sessionId: payload.sessionId, questionId: payload.questionId,
            questionVersionId: payload.questionVersionId, selectedChoiceIds: payload.selectedChoiceIds,
            isCorrect: payload.isCorrect, answeredAt: payload.answeredAt, provisional: false,
            invalidated: payload.invalidated === true },
        ];
        sessions = sessions.map((session) => session.id === payload.sessionId
          ? { ...session, answeredQuestionIds: [...new Set([...session.answeredQuestionIds, payload.questionId as string])] }
          : session);
      }
      if (decision === 'remote' && conflict.kind === 'session.submitted') {
        const payload = conflict.remote.payload;
        if (typeof payload.sessionId !== 'string' || typeof payload.submittedAt !== 'string'
          || !Array.isArray(payload.answeredQuestionIds)) throw new Error('別端末の模試結果が不正です。');
        attempts = state.attempts.filter((item) => item.sessionId !== payload.sessionId || !item.provisional);
        sessions = sessions.map((session) => session.id === payload.sessionId
          ? { ...session, status: 'completed', answeredQuestionIds: payload.answeredQuestionIds as string[],
            submittedAt: payload.submittedAt as string, serverConfirmed: true, updatedAt: payload.submittedAt as string }
          : session);
      }
      if (decision === 'remote' && conflict.kind === 'draft.saved') {
        const { sessionId, questionId, selectedChoiceIds, updatedAt } = conflict.remote.payload;
        if (typeof sessionId !== 'string' || typeof questionId !== 'string'
          || !Array.isArray(selectedChoiceIds) || typeof updatedAt !== 'string') throw new Error('別端末の選択データが不正です。');
        drafts[conflict.entityId] = { sessionId, questionId, selectedChoiceIds, updatedAt };
      }
      if (decision === 'remote' && conflict.kind === 'note.saved') {
        const { questionId, questionVersionId, body, updatedAt } = conflict.remote.payload;
        if (typeof questionId !== 'string' || typeof questionVersionId !== 'string'
          || typeof body !== 'string' || typeof updatedAt !== 'string') throw new Error('別端末のメモが不正です。');
        notes[conflict.entityId] = { questionId, questionVersionId, body, revision: resolvedRevision, updatedAt };
      }
      const questionStates: LearningSnapshot['questionStates'] = {};
      for (const attempt of [...attempts].filter((item) => !item.invalidated)
        .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))) {
        questionStates[attempt.questionId] = updateQuestionState(questionStates[attempt.questionId], attempt);
      }
      return {
        snapshot: { ...state, drafts, notes, attempts, sessions, questionStates, outbox,
          syncRevisions: finalConflict ? state.syncRevisions
            : { ...state.syncRevisions, [revisionKey(conflict.kind as 'draft.saved' | 'note.saved', conflict.entityId)]: revision as number },
          syncCursor: conflict.remote.sequence,
          syncConflictHistory: [...state.syncConflictHistory, ...records],
        },
        result: undefined,
      };
    }, '同期競合の解決を保存できませんでした。', {
      success: () => set({ syncConflict: null, syncError: null }),
    });
  },

  setSyncError: (message) => set({ syncError: message }),
}));

export function getCurrentLearningSnapshot(): LearningSnapshot {
  return extractSnapshot(useLearningStore.getState());
}
