import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

const originalFetch = globalThis.fetch;
const sourceSha = 'a'.repeat(40);
const baseRun = {
  id: 12345,
  conclusion: 'success',
  event: 'push',
  head_branch: 'main',
  head_sha: sourceSha,
  path: '.github/workflows/ci.yml',
  status: 'completed',
};
const successfulJobs = ['quality', 'database', 'e2e', 'pages', 'security'].map((name) => ({
  conclusion: 'success',
  name,
  status: 'completed',
}));
let importSequence = 0;

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function installGithubApiFixture(jobs = successfulJobs) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/branches/main')) return jsonResponse({ commit: { sha: sourceSha } });
    if (url.pathname.endsWith('/actions/workflows/ci.yml/runs')) return jsonResponse({ workflow_runs: [baseRun] });
    if (url.pathname.endsWith('/actions/runs/12345/jobs')) return jsonResponse({ jobs });
    if (url.pathname.endsWith('/actions/runs/12345')) return jsonResponse(baseRun);
    return new Response(null, { status: 404 });
  };
}

async function executeVerifier() {
  importSequence += 1;
  return import(`./verify-deploy-source.mjs?fixture=${importSequence}`);
}

beforeEach(async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'jstqb-deploy-verifier-'));
  Object.assign(process.env, {
    DEFAULT_BRANCH: 'main',
    GITHUB_OUTPUT: join(temporaryDirectory, 'output.txt'),
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'example/jstqb-study-app',
    GITHUB_TOKEN: 'fixture-token',
    SOURCE_EVENT: 'workflow_dispatch',
    SOURCE_RUN_ID: '',
    SOURCE_SHA: sourceSha,
  });
  installGithubApiFixture();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('本番デプロイ元検証', () => {
  it('現在のmainで5検査が成功したcommitだけを承認する', async () => {
    await executeVerifier();
    const output = await readFile(process.env.GITHUB_OUTPUT, 'utf8');
    assert.match(output, new RegExp(`commit_sha=${sourceSha}`, 'u'));
    assert.match(output, /source_run_id=12345/u);
  });

  it('main以外からの手動実行を拒否する', async () => {
    process.env.GITHUB_REF = 'refs/heads/feature';
    await assert.rejects(executeVerifier(), /手動デプロイはrefs\/heads\/mainからだけ実行できます。/u);
  });

  it('必須検査が1件でも失敗した実行を拒否する', async () => {
    installGithubApiFixture(successfulJobs.filter((job) => job.name !== 'database'));
    await assert.rejects(executeVerifier(), /本番デプロイに必要な検査が成功していません: database/u);
  });
});
