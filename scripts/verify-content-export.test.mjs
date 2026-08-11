import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifyContentExport } from './verify-content-export.mjs';

function validQuestion() {
  return {
    id: 'fl-production-001',
    versionId: 'fl-production-001-v1',
    chapterNumber: 1,
    chapterTitle: 'テストの基礎',
    objectiveCode: 'FL-1.1.1',
    prompt: 'テストの目的として適切なものはどれですか。',
    explanation: '品質に関する情報を提供することが目的です。',
    difficulty: 1,
    sourceReference: 'Foundation Level シラバス 1.1',
    selectionType: 'single',
    requiredSelectionCount: 1,
    createdBy: 'author-a',
    reviewedBy: 'reviewer-b',
    reviewedAt: '2026-08-10T10:00:00.000Z',
    publishedAt: '2026-08-11T10:00:00.000Z',
    status: 'published',
    isIndependent: true,
    choices: [
      { id: 'choice-a', label: 'A', body: '品質情報を提供する', explanation: '正しい目的です。', isCorrect: true },
      { id: 'choice-b', label: 'B', body: '欠陥ゼロを証明する', explanation: '完全な証明はできません。', isCorrect: false },
    ],
  };
}

describe('本番問題エクスポートの最小契約', () => {
  it('現行domainとレビュー情報を満たす問題を受理する', () => {
    assert.deepEqual(verifyContentExport([validQuestion()], 1), []);
  });

  it('選択肢ID・ラベルの重複とselectionType不整合を拒否する', () => {
    const question = validQuestion();
    question.choices[1].id = question.choices[0].id;
    question.choices[1].label = question.choices[0].label;
    question.selectionType = 'multiple';
    const violations = verifyContentExport([question], 1).join('\n');
    assert.match(violations, /選択肢IDが重複/u);
    assert.match(violations, /選択肢ラベルが重複/u);
    assert.match(violations, /multiple選択のrequiredSelectionCountは2以上/u);
  });

  it('同一作成者レビューと時系列逆転を拒否する', () => {
    const question = validQuestion();
    question.reviewedBy = question.createdBy;
    question.publishedAt = '2026-08-09T10:00:00.000Z';
    const violations = verifyContentExport([question], 1).join('\n');
    assert.match(violations, /作成者とレビュー者は別/u);
    assert.match(violations, /publishedAtがreviewedAtより前/u);
  });
});
