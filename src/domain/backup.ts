import { z } from 'zod';

import { clonePreAnswerQuestionSnapshot } from './pre-answer-snapshot';
import type { LearningSession, LearningSnapshot, PreAnswerQuestionSnapshot } from './types';

const payloadValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

const choiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  body: z.string(),
}).strict();

const questionSnapshotSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  chapterNumber: z.number().int(),
  chapterTitle: z.string(),
  objectiveCode: z.string(),
  kLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  prompt: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sourceReference: z.string(),
  selectionType: z.enum(['single', 'multiple']).optional(),
  requiredChoiceCount: z.number().int().positive().optional(),
  choices: z.array(choiceSchema),
}).strict();

const sessionSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['chapter', 'random', 'wrong', 'review', 'exam']),
  title: z.string(),
  questionIds: z.array(z.string()),
  questionVersionIds: z.array(z.string()).optional(),
  questionSnapshots: z.array(questionSnapshotSchema).optional(),
  currentIndex: z.number().int().nonnegative(),
  answeredQuestionIds: z.array(z.string()),
  status: z.enum(['active', 'submitting', 'completed']),
  reviewQuestionIds: z.array(z.string()).default([]),
  durationMinutes: z.number().positive().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

const draftSchema = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  selectedChoiceIds: z.array(z.string()),
  questionVersionId: z.string().nullable().default(null),
  revision: z.number().int().nonnegative().default(0),
  deviceId: z.string().default(''),
  updatedAt: z.string(),
}).strict();

const attemptSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  questionId: z.string(),
  questionVersionId: z.string(),
  selectedChoiceIds: z.array(z.string()),
  isCorrect: z.boolean(),
  invalidated: z.boolean().optional(),
  answeredAt: z.string(),
}).strict();

const questionStateSchema = z.object({
  questionId: z.string(),
  wrongEver: z.boolean(),
  latestOutcome: z.enum(['correct', 'wrong']).nullable(),
  consecutiveCorrectAfterWrong: z.number().int().min(0).max(2),
  recoveredAt: z.string().nullable(),
  reviewStage: z.number().int().min(0).max(5),
  nextReviewAt: z.string().nullable(),
  firstAttemptAt: z.string(),
  lastAttemptAt: z.string(),
  lastAttemptSessionId: z.string(),
  attemptCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
}).strict();

const noteSchema = z.object({
  questionId: z.string(),
  questionVersionId: z.string(),
  body: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
}).strict();

const issueSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  questionId: z.string(),
  questionVersionId: z.string(),
  category: z.enum(['incorrect_answer', 'unclear', 'outdated', 'typo', 'other']),
  description: z.string(),
  createdAt: z.string(),
  syncStatus: z.enum(['queued', 'synced']),
}).strict();

const outboxEventSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'session.created',
    'draft.saved',
    'answer.submitted',
    'session.advanced',
    'session.submitted',
    'session.review-marked',
    'bookmark.changed',
    'note.saved',
    'issue.reported',
  ]),
  entityId: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.string(), payloadValueSchema),
  blocked: z.boolean().optional(),
  resolved: z.boolean().optional(),
  blockedReason: z.string().optional(),
}).strict();

const conflictDraftSchema = z.object({
  id: z.string(),
  kind: z.literal('draft'),
  entityId: z.string(),
  local: draftSchema,
  remote: draftSchema,
  createdAt: z.string(),
}).strict();

const conflictNoteSchema = z.object({
  id: z.string(),
  kind: z.literal('note'),
  entityId: z.string(),
  local: noteSchema,
  remote: noteSchema,
  createdAt: z.string(),
}).strict();

const conflictSchema = z.discriminatedUnion('kind', [conflictDraftSchema, conflictNoteSchema]);

const snapshotSchema = z.object({
  schemaVersion: z.literal(2),
  sessions: z.array(sessionSchema),
  drafts: z.record(z.string(), draftSchema),
  attempts: z.array(attemptSchema),
  questionStates: z.record(z.string(), questionStateSchema),
  bookmarks: z.array(z.string()),
  notes: z.record(z.string(), noteSchema).default({}),
  issues: z.array(issueSchema).default([]),
  outbox: z.array(outboxEventSchema),
  syncCursor: z.number().int().nonnegative().default(0),
  dailyGoal: z.number().int().min(1).max(100).default(10),
  conflicts: z.array(conflictSchema).optional(),
  syncMode: z.enum(['active', 'portable-local']).optional(),
}).strict();

// schemaVersion 1には回答前snapshotへ解説・正答属性が混在したデータがあるため、
// migrationでは受け付けるが、下記のwhitelistだけを残して破棄する。
const legacyChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  body: z.string(),
}).passthrough();

const legacyQuestionSnapshotSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  chapterNumber: z.number().int(),
  chapterTitle: z.string(),
  objectiveCode: z.string(),
  kLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  prompt: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sourceReference: z.string(),
  selectionType: z.enum(['single', 'multiple']).optional(),
  requiredChoiceCount: z.number().int().positive().optional(),
  choices: z.array(legacyChoiceSchema),
}).passthrough();

const legacySessionSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['chapter', 'random', 'wrong', 'review', 'exam']),
  title: z.string(),
  questionIds: z.array(z.string()),
  questionVersionIds: z.array(z.string()).optional(),
  questionSnapshots: z.array(legacyQuestionSnapshotSchema).optional(),
  currentIndex: z.number().int().nonnegative(),
  answeredQuestionIds: z.array(z.string()),
  status: z.enum(['active', 'submitting', 'completed']),
  reviewQuestionIds: z.array(z.string()).default([]),
  durationMinutes: z.number().positive().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

const legacySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.array(legacySessionSchema),
  drafts: z.record(z.string(), draftSchema),
  attempts: z.array(attemptSchema),
  questionStates: z.record(z.string(), questionStateSchema),
  bookmarks: z.array(z.string()),
  notes: z.record(z.string(), noteSchema).default({}),
  issues: z.array(issueSchema).default([]),
  outbox: z.array(outboxEventSchema),
  syncCursor: z.number().int().nonnegative().default(0),
  dailyGoal: z.number().int().min(1).max(100).default(10),
  conflicts: z.array(conflictSchema).optional(),
  syncMode: z.enum(['active', 'portable-local']).optional(),
}).passthrough();

const backupEnvelopeSchema = z.object({
  format: z.literal('jstqb-learning-backup'),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  snapshot: z.unknown(),
}).strict();

export interface LearningBackup {
  format: 'jstqb-learning-backup';
  formatVersion: 1;
  exportedAt: string;
  snapshot: LearningSnapshot;
}

function cloneSession(session: LearningSession): LearningSession {
  const cloned: LearningSession = {
    id: session.id,
    mode: session.mode,
    title: session.title,
    questionIds: [...session.questionIds],
    currentIndex: session.currentIndex,
    answeredQuestionIds: [...session.answeredQuestionIds],
    status: session.status,
    reviewQuestionIds: [...(session.reviewQuestionIds ?? [])],
    durationMinutes: session.durationMinutes ?? null,
    expiresAt: session.expiresAt ?? null,
    startedAt: session.startedAt ?? null,
    submittedAt: session.submittedAt ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  if (session.questionVersionIds !== undefined) cloned.questionVersionIds = [...session.questionVersionIds];
  if (session.questionSnapshots !== undefined) {
    cloned.questionSnapshots = session.questionSnapshots.map(clonePreAnswerQuestionSnapshot);
  }
  return cloned;
}

export function sanitizeLearningSnapshot(snapshot: LearningSnapshot): LearningSnapshot {
  const sanitized: LearningSnapshot = {
    schemaVersion: 2,
    sessions: snapshot.sessions.map(cloneSession),
    drafts: snapshot.drafts,
    attempts: snapshot.attempts,
    questionStates: snapshot.questionStates,
    bookmarks: [...snapshot.bookmarks],
    notes: snapshot.notes,
    issues: snapshot.issues,
    outbox: snapshot.outbox,
    syncCursor: snapshot.syncCursor,
    dailyGoal: snapshot.dailyGoal,
  };
  if (snapshot.conflicts !== undefined) sanitized.conflicts = snapshot.conflicts;
  if (snapshot.syncMode !== undefined) sanitized.syncMode = snapshot.syncMode;
  return sanitized;
}

function normalizeSnapshot(value: z.output<typeof snapshotSchema>): LearningSnapshot {
  const normalized: LearningSnapshot = {
    schemaVersion: 2,
    sessions: value.sessions,
    drafts: value.drafts,
    attempts: value.attempts,
    questionStates: value.questionStates,
    bookmarks: value.bookmarks,
    notes: value.notes,
    issues: value.issues,
    outbox: value.outbox,
    syncCursor: value.syncCursor,
    dailyGoal: value.dailyGoal,
  };
  if (value.conflicts !== undefined) normalized.conflicts = value.conflicts;
  if (value.syncMode !== undefined) normalized.syncMode = value.syncMode;
  return sanitizeLearningSnapshot(normalized);
}

function migrateLegacyQuestionSnapshot(
  question: z.output<typeof legacyQuestionSnapshotSchema>,
): PreAnswerQuestionSnapshot {
  const migrated: PreAnswerQuestionSnapshot = {
    id: question.id,
    versionId: question.versionId,
    chapterNumber: question.chapterNumber,
    chapterTitle: question.chapterTitle,
    objectiveCode: question.objectiveCode,
    prompt: question.prompt,
    difficulty: question.difficulty,
    sourceReference: question.sourceReference,
    choices: question.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      body: choice.body,
    })),
  };
  if (question.kLevel !== undefined) migrated.kLevel = question.kLevel;
  if (question.selectionType !== undefined) migrated.selectionType = question.selectionType;
  if (question.requiredChoiceCount !== undefined) migrated.requiredChoiceCount = question.requiredChoiceCount;
  return migrated;
}

