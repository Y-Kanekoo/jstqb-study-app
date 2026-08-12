import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { detectSecretFindings } from './check-secrets.mjs';
import { projectLabel, runDatabaseChecks } from './test-database.mjs';

const ciWorkflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

function createSpawnFixture(responses) {
  const calls = [];
  let responseIndex = 0;
  const spawnCommand = (command, argumentsList, options) => {
    calls.push({ command, argumentsList, options });
    const response = responses[responseIndex] ?? { status: 0, output: '' };
    responseIndex += 1;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      if (response.output) child.stdout.emit('data', response.output);
      child.emit('exit', response.status ?? 0, null);
    });
    return child;
  };
  return { calls, spawnCommand };
}

function containerList(id, name = `supabase_db_${projectLabel.split('=').at(-1)}`) {
  return `${id}\t${name}\n`;
}

function commandNames(calls) {
  return calls.map(({ command, argumentsList }) => `${command} ${argumentsList.join(' ')}`);
}

describe('PR #6レビュー回帰', () => {
  it('異種quoteを含む3種類のsecret代入を検出する', () => {
    const value = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 73 + 41) % 256)).toString('base64url');
    const findings = detectSecretFindings([
      `secret='${value}"'`,
      `token="${value}'"`,
      `password=\`${value}'\``,
    ].join('\n'));

    assert.ok(findings.includes('機密名へ代入された高エントロピー値'));
  });

  it('通常の変数補間は許可しtemplate式内のsecret literalを検出する', () => {
    const value = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 73 + 41) % 256)).toString('base64url');

    assert.deepEqual(detectSecretFindings('const token = `prefix-${userId}-${sessionId}`;'), []);
    assert.ok(detectSecretFindings(`const secret = \`\${readSecret("${value}")}\`;`)
      .includes('機密名へ代入された高エントロピー値'));
  });

  it('空白・改行を含むtemplate式内のsecret literalを検出する', () => {
    const value = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 73 + 41) % 256)).toString('base64url');
    const spaced = `const secret = \`\${ readSecret("${value}") }\`;`;
    const multiline = `const apiToken = \`prefix-\${\n  readSecret(\n    '${value}'\n  )\n}\`;`;

    assert.ok(detectSecretFindings(spaced).includes('機密名へ代入された高エントロピー値'));
    assert.ok(detectSecretFindings(multiline).includes('機密名へ代入された高エントロピー値'));
  });

  it('全checkoutで資格情報永続化を無効化しDB cleanup契約を固定する', async () => {
    const source = await readFile(ciWorkflowUrl, 'utf8');
    const checkoutUses = [...source.matchAll(/^\s*uses:\s+actions\/checkout@[^\n]+$/gmu)];
    assert.ok(checkoutUses.length > 0, 'checkoutがありません。');
    for (const [index, checkout] of checkoutUses.entries()) {
      const start = checkout.index ?? 0;
      const nextStep = source.indexOf('\n      - name:', start);
      assert.match(source.slice(start, nextStep === -1 ? source.length : nextStep), /persist-credentials:\s*false/u, `checkout ${index + 1}が不正です。`);
    }
    for (const required of ['repo共通lock', 'container_query_attempts=3', 'known=true', 'finish_cleanup']) {
      assert.ok(source.includes(required), `DB cleanup契約が不足しています: ${required}`);
    }
  });

  it('一時的なDocker照会失敗後に所有権を確定してcleanupする', async () => {
    const expectedName = `supabase_db_${projectLabel.split('=').at(-1)}`;
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 1, output: 'docker daemon is busy' },
      { status: 0, output: containerList('db-id-1', expectedName) },
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('db-id-2', expectedName) },
      { status: 0, output: '' },
      { status: 0, output: '' },
    ]);

    assert.equal(await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, acquireLock: async () => async () => {}, log: { error() {} } }), 0);
    assert.ok(commandNames(fixture.calls).includes('supabase stop --no-backup'));
  });

  it('所有権照会が3回失敗したらstopしない', async () => {
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 1, output: 'docker unavailable 1' },
      { status: 1, output: 'docker unavailable 2' },
      { status: 1, output: 'docker unavailable 3' },
    ]);
    const errors = [];

    assert.equal(await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, acquireLock: async () => async () => {}, log: { error(message) { errors.push(message); } } }), 1);
    assert.ok(!commandNames(fixture.calls).includes('supabase stop --no-backup'));
    assert.ok(errors.some((message) => message.includes('3回すべて失敗')));
  });

  it('cleanup失敗をstopの終了コードとして伝播する', async () => {
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('owned') },
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('owned') },
      { status: 9, output: 'stop failed' },
      { status: 0, output: containerList('owned') },
    ]);

    assert.equal(await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, acquireLock: async () => async () => {}, log: { error() {} } }), 9);
    assert.ok(commandNames(fixture.calls).includes('supabase stop --no-backup'));
  });
});
