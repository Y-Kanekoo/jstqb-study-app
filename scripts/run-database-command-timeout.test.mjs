import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import { createCommandRunner } from './run-database-harness.mjs';

function createFakeChild({ exitImmediately = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.killSignals = [];
  child.kill = (signal) => {
    child.killSignals.push(signal);
    return true;
  };
  if (exitImmediately) queueMicrotask(() => child.emit('exit', 0, null));
  return child;
}

describe('database command timeout', () => {
  it('応答しないchildをSIGTERMからSIGKILLの順で停止して必ず完了する', async () => {
    const child = createFakeChild();
    const activeChildren = new Set();
    const runCommand = createCommandRunner(() => child, activeChildren, {
      commandTimeoutMs: 20,
      terminationGraceMs: 10,
    });
    queueMicrotask(() => child.stdout.emit('data', 'password=表示してはならない値'));

    const result = await runCommand('hanging-command', ['--secret', '表示してはならない値']);

    assert.equal(result.status, 124);
    assert.match(result.output, /制限時間20ms/u);
    assert.doesNotMatch(result.output, /password|表示してはならない値|--secret/u);
    assert.deepEqual(child.killSignals, ['SIGTERM', 'SIGKILL']);
    assert.equal(activeChildren.size, 0);
  });

  it('正常終了時はtimeout timerを解除して後からkill・二重完了しない', async () => {
    const child = createFakeChild({ exitImmediately: true });
    const activeChildren = new Set();
    const runCommand = createCommandRunner(() => child, activeChildren, {
      commandTimeoutMs: 20,
      terminationGraceMs: 10,
    });

    const result = await runCommand('successful-command', []);
    await new Promise((resolveResult) => setTimeout(resolveResult, 50));

    assert.deepEqual(result, { status: 0, output: '' });
    assert.deepEqual(child.killSignals, []);
    assert.equal(activeChildren.size, 0);
  });
});
