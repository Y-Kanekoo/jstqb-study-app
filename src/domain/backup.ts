import { z } from 'zod';

import type { LearningSnapshot } from './types';

const payloadValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

const sessionSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['chapter', 'random', 'wrong', 'review', 'exam']),
  title: z.string(),
  questionIds: z.array(z.string()),
  currentIndex: z.number().int().nonnegative(),
  answeredQuestionIds: z.array(z.string()),
  status: z.enum(['active', 'completed']),
  reviewQuestionIds: z.array(z.string()).default([]),
  durationMinutes: z.number().positive().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const draftSchema = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  selectedChoiceIds: z.array(z.string()),
  updatedAt: z.string(),
});

const attemptSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  questionId: z.string(),
  questionVersionId: z.string(),
  selectedChoiceIds: z.array(z.string()),
  isCorrect: z.boolean(),
  answeredAt: z.string(),
});

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
});

const noteSchema = z.object({
  questionId: z.string(),
  questionVersionId: z.string(),
  body: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
});

const issueSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  questionId: z.string(),
  questionVersionId: z.string(),
  category: z.enum(['incorrect_answer', 'unclear', 'outdated', 'typo', 'other']),
  description: z.string(),
  createdAt: z.string(),
  syncStatus: z.enum(['queued', 'synced']),
});

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
});

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
});

const backupEnvelopeSchema = z.object({
  format: z.literal('jstqb-learning-backup'),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  snapshot: snapshotSchema,
});

export interface LearningBackup {
  format: 'jstqb-learning-backup';
  formatVersion: 1;
  exportedAt: string;
  snapshot: LearningSnapshot;
}

function normalizeSnapshot(value: z.output<typeof snapshotSchema>): LearningSnapshot {
  return {
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
}

export function parseLearningSnapshot(value: unknown): LearningSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  return result.success ? normalizeSnapshot(result.data) : null;
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
      return {
        ...envelope.data,
        snapshot: normalizeSnapshot(envelope.data.snapshot),
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

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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
