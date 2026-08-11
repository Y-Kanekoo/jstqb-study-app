import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const maximumTextSize = 2_000_000;
const projectRootUrl = new URL('..', import.meta.url);
const projectRoot = resolve(fileURLToPath(projectRootUrl));
const allowedEnvironmentFiles = new Set(['.env.example']);
const ignoredExtensions = new Set(['.ico', '.jpg', '.jpeg', '.png', '.ttf', '.woff', '.woff2']);
const patterns = [
  { name: '秘密鍵', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: 'GitHubトークン', pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/u },
  { name: 'OpenAI APIキー', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { name: 'AWSアクセスキー', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'Supabase service roleキー', pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=/u },
];
const violations = new Set();

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 32_000_000,
    ...options,
  });
}

function isIgnoredBinaryPath(relativePath) {
  return ignoredExtensions.has(extname(relativePath).toLowerCase());
}

function checkPathPolicy(relativePath, label) {
  const fileName = basename(relativePath);
  if (fileName.startsWith('.env') && !allowedEnvironmentFiles.has(fileName)) {
    violations.add(`${label}: 環境ファイルを追跡しています`);
    return false;
  }
  return !isIgnoredBinaryPath(relativePath);
}

function checkContent(label, content) {
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) {
      violations.add(`${label}: ${name}の可能性がある値を検出しました`);
    }
  }
}

const trackedOutput = runGit(['ls-files', '-z']);
const trackedFiles = trackedOutput.split('\0').filter(Boolean);

for (const relativePath of trackedFiles) {
  if (!checkPathPolicy(relativePath, relativePath)) continue;

  const filePath = resolve(projectRoot, relativePath);
  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
    violations.add(`${relativePath}: リポジトリ外のパスです`);
    continue;
  }
  const fileStat = await stat(filePath);
  if (fileStat.size > maximumTextSize) {
    violations.add(`${relativePath}: 2MBを超える非バイナリファイルは秘密検査できないため追跡できません`);
    continue;
  }
  checkContent(relativePath, await readFile(filePath, 'utf8'));
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
  const textPaths = paths.filter((relativePath) => checkPathPolicy(relativePath, `履歴:${relativePath}`));
  if (textPaths.length === 0) continue;

  const label = `履歴:${textPaths.slice(0, 3).join(',')} (${objectId.slice(0, 12)})`;
  const objectSize = Number.parseInt(sizeText, 10);
  if (!Number.isSafeInteger(objectSize) || objectSize < 0) {
    violations.add(`${label}: Git blobサイズを取得できません`);
    continue;
  }
  if (objectSize > maximumTextSize) {
    violations.add(`${label}: 2MBを超える非バイナリ履歴は秘密検査できないため保持できません`);
    continue;
  }

  const content = runGit(['cat-file', 'blob', objectId], { maxBuffer: maximumTextSize + 1_000 });
  checkContent(label, content);
}

if (violations.size > 0) {
  console.error(`秘密情報検査に失敗しました:\n${[...violations].join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${trackedFiles.length}個の追跡ファイルと${reachableBlobCount}個の到達可能な履歴blobを検査し、秘密情報を検出しませんでした。`);
}
