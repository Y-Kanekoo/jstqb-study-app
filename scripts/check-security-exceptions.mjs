import { readFile } from 'node:fs/promises';

const workspaceUrl = new URL('../pnpm-workspace.yaml', import.meta.url);
const manifestUrl = new URL('../.github/security-exceptions.json', import.meta.url);
const documentationUrl = new URL('../docs/security-exceptions.md', import.meta.url);
const workspace = await readFile(workspaceUrl, 'utf8');
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const documentation = await readFile(documentationUrl, 'utf8');
const ignoredAdvisories = new Set(workspace.match(/GHSA-[a-z0-9-]+/gu) ?? []);
const documentedAdvisories = new Set(documentation.match(/GHSA-[a-z0-9-]+/gu) ?? []);
const checkDate = process.env.SECURITY_EXCEPTION_CHECK_DATE ?? new Date().toISOString().slice(0, 10);
const violations = [];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function requiredString(record, field, label) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    violations.push(`${label}: ${field}がありません`);
    return '';
  }
  return value.trim();
}

if (!isIsoDate(checkDate)) {
  console.error('SECURITY_EXCEPTION_CHECK_DATEはYYYY-MM-DD形式の実在日である必要があります。');
  process.exit(2);
}

if (!isRecord(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.exceptions)) {
  console.error('セキュリティ例外manifestのschemaが不正です。');
  process.exit(1);
}

const manifestAdvisories = new Set();
const exceptionIds = new Set();
for (const [index, value] of manifest.exceptions.entries()) {
  const label = `${index + 1}件目のセキュリティ例外`;
  if (!isRecord(value)) {
    violations.push(`${label}: オブジェクトではありません`);
    continue;
  }
  const id = requiredString(value, 'id', label);
  requiredString(value, 'reason', label);
  requiredString(value, 'scope', label);
  requiredString(value, 'remediation', label);
  const reviewedOn = requiredString(value, 'reviewedOn', label);
  const expiresOn = requiredString(value, 'expiresOn', label);
  if (id && exceptionIds.has(id)) violations.push(`${label}: idが重複しています: ${id}`);
  if (id) exceptionIds.add(id);
  if (!isIsoDate(reviewedOn) || !isIsoDate(expiresOn)) {
    violations.push(`${label}: reviewedOnまたはexpiresOnが実在するISO日付ではありません`);
  } else {
    if (reviewedOn > expiresOn) violations.push(`${label}: expiresOnがreviewedOnより前です`);
    if (checkDate > expiresOn) violations.push(`${label}: 確認期限${expiresOn}を過ぎています`);
  }

  if (!Array.isArray(value.advisories) || value.advisories.length === 0) {
    violations.push(`${label}: advisoriesがありません`);
    continue;
  }
  for (const advisory of value.advisories) {
    if (typeof advisory !== 'string' || !/^GHSA-[a-z0-9-]+$/u.test(advisory)) {
      violations.push(`${label}: Advisory IDが不正です`);
      continue;
    }
    if (manifestAdvisories.has(advisory)) violations.push(`${label}: Advisory IDが重複しています: ${advisory}`);
    manifestAdvisories.add(advisory);
  }
}

for (const advisory of ignoredAdvisories) {
  if (!manifestAdvisories.has(advisory)) violations.push(`manifestにない監査除外です: ${advisory}`);
  if (!documentedAdvisories.has(advisory)) violations.push(`文書化されていない監査除外です: ${advisory}`);
}
for (const advisory of manifestAdvisories) {
  if (!ignoredAdvisories.has(advisory)) violations.push(`pnpm監査設定にないmanifest例外です: ${advisory}`);
}

if (violations.length > 0) {
  console.error(`セキュリティ例外検査に失敗しました:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log(`${manifest.exceptions.length}件・${manifestAdvisories.size} Advisoryの期限付き監査例外を検証しました。`);
