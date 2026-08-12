import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

const workflowsUrl = new URL('../.github/workflows/', import.meta.url);
const rulesetUrl = new URL('../.github/rulesets/main.json', import.meta.url);
const ciWorkflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);
const setupCliSha = '46f7f98c7f948ad727d22c1e67fab04c223a0520';

describe('GitHub Actionsの信頼境界', () => {
  it('外部Actionを検証済みの40桁commit SHAへ固定する', async () => {
    const workflowNames = (await readdir(workflowsUrl)).filter((name) => name.endsWith('.yml')).sort();
    assert.ok(workflowNames.length > 0, 'Workflowがありません。');

    for (const workflowName of workflowNames) {
      const source = await readFile(new URL(workflowName, workflowsUrl), 'utf8');
      const actions = [...source.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s#]+)/gmu)];
      assert.ok(actions.length > 0, `${workflowName}に検査対象Actionがありません。`);
      for (const action of actions) {
        assert.match(action[2] ?? '', /^[0-9a-f]{40}$/u, `${workflowName}の${action[1] ?? '不明なAction'}がfull SHA固定ではありません。`);
      }
    }
  });

  it('必須checkをGitHub Actions Appの発行に限定する', async () => {
    const parsed = JSON.parse(await readFile(rulesetUrl, 'utf8'));
    const statusRule = parsed.rules.find((rule) => rule.type === 'required_status_checks');
    assert.ok(statusRule, '必須checkのRulesetがありません。');
    const checks = statusRule.parameters.required_status_checks;
    assert.deepEqual(checks.map((check) => check.context).sort(), ['database', 'e2e', 'pages', 'quality', 'security']);
    for (const check of checks) assert.equal(check.integration_id, 15368, `${check.context}の発行元が固定されていません。`);
  });

  it('database jobで固定CLIによるreset・pgTAP・常時cleanupを強制する', async () => {
    const source = await readFile(ciWorkflowUrl, 'utf8');
    const databaseStart = source.indexOf('\n  database:');
    const databaseEnd = source.indexOf('\n  security:', databaseStart);
    assert.ok(databaseStart >= 0 && databaseEnd > databaseStart, 'database jobがありません。');
    const databaseJob = source.slice(databaseStart, databaseEnd);

    assert.match(databaseJob, /name: database/u);
    assert.match(databaseJob, /runs-on: ubuntu-latest/u);
    assert.match(databaseJob, /timeout-minutes: 20/u);
    assert.match(databaseJob, new RegExp(`uses: supabase/setup-cli@${setupCliSha}`, 'u'));
    assert.match(databaseJob, /version: 2\.113\.0/u);

    const startIndex = databaseJob.indexOf('run: supabase start');
    const resetIndex = databaseJob.indexOf('run: supabase db reset');
    const testIndex = databaseJob.indexOf('run: supabase test db');
    assert.ok(startIndex >= 0 && startIndex < resetIndex && resetIndex < testIndex, 'Supabase検証順が不正です。');
    assert.match(databaseJob, /if: failure\(\)[\s\S]*docker logs --tail 300 supabase_db_jstqb-study-app/u);
    assert.match(databaseJob, /if: always\(\)[\s\S]*supabase stop --no-backup/u);
    assert.doesNotMatch(databaseJob, /SUPABASE_(?:DB_PASSWORD|SERVICE_ROLE_KEY)|postgres(?:ql)?:\/\//u);
  });
});
