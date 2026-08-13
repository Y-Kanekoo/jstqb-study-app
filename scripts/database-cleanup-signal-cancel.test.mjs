import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

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
  '.supabase-database-ci-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.lock',
);

describe('DB harness cleanup中signal回帰', () => {
  it('cleanup command開始後のsignalを長いtimeoutより先にTERM/KILLへ収束させる', async () => {
    const signalTarget = new EventEmitter();
    const children = [];
    let released = false;
    const releaseLock = async () => { released = true; };
    releaseLock.lockDirectory = lockDirectory;
    const spawnCommand = createSpawnSequence([
      { output: '', status: 1 },
      { onSpawn: () => signalTarget.emit('SIGTERM') },
    ], children);

    const status = await runProductionDatabaseHarness({
      spawnCommand,
      acquireLock: async () => releaseLock,
      signalTarget,
      commandTimeoutMs: 60_000,
      cleanupCommandTimeoutMs: 60_000,
      terminationGraceMs: 10,
      log: { error() {}, info() {} },
    });

    assert.equal(status, 1);
    assert.equal(children.length, 2, 'cleanupの最初の所有照会でsignalを受信する');
    assert.deepEqual(children[1].killSignals, ['SIGTERM', 'SIGKILL']);
    assert.equal(released, true);
    assert.equal(signalTarget.listenerCount('SIGINT'), 0);
    assert.equal(signalTarget.listenerCount('SIGTERM'), 0);
  });
});
