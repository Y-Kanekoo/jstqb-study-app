import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { getQuestion } from '@/content/questions';
import { advanceSession, scoreAnswer, updateQuestionState } from '@/domain/learning';
import type {
  AnswerAttempt,
  LearningSession,
  LearningSnapshot,
  OutboxEvent,
  RemoteSyncEvent,
  SessionMode,
  SubmitAnswerResult,
} from '@/domain/types';
import { getStoredValue, setStoredValue } from '@/storage/persistence';

const snapshotKey = 'learning-snapshot-v1';

const initialSnapshot: LearningSnapshot = {
  schemaVersion: 1,
  sessions: [],
  drafts: {},
  attempts: [],
  questionStates: {},
  bookmarks: [],
  outbox: [],
  syncCursor: 0,
  dailyGoal: 10,
};

interface LearningStore extends LearningSnapshot {
  hydrated: boolean;
  saving: boolean;
  storageError: string | null;
  initialize: () => Promise<void>;
  startSession: (mode: SessionMode, title: string, questionIds: string[]) => Promise<string>;
  selectChoice: (sessionId: string, questionId: string, choiceId: string) => Promise<void>;
  submitAnswer: (sessionId: string, questionId: string) => Promise<SubmitAnswerResult>;
  moveToNext: (sessionId: string, questionId: string) => Promise<void>;
  goToQuestion: (sessionId: string, index: number) => Promise<void>;
  toggleBookmark: (questionId: string) => Promise<void>;
  setDailyGoal: (goal: number) => Promise<void>;
  markOutboxSynced: (eventIds: string[]) => Promise<void>;
  applyRemoteEvents: (events: RemoteSyncEvent[]) => Promise<void>;
}

interface StoredLearningSnapshot extends Omit<LearningSnapshot, 'syncCursor'> {
  syncCursor?: number;
}

function isLearningSnapshot(value: unknown): value is StoredLearningSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'schemaVersion' in value && value.schemaVersion === 1
    && 'sessions' in value && Array.isArray(value.sessions)
    && 'attempts' in value && Array.isArray(value.attempts)
    && 'outbox' in value && Array.isArray(value.outbox)
    && (!('syncCursor' in value) || typeof value.syncCursor === 'number');
}

function extractSnapshot(store: LearningStore): LearningSnapshot {
  return {
    schemaVersion: 1,
    sessions: store.sessions,
    drafts: store.drafts,
    attempts: store.attempts,
    questionStates: store.questionStates,
    bookmarks: store.bookmarks,
    outbox: store.outbox,
    syncCursor: store.syncCursor,
    dailyGoal: store.dailyGoal,
  };
}

let persistenceChain = Promise.resolve();

