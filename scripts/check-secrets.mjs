import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const projectRoot = new URL('..', import.meta.url);
const trackedOutput = execFileSync('git', ['ls-files', '-z'], { cwd: projectRoot, encoding: 'utf8' });
const trackedFiles = trackedOutput.split('\0').filter(Boolean);
const allowedEnvironmentFiles = new Set(['.env.example']);
const ignoredExtensions = new Set(['.ico', '.jpg', '.jpeg', '.png', '.ttf', '.woff', '.woff2']);
const patterns = [
  { name: '秘密鍵', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: 'GitHubトークン', pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/u },
  { name: 'OpenAI APIキー', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { name: 'AWSアクセスキー', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'Supabase service roleキー', pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=/u },
];
const violations = [];

for (const relativePath of trackedFiles) {
  const fileName = basename(relativePath);
  if (fileName.startsWith('.env') && !allowedEnvironmentFiles.has(fileName)) {
    violations.push(`${relativePath}: 環境ファイルを追跡しています`);
    continue;
  }
  if (ignoredExtensions.has(extname(fileName).toLowerCase())) {
    continue;
  }

  const fileUrl = new URL(relativePath, projectRoot);
  const fileStat = await stat(fileUrl);
  if (fileStat.size > 2_000_000) {
    continue;
  }
  const content = await readFile(fileUrl, 'utf8');
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) {
      violations.push(`${relativePath}: ${name}の可能性がある値を検出しました`);
    }
  }
}

if (violations.length > 0) {
  console.error(`秘密情報検査に失敗しました:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${trackedFiles.length}個の追跡ファイルを検査し、秘密情報を検出しませんでした。`);
}
