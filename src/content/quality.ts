/// <reference types="node" />

import { createHash } from 'node:crypto';

import {
  chapterTitles,
  contentObjectives,
  objectiveByCode,
  targetChapterDistribution,
  targetKLevelDistribution,
  type ContentKLevel,
} from './objectives.ts';
import {
  productionBundleSchema,
  type ProductionBundle,
  type ProductionQuestion,
} from './production-schema.ts';

export type ContentIssueSeverity = 'error' | 'warning';

export interface ContentQualityIssue {
  code: string;
  severity: ContentIssueSeverity;
  message: string;
  questionId?: string;
}

export interface ContentQualityOptions {
  enforceProductionDistribution?: boolean;
  releaseGate?: boolean;
  similarityThreshold?: number;
}

export interface ContentQualityReport {
  valid: boolean;
  releaseReady: boolean;
  questionCount: number;
  errorCount: number;
  warningCount: number;
  chapterDistribution: Record<number, number>;
  kLevelDistribution: Record<ContentKLevel, number>;
  statusDistribution: Record<'draft' | 'reviewing' | 'published' | 'suspended' | 'retired', number>;
  selectionDistribution: Record<'single' | 'multiple', number>;
  generationMethodDistribution: Record<'independent-case' | 'structured-remediation' | 'parameterized-case', number>;
  parameterDerivedCount: number;
  parameterDerivedRate: number;
  multiplePromptTemplateDistribution: Record<string, number>;
  literalPremiseDistractorCount: number;
  literalPremiseDistractorRate: number;
  literalPremiseDistractorQuestionCount: number;
  literalPremiseDistractorQuestionRate: number;
  multipleCorrectAverageLength: number;
  multipleIncorrectAverageLength: number;
  multipleChoiceLengthGapRate: number;
  objectiveCoverage: number;
  issues: ContentQualityIssue[];
  bundle?: ProductionBundle;
}

const prohibitedPatterns: readonly { code: string; pattern: RegExp; message: string }[] = [
  { code: 'PROHIBITED_ALL_ABOVE', pattern: /(?:上記|選択肢).{0,8}すべて/, message: '「上記のすべて」に相当する選択肢は禁止です。' },
  { code: 'PROHIBITED_ALL_CORRECT', pattern: /すべて.{0,6}正し/, message: '「すべて正しい」に相当する選択肢は禁止です。' },
  { code: 'PROHIBITED_TESTOMO', pattern: /テス友/, message: '他アプリ名を問題本文や選択肢へ含めないでください。' },
  { code: 'PROHIBITED_COPY_CLAIM', pattern: /(?:転載|複製|言い換え).{0,12}(?:過去問|市販教材|模擬問題)/, message: '第三者問題の転載・複製を示す表現があります。' },
];

const negativeQuestionPattern = /(?:適切でない|正しくない|誤っている|該当しない).{0,20}(?:どれ|もの)/;
const decorativeContextPattern = /^.{2,24}システム(?:のチーム|の学習会|で)[^。]{10,100}(?:しています|います)。[^。]{0,40}(?:に関する説明|の考え方に基づく判断)/;

function issue(
  code: string,
  severity: ContentIssueSeverity,
  message: string,
  questionId?: string,
): ContentQualityIssue {
  return questionId === undefined ? { code, severity, message } : { code, severity, message, questionId };
}

export function canonicalQuestionContent(question: ProductionQuestion): string {
  return JSON.stringify({
    id: question.id,
    versionId: question.versionId,
    versionNumber: question.versionNumber,
    syllabusVersion: question.syllabusVersion,
    chapterNumber: question.chapterNumber,
    chapterTitle: question.chapterTitle,
    objectiveCode: question.objectiveCode,
    kLevel: question.kLevel,
    difficulty: question.difficulty,
    selectionType: question.selectionType,
    requiredChoiceCount: question.requiredChoiceCount,
    shuffleChoices: question.shuffleChoices,
    generationMethod: question.generationMethod,
    caseFamily: question.caseFamily,
    promptTemplateFamily: question.promptTemplateFamily,
    premises: question.premises,
    prompt: question.prompt,
    choices: question.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      body: choice.body,
      isCorrect: choice.isCorrect,
      explanation: choice.explanation,
      addressedPremiseKeys: choice.addressedPremiseKeys,
    })),
    explanation: question.explanation,
    sourceReference: question.sourceReference,
    sourceUrl: question.sourceUrl,
    originStatement: question.originStatement,
    prohibitedSourceCheck: question.prohibitedSourceCheck,
  });
}

