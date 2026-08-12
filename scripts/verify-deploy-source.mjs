import { appendFile } from 'node:fs/promises';

const repository = requiredEnvironment('GITHUB_REPOSITORY');
const token = requiredEnvironment('GITHUB_TOKEN');
const sourceEvent = requiredEnvironment('SOURCE_EVENT');
const sourceSha = requiredEnvironment('SOURCE_SHA');
const defaultBranch = requiredEnvironment('DEFAULT_BRANCH');
const sourceRunId = process.env.SOURCE_RUN_ID?.trim() ?? '';
const githubRef = process.env.GITHUB_REF?.trim() ?? '';

if (!/^[0-9a-f]{40}$/u.test(sourceSha)) {
  throw new Error('デプロイ対象SHAは40桁のGit commit SHAである必要があります。');
}

async function githubApi(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'jstqb-study-app-deploy-verifier',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub APIの検証に失敗しました: ${response.status} ${path}`);
  }
  return response.json();
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}が設定されていません。`);
  return value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record, field) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`GitHub API応答に${field}がありません。`);
  }
  return value;
}

async function findManualSourceRun() {
  const expectedRef = `refs/heads/${defaultBranch}`;
  if (githubRef !== expectedRef) {
    throw new Error(`手動デプロイは${expectedRef}からだけ実行できます。`);
  }

  const branchResponse = await githubApi(`/repos/${repository}/branches/${encodeURIComponent(defaultBranch)}`);
  if (!isRecord(branchResponse) || !isRecord(branchResponse.commit) || requiredString(branchResponse.commit, 'sha') !== sourceSha) {
    throw new Error('手動デプロイ対象が現在のmain先頭と一致しません。最新mainで再実行してください。');
  }

  const query = new URLSearchParams({
    branch: defaultBranch,
    event: 'push',
    head_sha: sourceSha,
    per_page: '100',
    status: 'success',
  });
  const response = await githubApi(`/repos/${repository}/actions/workflows/ci.yml/runs?${query.toString()}`);
  if (!isRecord(response) || !Array.isArray(response.workflow_runs)) {
    throw new Error('品質検査の実行履歴を取得できません。');
  }
  const run = response.workflow_runs.find((value) => isRecord(value) && value.head_sha === sourceSha && value.event === 'push');
  if (!isRecord(run)) {
    throw new Error('現在のmain SHAに成功済みの品質検査がありません。');
  }
  return run;
}

async function findAutomaticSourceRun() {
  if (!/^\d+$/u.test(sourceRunId)) {
    throw new Error('自動デプロイ元の品質検査IDが不正です。');
  }
  const run = await githubApi(`/repos/${repository}/actions/runs/${sourceRunId}`);
  if (!isRecord(run)) throw new Error('自動デプロイ元の品質検査を取得できません。');
  return run;
}

async function verifyRequiredJobs(runId) {
  const response = await githubApi(`/repos/${repository}/actions/runs/${runId}/jobs?filter=all&per_page=100`);
  if (!isRecord(response) || !Array.isArray(response.jobs)) {
    throw new Error('品質検査のjob一覧を取得できません。');
  }
  const requiredJobs = ['database', 'e2e', 'pages', 'quality', 'security'];
  const failed = requiredJobs.filter((name) => !response.jobs.some(
    (job) => isRecord(job) && job.name === name && job.status === 'completed' && job.conclusion === 'success',
  ));
  if (failed.length > 0) {
    throw new Error(`本番デプロイに必要な検査が成功していません: ${failed.join(', ')}`);
  }
}

if (sourceEvent !== 'workflow_dispatch' && sourceEvent !== 'workflow_run') {
  throw new Error(`未対応のデプロイトリガーです: ${sourceEvent}`);
}
const run = sourceEvent === 'workflow_dispatch' ? await findManualSourceRun() : await findAutomaticSourceRun();
const runId = run.id;
if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('品質検査IDが不正です。');
if (
  requiredString(run, 'head_sha') !== sourceSha
  || requiredString(run, 'head_branch') !== defaultBranch
  || requiredString(run, 'event') !== 'push'
  || requiredString(run, 'path') !== '.github/workflows/ci.yml'
  || requiredString(run, 'status') !== 'completed'
  || requiredString(run, 'conclusion') !== 'success'
) {
  throw new Error('デプロイ元はmainへのpushで全体成功した品質検査ではありません。');
}
await verifyRequiredJobs(runId);

const outputPath = requiredEnvironment('GITHUB_OUTPUT');
await appendFile(outputPath, `commit_sha=${sourceSha}\nsource_run_id=${runId}\n`, 'utf8');
console.log(`検査済みmain commit ${sourceSha}（品質検査 ${runId}）を本番デプロイ対象として承認しました。`);
