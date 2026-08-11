import { describe, expect, it } from 'vitest';

import { buildRollbackSql, buildSeedSql } from './content-pipeline';
import { calculateContentHash } from '../src/content/quality';
import type { ProductionBundle, ProductionQuestion } from '../src/content/production-schema';

function fixtureBundle(): ProductionBundle {
  const id = 'jfl-2023-0001';
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
    premises: [],
    prompt: '在庫管理サービスのテスト目的として、最も適切な説明はどれですか。',
    choices: [
      { id: `${id}-A`, label: 'A', body: '品質情報を提供する', isCorrect: true, explanation: 'リスクと品質に関する情報を意思決定者へ提供できます。', addressedPremiseKeys: [] },
      { id: `${id}-B`, label: 'B', body: '無欠陥を証明する', isCorrect: false, explanation: '有限のテストで欠陥が存在しないことを証明できません。', addressedPremiseKeys: [] },
      { id: `${id}-C`, label: 'C', body: '担当者を査定する', isCorrect: false, explanation: '担当者の査定はソフトウェアテストの目的ではありません。', addressedPremiseKeys: [] },
      { id: `${id}-D`, label: 'D', body: '修正を実装する', isCorrect: false, explanation: '修正の実装は開発やデバッグの活動に分類されます。', addressedPremiseKeys: [] },
    ],
    explanation: 'テストは品質とリスクに関する情報を提供し、欠陥の予防や発見を支援する活動です。無欠陥の証明ではありません。',
    sourceReference: 'JSTQB Foundation Level シラバス Version 2023V4.0.J02 1.1 / FL-1.1.1',
    sourceUrl: 'https://www.jstqb.jp/syllabus/',
    originStatement: '独自作問',
    prohibitedSourceCheck: true,
    createdBy: 'content-author',
    createdAt: '2026-08-12T00:00:00+09:00',
    contentHash: '0'.repeat(64),
    reviews: [
      {
        type: 'technical',
        reviewer: 'technical-gate',
        reviewerType: 'automated',
        result: 'approved',
        reviewedAt: '2026-08-12T00:10:00+09:00',
        notes: '学習目標と正答根拠の構造検査に合格しました。',
      },
    ],
  };
  question.contentHash = calculateContentHash(question);
  return {
    schemaVersion: 1,
    bundleId: 'jstqb-fl-2023-v1',
    certificationCode: 'JSTQB-FL',
    syllabusVersion: '2023V4.0.J02',
    sourceUrl: 'https://www.jstqb.jp/syllabus/',
    generatedAt: '2026-08-12T00:20:00+09:00',
    questions: [question],
  };
}

describe('非公開コンテンツSQLハーネス', () => {
  it('正答キーと来歴を含むトランザクションSQLを生成する', () => {
    const sql = buildSeedSql(fixtureBundle(), 'private.json');

    expect(sql).toContain('begin;');
    expect(sql).toContain('insert into public.question_answer_keys');
    expect(sql).toContain("'jfl-2023-0001-A'");
    expect(sql).toContain('commit;');
    expect(sql).toContain('公開リポジトリへ追加しないこと');
    expect(sql).toContain('where not exists (');
    expect(sql).toContain('異なるcontent hash');
    expect(sql).toContain('選択方式・必要選択数・正答choice数');
  });

  it('回答履歴がある場合に停止するロールバックSQLを生成する', () => {
    const sql = buildRollbackSql(fixtureBundle());

    expect(sql).toContain('public.answer_attempts');
    expect(sql).toContain('回答履歴が存在するためロールバックできません');
    expect(sql).toContain("status = 'rolled_back'");
  });
});
