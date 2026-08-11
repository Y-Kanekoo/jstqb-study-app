import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const trackedOutput = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
const trackedFiles = trackedOutput.split('\0').filter(Boolean);
const forbiddenPathPatterns = [
  /(^|\/)outputs\/private-content\//,
  /(^|\/)private-content\//,
  /(^|\/)content\/private\//,
  /\.questions\.json$/,
  /\.review-manifest\.json$/,
  /\.seed\.sql$/,
  /\.rollback\.sql$/,
];

const violations = trackedFiles.filter((file) => forbiddenPathPatterns.some((pattern) => pattern.test(file)));

for (const file of trackedFiles.filter((candidate) => candidate.endsWith('.json'))) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'questions' in parsed
      && Array.isArray(parsed.questions)
      && parsed.questions.length > 50
    ) {
      violations.push(`${file}（問題配列${parsed.questions.length}件）`);
    }
  } catch {
    // JSONとして読めない設定ファイルは、各専用検証へ任せる。
  }
}

if (violations.length > 0) {
  process.stderr.write(`非公開問題データをGitで追跡しています:\n${violations.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('公開・非公開コンテンツ境界: 合格\n');
}
