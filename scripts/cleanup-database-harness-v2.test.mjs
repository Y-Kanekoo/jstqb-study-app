import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanupDatabaseHarness } from './cleanup-database-harness.mjs';

function commandResult(output, status = 0) {
  return { output, status };
}

function createSpawn(results, calls) {
  return (command, argumentsList) => {
    calls.push([command, argumentsList]);
    const result = results.shift() ?? commandResult('');
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (result.output !== '') child.stdout.emit('data', result.output);
      child.emit('exit', result.status, null);
    });
    return child;
  };
}

const lockDirectory = join(
  tmpdir(),
  '.supabase-database-ci-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.lock',
);
const ownership = `known=true\nname=supabase_db_jstqb-study-app\nlock=${lockDirectory}\n`;

describe('DB harness外側cleanup', () => {
  it('所有証跡と同名のcontainerだけを停止し残留0を確認する', async () => {
    const calls = [];
    let removedLock;
    const status = await cleanupDatabaseHarness({
      ownershipFile: '/tmp/owned',
      spawnCommand: createSpawn([
        commandResult('one\tsupabase_db_jstqb-study-app\n'),
        commandResult(''),
        commandResult(''),
      ], calls),
      readOwnershipFile: async () => ownership,
      removeOwnershipFile: async () => {},
      removeLockDirectory: async (path) => { removedLock = path; },
    });
    assert.equal(status, 0);
    assert.equal(calls.some(([command, argumentsList]) => command === 'supabase' && argumentsList[0] === 'stop'), true);
    assert.equal(removedLock, lockDirectory);
  });

  it('未知の同project containerがあれば停止しない', async () => {
    const calls = [];
    const status = await cleanupDatabaseHarness({
      ownershipFile: '/tmp/owned',
      spawnCommand: createSpawn([
        commandResult('one\tsupabase_db_jstqb-study-app\ntwo\tsupabase_api_jstqb-study-app\n'),
      ], calls),
      readOwnershipFile: async () => ownership,
      removeOwnershipFile: async () => {},
      removeLockDirectory: async () => {},
      log: { error() {} },
    });
    assert.equal(status, 1);
    assert.equal(calls.some(([command]) => command === 'supabase'), false);
  });

  it('container開始前のlock-only証跡でもcontainer 0ならlockを回収する', async () => {
    let removedLock;
    const status = await cleanupDatabaseHarness({
      ownershipFile: '/tmp/owned',
      spawnCommand: createSpawn([commandResult(''), commandResult('')], []),
      readOwnershipFile: async () => `known=false\nlock=${lockDirectory}\n`,
      removeOwnershipFile: async () => {},
      removeLockDirectory: async (path) => { removedLock = path; },
    });
    assert.equal(status, 0);
    assert.equal(removedLock, lockDirectory);
  });
});
