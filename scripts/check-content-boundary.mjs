import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });
const worktreeRoot = git(['rev-parse', '--show-toplevel']).trim();

const forbiddenPathPatterns = [
  /(^|\/)outputs\/private-content(?:\/|$)/u,
  /(^|\/)private-content(?:\/|$)/u,
  /(^|\/)content\/private(?:\/|$)/u,
  /(^|\/)(?:[^/]+\.)?(?:questions|review-manifest|seed|rollback)\.json$/u,
  /(^|\/)[^/]+\.(?:questions|review-manifest|seed|rollback)\.[^/]+$/u,
];

function isForbiddenPath(path) {
  return forbiddenPathPatterns.some((pattern) => pattern.test(path));
}

function reachableObjects() {
  const output = git(['rev-list', '--objects', '--all']);
  return output.split('\n').filter(Boolean).map((line) => {
    const separator = line.indexOf(' ');
    return separator < 0
      ? { objectId: line, path: '' }
      : { objectId: line.slice(0, separator), path: line.slice(separator + 1) };
  });
}

function blobContent(objectId) {
  return execFileSync('git', ['cat-file', 'blob', objectId], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
}

function questionRecordCount(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + questionRecordCount(item), 0);
  if (typeof value !== 'object' || value === null) return 0;
  const record = value;
  const isQuestion = Array.isArray(record.choices)
    && typeof record.prompt === 'string'
    && (typeof record.isCorrect === 'boolean' || typeof record.contentHash === 'string');
  return (isQuestion ? 1 : 0) + Object.values(record).reduce((sum, item) => sum + questionRecordCount(item), 0);
}

function questionRecordCountInText(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return questionRecordCount(JSON.parse(text));
    } catch {
      // 分割されたNDJSONを次に検査する。
    }
  }
  return text.split('\n').reduce((sum, line) => {
    try {
      return sum + questionRecordCount(JSON.parse(line));
    } catch {
      return sum;
    }
  }, 0);
}

function suspiciousBlob(path, content) {
  if (content.length > 32 * 1024 * 1024) return null;
  const text = content.toString('utf8');
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const count = questionRecordCount(parsed);
      if (count > 50) return `${path || '<履歴blob>'}（問題レコード${count}件）`;
    } catch {
      // JSONでないblobは内容マーカー検査へ進む。
    }
  }
  const sensitiveRecordCount = (text.match(/(?:is_correct|isCorrect|correct_choice_ids|question_answer_keys)/gu) ?? []).length;
  if (sensitiveRecordCount >= 50) {
    return `${path || '<履歴blob>'}（採点情報マーカー${sensitiveRecordCount}件）`;
  }
  return null;
}

function checkPrivateDirectoryPermissions() {
  const privateDirectory = join(worktreeRoot, 'outputs', 'private-content');
  if (!existsSync(privateDirectory)) return [];
  const violations = [];
  const directoryMode = lstatSync(privateDirectory).mode & 0o777;
  if (directoryMode !== 0o700) violations.push('private contentディレクトリの権限が0700ではありません');
  for (const entry of readdirSync(privateDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const mode = lstatSync(join(privateDirectory, entry.name)).mode & 0o777;
    if (mode !== 0o600) violations.push('private contentファイルの権限が0600ではありません');
  }
  return violations;
}

const violations = [];
const reachable = reachableObjects();
const pathByObject = new Map();
let reachableQuestionRecords = 0;
let reachableSensitiveMarkers = 0;
for (const item of reachable) {
  if (item.path && isForbiddenPath(item.path)) violations.push(`${item.path}（履歴path）`);
  const paths = pathByObject.get(item.objectId) ?? [];
  if (item.path) paths.push(item.path);
  pathByObject.set(item.objectId, paths);
}

for (const [objectId, paths] of pathByObject) {
  const type = git(['cat-file', '-t', objectId]).trim();
  if (type !== 'blob') continue;
  const label = paths[0] ?? '';
  const content = blobContent(objectId);
  const text = content.length > 32 * 1024 * 1024 ? '' : content.toString('utf8');
  reachableSensitiveMarkers += (text.match(/(?:is_correct|isCorrect|correct_choice_ids|question_answer_keys)/gu) ?? []).length;
  reachableQuestionRecords += questionRecordCountInText(text);
  const suspicious = suspiciousBlob(label, content);
  if (suspicious !== null) violations.push(`${suspicious}（履歴の全blob検査）`);
}

if (reachableQuestionRecords > 50) {
  violations.push(`履歴全blobの累積採点情報マーカーを検出しました（問題レコード${reachableQuestionRecords}、マーカー${reachableSensitiveMarkers}）`);
}

const trackedFiles = git(['ls-files', '-z']).split('\0').filter(Boolean);
for (const file of trackedFiles) {
  if (isForbiddenPath(file)) violations.push(`${file}（現在の追跡path）`);
}

violations.push(...checkPrivateDirectoryPermissions());

if (violations.length > 0) {
  process.stderr.write(`公開・非公開コンテンツ境界違反を検出しました（履歴、blob、path、権限を検査）:\n${violations.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('公開・非公開コンテンツ境界: reachable history/blob、任意拡張子、rename/split path、private権限を検査して合格\n');
}
