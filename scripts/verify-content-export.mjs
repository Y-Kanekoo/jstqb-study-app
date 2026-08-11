import { readFile } from 'node:fs/promises';

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
if (!Array.isArray(parsed)) {
  console.error('問題エクスポートのルートは配列である必要があります。');
  process.exit(1);
}

const violations = [];
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    violations.push(`${index + 1}件目: 問題がオブジェクトではありません`);
    continue;
  }

  const id = requiredString(value, 'id', index);
  const versionId = requiredString(value, 'versionId', index);
  const prompt = requiredString(value, 'prompt', index);
  requiredString(value, 'objectiveCode', index);
  requiredString(value, 'explanation', index);
  requiredString(value, 'sourceReference', index);
  requiredString(value, 'reviewedBy', index);

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
  const correctCount = value.choices.filter((choice) => typeof choice === 'object' && choice !== null && choice.isCorrect === true).length;
  if (
    !Number.isSafeInteger(value.requiredSelectionCount)
    || value.requiredSelectionCount < 1
    || correctCount < 1
    || correctCount !== value.requiredSelectionCount
  ) {
    violations.push(`${id}: 正答数とrequiredSelectionCountが一致しません`);
  }
  for (const choice of value.choices) {
    if (
      typeof choice !== 'object'
      || choice === null
      || typeof choice.body !== 'string'
      || choice.body.trim() === ''
      || typeof choice.explanation !== 'string'
      || choice.explanation.trim() === ''
      || typeof choice.isCorrect !== 'boolean'
    ) {
      violations.push(`${id}: 選択肢本文または選択肢別解説がありません`);
    }
  }
}

if (parsed.length < minimumCount) {
  violations.push(`公開済み独立問題が${parsed.length}題です。最低${minimumCount}題が必要です`);
}

if (violations.length > 0) {
  console.error(`問題コンテンツ検査に失敗しました:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${parsed.length}題の公開済み独立問題を検証しました。`);
}
