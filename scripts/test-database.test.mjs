import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import { projectLabel, runDatabaseChecks } from './test-database.mjs';

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
      child.emit('exit', response.status ?? 0, response.signal ?? null);
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

describe('ローカルSupabase database runner', () => {
  it('同project既存containerがあればreset/stopを実行しない', async () => {
    const fixture = createSpawnFixture([{ status: 0, output: containerList('existing') }]);
    const status = await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, log: { error() {} } });

    assert.equal(status, 1);
    assert.deepEqual(commandNames(fixture.calls), [
      `docker ps --all --filter label=${projectLabel} --format {{.ID}}\\t{{.Names}}`,
    ]);
  });

  it('other projectのcontainerは無視して対象projectだけを検査する', async () => {
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('owned') },
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('owned') },
      { status: 0, output: '' },
    ]);
    const status = await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, log: { error() {} } });

    assert.equal(status, 0);
    assert.ok(commandNames(fixture.calls).includes('supabase db reset'));
    assert.ok(commandNames(fixture.calls).includes('supabase test db'));
    assert.ok(commandNames(fixture.calls).includes('supabase stop --no-backup'));
    assert.ok(commandNames(fixture.calls).every((name) => !name.includes('name=supabase_')));
    assert.ok(fixture.calls
      .filter(({ command }) => command === 'docker')
      .every(({ argumentsList }) => argumentsList.includes(`label=${projectLabel}`)));
  });

  it('start失敗時に自分が開始したcontainerだけをcleanupする', async () => {
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 1, output: 'start failed: password=local-secret' },
      { status: 0, output: containerList('started') },
      { status: 0, output: containerList('started') },
      { status: 0, output: '' },
      { status: 0, output: containerList('started') },
      { status: 0, output: '' },
      { status: 0, output: '' },
    ]);
    const status = await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, log: { error() {} } });
    const names = commandNames(fixture.calls);

    assert.equal(status, 1);
    assert.ok(names.includes('supabase stop --no-backup'));
    assert.ok(!names.includes('supabase db reset'));
    assert.ok(!names.includes('supabase test db'));
  });

  it('test失敗のexit codeを伝播する', async () => {
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('owned') },
      { status: 0, output: '' },
      { status: 7, output: 'pgTAP failed' },
      { status: 0, output: containerList('owned') },
      { status: 0, output: '' },
      { status: 0, output: '' },
    ]);

    assert.equal(await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, log: { error() {} } }), 7);
  });

  it('cleanup失敗のexit codeを伝播する', async () => {
    const fixture = createSpawnFixture([
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 0, output: containerList('owned') },
      { status: 0, output: '' },
      { status: 0, output: '' },
      { status: 9, output: 'stop failed' },
      { status: 0, output: containerList('owned') },
    ]);

    assert.equal(await runDatabaseChecks({ spawnCommand: fixture.spawnCommand, log: { error() {} } }), 9);
  });
});
