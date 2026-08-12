export type QuestionDifficulty = 1 | 2 | 3;
export type SessionMode = 'chapter' | 'random' | 'wrong' | 'review' | 'exam';
export type SessionStatus = 'active' | 'submitting' | 'completed';
export type LatestOutcome = 'correct' | 'wrong' | null;
export type SyncStatus = 'synced' | 'queued' | 'syncing' | 'auth-required' | 'conflict' | 'error';
export type LearningSyncMode = 'active' | 'portable-local';
export type ConflictAction = 'keep-local' | 'accept-remote' | 'merge';
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
  kLevel?: 1 | 2 | 3 | undefined;
  prompt: string;
  explanation: string;
  difficulty: QuestionDifficulty;
  sourceReference: string;
  selectionType?: 'single' | 'multiple' | undefined;
  requiredChoiceCount?: number | undefined;
  choices: Choice[];
}

export interface SessionChoice {
  id: string;
  label: string;
  body: string;
}

export interface PreAnswerQuestionSnapshot {
  id: string;
  versionId: string;
  chapterNumber: number;
  chapterTitle: string;
  objectiveCode: string;
  kLevel?: 1 | 2 | 3 | undefined;
  prompt: string;
  difficulty: QuestionDifficulty;
  sourceReference: string;
  selectionType?: 'single' | 'multiple' | undefined;
  requiredChoiceCount?: number | undefined;
  choices: SessionChoice[];
}

/** 回答前snapshotの旧名称。回答・正答情報はこの型に含めない。 */
export type SessionQuestionSnapshot = PreAnswerQuestionSnapshot;

export interface LearningSession {
  id: string;
  mode: SessionMode;
  title: string;
  questionIds: string[];
  questionVersionIds?: string[] | undefined;
  questionSnapshots?: PreAnswerQuestionSnapshot[] | undefined;
  currentIndex: number;
  answeredQuestionIds: string[];
  status: SessionStatus;
  reviewQuestionIds?: string[];
  durationMinutes?: number | null;
  expiresAt?: string | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerDraft {
  sessionId: string;
  questionId: string;
  selectedChoiceIds: string[];
  questionVersionId: string | null;
  revision: number;
  deviceId: string;
  updatedAt: string;
}

export interface AnswerAttempt {
  id: string;
  sessionId: string;
  questionId: string;
  questionVersionId: string;
  selectedChoiceIds: string[];
  isCorrect: boolean;
  invalidated?: boolean | undefined;
  answeredAt: string;
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
  blocked?: boolean | undefined;
  resolved?: boolean | undefined;
  blockedReason?: string | undefined;
}

export interface DraftConflict {
  id: string;
  kind: 'draft';
  entityId: string;
  local: AnswerDraft;
  remote: AnswerDraft;
  createdAt: string;
}

export interface NoteConflict {
  id: string;
  kind: 'note';
  entityId: string;
  local: QuestionNote;
  remote: QuestionNote;
  createdAt: string;
}

export type LearningConflict = DraftConflict | NoteConflict;

export interface LearningSnapshot {
  schemaVersion: 2;
  sessions: LearningSession[];
  drafts: Record<string, AnswerDraft>;
  attempts: AnswerAttempt[];
  questionStates: Record<string, UserQuestionState>;
  bookmarks: string[];
  notes: Record<string, QuestionNote>;
  issues: ContentIssue[];
  outbox: OutboxEvent[];
  syncCursor: number;
  dailyGoal: number;
  conflicts?: LearningConflict[] | undefined;
  syncMode?: LearningSyncMode | undefined;
}

export interface RemoteSyncEvent extends OutboxEvent {
  sequence: number;
}

export interface SubmitAnswerResult {
  attempt: AnswerAttempt;
  questionState: UserQuestionState;
}

export interface ExamResult {
  correctCount: number;
  totalCount: number;
  passed: boolean;
  pending?: boolean;
}
