import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { cleanupDatabaseHarness } from './cleanup-database-harness.mjs';
import { runProductionDatabaseHarness } from './run-database-harness.mjs';

function createChild({ output = '', status, onSpawn } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.killSignals = [];
  child.kill = (signal) => {
    child.killSignals.push(signal);
    return true;
  };
  queueMicrotask(() => {
    onSpawn?.();
    if (output !== '') child.stdout.emit('data', output);
    if (status !== undefined) child.emit('exit', status, null);
  });
  return child;
}

function createSpawnSequence(definitions, children, calls = []) {
  return (command, argumentsList) => {
    calls.push([command, argumentsList]);
    const definition = definitions.shift();
    if (definition === undefined) throw new Error('想定外のcommandが実行されました。');
    const child = createChild(definition);
    children.push(child);
    return child;
  };
}

const lockDirectory = join(
  tmpdir(),
  '.supabase-database-ci-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.lock',
);

describe('DB review nitpick回帰', () => {
  it('所有証跡を読めない場合はcontainerがあっても停止しない', async () => {
    const calls = [];
    const status = await cleanupDatabaseHarness({
      ownershipFile: '/tmp/db-harness-ownership',
      spawnCommand: createSpawnSequence([
        { output: 'one\tsupabase_db_jstqb-study-app\n', status: 0 },
      ], [], calls),
      readOwnershipFile: async () => { throw new Error('所有証跡を読めません。'); },
      removeOwnershipFile: async () => {},
      removeLockDirectory: async () => {},
      log: { error() {} },
    });

    assert.equal(status, 1);
    assert.equal(calls.some(([command]) => command === 'supabase'), false);
  });

  it('2回目のsignalもNode既定終了へ落とさずfinally後にlistenerを除去する', async () => {
    const signalTarget = new EventEmitter();
    const children = [];
    const listenerCounts = [];
    let released = false;
    const releaseLock = async () => { released = true; };
    releaseLock.lockDirectory = lockDirectory;
    const spawnCommand = createSpawnSequence([
      {
        onSpawn: () => {
          signalTarget.emit('SIGTERM');
          listenerCounts.push(signalTarget.listenerCount('SIGTERM'));
          signalTarget.emit('SIGTERM');
          listenerCounts.push(signalTarget.listenerCount('SIGTERM'));
        },
      },
      { output: '', status: 0 },
      { output: '', status: 0 },
    ], children);

    const status = await runProductionDatabaseHarness({
      spawnCommand,
      acquireLock: async () => releaseLock,
      signalTarget,
      commandTimeoutMs: 60_000,
      cleanupCommandTimeoutMs: 100,
      terminationGraceMs: 10,
      log: { error() {}, info() {} },
    });

    assert.equal(status, 1);
    assert.deepEqual(listenerCounts, [1, 1]);
    assert.deepEqual(children[0].killSignals, ['SIGTERM', 'SIGKILL']);
    assert.equal(released, true);
    assert.equal(signalTarget.listenerCount('SIGINT'), 0);
    assert.equal(signalTarget.listenerCount('SIGTERM'), 0);
  });
});
