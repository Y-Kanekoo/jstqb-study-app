import { z } from 'zod';

import type { LearningSnapshot } from './types';

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
  explanation: z.string(),
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
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
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

const backupEnvelopeSchema = z.object({
  format: z.literal('jstqb-learning-backup'),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  snapshot: snapshotSchema,
}).strict();

export interface LearningBackup {
  format: 'jstqb-learning-backup';
  formatVersion: 1;
  exportedAt: string;
  snapshot: LearningSnapshot;
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
  return normalized;
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

function isLearningSnapshot(value: z.output<typeof snapshotSchema>): boolean {
  const snapshot = normalizeSnapshot(value);
  return hasValidSessionSnapshot(snapshot)
    && new Set(snapshot.outbox.map((event) => event.id)).size === snapshot.outbox.length
    && new Set(snapshot.attempts.map((attempt) => attempt.id)).size === snapshot.attempts.length;
}

export function parseLearningSnapshot(value: unknown): LearningSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  return result.success && isLearningSnapshot(result.data) ? normalizeSnapshot(result.data) : null;
}

export function createLearningBackup(snapshot: LearningSnapshot, exportedAt = new Date().toISOString()): LearningBackup {
  return {
    format: 'jstqb-learning-backup',
    formatVersion: 1,
    exportedAt,
    snapshot,
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
    ...snapshot,
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
