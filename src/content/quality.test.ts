import { describe, expect, it } from 'vitest';

import { targetChapterDistribution, targetKLevelDistribution } from './objectives';
import { calculateContentHash, validateContentBundle } from './quality';
import type { ProductionBundle, ProductionQuestion } from './production-schema';

const sourceUrl = 'https://www.jstqb.jp/syllabus/';

function createQuestion(id = 'jfl-2023-0001'): ProductionQuestion {
  const question: ProductionQuestion = {
    id,
    versionId: `${id}-v1`,
    versionNumber: 1,
    status: 'reviewing',
    syllabusVersion: '2023V4.0.J02',
    chapterNumber: 1,
    chapterTitle: 'テストの基礎',
    objectiveCode: 'FL-1.1.1',
    kLevel: 1,
    difficulty: 1,
    selectionType: 'single',
    requiredChoiceCount: 1,
    shuffleChoices: true,
    generationMethod: 'independent-case',
    caseFamily: 'test-purpose-basic',
    prompt: '注文管理サービスを確認するとき、テスト目的として最も適切な説明はどれですか。',
    choices: [
      { id: `${id}-A`, label: 'A', body: '品質に関する情報を提供する', isCorrect: true, explanation: '作業成果物を評価し、品質に関する情報を意思決定者へ提供する活動です。' },
      { id: `${id}-B`, label: 'B', body: '欠陥がないと証明する', isCorrect: false, explanation: '有限のテストで欠陥が存在しないことを完全に証明することはできません。' },
      { id: `${id}-C`, label: 'C', body: '担当者を評価する', isCorrect: false, explanation: '個人の評価はテストの目的ではなく、欠陥情報を責任追及へ使うべきではありません。' },
      { id: `${id}-D`, label: 'D', body: '修正コードを作成する', isCorrect: false, explanation: '修正コードの作成はデバッグや開発の活動であり、テスト目的そのものではありません。' },
    ],
    explanation: 'テストは作業成果物を評価して欠陥や故障を発見し、品質とリスクに関する情報を提供します。完全な無欠陥証明ではありません。',
    sourceReference: 'JSTQB Foundation Level シラバス Version 2023V4.0.J02 1.1 / FL-1.1.1',
    sourceUrl,
    originStatement: '独自作問',
    prohibitedSourceCheck: true,
    createdBy: 'content-author',
    createdAt: '2026-08-12T00:00:00+09:00',
    contentHash: '0'.repeat(64),
    reviews: [
      { type: 'technical', reviewer: 'technical-gate', reviewerType: 'automated', result: 'approved', reviewedAt: '2026-08-12T00:10:00+09:00', notes: '学習目標と正答根拠の構造検査に合格しました。' },
      { type: 'editorial', reviewer: 'editorial-gate', reviewerType: 'automated', result: 'approved', reviewedAt: '2026-08-12T00:11:00+09:00', notes: '表記と選択肢説明の自動検査に合格しました。' },
      { type: 'similarity', reviewer: 'similarity-gate', reviewerType: 'automated', result: 'approved', reviewedAt: '2026-08-12T00:12:00+09:00', notes: '同一バンドル内の類似度検査に合格しました。' },
    ],
  };
  question.contentHash = calculateContentHash(question);
  return question;
}

function createBundle(questions: ProductionQuestion[]): ProductionBundle {
  return {
    schemaVersion: 1,
    bundleId: 'jstqb-fl-2023-v1',
    certificationCode: 'JSTQB-FL',
    syllabusVersion: '2023V4.0.J02',
    sourceUrl,
    generatedAt: '2026-08-12T00:20:00+09:00',
    questions,
  };
}

describe('本番問題の品質ゲート', () => {
  it('構造と自動レビューが整った問題を受け入れる', () => {
    const report = validateContentBundle(createBundle([createQuestion()]));

    expect(report.valid).toBe(true);
    expect(report.questionCount).toBe(1);
    expect(report.errorCount).toBe(0);
  });

  it('正答数の不一致を拒否する', () => {
    const question = createQuestion();
    question.choices[1] = { ...question.choices[1]!, isCorrect: true };
    question.contentHash = calculateContentHash(question);

    const report = validateContentBundle(createBundle([question]));

    expect(report.valid).toBe(false);
    expect(report.issues.some((item) => item.code === 'CORRECT_COUNT_MISMATCH')).toBe(true);
  });

  it('複数選択の正解集合2件を受け入れる', () => {
    const question = createQuestion();
    question.selectionType = 'multiple';
    question.requiredChoiceCount = 2;
    question.choices[1] = { ...question.choices[1]!, isCorrect: true };
    question.contentHash = calculateContentHash(question);

    const report = validateContentBundle(createBundle([question]));

    expect(report.valid).toBe(true);
    expect(report.selectionDistribution.multiple).toBe(1);
  });

  it('重複問題文を拒否する', () => {
    const first = createQuestion('jfl-2023-0001');
    const second = createQuestion('jfl-2023-0002');

    const report = validateContentBundle(createBundle([first, second]));

    expect(report.valid).toBe(false);
    expect(report.issues.some((item) => item.code === 'PROMPT_DUPLICATE')).toBe(true);
  });

  it('自動レビューだけでは本番公開を許可しない', () => {
    const report = validateContentBundle(createBundle([createQuestion()]), { releaseGate: true });

    expect(report.releaseReady).toBe(false);
    expect(report.issues.some((item) => item.code === 'HUMAN_REVIEW_MISSING')).toBe(true);
    expect(report.issues.some((item) => item.code === 'FINAL_APPROVAL_MISSING')).toBe(true);
  });

  it('指定された500題の章・Kレベル配分が合計と一致する', () => {
    expect(Object.values(targetChapterDistribution).reduce((sum, count) => sum + count, 0)).toBe(500);
    expect(Object.values(targetKLevelDistribution).reduce((sum, count) => sum + count, 0)).toBe(500);
  });

  it('生成方式と選択方式を集計する', () => {
    const report = validateContentBundle(createBundle([createQuestion()]));

    expect(report.selectionDistribution).toEqual({ single: 1, multiple: 0 });
    expect(report.generationMethodDistribution['independent-case']).toBe(1);
    expect(report.parameterDerivedRate).toBe(0);
  });
});
