import { readFile } from 'node:fs/promises';

const workspaceUrl = new URL('../pnpm-workspace.yaml', import.meta.url);
const exceptionsUrl = new URL('../docs/security-exceptions.md', import.meta.url);
const workspace = await readFile(workspaceUrl, 'utf8');
const documentation = await readFile(exceptionsUrl, 'utf8');
const ignoredAdvisories = new Set(workspace.match(/GHSA-[a-z0-9-]+/gu) ?? []);
const documentedAdvisories = new Set(documentation.match(/GHSA-[a-z0-9-]+/gu) ?? []);
const expiryMatch = documentation.match(/次回確認:.*?(\d{4}-\d{2}-\d{2})/u);
const checkDate = process.env.SECURITY_EXCEPTION_CHECK_DATE ?? new Date().toISOString().slice(0, 10);

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

if (!isIsoDate(checkDate)) {
  console.error('SECURITY_EXCEPTION_CHECK_DATEはYYYY-MM-DD形式の実在日である必要があります。');
  process.exit(2);
}

if (ignoredAdvisories.size === 0) {
  console.log('有効な脆弱性監査例外はありません。');
  process.exit(0);
}

const undocumented = [...ignoredAdvisories].filter((advisory) => !documentedAdvisories.has(advisory));
if (undocumented.length > 0) {
  console.error(`文書化されていない脆弱性監査例外があります: ${undocumented.join(', ')}`);
  process.exit(1);
}

const expiry = expiryMatch?.[1];
if (!expiry || !isIsoDate(expiry)) {
  console.error('セキュリティ例外文書に有効な次回確認期限がありません。');
  process.exit(1);
}

if (checkDate > expiry) {
  console.error(`脆弱性監査例外の確認期限${expiry}を過ぎています。例外を削除するか、根拠を再評価して期限を更新してください。`);
  process.exit(1);
}

console.log(`${ignoredAdvisories.size}件の脆弱性監査例外は${expiry}まで有効です。`);