function queueSnapshot(snapshot: LearningSnapshot): Promise<void> {
  persistenceChain = persistenceChain.then(() => setStoredValue(snapshotKey, JSON.stringify(snapshot)));
  return persistenceChain;
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

  initialize: async () => {
    try {
      const stored = await getStoredValue(snapshotKey);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (isLearningSnapshot(parsed)) {
          set({ ...parsed, syncCursor: parsed.syncCursor ?? 0, hydrated: true, storageError: null });
          return;
        }
      }
      set({ hydrated: true, storageError: null });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '保存データを読み込めませんでした。';
      set({ hydrated: true, storageError: message });
    }
  },

  startSession: async (mode, title, questionIds) => {
    if (questionIds.length === 0) {
      throw new Error('学習できる問題がありません。');
    }
    const now = new Date().toISOString();
    const session: LearningSession = {
      id: randomUUID(),
      mode,
      title,
      questionIds,
      currentIndex: 0,
      answeredQuestionIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const event = createOutboxEvent('session.created', session.id, now, {
      sessionId: session.id,
      mode,
      title,
      questionIds,
      createdAt: now,
    });
    set((state) => ({ sessions: [session, ...state.sessions], outbox: [...state.outbox, event], saving: true, storageError: null }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
      return session.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'セッションを保存できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  selectChoice: async (sessionId, questionId, choiceId) => {
    const now = new Date().toISOString();
    const key = `${sessionId}:${questionId}`;
    set((state) => {
      const previous = state.drafts[key];
      const isSelected = previous?.selectedChoiceIds.includes(choiceId) ?? false;
      const selectedChoiceIds = isSelected ? [] : [choiceId];
      const draft = { sessionId, questionId, selectedChoiceIds, updatedAt: now };
      const event = createOutboxEvent('draft.saved', key, now, { sessionId, questionId, selectedChoiceIds });
      const otherDraftEvents = state.outbox.filter((item) => !(item.kind === 'draft.saved' && item.entityId === key));
      return {
        drafts: { ...state.drafts, [key]: draft },
        outbox: [...otherDraftEvents, event],
        saving: true,
        storageError: null,
      };
    });
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '回答の選択を保存できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  submitAnswer: async (sessionId, questionId) => {
    const question = getQuestion(questionId);
    const draft = get().drafts[`${sessionId}:${questionId}`];
    if (!question || !draft || draft.selectedChoiceIds.length === 0) {
      throw new Error('回答を選択してください。');
    }
    const existing = get().attempts.find((item) => item.sessionId === sessionId && item.questionId === questionId);
    if (existing) {
      const existingState = get().questionStates[questionId];
      if (!existingState) {
        throw new Error('学習状態を復元できませんでした。');
      }
      return { attempt: existing, questionState: existingState };
    }

    const now = new Date().toISOString();
    const attempt: AnswerAttempt = {
      id: randomUUID(),
      sessionId,
      questionId,
      questionVersionId: question.versionId,
      selectedChoiceIds: draft.selectedChoiceIds,
      isCorrect: scoreAnswer(question, draft.selectedChoiceIds),
      answeredAt: now,
    };
    const questionState = updateQuestionState(get().questionStates[questionId], attempt);
    const event = createOutboxEvent('answer.submitted', attempt.id, now, {
      sessionId,
      questionId,
      questionVersionId: question.versionId,
      selectedChoiceIds: draft.selectedChoiceIds,
      isCorrect: attempt.isCorrect,
      answeredAt: now,
    });
    set((state) => ({
      attempts: [...state.attempts, attempt],
      questionStates: { ...state.questionStates, [questionId]: questionState },
      sessions: state.sessions.map((session) => session.id === sessionId
        ? {
          ...session,
          answeredQuestionIds: session.answeredQuestionIds.includes(questionId)
            ? session.answeredQuestionIds
            : [...session.answeredQuestionIds, questionId],
          updatedAt: now,
        }
        : session),
      outbox: [...state.outbox, event],
      saving: true,
      storageError: null,
    }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
      return { attempt, questionState };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '回答を保存できませんでした。次の問題へは進めません。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  moveToNext: async (sessionId, questionId) => {
    const now = new Date().toISOString();
    set((state) => ({
      sessions: state.sessions.map((session) => session.id === sessionId
        ? advanceSession(session, questionId, now)
        : session),
      outbox: [...state.outbox, createOutboxEvent('session.advanced', sessionId, now, { sessionId, questionId })],
      saving: true,
      storageError: null,
    }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '進捗を保存できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  goToQuestion: async (sessionId, index) => {
    const now = new Date().toISOString();
    set((state) => ({
      sessions: state.sessions.map((session) => session.id === sessionId
        ? { ...session, currentIndex: Math.max(0, Math.min(index, session.questionIds.length - 1)), updatedAt: now }
        : session),
      saving: true,
    }));
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
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
      };
    });
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },

  setDailyGoal: async (goal) => {
    set({ dailyGoal: Math.max(1, Math.min(100, goal)), saving: true });
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },

  markOutboxSynced: async (eventIds) => {
    const eventIdSet = new Set(eventIds);
    set((state) => ({ outbox: state.outbox.filter((event) => !eventIdSet.has(event.id)), saving: true }));
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },

  applyRemoteEvents: async (events) => {
    if (events.length === 0) return;
    const sortedEvents = [...events].sort((left, right) => left.sequence - right.sequence);
    set((state) => {
      let sessions = [...state.sessions];
      let drafts = { ...state.drafts };
      let attempts = [...state.attempts];
      let bookmarks = [...state.bookmarks];

      for (const event of sortedEvents) {
        const payload = event.payload;
        if (event.kind === 'session.created' && !sessions.some((session) => session.id === event.entityId)) {
          const mode = payload.mode;
          const title = payload.title;
          const questionIds = payload.questionIds;
          const createdAt = payload.createdAt;
          if ((mode === 'chapter' || mode === 'random' || mode === 'wrong' || mode === 'review')
            && typeof title === 'string' && Array.isArray(questionIds) && typeof createdAt === 'string') {
            sessions = [{
              id: event.entityId,
              mode,
              title,
              questionIds,
              currentIndex: 0,
              answeredQuestionIds: [],
              status: 'active',
              createdAt,
              updatedAt: createdAt,
            }, ...sessions];
          }
        }

        if (event.kind === 'draft.saved') {
          const sessionId = payload.sessionId;
          const questionId = payload.questionId;
          const selectedChoiceIds = payload.selectedChoiceIds;
          if (typeof sessionId === 'string' && typeof questionId === 'string' && Array.isArray(selectedChoiceIds)) {
            const key = `${sessionId}:${questionId}`;
            const current = drafts[key];
            if (!current || current.updatedAt <= event.occurredAt) {
              drafts[key] = { sessionId, questionId, selectedChoiceIds, updatedAt: event.occurredAt };
            }
          }
        }

        if (event.kind === 'answer.submitted' && !attempts.some((attempt) => attempt.id === event.entityId)) {
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
            };
            attempts = [...attempts, attempt];
            sessions = sessions.map((session) => session.id === sessionId
              ? {
                ...session,
                answeredQuestionIds: session.answeredQuestionIds.includes(questionId)
                  ? session.answeredQuestionIds
                  : [...session.answeredQuestionIds, questionId],
                updatedAt: answeredAt,
              }
              : session);
          }
        }

        if (event.kind === 'session.advanced') {
          const questionId = payload.questionId;
          if (typeof questionId === 'string') {
            sessions = sessions.map((session) => session.id === event.entityId
              ? advanceSession(session, questionId, event.occurredAt)
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
      }

      const questionStates: LearningSnapshot['questionStates'] = {};
      for (const attempt of [...attempts].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))) {
        questionStates[attempt.questionId] = updateQuestionState(questionStates[attempt.questionId], attempt);
      }

      return {
        sessions,
        drafts,
        attempts,
        questionStates,
        bookmarks,
        syncCursor: sortedEvents.at(-1)?.sequence ?? state.syncCursor,
        saving: true,
      };
    });
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },
}));
