export type QuestionDifficulty = 1 | 2 | 3;
export type SessionMode = 'chapter' | 'random' | 'wrong' | 'review' | 'exam';
export type SessionStatus = 'active' | 'completed';
export type LatestOutcome = 'correct' | 'wrong' | null;
export type SyncStatus = 'synced' | 'queued' | 'syncing' | 'auth-required' | 'error';
export type WrongFilter = 'unresolved' | 'latest-wrong' | 'last-7-days' | 'last-30-days' | 'last-90-days' | 'ever' | 'recovered';
export type ContentIssueCategory = 'incorrect_answer' | 'unclear' | 'outdated' | 'typo' | 'other';

export interface Choice {
  id: string;
  label: string;
  body: string;
  explanation: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  versionId: string;
  chapterNumber: number;
  chapterTitle: string;
  objectiveCode: string;
  kLevel?: 1 | 2 | 3;
  prompt: string;
  explanation: string;
  difficulty: QuestionDifficulty;
  sourceReference: string;
  selectionType?: 'single' | 'multiple';
  requiredChoiceCount?: number;
  choices: Choice[];
}

export interface LearningSession {
  id: string;
  mode: SessionMode;
  title: string;
  questionIds: string[];
  questionVersionIds?: string[] | undefined;
  currentIndex: number;
  answeredQuestionIds: string[];
  status: SessionStatus;
  reviewQuestionIds?: string[];
  durationMinutes?: number | null;
  expiresAt?: string | null;
  submittedAt?: string | null;
  serverConfirmed?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerDraft {
  sessionId: string;
  questionId: string;
  selectedChoiceIds: string[];
  updatedAt: string;
}

export interface AnswerAttempt {
  id: string;
  sessionId: string;
  questionId: string;
  questionVersionId: string;
  selectedChoiceIds: string[];
  isCorrect: boolean;
  answeredAt: string;
  provisional?: boolean | undefined;
  invalidated?: boolean | undefined;
}

export interface UserQuestionState {
  questionId: string;
  wrongEver: boolean;
  latestOutcome: LatestOutcome;
  consecutiveCorrectAfterWrong: number;
  recoveredAt: string | null;
  reviewStage: number;
  nextReviewAt: string | null;
  firstAttemptAt: string;
  lastAttemptAt: string;
  lastAttemptSessionId: string;
  attemptCount: number;
  correctCount: number;
}

export interface QuestionNote {
  questionId: string;
  questionVersionId: string;
  body: string;
  revision: number;
  updatedAt: string;
}

export interface ContentIssue {
  id: string;
  eventId: string;
  questionId: string;
  questionVersionId: string;
  category: ContentIssueCategory;
  description: string;
  createdAt: string;
  syncStatus: 'queued' | 'synced';
}

export interface OutboxEvent {
  id: string;
  kind:
    | 'session.created'
    | 'draft.saved'
    | 'answer.submitted'
    | 'session.advanced'
    | 'session.submitted'
    | 'session.review-marked'
    | 'bookmark.changed'
    | 'note.saved'
    | 'issue.reported';
  entityId: string;
  occurredAt: string;
  payload: Record<string, boolean | number | string | string[] | null>;
}

export interface LearningSnapshot {
  schemaVersion: 2;
  deviceId: string;
  syncRevisions: Record<string, number>;
  syncOwnerId: string | null;
  syncConflictHistory: SyncConflictRecord[];
  sessions: LearningSession[];
  drafts: Record<string, AnswerDraft>;
  attempts: AnswerAttempt[];
  questionStates: Record<string, UserQuestionState>;
  bookmarks: string[];
  notes: Record<string, QuestionNote>;
  noteBuffer: Record<string, string>;
  issues: ContentIssue[];
  outbox: OutboxEvent[];
  syncCursor: number;
  dailyGoal: number;
}

export interface RemoteSyncEvent extends OutboxEvent {
  sequence: number;
}

export interface SyncConflictRecord {
  id: string;
  kind: 'draft.saved' | 'note.saved' | 'answer.submitted' | 'session.submitted';
  entityId: string;
  localEventIds: string[];
  localPayload: OutboxEvent['payload'];
  remoteEventId: string;
  remotePayload: OutboxEvent['payload'];
  decision: 'local' | 'remote';
  resolvedAt: string;
}

export interface SubmitAnswerResult {
  attempt: AnswerAttempt;
  questionState: UserQuestionState;
}

export interface ExamResult {
  correctCount: number;
  totalCount: number;
  passed: boolean;
}
