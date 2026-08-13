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

function createSpawnSequence(definitions, children) {
  return () => {
    const definition = definitions.shift();
    if (definition === undefined) throw new Error('想定外のcommandが実行されました。');
    const child = createChild(definition);
    children.push(child);
    return child;
  };
}

const lockDirectory = join(
  tmpdir(),
  '.supabase-database-ci-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.lock',
);
const ownership = `known=true\nname=supabase_db_jstqb-study-app\nlock=${lockDirectory}\n`;
const containerOutput = 'one\tsupabase_db_jstqb-study-app\n';

describe('DB harness signal・cleanup timeout回帰', () => {
  it('signal受信時は5分timeoutを待たずTERM/KILL後にfinally cleanupしlistenerを除去する', async () => {
    const signalTarget = new EventEmitter();
    const children = [];
    let released = false;
    const releaseLock = async () => { released = true; };
    releaseLock.lockDirectory = lockDirectory;
    const spawnCommand = createSpawnSequence([
      { onSpawn: () => signalTarget.emit('SIGTERM') },
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
    assert.deepEqual(children[0].killSignals, ['SIGTERM', 'SIGKILL']);
    assert.equal(children.length, 3, 'finally cleanupの2回の所有照会まで完了する');
    assert.equal(released, true);
    assert.equal(signalTarget.listenerCount('SIGINT'), 0);
    assert.equal(signalTarget.listenerCount('SIGTERM'), 0);
  });

  for (const scenario of [
    { label: '最初のdocker ps', definitions: [{}], hangingIndex: 0 },
    {
      label: 'supabase stop',
      definitions: [{ output: containerOutput, status: 0 }, {}],
      hangingIndex: 1,
    },
    {
      label: '停止後のdocker ps再照会',
      definitions: [
        { output: containerOutput, status: 0 },
        { output: '', status: 0 },
        {},
      ],
      hangingIndex: 2,
    },
  ]) {
    it(`outer cleanupの${scenario.label}がhangしてもbounded失敗する`, async () => {
      const children = [];
      const errors = [];
      const status = await cleanupDatabaseHarness({
        ownershipFile: '/tmp/db-harness-ownership',
        spawnCommand: createSpawnSequence([...scenario.definitions], children),
        readOwnershipFile: async () => ownership,
        removeOwnershipFile: async () => {},
        removeLockDirectory: async () => {},
        commandTimeoutMs: 20,
        terminationGraceMs: 10,
        log: { error(message) { errors.push(message); } },
      });

      assert.equal(status, 124);
      assert.deepEqual(children[scenario.hangingIndex].killSignals, ['SIGTERM', 'SIGKILL']);
      assert.equal(errors.some((message) => message.includes('制限時間20ms')), true);
      assert.equal(errors.some((message) => /password|token=|secret=/u.test(message)), false);
    });
  }
});