export function calculateContentHash(question: ProductionQuestion): string {
  return createHash('sha256').update(canonicalQuestionContent(question), 'utf8').digest('hex');
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function semanticQuestionText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^.{2,30}システム(?:のチーム|の学習会|で)[^。]*。/, '')
    .replace(/(?:最も適切なもの|最も適切な説明|最も適切な判断)(?:はどれですか|を選んでください)。?$/u, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

function shingles(value: string, size = 3): Set<string> {
  const normalized = normalizeText(value);
  const result = new Set<string>();
  if (normalized.length <= size) {
    result.add(normalized);
    return result;
  }
  for (let index = 0; index <= normalized.length - size; index += 1) {
    result.add(normalized.slice(index, index + size));
  }
  return result;
}

export function calculateSimilarity(first: string, second: string): number {
  const firstSet = shingles(first);
  const secondSet = shingles(second);
  let intersection = 0;
  for (const item of firstSet) {
    if (secondSet.has(item)) {
      intersection += 1;
    }
  }
  const union = firstSet.size + secondSet.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function emptyChapterDistribution(): Record<number, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function addSchemaIssues(input: unknown, issues: ContentQualityIssue[]): ProductionBundle | undefined {
  const parsed = productionBundleSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  for (const schemaIssue of parsed.error.issues) {
    issues.push(issue('SCHEMA_INVALID', 'error', `${schemaIssue.path.join('.')}: ${schemaIssue.message}`));
  }
  return undefined;
}

function validateQuestion(question: ProductionQuestion, issues: ContentQualityIssue[], releaseGate: boolean): void {
  const objective = objectiveByCode.get(question.objectiveCode);
  if (objective === undefined) {
    issues.push(issue('OBJECTIVE_UNKNOWN', 'error', `未定義の学習目標です: ${question.objectiveCode}`, question.id));
  } else {
    if (objective.chapterNumber !== question.chapterNumber) {
      issues.push(issue('OBJECTIVE_CHAPTER_MISMATCH', 'error', '学習目標と章番号が一致しません。', question.id));
    }
    if (objective.kLevel !== question.kLevel) {
      issues.push(issue('OBJECTIVE_K_LEVEL_MISMATCH', 'error', '学習目標とKレベルが一致しません。', question.id));
    }
    if (!question.sourceReference.includes(objective.section) || !question.sourceReference.includes(question.objectiveCode)) {
      issues.push(issue('SOURCE_REFERENCE_INCOMPLETE', 'error', '参照箇所に章節と学習目標コードが必要です。', question.id));
    }
  }

  const expectedChapterTitle = chapterTitles[question.chapterNumber as keyof typeof chapterTitles];
  if (expectedChapterTitle !== question.chapterTitle) {
    issues.push(issue('CHAPTER_TITLE_MISMATCH', 'error', '章番号と章タイトルが一致しません。', question.id));
  }

  if (question.versionId !== `${question.id}-v${question.versionNumber}`) {
    issues.push(issue('VERSION_ID_MISMATCH', 'error', '問題版IDと版番号が一致しません。', question.id));
  }

  const correctCount = question.choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== question.requiredChoiceCount) {
    issues.push(issue('CORRECT_COUNT_MISMATCH', 'error', `正答数${correctCount}と必要選択数${question.requiredChoiceCount}が一致しません。`, question.id));
  }
  if (question.selectionType === 'single' && question.requiredChoiceCount !== 1) {
    issues.push(issue('SINGLE_CHOICE_COUNT_INVALID', 'error', '単一選択問題の必要選択数は1です。', question.id));
  }
  if (question.selectionType === 'multiple' && question.requiredChoiceCount < 2) {
    issues.push(issue('MULTIPLE_CHOICE_COUNT_INVALID', 'error', '複数選択問題の必要選択数は2以上です。', question.id));
  }

  const premiseKeys = question.premises.map((premise) => premise.key);
  if (new Set(premiseKeys).size !== premiseKeys.length) {
    issues.push(issue('PREMISE_KEY_DUPLICATE', 'error', '誤概念のpremise keyが重複しています。', question.id));
  }
  if (question.selectionType === 'single') {
    if (question.premises.length !== 0 || question.choices.some((choice) => choice.addressedPremiseKeys.length !== 0)) {
      issues.push(issue('SINGLE_PREMISE_MAPPING_INVALID', 'error', '単一選択問題に複数選択用のpremise対応を設定できません。', question.id));
    }
  } else {
    if (question.premises.length !== question.requiredChoiceCount) {
      issues.push(issue('MULTIPLE_PREMISE_COUNT_INVALID', 'error', '複数選択では誤概念数と必要選択数を一致させてください。', question.id));
    }
    const correctChoices = question.choices.filter((choice) => choice.isCorrect);
    const addressedKeys = correctChoices.flatMap((choice) => choice.addressedPremiseKeys);
    const sortedPremiseKeys = [...premiseKeys].sort();
    const sortedAddressedKeys = [...addressedKeys].sort();
    const hasOneToOneMapping = correctChoices.every((choice) => choice.addressedPremiseKeys.length === 1)
      && new Set(addressedKeys).size === addressedKeys.length
      && JSON.stringify(sortedPremiseKeys) === JSON.stringify(sortedAddressedKeys);
    if (!hasOneToOneMapping) {
      issues.push(issue('MULTIPLE_PREMISE_BIJECTION_INVALID', 'error', '各誤概念Pと各正答Cを1対1かつ漏れなく対応させてください。', question.id));
    }
    if (question.choices.some((choice) => !choice.isCorrect && choice.addressedPremiseKeys.length !== 0)) {
      issues.push(issue('DISTRACTOR_PREMISE_MAPPING_INVALID', 'error', '誤答選択肢を是正済みpremiseとして扱うことはできません。', question.id));
    }
    for (const choice of correctChoices) {
      const premiseKey = choice.addressedPremiseKeys[0];
      if (premiseKey !== undefined && !choice.explanation.includes(premiseKey)) {
        issues.push(issue('PREMISE_EXPLANATION_MISSING', 'error', `正答解説に対応先${premiseKey}を明示してください。`, question.id));
      }
    }
    for (const premiseKey of premiseKeys) {
      if (!question.explanation.includes(premiseKey)) {
        issues.push(issue('OVERALL_PREMISE_EXPLANATION_MISSING', 'error', `総合解説に${premiseKey}との対応を明示してください。`, question.id));
      }
    }
    if (/P[1-4]/u.test(question.prompt) || question.choices.some((choice) => /P[1-4]/u.test(choice.body))) {
      issues.push(issue('PREMISE_KEY_EXPOSED', 'error', '内部のpremise keyを採点前の問題文・選択肢へ表示しないでください。', question.id));
    }
  }

  const choiceIds = new Set(question.choices.map((choice) => choice.id));
  const choiceLabels = new Set(question.choices.map((choice) => choice.label));
  const choiceBodies = new Set(question.choices.map((choice) => normalizeText(choice.body)));
  if (choiceIds.size !== question.choices.length || choiceLabels.size !== question.choices.length) {
    issues.push(issue('CHOICE_ID_DUPLICATE', 'error', '選択肢IDまたはラベルが重複しています。', question.id));
  }
  if (choiceBodies.size !== question.choices.length) {
    issues.push(issue('CHOICE_BODY_DUPLICATE', 'error', '同一内容の選択肢があります。', question.id));
  }
  for (const choice of question.choices) {
    if (!choice.id.startsWith(`${question.id}-`)) {
      issues.push(issue('CHOICE_ID_PREFIX_INVALID', 'error', `選択肢IDが問題IDに従っていません: ${choice.id}`, question.id));
    }
  }

  const searchableText = [question.prompt, question.explanation, ...question.choices.map((choice) => `${choice.body} ${choice.explanation}`)].join('\n');
  for (const prohibited of prohibitedPatterns) {
    if (prohibited.pattern.test(searchableText)) {
      issues.push(issue(prohibited.code, 'error', prohibited.message, question.id));
    }
  }
  if (negativeQuestionPattern.test(question.prompt)) {
    issues.push(issue('NEGATIVE_QUESTION_REVIEW', 'warning', '否定形の問いです。必要性と強調表示を人が確認してください。', question.id));
  }
  if (decorativeContextPattern.test(question.prompt)) {
    issues.push(issue(
      'DECORATIVE_CONTEXT',
      'error',
      'システム名と汎用的な前置きだけを差し替えた問題です。解答に必要な具体的事実・成果物・数値を提示してください。',
      question.id,
    ));
  }
  if (semanticQuestionText(question.prompt).length < 20) {
    issues.push(issue('SEMANTIC_CONTENT_TOO_SHORT', 'error', '装飾的な前置きと定型句を除くと、問題固有の情報が不足しています。', question.id));
  }

  if (calculateContentHash(question) !== question.contentHash) {
    issues.push(issue('CONTENT_HASH_MISMATCH', 'error', 'contentHashが問題内容と一致しません。', question.id));
  }

  const requiredReviewTypes = ['technical', 'editorial', 'similarity'] as const;
  for (const reviewType of requiredReviewTypes) {
    const approved = question.reviews.find((review) => review.type === reviewType && review.result === 'approved');
    if (question.status !== 'draft' && approved === undefined) {
      issues.push(issue('REVIEW_MISSING', 'error', `${reviewType}の承認記録がありません。`, question.id));
    }
    if (approved?.reviewer === question.createdBy) {
      issues.push(issue('REVIEWER_NOT_INDEPENDENT', 'error', `${reviewType}レビュー担当が作成者と同一です。`, question.id));
    }
  }

  if (releaseGate) {
    if (question.status !== 'published') {
      issues.push(issue('RELEASE_STATUS_INVALID', 'error', '本番公開ゲートではpublished状態が必要です。', question.id));
    }
    for (const reviewType of ['technical', 'editorial'] as const) {
      const humanApproval = question.reviews.some((review) => (
        review.type === reviewType && review.result === 'approved' && review.reviewerType === 'human'
      ));
      if (!humanApproval) {
        issues.push(issue('HUMAN_REVIEW_MISSING', 'error', `${reviewType}の人手承認がありません。`, question.id));
      }
    }
  }
}

function validateUniqueness(bundle: ProductionBundle, issues: ContentQualityIssue[], threshold: number): void {
  const ids = new Set<string>();
  const versionIds = new Set<string>();
  const exactPrompts = new Map<string, string>();
  const semanticPrompts = new Map<string, string>();
  const exactChoiceSets = new Map<string, string>();
  for (const question of bundle.questions) {
    if (ids.has(question.id)) {
      issues.push(issue('QUESTION_ID_DUPLICATE', 'error', '問題IDが重複しています。', question.id));
    }
    if (versionIds.has(question.versionId)) {
      issues.push(issue('VERSION_ID_DUPLICATE', 'error', '問題版IDが重複しています。', question.id));
    }
    ids.add(question.id);
    versionIds.add(question.versionId);

    const normalizedPrompt = normalizeText(question.prompt);
    const previousId = exactPrompts.get(normalizedPrompt);
    if (previousId !== undefined) {
      issues.push(issue('PROMPT_DUPLICATE', 'error', `${previousId}と問題文が重複しています。`, question.id));
    } else {
      exactPrompts.set(normalizedPrompt, question.id);
    }

    const semanticPrompt = semanticQuestionText(question.prompt);
    const previousSemanticId = semanticPrompts.get(semanticPrompt);
    if (previousSemanticId !== undefined) {
      issues.push(issue('SEMANTIC_PROMPT_DUPLICATE', 'error', `${previousSemanticId}と装飾を除いた問題文が同一です。`, question.id));
    } else {
      semanticPrompts.set(semanticPrompt, question.id);
    }

    const choiceSetSignature = question.choices.map((choice) => normalizeText(choice.body)).sort().join('|');
    const previousChoiceSetId = exactChoiceSets.get(choiceSetSignature);
    if (previousChoiceSetId !== undefined) {
      issues.push(issue('CHOICE_SET_DUPLICATE', 'error', `${previousChoiceSetId}と選択肢集合が同一です。選択肢順だけの別問題は認めません。`, question.id));
    } else {
      exactChoiceSets.set(choiceSetSignature, question.id);
    }
  }

  for (let firstIndex = 0; firstIndex < bundle.questions.length; firstIndex += 1) {
    const first = bundle.questions[firstIndex];
    if (first === undefined) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < bundle.questions.length; secondIndex += 1) {
      const second = bundle.questions[secondIndex];
      if (second === undefined) {
        continue;
      }
      const semanticSimilarity = calculateSimilarity(semanticQuestionText(first.prompt), semanticQuestionText(second.prompt));
      const objectiveThreshold = first.objectiveCode === second.objectiveCode ? Math.min(threshold, 0.76) : threshold;
      if (semanticSimilarity >= objectiveThreshold) {
        issues.push(issue(
          'PROMPT_TOO_SIMILAR',
          'error',
          `${first.id}とのsemantic類似度が${semanticSimilarity.toFixed(3)}です（閾値${objectiveThreshold}）。`,
          second.id,
        ));
      }

      if (first.objectiveCode === second.objectiveCode) {
        const firstChoices = new Set(first.choices.map((choice) => normalizeText(choice.body)));
        const secondChoices = new Set(second.choices.map((choice) => normalizeText(choice.body)));
        let sharedChoices = 0;
        for (const body of firstChoices) {
          if (secondChoices.has(body)) {
            sharedChoices += 1;
          }
        }
        const choiceUnion = firstChoices.size + secondChoices.size - sharedChoices;
        const choiceJaccard = choiceUnion === 0 ? 1 : sharedChoices / choiceUnion;
        if (choiceJaccard >= 0.6 && semanticSimilarity >= 0.5) {
          issues.push(issue(
            'NEAR_DUPLICATE_CASE',
            'error',
            `${first.id}と問題文・選択肢の両方が近似しています（semantic=${semanticSimilarity.toFixed(3)}, choices=${choiceJaccard.toFixed(3)}）。`,
            second.id,
          ));
        }
      }
    }
  }
}

