import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const maximumScannableSize = 2_000_000;
const projectRootUrl = new URL('..', import.meta.url);
const projectRoot = resolve(fileURLToPath(projectRootUrl));
const allowedEnvironmentFiles = new Set(['.env.example']);
const providerPatterns = [
  { name: '秘密鍵', pattern: /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/u },
  { name: 'GitHubトークン', pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{22,})\b/u },
  { name: 'GitLabトークン', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/u },
  { name: 'OpenAI APIキー', pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u },
  { name: 'AWSアクセスキー', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u },
  { name: 'Google APIキー', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/u },
  { name: 'Slackトークン', pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u },
  { name: 'Stripe秘密キー', pattern: /\b(?:(?:sk|rk)_live_[0-9A-Za-z]{16,}|whsec_[0-9A-Za-z]{16,})\b/u },
  { name: 'npmトークン', pattern: /\bnpm_[0-9A-Za-z]{36}\b/u },
  { name: 'PyPIトークン', pattern: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{20,}\b/u },
  { name: 'Hugging Faceトークン', pattern: /\bhf_[0-9A-Za-z]{30,}\b/u },
  { name: 'SendGrid APIキー', pattern: /\bSG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{32,}\b/u },
  { name: 'Supabase秘密キー', pattern: /\bsb_secret_[0-9A-Za-z_-]{20,}\b/u },
  { name: 'Supabase service role変数', pattern: /\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]/u },
  { name: '認証情報付きデータベースURL', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s/@]+@/u },
];
const jwtPattern = /\b[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{16,}\b/gu;
const sensitiveAssignmentPattern = /\b(?:[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIAL)|[a-z][a-z0-9_]*(?:_key|_token|_secret|_password|_credential)|[a-z][A-Za-z0-9]*(?:Key|Token|Secret|Password|Credential)|token|secret|password|credential)\b\s*[:=]\s*["'`]([^"'`\s]{20,})["'`]/gu;
const highRiskJwtRoles = new Set(['postgres', 'service_role', 'supabase_admin']);

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 32_000_000,
    ...options,
  });
}

function checkPathPolicy(relativePath, label, violations) {
  const fileName = basename(relativePath);
  if (fileName.startsWith('.env') && !allowedEnvironmentFiles.has(fileName)) {
    violations.add(`${label}: 環境ファイルを追跡しています`);
    return false;
  }
  return true;
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function decodeJwtPayload(encodedPayload) {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function detectSecretFindings(content) {
  const findings = new Set();
  for (const { name, pattern } of providerPatterns) {
    if (pattern.test(content)) findings.add(name);
  }

  for (const match of content.matchAll(jwtPattern)) {
    const payload = decodeJwtPayload(match[1] ?? '');
    const role = payload?.role;
    if (typeof role === 'string' && highRiskJwtRoles.has(role)) {
      findings.add(`高権限JWT（role=${role}）`);
    }
  }

  for (const match of content.matchAll(sensitiveAssignmentPattern)) {
    const value = match[1] ?? '';
    if (/example|fixture|placeholder|dummy|your[-_]/iu.test(value)) continue;
    if (value.length >= 24 && shannonEntropy(value) >= 3.8) {
      findings.add('機密名へ代入された高エントロピー値');
    }
  }
  return [...findings];
}

function checkContent(label, content, violations) {
  for (const finding of detectSecretFindings(content)) {
    violations.add(`${label}: ${finding}の可能性がある値を検出しました`);
  }
}

const violations = new Set();
const trackedOutput = runGit(['ls-files', '-z']);
const trackedFiles = trackedOutput.split('\0').filter(Boolean);

for (const relativePath of trackedFiles) {
  if (!checkPathPolicy(relativePath, relativePath, violations)) continue;

  const filePath = resolve(projectRoot, relativePath);
  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
    violations.add(`${relativePath}: リポジトリ外のパスです`);
    continue;
  }
  const fileStat = await stat(filePath);
  if (fileStat.size > maximumScannableSize) {
    violations.add(`${relativePath}: 2MBを超えるファイルは秘密検査できないため追跡できません`);
    continue;
  }
  checkContent(relativePath, await readFile(filePath, 'utf8'), violations);
}

const reachableObjects = runGit(['-c', 'core.quotePath=false', 'rev-list', '--objects', '--all'])
  .split('\n')
  .filter(Boolean);
const pathsByObjectId = new Map();

for (const line of reachableObjects) {
  const separatorIndex = line.indexOf(' ');
  const objectId = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
  const relativePath = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
  const paths = pathsByObjectId.get(objectId) ?? [];
  if (relativePath) paths.push(relativePath);
  pathsByObjectId.set(objectId, paths);
}

const objectIds = [...pathsByObjectId.keys()];
const metadataOutput = objectIds.length === 0
  ? ''
  : runGit(
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    { input: `${objectIds.join('\n')}\n` },
  );
let reachableBlobCount = 0;

for (const line of metadataOutput.split('\n').filter(Boolean)) {
  const [objectId, objectType, sizeText] = line.split(' ');
  if (!objectId || objectType !== 'blob' || !sizeText) continue;

  reachableBlobCount += 1;
  const paths = pathsByObjectId.get(objectId) ?? [];
  const scannablePaths = paths.filter((relativePath) => checkPathPolicy(relativePath, `履歴:${relativePath}`, violations));
  if (scannablePaths.length === 0) continue;

  const label = `履歴:${scannablePaths.slice(0, 3).join(',')} (${objectId.slice(0, 12)})`;
  const objectSize = Number.parseInt(sizeText, 10);
  if (!Number.isSafeInteger(objectSize) || objectSize < 0) {
    violations.add(`${label}: Git blobサイズを取得できません`);
    continue;
  }
  if (objectSize > maximumScannableSize) {
    violations.add(`${label}: 2MBを超える履歴ファイルは秘密検査できないため保持できません`);
    continue;
  }

  const content = runGit(['cat-file', 'blob', objectId], { maxBuffer: maximumScannableSize + 1_000 });
  checkContent(label, content, violations);
}

if (violations.size > 0) {
  console.error(`秘密情報検査に失敗しました:\n${[...violations].join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${trackedFiles.length}個の追跡ファイルと${reachableBlobCount}個の到達可能な履歴blobを検査し、秘密情報を検出しませんでした。`);
}
