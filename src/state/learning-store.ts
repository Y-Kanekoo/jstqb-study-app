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
  SessionMode,
  SubmitAnswerResult,
} from '@/domain/types';
import { getStoredValue, setStoredValue } from '@/storage/persistence';

const snapshotKey = 'learning-snapshot-v1';

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
};

interface LearningStore extends LearningSnapshot {
  hydrated: boolean;
  saving: boolean;
  storageError: string | null;
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
  reportIssue: (questionId: string, questionVersionId: string, category: ContentIssueCategory, description: string) => Promise<string>;
  setDailyGoal: (goal: number) => Promise<void>;
  restoreSnapshot: (snapshot: LearningSnapshot) => Promise<void>;
  clearLearningData: () => Promise<void>;
  markOutboxSynced: (eventIds: string[]) => Promise<void>;
  applyRemoteEvents: (events: RemoteSyncEvent[]) => Promise<void>;
}

function extractSnapshot(store: LearningStore): LearningSnapshot {
  return {
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
        const snapshot = parseLearningSnapshot(parsed);
        if (snapshot) {
          set({ ...snapshot, hydrated: true, storageError: null });
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
      reviewQuestionIds: [],
      durationMinutes: null,
      expiresAt: null,
      submittedAt: null,
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
    set((state) => ({
      sessions: [session, ...state.sessions],
      outbox: [...state.outbox, event],
      saving: true,
      storageError: null,
    }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
      return session.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '模試を保存できませんでした。';
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

  submitExam: async (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session || session.mode !== 'exam') {
      throw new Error('模試セッションが見つかりません。');
    }
    const existingAttempts = get().attempts.filter((attempt) => attempt.sessionId === sessionId);
    if (session.status === 'completed') {
      const correctCount = existingAttempts.filter((attempt) => attempt.isCorrect).length;
      return { correctCount, totalCount: session.questionIds.length, passed: correctCount >= examConfig.passScore };
    }

    const now = new Date().toISOString();
    const existingQuestionIds = new Set(existingAttempts.map((attempt) => attempt.questionId));
    const newAttempts: AnswerAttempt[] = [];
    for (const questionId of session.questionIds) {
      const question = getQuestion(questionId);
      const draft = get().drafts[`${sessionId}:${questionId}`];
      if (!question || !draft || draft.selectedChoiceIds.length === 0 || existingQuestionIds.has(questionId)) {
        continue;
      }
      newAttempts.push({
        id: randomUUID(),
        sessionId,
        questionId,
        questionVersionId: question.versionId,
        selectedChoiceIds: draft.selectedChoiceIds,
        isCorrect: scoreAnswer(question, draft.selectedChoiceIds),
        answeredAt: now,
      });
    }

    const questionStates = { ...get().questionStates };
    for (const attempt of newAttempts) {
      questionStates[attempt.questionId] = updateQuestionState(questionStates[attempt.questionId], attempt);
    }
    const answeredQuestionIds = [...new Set([
      ...existingAttempts.map((attempt) => attempt.questionId),
      ...newAttempts.map((attempt) => attempt.questionId),
    ])];
    const answerEvents = newAttempts.map((attempt) => createOutboxEvent('answer.submitted', attempt.id, now, {
      sessionId,
      questionId: attempt.questionId,
      questionVersionId: attempt.questionVersionId,
      selectedChoiceIds: attempt.selectedChoiceIds,
      isCorrect: attempt.isCorrect,
      answeredAt: attempt.answeredAt,
    }));
    const submittedEvent = createOutboxEvent('session.submitted', sessionId, now, {
      sessionId,
      submittedAt: now,
      answeredQuestionIds,
    });
    set((state) => ({
      attempts: [...state.attempts, ...newAttempts],
      questionStates,
      sessions: state.sessions.map((item) => item.id === sessionId
        ? {
          ...item,
          answeredQuestionIds,
          status: 'completed',
          submittedAt: now,
          updatedAt: now,
        }
        : item),
      outbox: [...state.outbox, ...answerEvents, submittedEvent],
      saving: true,
      storageError: null,
    }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '模試結果を保存できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }

    const allAttempts = [...existingAttempts, ...newAttempts];
    const correctCount = allAttempts.filter((attempt) => attempt.isCorrect).length;
    return { correctCount, totalCount: session.questionIds.length, passed: correctCount >= examConfig.passScore };
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
    }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '見直し印を保存できませんでした。';
      set({ saving: false, storageError: message });
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
      };
    });
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },

  saveNote: async (questionId, questionVersionId, body) => {
    const now = new Date().toISOString();
    set((state) => {
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
      });
      return {
        notes: { ...state.notes, [questionId]: note },
        outbox: [
          ...state.outbox.filter((item) => !(item.kind === 'note.saved' && item.entityId === questionId)),
          event,
        ],
        saving: true,
        storageError: null,
      };
    });
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'メモを保存できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  reportIssue: async (questionId, questionVersionId, category, description) => {
    const normalizedDescription = description.trim();
    if (normalizedDescription.length < 5) {
      throw new Error('報告内容を5文字以上で入力してください。');
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
    }));
    try {
      await queueSnapshot(extractSnapshot(get()));
      set({ saving: false });
      return issueId;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '問題報告を保存できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  setDailyGoal: async (goal) => {
    set({ dailyGoal: Math.max(1, Math.min(100, goal)), saving: true });
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },

  restoreSnapshot: async (snapshot) => {
    set({ ...snapshot, saving: true, storageError: null });
    try {
      await queueSnapshot(snapshot);
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'バックアップを復元できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  clearLearningData: async () => {
    set({ ...initialSnapshot, saving: true, storageError: null });
    try {
      await queueSnapshot(initialSnapshot);
      set({ saving: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '端末の学習データを削除できませんでした。';
      set({ saving: false, storageError: message });
      throw error;
    }
  },

  markOutboxSynced: async (eventIds) => {
    const eventIdSet = new Set(eventIds);
    set((state) => ({
      outbox: state.outbox.filter((event) => !eventIdSet.has(event.id)),
      issues: state.issues.map((issue) => eventIdSet.has(issue.eventId) ? { ...issue, syncStatus: 'synced' } : issue),
      saving: true,
    }));
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
      let notes = { ...state.notes };
      let issues = [...state.issues];

      for (const event of sortedEvents) {
        const payload = event.payload;
        if (event.kind === 'session.created' && !sessions.some((session) => session.id === event.entityId)) {
          const mode = payload.mode;
          const title = payload.title;
          const questionIds = payload.questionIds;
          const createdAt = payload.createdAt;
          if ((mode === 'chapter' || mode === 'random' || mode === 'wrong' || mode === 'review' || mode === 'exam')
            && typeof title === 'string' && Array.isArray(questionIds) && typeof createdAt === 'string') {
            const durationMinutes = typeof payload.durationMinutes === 'number' ? payload.durationMinutes : null;
            const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : null;
            sessions = [{
              id: event.entityId,
              mode,
              title,
              questionIds,
              currentIndex: 0,
              answeredQuestionIds: [],
              status: 'active',
              reviewQuestionIds: [],
              durationMinutes,
              expiresAt,
              submittedAt: null,
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
            && typeof revision === 'number' && typeof updatedAt === 'string') {
            const current = notes[questionId];
            if (!current || current.updatedAt <= updatedAt) {
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
      for (const attempt of [...attempts].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))) {
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
        syncCursor: sortedEvents.at(-1)?.sequence ?? state.syncCursor,
        saving: true,
      };
    });
    await queueSnapshot(extractSnapshot(get()));
    set({ saving: false });
  },
}));