function validateDistribution(
  bundle: ProductionBundle,
  chapterDistribution: Record<number, number>,
  kLevelDistribution: Record<ContentKLevel, number>,
  selectionDistribution: Record<'single' | 'multiple', number>,
  multiplePromptTemplateDistribution: Record<string, number>,
  literalPremiseDistractorRate: number,
  literalPremiseDistractorQuestionRate: number,
  multipleChoiceLengthGapRate: number,
  issues: ContentQualityIssue[],
): void {
  if (bundle.questions.length !== 500) {
    issues.push(issue('QUESTION_COUNT_INVALID', 'error', `本番問題数は500題必須です。実数: ${bundle.questions.length}`));
  }
  for (const [chapterText, expected] of Object.entries(targetChapterDistribution)) {
    const chapter = Number(chapterText);
    const actual = chapterDistribution[chapter] ?? 0;
    if (actual !== expected) {
      issues.push(issue('CHAPTER_DISTRIBUTION_INVALID', 'error', `第${chapter}章は${expected}題必須です。実数: ${actual}`));
    }
  }
  for (const level of [1, 2, 3] as const) {
    const expected = targetKLevelDistribution[level];
    const actual = kLevelDistribution[level];
    if (actual !== expected) {
      issues.push(issue('K_LEVEL_DISTRIBUTION_INVALID', 'error', `K${level}は${expected}題必須です。実数: ${actual}`));
    }
  }
  if (selectionDistribution.multiple !== 60) {
    issues.push(issue(
      'MULTIPLE_CHOICE_DISTRIBUTION_INVALID',
      'error',
      `本番問題は複数選択を60題含む必要があります。実数: ${selectionDistribution.multiple}`,
    ));
  }
  if (Object.keys(multiplePromptTemplateDistribution).length < 4) {
    issues.push(issue('MULTIPLE_PROMPT_TEMPLATE_VARIETY_INVALID', 'error', '複数選択の提示形式は4種類以上必要です。'));
  }
  const largestTemplateCount = Math.max(0, ...Object.values(multiplePromptTemplateDistribution));
  if (selectionDistribution.multiple > 0 && largestTemplateCount / selectionDistribution.multiple > 0.4) {
    issues.push(issue('MULTIPLE_PROMPT_TEMPLATE_CONCENTRATION', 'error', '複数選択の提示形式が一つのテンプレートへ40%を超えて集中しています。'));
  }
  if (literalPremiseDistractorRate > 0.2) {
    issues.push(issue('LITERAL_PREMISE_DISTRACTOR_RATE_HIGH', 'error', `元premise本文そのままの誤答率は20%以下が必要です。実数: ${(literalPremiseDistractorRate * 100).toFixed(1)}%`));
  }
  if (literalPremiseDistractorQuestionRate > 0.2) {
    issues.push(issue('LITERAL_PREMISE_DISTRACTOR_QUESTION_RATE_HIGH', 'error', `元premise本文を誤答に再掲する複数選択問題は20%以下が必要です。実数: ${(literalPremiseDistractorQuestionRate * 100).toFixed(1)}%`));
  }
  if (multipleChoiceLengthGapRate > 0.35) {
    issues.push(issue('CHOICE_LENGTH_CLUE_HIGH', 'error', `複数選択の正誤平均文字数差が大きすぎます。差率: ${(multipleChoiceLengthGapRate * 100).toFixed(1)}%`));
  } else if (multipleChoiceLengthGapRate > 0.2) {
    issues.push(issue('CHOICE_LENGTH_CLUE_REVIEW', 'warning', `複数選択の正誤平均文字数差を確認してください。差率: ${(multipleChoiceLengthGapRate * 100).toFixed(1)}%`));
  }
  for (const question of bundle.questions) {
    if (question.selectionType === 'multiple' && question.requiredChoiceCount !== 2) {
      issues.push(issue(
        'PRODUCTION_MULTIPLE_COUNT_INVALID',
        'error',
        '本番バンドルの複数選択問題は必要選択数2で作成してください。',
        question.id,
      ));
    }
  }
  const coveredObjectives = new Set(bundle.questions.map((question) => question.objectiveCode));
  for (const objective of contentObjectives) {
    if (!coveredObjectives.has(objective.code)) {
      issues.push(issue('OBJECTIVE_NOT_COVERED', 'error', `学習目標${objective.code}の問題がありません。`));
    }
  }
}

