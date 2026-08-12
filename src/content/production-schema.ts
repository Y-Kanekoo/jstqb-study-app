import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const questionCompatibilitySchema = z.enum(['cosmetic', 'compatible', 'breaking']);

export const contentReviewSchema = z.object({
  type: z.enum(['technical', 'editorial', 'similarity']),
  reviewer: z.string().min(3).max(120),
  reviewerType: z.enum(['human', 'automated']),
  result: z.enum(['approved', 'changes_requested', 'rejected']),
  reviewedAt: isoDateTimeSchema,
  notes: z.string().min(10).max(1_000),
});

export const productionChoiceSchema = z.object({
  id: z.string().regex(/^jfl-2023-\d{4}-[A-F]$/),
  label: z.string().regex(/^[A-F]$/),
  body: z.string().min(4).max(500),
  isCorrect: z.boolean(),
  explanation: z.string().min(15).max(1_000),
  addressedPremiseKeys: z.array(z.string().regex(/^P[1-4]$/)).max(4),
});

export const questionPremiseSchema = z.object({
  key: z.string().regex(/^P[1-4]$/),
  statement: z.string().min(4).max(500),
});

export const productionQuestionSchema = z.object({
  id: z.string().regex(/^jfl-2023-\d{4}$/),
  versionId: z.string().regex(/^jfl-2023-\d{4}-v\d+$/),
  versionNumber: z.number().int().positive(),
  status: z.enum(['draft', 'reviewing', 'published', 'suspended', 'retired']),
  syllabusVersion: z.literal('2023V4.0.J02'),
  chapterNumber: z.number().int().min(1).max(6),
  chapterTitle: z.string().min(2).max(100),
  objectiveCode: z.string().regex(/^FL-[1-6]\.\d+\.\d+$/),
  kLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  selectionType: z.enum(['single', 'multiple']),
  requiredChoiceCount: z.number().int().min(1).max(4),
  shuffleChoices: z.boolean(),
  generationMethod: z.enum(['independent-case', 'structured-remediation', 'parameterized-case']),
  caseFamily: z.string().min(3).max(120),
  promptTemplateFamily: z.string().min(3).max(120),
  premises: z.array(questionPremiseSchema).max(4),
  prompt: z.string().min(15).max(1_500),
  choices: z.array(productionChoiceSchema).min(3).max(6),
  explanation: z.string().min(40).max(2_000),
  sourceReference: z.string().min(20).max(300),
  sourceUrl: z.string().url(),
  originStatement: z.literal('独自作問'),
  prohibitedSourceCheck: z.literal(true),
  createdBy: z.string().min(3).max(120),
  createdAt: isoDateTimeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  // 旧fixtureを壊さないため型上は任意だが、公開CLIは明示入力を必須にする。
  compatibility: questionCompatibilitySchema.optional(),
  reviews: z.array(contentReviewSchema).max(10),
});

export const productionBundleSchema = z.object({
  schemaVersion: z.literal(1),
  bundleId: z.string().regex(/^jstqb-fl-2023-v\d+$/),
  certificationCode: z.literal('JSTQB-FL'),
  syllabusVersion: z.literal('2023V4.0.J02'),
  sourceUrl: z.string().url(),
  generatedAt: isoDateTimeSchema,
  finalApproval: z.object({
    approvedBy: z.string().min(3).max(120),
    approvedAt: isoDateTimeSchema,
  }).optional(),
  questions: z.array(productionQuestionSchema).min(1).max(2_000),
});

// 本番seed/release入力はcompatibilityを省略できない。公開サンプル・既存fixture用の
// productionBundleSchemaとは分離し、CLIのrequireCompatibilityでこの契約を選択する。
export const productionSeedQuestionSchema = productionQuestionSchema.extend({
  compatibility: questionCompatibilitySchema,
});

export const productionSeedBundleSchema = productionBundleSchema.extend({
  questions: z.array(productionSeedQuestionSchema).min(1).max(2_000),
});

export type ContentReview = z.infer<typeof contentReviewSchema>;
export type ProductionChoice = z.infer<typeof productionChoiceSchema>;
export type QuestionPremise = z.infer<typeof questionPremiseSchema>;
export type ProductionQuestion = z.infer<typeof productionQuestionSchema>;
export type ProductionBundle = z.infer<typeof productionBundleSchema>;
export type QuestionCompatibility = z.infer<typeof questionCompatibilitySchema>;
export type ProductionSeedBundle = z.infer<typeof productionSeedBundleSchema>;