function migrateLegacySession(session: z.output<typeof legacySessionSchema>): LearningSession {
  const migrated: LearningSession = {
    id: session.id,
    mode: session.mode,
    title: session.title,
    questionIds: [...session.questionIds],
    currentIndex: session.currentIndex,
    answeredQuestionIds: [...session.answeredQuestionIds],
    status: session.status,
    reviewQuestionIds: [...session.reviewQuestionIds],
    durationMinutes: session.durationMinutes,
    expiresAt: session.expiresAt,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  if (session.questionVersionIds !== undefined) migrated.questionVersionIds = [...session.questionVersionIds];
  if (session.questionSnapshots !== undefined) {
    migrated.questionSnapshots = session.questionSnapshots.map(migrateLegacyQuestionSnapshot);
  }
  return migrated;
}

function migrateLegacySnapshot(value: z.output<typeof legacySnapshotSchema>): LearningSnapshot {
  const migrated: LearningSnapshot = {
    schemaVersion: 2,
    sessions: value.sessions.map(migrateLegacySession),
    drafts: value.drafts,
    attempts: value.attempts,
    questionStates: value.questionStates,
    bookmarks: value.bookmarks,
    notes: value.notes,
    issues: value.issues,
    outbox: value.outbox,
    syncCursor: value.syncCursor,
    dailyGoal: value.dailyGoal,
  };
  if (value.conflicts !== undefined) migrated.conflicts = value.conflicts;
  if (value.syncMode !== undefined) migrated.syncMode = value.syncMode;
  return sanitizeLearningSnapshot(migrated);
}

function hasValidSessionSnapshot(snapshot: LearningSnapshot): boolean {
  return snapshot.sessions.every((session) => {
    if (session.questionVersionIds && session.questionVersionIds.length !== session.questionIds.length) return false;
    if (!session.questionSnapshots) return true;
    if (session.questionSnapshots.length !== session.questionIds.length) return false;
    return session.questionSnapshots.every((question, index) => (
      question.id === session.questionIds[index]
      && (!session.questionVersionIds || question.versionId === session.questionVersionIds[index])
      && new Set(question.choices.map((choice) => choice.id)).size === question.choices.length
    ));
  });
}

function isLearningSnapshot(snapshot: LearningSnapshot): boolean {
  return hasValidSessionSnapshot(snapshot)
    && new Set(snapshot.outbox.map((event) => event.id)).size === snapshot.outbox.length
    && new Set(snapshot.attempts.map((attempt) => attempt.id)).size === snapshot.attempts.length;
}

export function parseLearningSnapshot(value: unknown): LearningSnapshot | null {
  const currentResult = snapshotSchema.safeParse(value);
  if (currentResult.success) {
    const snapshot = normalizeSnapshot(currentResult.data);
    return isLearningSnapshot(snapshot) ? snapshot : null;
  }
  const legacyResult = legacySnapshotSchema.safeParse(value);
  if (!legacyResult.success) return null;
  const snapshot = migrateLegacySnapshot(legacyResult.data);
  return isLearningSnapshot(snapshot) ? snapshot : null;
}

export function createLearningBackup(snapshot: LearningSnapshot, exportedAt = new Date().toISOString()): LearningBackup {
  return {
    format: 'jstqb-learning-backup',
    formatVersion: 1,
    exportedAt,
    snapshot: sanitizeLearningSnapshot(snapshot),
  };
}

export function serializeLearningBackup(snapshot: LearningSnapshot, exportedAt = new Date().toISOString()): string {
  return JSON.stringify(createLearningBackup(snapshot, exportedAt), null, 2);
}

export function parseLearningBackup(text: string): LearningBackup | null {
  try {
    const value: unknown = JSON.parse(text);
    const envelope = backupEnvelopeSchema.safeParse(value);
    if (envelope.success) {
      const snapshot = parseLearningSnapshot(envelope.data.snapshot);
      if (!snapshot) return null;
      return {
        ...envelope.data,
        snapshot,
      };
    }
    const snapshot = parseLearningSnapshot(value);
    return snapshot
      ? createLearningBackup(snapshot, new Date().toISOString())
      : null;
  } catch {
    return null;
  }
}

/**
 * 別利用者・別同期履歴へ持ち込むバックアップは、サーバーへ再送しない。
 * セッション/attempt IDはローカル継続用に保持し、event IDとcursorだけ破棄する。
 */
export function preparePortableRestore(snapshot: LearningSnapshot): LearningSnapshot {
  return {
    ...sanitizeLearningSnapshot(snapshot),
    outbox: [],
    syncCursor: 0,
    conflicts: [],
    syncMode: 'portable-local',
  };
}

function escapeCsvCell(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function serializeAttemptsCsv(snapshot: LearningSnapshot): string {
  const header = [
    '回答ID',
    'セッションID',
    '問題ID',
    '問題版ID',
    '選択肢ID',
    '正誤',
    '回答日時',
  ];
  const rows = snapshot.attempts.map((attempt) => [
    attempt.id,
    attempt.sessionId,
    attempt.questionId,
    attempt.questionVersionId,
    attempt.selectedChoiceIds.join('|'),
    attempt.isCorrect ? '正解' : '誤答',
    attempt.answeredAt,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
}