export function validateContentBundle(input: unknown, options: ContentQualityOptions = {}): ContentQualityReport {
  const issues: ContentQualityIssue[] = [];
  const bundle = addSchemaIssues(input, issues);
  const chapterDistribution = emptyChapterDistribution();
  const kLevelDistribution: Record<ContentKLevel, number> = { 1: 0, 2: 0, 3: 0 };
  const statusDistribution: Record<'draft' | 'reviewing' | 'published' | 'suspended' | 'retired', number> = {
    draft: 0,
    reviewing: 0,
    published: 0,
    suspended: 0,
    retired: 0,
  };
  const selectionDistribution: Record<'single' | 'multiple', number> = { single: 0, multiple: 0 };
  const generationMethodDistribution: Record<'independent-case' | 'structured-remediation' | 'parameterized-case', number> = {
    'independent-case': 0,
    'structured-remediation': 0,
    'parameterized-case': 0,
  };
  const multiplePromptTemplateDistribution: Record<string, number> = {};
  let literalPremiseDistractorCount = 0;
  let literalPremiseDistractorQuestionCount = 0;
  let multipleDistractorCount = 0;
  let multipleCorrectLengthTotal = 0;
  let multipleCorrectCount = 0;
  let multipleIncorrectLengthTotal = 0;
  let multipleIncorrectCount = 0;
  const releaseGate = options.releaseGate ?? false;
  const enforceDistribution = options.enforceProductionDistribution ?? false;
  const similarityThreshold = options.similarityThreshold ?? 0.82;

  if (bundle !== undefined) {
    for (const question of bundle.questions) {
      chapterDistribution[question.chapterNumber] = (chapterDistribution[question.chapterNumber] ?? 0) + 1;
      kLevelDistribution[question.kLevel] += 1;
      statusDistribution[question.status] += 1;
      selectionDistribution[question.selectionType] += 1;
      generationMethodDistribution[question.generationMethod] += 1;
      if (question.selectionType === 'multiple') {
        multiplePromptTemplateDistribution[question.promptTemplateFamily] = (multiplePromptTemplateDistribution[question.promptTemplateFamily] ?? 0) + 1;
        const premiseBodies = new Set(question.premises.map((premise) => normalizeText(premise.statement)));
        let hasLiteralPremiseDistractor = false;
        for (const choice of question.choices) {
          const length = Array.from(choice.body).length;
          if (choice.isCorrect) {
            multipleCorrectLengthTotal += length;
            multipleCorrectCount += 1;
          } else {
            multipleIncorrectLengthTotal += length;
            multipleIncorrectCount += 1;
            multipleDistractorCount += 1;
            if (premiseBodies.has(normalizeText(choice.body))) {
              literalPremiseDistractorCount += 1;
              hasLiteralPremiseDistractor = true;
            }
          }
        }
        if (hasLiteralPremiseDistractor) {
          literalPremiseDistractorQuestionCount += 1;
        }
      }
      validateQuestion(question, issues, releaseGate);
    }
    validateUniqueness(bundle, issues, similarityThreshold);
    if (enforceDistribution || releaseGate) {
      const literalPremiseDistractorRate = multipleDistractorCount === 0 ? 0 : literalPremiseDistractorCount / multipleDistractorCount;
      const literalPremiseDistractorQuestionRate = selectionDistribution.multiple === 0 ? 0 : literalPremiseDistractorQuestionCount / selectionDistribution.multiple;
      const correctAverage = multipleCorrectCount === 0 ? 0 : multipleCorrectLengthTotal / multipleCorrectCount;
      const incorrectAverage = multipleIncorrectCount === 0 ? 0 : multipleIncorrectLengthTotal / multipleIncorrectCount;
      const lengthGapRate = Math.max(correctAverage, incorrectAverage) === 0
        ? 0
        : Math.abs(correctAverage - incorrectAverage) / Math.max(correctAverage, incorrectAverage);
      validateDistribution(
        bundle,
        chapterDistribution,
        kLevelDistribution,
        selectionDistribution,
        multiplePromptTemplateDistribution,
        literalPremiseDistractorRate,
        literalPremiseDistractorQuestionRate,
        lengthGapRate,
        issues,
      );
    }
    if (releaseGate && bundle.finalApproval === undefined) {
      issues.push(issue('FINAL_APPROVAL_MISSING', 'error', '本番公開には本人の最終承認が必要です。'));
    }
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  const objectiveCoverage = bundle === undefined
    ? 0
    : new Set(bundle.questions.map((question) => question.objectiveCode)).size;
  const parameterDerivedCount = generationMethodDistribution['parameterized-case'];
  const parameterDerivedRate = bundle === undefined || bundle.questions.length === 0
    ? 0
    : parameterDerivedCount / bundle.questions.length;
  const literalPremiseDistractorRate = multipleDistractorCount === 0 ? 0 : literalPremiseDistractorCount / multipleDistractorCount;
  const literalPremiseDistractorQuestionRate = selectionDistribution.multiple === 0 ? 0 : literalPremiseDistractorQuestionCount / selectionDistribution.multiple;
  const multipleCorrectAverageLength = multipleCorrectCount === 0 ? 0 : multipleCorrectLengthTotal / multipleCorrectCount;
  const multipleIncorrectAverageLength = multipleIncorrectCount === 0 ? 0 : multipleIncorrectLengthTotal / multipleIncorrectCount;
  const multipleChoiceLengthGapRate = Math.max(multipleCorrectAverageLength, multipleIncorrectAverageLength) === 0
    ? 0
    : Math.abs(multipleCorrectAverageLength - multipleIncorrectAverageLength) / Math.max(multipleCorrectAverageLength, multipleIncorrectAverageLength);

  return {
    valid: errorCount === 0,
    releaseReady: releaseGate && errorCount === 0,
    questionCount: bundle?.questions.length ?? 0,
    errorCount,
    warningCount,
    chapterDistribution,
    kLevelDistribution,
    statusDistribution,
    selectionDistribution,
    generationMethodDistribution,
    parameterDerivedCount,
    parameterDerivedRate,
    multiplePromptTemplateDistribution,
    literalPremiseDistractorCount,
    literalPremiseDistractorRate,
    literalPremiseDistractorQuestionCount,
    literalPremiseDistractorQuestionRate,
    multipleCorrectAverageLength,
    multipleIncorrectAverageLength,
    multipleChoiceLengthGapRate,
    objectiveCoverage,
    issues,
    ...(bundle === undefined ? {} : { bundle }),
  };
}
