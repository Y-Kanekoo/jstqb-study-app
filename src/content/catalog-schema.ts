import { z } from 'zod';

export const catalogChannelSchema = z.enum(['public', 'personal_preview']);

export const catalogChoiceSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(8),
  body: z.string().min(1).max(1_000),
  explanation: z.string().min(1).max(2_000),
  isCorrect: z.boolean(),
}).strict();

export const catalogQuestionSchema = z.object({
  id: z.string().min(1).max(160),
  versionId: z.string().min(1).max(180),
  versionNumber: z.number().int().positive(),
  status: z.enum(['reviewing', 'published']),
  syllabusVersion: z.string().min(1).max(64),
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string().min(1).max(200),
  objectiveCode: z.string().min(1).max(80),
  objectiveTitle: z.string().min(1).max(300),
  kLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  selectionType: z.enum(['single', 'multiple']),
  requiredChoiceCount: z.number().int().min(1).max(6),
  shuffleChoices: z.boolean(),
  prompt: z.string().min(1).max(4_000),
  explanation: z.string().min(1).max(4_000),
  sourceReference: z.string().min(1).max(1_000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  choices: z.array(catalogChoiceSchema).min(2).max(8),
  correctChoiceIds: z.array(z.string().min(1).max(160)).min(1).max(6),
}).strict().superRefine((question, context) => {
  const choiceIds = question.choices.map((choice) => choice.id);
  if (new Set(choiceIds).size !== choiceIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['choices'],
      message: '選択肢IDは問題内で一意である必要があります。',
    });
  }

  const correctChoiceIds = question.choices
    .filter((choice) => choice.isCorrect)
    .map((choice) => choice.id)
    .sort();
  const answerKeyIds = [...question.correctChoiceIds].sort();
  if (new Set(answerKeyIds).size !== answerKeyIds.length
    || JSON.stringify(correctChoiceIds) !== JSON.stringify(answerKeyIds)) {
    context.addIssue({
      code: 'custom',
      path: ['correctChoiceIds'],
      message: '正答集合は選択肢のisCorrectと完全に一致する必要があります。',
    });
  }

  if (question.requiredChoiceCount !== answerKeyIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['requiredChoiceCount'],
      message: '必要選択数は正答数と一致する必要があります。',
    });
  }

  if (question.selectionType === 'single' && question.requiredChoiceCount !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['selectionType'],
      message: '単一選択問題の必要選択数は1である必要があります。',
    });
  }

  if (question.selectionType === 'multiple' && question.requiredChoiceCount < 2) {
    context.addIssue({
      code: 'custom',
      path: ['selectionType'],
      message: '複数選択問題の必要選択数は2以上である必要があります。',
    });
  }
});

export const catalogSnapshotSchema = z.object({
  schema: z.literal('question-catalog.v1'),
  certificationCode: z.string().min(1).max(64),
  syllabusVersion: z.string().min(1).max(64),
  channel: catalogChannelSchema,
  revision: z.number().int().nonnegative(),
  etag: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime({ offset: true }),
  fullSnapshot: z.boolean(),
  questions: z.array(catalogQuestionSchema).max(2_000),
  removedVersionIds: z.array(z.string().min(1).max(180)).max(2_000),
}).strict().superRefine((snapshot, context) => {
  const questionIds = snapshot.questions.map((question) => question.id);
  const versionIds = snapshot.questions.map((question) => question.versionId);
  const removedVersionIds = snapshot.removedVersionIds;

  if (new Set(questionIds).size !== questionIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['questions'],
      message: '問題IDはカタログ内で一意である必要があります。',
    });
  }
  if (new Set(versionIds).size !== versionIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['questions'],
      message: '問題版IDはカタログ内で一意である必要があります。',
    });
  }
  if (new Set(removedVersionIds).size !== removedVersionIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['removedVersionIds'],
      message: '削除済み問題版IDは一意である必要があります。',
    });
  }
  if (snapshot.fullSnapshot && removedVersionIds.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['removedVersionIds'],
      message: '完全スナップショットに削除差分を含めることはできません。',
    });
  }

  const currentVersions = new Set(versionIds);
  if (removedVersionIds.some((versionId) => currentVersions.has(versionId))) {
    context.addIssue({
      code: 'custom',
      path: ['removedVersionIds'],
      message: '同じ問題版を更新と削除の両方に含めることはできません。',
    });
  }

  if (snapshot.channel === 'public'
    && snapshot.questions.some((question) => question.status !== 'published')) {
    context.addIssue({
      code: 'custom',
      path: ['questions'],
      message: '公開カタログには公開済み問題だけを含める必要があります。',
    });
  }
});

export type CatalogChannel = z.infer<typeof catalogChannelSchema>;
export type CatalogChoice = z.infer<typeof catalogChoiceSchema>;
export type CatalogQuestion = z.infer<typeof catalogQuestionSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
