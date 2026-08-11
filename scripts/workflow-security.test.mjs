import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

const workflowsUrl = new URL('../.github/workflows/', import.meta.url);
const rulesetUrl = new URL('../.github/rulesets/main.json', import.meta.url);

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
    assert.deepEqual(checks.map((check) => check.context).sort(), ['e2e', 'pages', 'quality', 'security']);
    for (const check of checks) assert.equal(check.integration_id, 15368, `${check.context}の発行元が固定されていません。`);
  });
});
