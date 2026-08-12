import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertPrivatePath,
  buildSeedSql,
  calculateBundleHashes,
} from './content-pipeline';
import type { ProductionBundle, ProductionQuestion } from '../src/content/production-schema';

function bundle(): ProductionBundle {
  const question: ProductionQuestion = {
    id: 'jfl-2023-0001',
    versionId: 'jfl-2023-0001-v1',
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
    promptTemplateFamily: 'basic-question',
    premises: [],
    prompt: '在庫管理サービスのテスト目的として、最も適切な説明はどれですか。',
    choices: [
      { id: 'jfl-2023-0001-A', label: 'A', body: '品質情報を提供する', isCorrect: true, explanation: '品質情報を意思決定者へ提供できます。', addressedPremiseKeys: [] },
      { id: 'jfl-2023-0001-B', label: 'B', body: '無欠陥を証明する', isCorrect: false, explanation: '有限のテストで無欠陥を証明できません。', addressedPremiseKeys: [] },
      { id: 'jfl-2023-0001-C', label: 'C', body: '担当者を査定する', isCorrect: false, explanation: '担当者の査定はテスト目的ではありません。', addressedPremiseKeys: [] },
      { id: 'jfl-2023-0001-D', label: 'D', body: '修正を実装する', isCorrect: false, explanation: '修正の実装はテスト目的ではありません。', addressedPremiseKeys: [] },
    ],
    explanation: 'テストは品質とリスクに関する情報を提供し、欠陥の予防や発見を支援する活動です。',
    sourceReference: 'JSTQB Foundation Level シラバス Version 2023V4.0.J02 1.1 / FL-1.1.1',
    sourceUrl: 'https://www.jstqb.jp/syllabus/',
    originStatement: '独自作問',
    prohibitedSourceCheck: true,
    createdBy: 'content-author',
    createdAt: '2026-08-12T00:00:00+09:00',
    contentHash: '0'.repeat(64),
    compatibility: 'breaking',
    reviews: [],
  };
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

describe('公開コンテンツ境界の悪用回帰', () => {
  it('raw bytes hashとcanonical hashを別値として保持する', () => {
    const value = bundle();
    const raw = Buffer.from(` ${JSON.stringify(value)}\n`, 'utf8');
    const hashes = calculateBundleHashes(raw, value);

    expect(hashes.rawHash).not.toBe(hashes.canonicalHash);
    expect(hashes.rawHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashes.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('seed SQLへchoice属性・answer key・DB release gateを含める', () => {
    const sql = buildSeedSql(bundle(), 'private.json', {
      rawHash: '1'.repeat(64),
      canonicalHash: '2'.repeat(64),
    }, '00000000-0000-0000-0000-000000000001');

    expect(sql).toContain('raw_hash');
    expect(sql).toContain('canonical_hash');
    expect(sql).toContain('choiceのID・label・本文・explanation');
    expect(sql).toContain('正答choice集合とanswer key');
    expect(sql).toContain('assert_content_release_gate');
  });

  it('入力・出力をGit worktree外の0600/0700 private pathへ限定する', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jstqb-security-'));
    try {
      await chmod(directory, 0o700);
      const input = join(directory, 'bundle.part');
      await writeFile(input, '{}', { mode: 0o600 });
      await assertPrivatePath(input, '入力bundle', true);
      await expect(assertPrivatePath(join(directory, 'output.part'), '出力先', false)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('worktree内のprivate-looking pathを入力に使えない', async () => {
    await expect(assertPrivatePath('outputs/private-content/ignored.part', '入力bundle', false)).rejects.toThrow('Git worktree外');
  });
});
