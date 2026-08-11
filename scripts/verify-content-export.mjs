import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

export function verifyContentExport(parsed, minimumCount) {
  const violations = [];
  if (!Array.isArray(parsed)) return ['問題エクスポートのルートは配列である必要があります。'];

  const ids = new Set();
  const versionIds = new Set();
  const prompts = new Set();

  function requiredString(record, field, index) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') {
      violations.push(`${index + 1}件目: ${field}がありません`);
      return '';
    }
    return value.trim();
  }

  for (const [index, value] of parsed.entries()) {
    if (!isRecord(value)) {
      violations.push(`${index + 1}件目: 問題がオブジェクトではありません`);
      continue;
    }

    const id = requiredString(value, 'id', index);
    const versionId = requiredString(value, 'versionId', index);
    const prompt = requiredString(value, 'prompt', index);
    requiredString(value, 'objectiveCode', index);
    requiredString(value, 'chapterTitle', index);
    requiredString(value, 'explanation', index);
    requiredString(value, 'sourceReference', index);
    const createdBy = requiredString(value, 'createdBy', index);
    const reviewedBy = requiredString(value, 'reviewedBy', index);

    if (!Number.isSafeInteger(value.chapterNumber) || value.chapterNumber < 1 || value.chapterNumber > 6) {
      violations.push(`${id || index + 1}: chapterNumberは1〜6の整数である必要があります`);
    }
    if (!Number.isSafeInteger(value.difficulty) || value.difficulty < 1 || value.difficulty > 3) {
      violations.push(`${id || index + 1}: difficultyは1〜3の整数である必要があります`);
    }
    if (value.selectionType !== 'single' && value.selectionType !== 'multiple') {
      violations.push(`${id || index + 1}: selectionTypeはsingleまたはmultipleである必要があります`);
    }
    if (createdBy && reviewedBy && createdBy === reviewedBy) {
      violations.push(`${id || index + 1}: 作成者とレビュー者は別である必要があります`);
    }
    if (!isIsoTimestamp(value.reviewedAt) || !isIsoTimestamp(value.publishedAt)) {
      violations.push(`${id || index + 1}: reviewedAtとpublishedAtはUTCのISO日時である必要があります`);
    } else if (value.reviewedAt > value.publishedAt) {
      violations.push(`${id || index + 1}: publishedAtがreviewedAtより前です`);
    }
    if (value.status !== 'published') {
      violations.push(`${id || index + 1}: statusがpublishedではありません`);
    }
    if (value.isIndependent !== true) {
      violations.push(`${id || index + 1}: 独立問題として承認されていません`);
    }
    if (ids.has(id)) violations.push(`${id}: 問題IDが重複しています`);
    if (versionIds.has(versionId)) violations.push(`${versionId}: 問題版IDが重複しています`);
    const normalizedPrompt = prompt.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
    if (prompts.has(normalizedPrompt)) violations.push(`${id}: 問題文が重複しています`);
    ids.add(id);
    versionIds.add(versionId);
    prompts.add(normalizedPrompt);

    if (!Array.isArray(value.choices) || value.choices.length < 2) {
      violations.push(`${id}: 選択肢が不足しています`);
      continue;
    }
    const correctCount = value.choices.filter((choice) => isRecord(choice) && choice.isCorrect === true).length;
    if (
      !Number.isSafeInteger(value.requiredSelectionCount)
      || value.requiredSelectionCount < 1
      || correctCount < 1
      || correctCount !== value.requiredSelectionCount
    ) {
      violations.push(`${id}: 正答数とrequiredSelectionCountが一致しません`);
    }
    if (value.selectionType === 'single' && value.requiredSelectionCount !== 1) {
      violations.push(`${id}: single選択のrequiredSelectionCountは1である必要があります`);
    }
    if (value.selectionType === 'multiple' && (!Number.isSafeInteger(value.requiredSelectionCount) || value.requiredSelectionCount < 2)) {
      violations.push(`${id}: multiple選択のrequiredSelectionCountは2以上である必要があります`);
    }

    const choiceIds = new Set();
    const choiceLabels = new Set();
    for (const choice of value.choices) {
      if (!isRecord(choice)) {
        violations.push(`${id}: 選択肢がオブジェクトではありません`);
        continue;
      }
      const choiceId = typeof choice.id === 'string' ? choice.id.trim() : '';
      const choiceLabel = typeof choice.label === 'string' ? choice.label.trim() : '';
      if (
        !choiceId
        || !choiceLabel
        || typeof choice.body !== 'string'
        || choice.body.trim() === ''
        || typeof choice.explanation !== 'string'
        || choice.explanation.trim() === ''
        || typeof choice.isCorrect !== 'boolean'
      ) {
        violations.push(`${id}: 選択肢ID・ラベル・本文・選択肢別解説・正誤が不足しています`);
      }
      if (choiceIds.has(choiceId)) violations.push(`${id}: 選択肢IDが重複しています: ${choiceId}`);
      if (choiceLabels.has(choiceLabel)) violations.push(`${id}: 選択肢ラベルが重複しています: ${choiceLabel}`);
      choiceIds.add(choiceId);
      choiceLabels.add(choiceLabel);
    }
  }

  if (parsed.length < minimumCount) {
    violations.push(`公開済み独立問題が${parsed.length}題です。最低${minimumCount}題が必要です`);
  }
  return violations;
}

async function main() {
  const exportPath = process.argv[2];
  const minimumCount = Number(process.env.CONTENT_MINIMUM_COUNT ?? '500');
  if (!Number.isSafeInteger(minimumCount) || minimumCount < 1) {
    console.error('CONTENT_MINIMUM_COUNTは1以上の整数である必要があります。');
    process.exit(2);
  }
  if (!exportPath) {
    console.error('使い方: pnpm content:verify <非公開問題エクスポート.json>');
    process.exit(2);
  }

  const parsed = JSON.parse(await readFile(exportPath, 'utf8'));
  const violations = verifyContentExport(parsed, minimumCount);
  if (violations.length > 0) {
    console.error(`問題コンテンツ検査に失敗しました:\n${violations.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`${parsed.length}題の公開済み独立問題を検証しました。`);
  }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) await main();
