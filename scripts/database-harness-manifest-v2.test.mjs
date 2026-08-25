import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import {
  failureSnapshotScopes,
  registeredUpgradeFailureIds,
  registeredUpgradeScenarioIds,
  verifyDatabaseFixtureManifestV2,
  verifyM1ScenarioRegistration,
} from './database-boundary.mjs';
import {
  buildLegacyWriterRaceExecutionSql,
  buildLegacyWriterRaceReleaseSql,
  calculateCanonicalSchemaSignature,
  enumeratePgTapTestFiles,
  createPersistentPsqlConnection,
  executeRegisteredUpgradeScenario,
  extractExactSqlStateTokens,
  hasExactCauseCodeToken,
  loadDeclaredProductionBoundaryCanaries,
  loadDatabaseHarnessContracts,
  materializeRegisteredFailureScenario,
  runRegisteredUpgradeFailures,
  runRegisteredUpgradeScenarios,
  runRegisteredWriteRaces,
  runProductionDatabaseHarness,
  runTwoConnectionTableLockRace,
  selectGenericPgTapFiles,
} from './run-database-harness.mjs';

const ciWorkflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);
const databaseHarnessRunnerUrl = new URL('./run-database-harness.mjs', import.meta.url);

async function loadActualContract() {
  const result = await loadDatabaseHarnessContracts();
  assert.equal(result.ok, true, result.errors?.join('\n'));
  return result.value;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function createRegisteredM1Contract(contract) {
  const targetMigration = '20260814000200_learning_foundation_v2.sql';
  const targetContent = 'select 1;\n';
  const fixtureFiles = contract.fixtureFiles
    .filter(({ path }) => path !== 'manifest.json')
    .map(({ path, content }) => ({ path, content }));
  const addFixture = (path, content = 'select 1;\n') => fixtureFiles.push({ path, content });
  const scenarios = registeredUpgradeScenarioIds.map((id) => {
    const fixturePath = `upgrade-scenarios/${id}.sql`;
    const assertionPath = `upgrade-assertions/${id}.sql`;
    addFixture(fixturePath);
    addFixture(assertionPath);
    return {
      id,
      baseId: 'pr9-main-00411ef',
      fixturePath,
      fixtureSha256: sha256('select 1;\n'),
      targetMigration,
      assertionPath,
      assertionSha256: sha256('select 1;\n'),
    };
  });
  const failures = registeredUpgradeFailureIds.map((id) => {
    const fixturePath = `upgrade-failures/${id}.sql`;
    addFixture(fixturePath);
    return {
      id,
      causeCode: id.slice(3).replaceAll('-', '_'),
      baseId: 'pr9-main-00411ef',
      fixturePath,
      fixtureSha256: sha256('select 1;\n'),
      targetMigration,
      expectedSqlState: '23514',
      expectedError: id.slice(3).replaceAll('-', '_'),
      residueObjects: ['public.fixture_probe'],
      snapshotScopes: [...failureSnapshotScopes],
    };
  });
  const raceFixturePath = 'upgrade-races/m1-legacy-write-race.sql';
  const writerPath = 'upgrade-races/m1-legacy-write-race-writer.sql';
  addFixture(raceFixturePath);
  addFixture(writerPath);
  const v2Suite = { path: 'database_harness_security_v2.test.sql', content: 'select 1;\n' };
  const pgTapFiles = [...contract.pgTapFiles, v2Suite].sort((left, right) => compareUtf8(left.path, right.path));
  const pgTapByPath = new Map(pgTapFiles.map(({ path, content }) => [path, sha256(content)]));
  const phaseDefinitions = [
    ['atomic-failure-reapply-post', 'atomic-failure', 'clean-reapply-post', v2Suite.path],
    ['fresh-head', 'fresh', 'post-head', v2Suite.path],
    ['m1-normal-post', 'origin-main-upgrade', 'normal-scenario-post', v2Suite.path],
    ['m1-race-post', 'combined-order', 'race-reapply-post', v2Suite.path],
    ['origin-main-upgrade-base', 'origin-main-upgrade', 'pre-target', 'database_harness_security.test.sql'],
    ['origin-main-upgrade-post', 'origin-main-upgrade', 'post-target', v2Suite.path],
    ['production-boundary-head', 'production-boundary', 'fixture-free-head', v2Suite.path],
  ];
  const fixtureManifest = structuredClone(contract.fixtureManifest);
  fixtureManifest.m1ScenarioState = 'registered';
  fixtureManifest.targetMigration = targetMigration;
  fixtureManifest.files = fixtureFiles.map(({ path, content }) => ({ path, sha256: sha256(content) }))
    .sort((left, right) => compareUtf8(left.path, right.path));
  fixtureManifest.pgTapFiles = [{
    path: 'database_smoke.test.sql',
    sha256: pgTapByPath.get('database_smoke.test.sql'),
  }];
  fixtureManifest.phasePgTapFiles = phaseDefinitions.map(([id, phase, checkpoint, path]) => ({
    id,
    path,
    sha256: pgTapByPath.get(path),
    phase,
    checkpoint,
  }));
  fixtureManifest.genericPgTapExclusions = [
    'database_harness_security.test.sql',
    'database_harness_security_v2.test.sql',
  ];
  fixtureManifest.upgradeScenarios = scenarios;
  fixtureManifest.upgradeFailures = failures;
  fixtureManifest.writeRaces = [{
    id: 'm1-legacy-write-race',
    baseId: 'pr9-main-00411ef',
    fixturePath: raceFixturePath,
    fixtureSha256: sha256('select 1;\n'),
    targetMigration,
    writerPath,
    writerSha256: sha256('select 1;\n'),
    barrierProtocol: 'two-connection-table-lock-v1',
  }];
  const fixtureManifestContent = `${JSON.stringify(fixtureManifest)}\n`;
  fixtureFiles.push({ path: 'manifest.json', content: fixtureManifestContent });
  const manifest = structuredClone(contract.manifest);
  manifest.migrations.push({ file: targetMigration, sha256: sha256(targetContent) });
  return {
    ...contract,
    fixtureManifest,
    fixtureManifestContent,
    fixtureFiles,
    pgTapFiles,
    manifest,
    headMigrationFiles: [...contract.headMigrationFiles, { path: targetMigration, content: targetContent }],
  };
}

function createChild(output = '') {
  const child = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  queueMicrotask(() => {
    if (output !== '') child.stdout.emit('data', output);
    child.emit('exit', 0, null);
  });
  return child;
}

function createRegisteredPhaseSpawn(calls) {
  let databaseRunning = false;
  return (command, argumentsList) => {
    calls.push([command, argumentsList]);
    if (command === 'docker' && argumentsList[0] === 'ps') {
      return createChild(databaseRunning ? 'unit\tsupabase_db_jstqb-study-app\n' : '');
    }
    if (command === 'supabase' && argumentsList[0] === 'start') {
      databaseRunning = true;
      return createChild();
    }
    if (command === 'supabase' && argumentsList[0] === 'stop') {
      databaseRunning = false;
      return createChild();
    }
    if (command === 'supabase' && (argumentsList[0] === 'db' || argumentsList[0] === 'test')) return createChild();
    if (command === 'docker' && argumentsList[0] === 'exec') return createChild('61\n');
    throw new Error(`registered phase stubの想定外commandです: ${command} ${argumentsList.join(' ')}`);
  };
}

describe('DB harness manifest v2', () => {
  it('pre-M1 manifestは固定base、README、generic/phase分離の完全一覧を満たす', async () => {
    const contract = await loadActualContract();
    const { fixtureManifest } = contract;
    const result = verifyDatabaseFixtureManifestV2({
      manifest: fixtureManifest,
      fixtureFiles: contract.fixtureFiles.filter(({ path }) => path !== 'manifest.json'),
      pgTapFiles: contract.pgTapFiles,
    });

    assert.deepEqual(result, { ok: true, errors: [] });
    assert.equal(fixtureManifest.m1ScenarioState, 'not-registered');
    assert.equal(fixtureManifest.targetMigration, null);
    assert.equal(fixtureManifest.base.commitSha, '00411ef12777fdda151a66833598f6805fdfdf63');
    assert.deepEqual(fixtureManifest.files.find(({ path }) => path === 'README.md'), {
      path: 'README.md',
      sha256: 'cc91b0ebc0b28fc3ffba1b97376268ead9635f7661829cfef35f42661d53b982',
    });
    assert.equal(fixtureManifest.files.some(({ path }) => path === 'manifest.json'), false);
    assert.deepEqual(fixtureManifest.phasePgTapFiles, [{
      id: 'origin-main-upgrade-base',
      path: 'database_harness_security.test.sql',
      sha256: '3e1e8c886238909f5e042cbecdba3b64fa020f656e5098b6218bcbf1e831c0aa',
      phase: 'origin-main-upgrade',
      checkpoint: 'pre-target',
    }]);
  });

  it('unknown、temporary、symlink相当pathとprofile中間状態をfail-closedで拒否する', async () => {
    const contract = await loadActualContract();
    const malformed = structuredClone(contract.fixtureManifest);
    malformed.files.push({ path: 'unknown.tmp', sha256: 'a'.repeat(64) });
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: malformed,
      fixtureFiles: contract.fixtureFiles.filter(({ path }) => path !== 'manifest.json'),
      pgTapFiles: contract.pgTapFiles,
    }).ok, false);

    const intermediate = structuredClone(contract.fixtureManifest);
    intermediate.m1ScenarioState = 'registered';
    intermediate.targetMigration = '20260814000200_learning_foundation_v2.sql';
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: intermediate,
      fixtureFiles: contract.fixtureFiles.filter(({ path }) => path !== 'manifest.json'),
      pgTapFiles: contract.pgTapFiles,
    }).ok, false);

    const structurallyMalformed = structuredClone(contract.fixtureManifest);
    structurallyMalformed.base = null;
    structurallyMalformed.phasePgTapFiles = [null];
    assert.doesNotThrow(() => verifyDatabaseFixtureManifestV2({
      manifest: structurallyMalformed,
      fixtureFiles: contract.fixtureFiles.filter(({ path }) => path !== 'manifest.json'),
      pgTapFiles: contract.pgTapFiles,
    }));
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: structurallyMalformed,
      fixtureFiles: contract.fixtureFiles.filter(({ path }) => path !== 'manifest.json'),
      pgTapFiles: contract.pgTapFiles,
    }).ok, false);
  });

  it('旧security suiteをgenericから除外し、発見済みgenericだけを返す', async () => {
    const contract = await loadActualContract();
    const result = selectGenericPgTapFiles(contract.pgTapFiles, contract.fixtureManifest);

    assert.equal(result.ok, true);
    assert.deepEqual(result.files.map(({ path }) => path), ['database_smoke.test.sql']);
  });

  it('pgTAP再帰列挙はDFS順ではなくrelative full pathのUTF-8 byte順に固定する', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jstqb-pgtap-order-'));
    try {
      await mkdir(join(root, 'a'), { recursive: true });
      await mkdir(join(root, 'z'), { recursive: true });
      await writeFile(join(root, 'a-.test.sql'), 'select 1;\n', 'utf8');
      await writeFile(join(root, 'a', 'b.test.sql'), 'select 1;\n', 'utf8');
      await writeFile(join(root, 'z', 'é.test.sql'), 'select 1;\n', 'utf8');
      const files = await enumeratePgTapTestFiles(root);
      assert.deepEqual(files.map((path) => relative(root, path)), [
        'a-.test.sql',
        'a/b.test.sql',
        'z/é.test.sql',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('generic pgTAP選択はDFS由来の入力順をUTF-8 full path順へ正規化する', () => {
    const digest = (content) => createHash('sha256').update(content).digest('hex');
    const files = [
      { path: 'a/b.test.sql', content: 'b\n' },
      { path: 'a-.test.sql', content: 'dash\n' },
      { path: 'z/é.test.sql', content: 'utf8\n' },
    ];
    const manifest = {
      genericPgTapExclusions: [],
      pgTapFiles: [
        { path: 'a-.test.sql', sha256: digest('dash\n') },
        { path: 'a/b.test.sql', sha256: digest('b\n') },
        { path: 'z/é.test.sql', sha256: digest('utf8\n') },
      ],
    };
    const selected = selectGenericPgTapFiles(files, manifest);
    assert.equal(selected.ok, true);
    assert.deepEqual(selected.files.map(({ path }) => path), [
      'a-.test.sql',
      'a/b.test.sql',
      'z/é.test.sql',
    ]);
  });

  it('登録scenario/failure/raceをexact ID順で一度ずつ実行し、失敗後は後続を実行しない', async () => {
    const scenarioCalls = [];
    const scenarios = registeredUpgradeScenarioIds.map((id) => ({ id }));
    const scenarioResult = await runRegisteredUpgradeScenarios(scenarios, async ({ id }) => {
      scenarioCalls.push(id);
      return { status: 0, output: '' };
    });
    assert.equal(scenarioResult.status, 0);
    assert.deepEqual(scenarioCalls, registeredUpgradeScenarioIds);

    const failures = registeredUpgradeFailureIds.map((id) => ({ id }));
    const completeFailureCalls = [];
    const completeFailures = await runRegisteredUpgradeFailures(failures, async ({ id }) => {
      completeFailureCalls.push(id);
      return { status: 0, output: '' };
    });
    assert.equal(completeFailures.status, 0);
    assert.deepEqual(completeFailureCalls, registeredUpgradeFailureIds);

    const failureCalls = [];
    const failureResult = await runRegisteredUpgradeFailures(failures, async ({ id }) => {
      failureCalls.push(id);
      return id === registeredUpgradeFailureIds[2]
        ? { status: 1, output: '停止確認' }
        : { status: 0, output: '' };
    });
    assert.equal(failureResult.status, 1);
    assert.deepEqual(failureCalls, registeredUpgradeFailureIds.slice(0, 3));

    const raceCalls = [];
    const raceResult = await runRegisteredWriteRaces([{ id: 'm1-legacy-write-race' }], async ({ id }) => {
      raceCalls.push(id);
      return { status: 0, output: '' };
    });
    assert.equal(raceResult.status, 0);
    assert.deepEqual(raceCalls, ['m1-legacy-write-race']);

    const duplicate = await runRegisteredUpgradeScenarios([...scenarios, scenarios[0]], async () => {
      throw new Error('exact registry不一致時に実行してはいけません。');
    });
    assert.equal(duplicate.status, 1);
  });

  it('scenario実行はfixed base→fixture→migration→assertion→cleanupを順序固定する', async () => {
    const calls = [];
    const scenario = {
      id: 'm1-normal-upgrade',
      fixturePath: 'upgrade/m1-normal-upgrade.sql',
      assertionPath: 'upgrade/m1-normal-upgrade-assertion.sql',
    };
    const result = await executeRegisteredUpgradeScenario({
      scenario,
      prepareFixedBase: async () => { calls.push('base'); return { status: 0, root: 'isolated' }; },
      injectFixture: async () => { calls.push('fixture'); return { status: 0 }; },
      applyTargetMigration: async () => { calls.push('migration'); return { status: 0 }; },
      runAssertion: async () => { calls.push('assertion'); return { status: 0 }; },
      cleanup: async () => { calls.push('cleanup'); },
    });
    assert.equal(result.status, 0);
    assert.deepEqual(calls, ['base', 'fixture', 'migration', 'assertion', 'cleanup']);

    const failedCalls = [];
    const failed = await executeRegisteredUpgradeScenario({
      scenario,
      prepareFixedBase: async () => { failedCalls.push('base'); return { status: 0, root: 'isolated' }; },
      injectFixture: async () => { failedCalls.push('fixture'); return { status: 1 }; },
      applyTargetMigration: async () => { failedCalls.push('migration'); return { status: 0 }; },
      runAssertion: async () => { failedCalls.push('assertion'); return { status: 0 }; },
      cleanup: async () => { failedCalls.push('cleanup'); },
    });
    assert.equal(failed.status, 1);
    assert.deepEqual(failedCalls, ['base', 'fixture', 'cleanup']);
  });

  it('failure fixture basename・SQLSTATE・snapshot scopeをmaterialize時点で固定する', () => {
    const id = registeredUpgradeFailureIds[0];
    const target = { path: '20260814000200_learning_foundation_v2.sql', content: 'select 1;\n' };
    const failure = {
      id,
      fixturePath: `upgrade-failures/${id}.sql`,
      causeCode: id.slice(3).replaceAll('-', '_'),
      expectedError: id.slice(3).replaceAll('-', '_'),
      expectedSqlState: '23514',
      snapshotScopes: [...failureSnapshotScopes],
    };
    assert.equal(materializeRegisteredFailureScenario(failure, target).ok, true);
    assert.equal(materializeRegisteredFailureScenario({
      ...failure,
      fixturePath: 'upgrade-failures/other.sql',
    }, target).ok, false);
  });

  it('two persistent connection raceはlock待機確認後だけreleaseし、rollback→clean reapplyを固定する', async () => {
    const scenario = { id: 'm1-legacy-write-race', barrierProtocol: 'two-connection-table-lock-v1' };
    const calls = [];
    const blocker = {
      async prepare() { calls.push('blocker locked'); return { status: 0, blockerPid: 31 }; },
      async release() { calls.push('blocker release'); return { status: 0, output: '' }; },
      async close() { calls.push('blocker close'); return { status: 0, output: '' }; },
    };
    const writer = {
      async prepare() { calls.push('writer waiting request'); return { status: 0, writerPid: 41 }; },
      async release() { calls.push('writer abort'); return { status: 0, output: '' }; },
      async close() { calls.push('writer close'); return { status: 0, output: '' }; },
    };
    const rollback = await runTwoConnectionTableLockRace({
      scenario,
      openBlockerConnection: async () => blocker,
      openWriterConnection: async () => writer,
      runMigration: async () => { calls.push('migration started'); return { status: 1, output: 'SQLSTATE 23514' }; },
      confirmMigrationWaiting: async (pid) => { calls.push(`migration waiting ${String(pid)}`); return { status: 0, output: '', migrationPid: 37 }; },
      confirmWriterWaiting: async ({ blockerPid, migrationPid, writerPid }) => { calls.push(`writer waiting ${String(blockerPid)}/${String(migrationPid)}/${String(writerPid)}`); return { status: 0, output: '' }; },
      verifyRollback: async () => { calls.push('snapshot rollback'); return { status: 0, output: '' }; },
      cleanReapply: async () => { calls.push('clean reapply'); return { status: 0, output: '' }; },
    });
    assert.equal(rollback.status, 0);
    assert.equal(rollback.outcome, 'rollback-clean-reapply');
    assert.deepEqual(calls, [
      'blocker locked',
      'migration started',
      'migration waiting 31',
      'writer waiting request',
      'writer waiting 31/37/41',
      'blocker release',
      'writer abort',
      'snapshot rollback',
      'clean reapply',
      'blocker close',
      'writer close',
    ]);

    const shortcutCalls = [];
    const shortcut = await runTwoConnectionTableLockRace({
      scenario,
      openBlockerConnection: async () => ({
        async prepare() { shortcutCalls.push('blocker locked'); return { status: 0, blockerPid: 32 }; },
        async release() { shortcutCalls.push('blocker release'); return { status: 0, output: '' }; },
        async close() { shortcutCalls.push('blocker close'); return { status: 0, output: '' }; },
      }),
      openWriterConnection: async () => ({
        async prepare() { shortcutCalls.push('writer waiting request'); return { status: 0, writerPid: 42 }; },
        async release() { shortcutCalls.push('writer abort'); return { status: 0, output: '' }; },
        async close() { shortcutCalls.push('writer close'); return { status: 0, output: '' }; },
      }),
      runMigration: async () => { shortcutCalls.push('migration started'); return { status: 0, output: '' }; },
      confirmMigrationWaiting: async () => { shortcutCalls.push('migration waiting'); return { status: 0, output: '', migrationPid: 38 }; },
      confirmWriterWaiting: async () => { shortcutCalls.push('writer waiting'); return { status: 0, output: '' }; },
      verifyRollback: async () => { throw new Error('成功shortcutでsnapshot確認してはいけません。'); },
      cleanReapply: async () => { throw new Error('成功shortcutでclean reapplyしてはいけません。'); },
    });
    assert.equal(shortcut.status, 1);
    assert.equal(shortcut.outcome, 'rollback-required');
    assert.deepEqual(shortcutCalls, [
      'blocker locked', 'migration started', 'migration waiting', 'writer waiting request', 'writer waiting', 'blocker release', 'writer abort', 'blocker close', 'writer close',
    ]);
  });

  it('raceのmigration rejectはbarrier待機中に未処理化せずconnection close後に回収する', async () => {
    const calls = [];
    let activeMigration = 0;
    let releaseMigration;
    let unhandled;
    const onUnhandled = (reason) => { unhandled = reason; };
    process.once('unhandledRejection', onUnhandled);
    try {
      const result = await runTwoConnectionTableLockRace({
        scenario: { id: 'm1-legacy-write-race', barrierProtocol: 'two-connection-table-lock-v1' },
        openBlockerConnection: async () => ({
          async prepare() { calls.push('blocker prepare'); return { status: 0, blockerPid: 31 }; },
          async release() { return { status: 0, output: '' }; },
          async close() { calls.push('blocker close'); releaseMigration?.(); return { status: 0, output: '' }; },
        }),
        openWriterConnection: async () => ({
          async prepare() { throw new Error('barrierまで到達してはいけません。'); },
          async release() { return { status: 0, output: '' }; },
          async close() { calls.push('writer close'); return { status: 0, output: '' }; },
        }),
        runMigration: () => new Promise((resolve, reject) => {
          activeMigration = 1;
          calls.push('migration start');
          releaseMigration = () => {
            activeMigration = 0;
            calls.push('migration reject');
            reject(new Error('migration failed'));
          };
        }),
        confirmMigrationWaiting: async () => {
          calls.push('barrier throw');
          await new Promise((resolve) => setTimeout(resolve, 0));
          throw new Error('barrier failed');
        },
        confirmWriterWaiting: async () => ({ status: 0, output: '' }),
        verifyRollback: async () => ({ status: 0, output: '' }),
        cleanReapply: async () => ({ status: 0, output: '' }),
        migrationSettleTimeoutMs: 50,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(result.status, 1);
      assert.equal(result.outcome, 'execution-failed');
      assert.equal(activeMigration, 0);
      assert.equal(unhandled, undefined);
      assert.deepEqual(calls, [
        'blocker prepare', 'migration start', 'barrier throw', 'blocker close', 'migration reject', 'writer close',
      ]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('race成功後のpersistent cleanup失敗はcleanup-failedを返す', async () => {
    const connection = (pid, closeStatus) => ({
      async prepare() { return { status: 0, ...(pid === 31 ? { blockerPid: pid } : { writerPid: pid }) }; },
      async release() { return { status: 0, output: '' }; },
      async close() { return { status: closeStatus, output: '' }; },
    });
    const result = await runTwoConnectionTableLockRace({
      scenario: { id: 'm1-legacy-write-race', barrierProtocol: 'two-connection-table-lock-v1' },
      openBlockerConnection: async () => connection(31, 1),
      openWriterConnection: async () => connection(41, 0),
      runMigration: async () => ({ status: 1, output: 'SQLSTATE 23514' }),
      confirmMigrationWaiting: async () => ({ status: 0, output: '', migrationPid: 37 }),
      confirmWriterWaiting: async () => ({ status: 0, output: '' }),
      verifyRollback: async () => ({ status: 0, output: '' }),
      cleanReapply: async () => ({ status: 0, output: '' }),
    });
    assert.deepEqual(result, {
      status: 1,
      output: 'two-connection table-lock raceのpersistent connection cleanupに失敗しました。',
      outcome: 'cleanup-failed',
    });
  });

  it('legacy writer SQLは待機開始時に一度だけ送り、releaseはrollbackだけを送る', () => {
    const marker = 'legacy_writer_exact_once_marker';
    const writerSql = `select '${marker}';`;
    const executionSql = buildLegacyWriterRaceExecutionSql(writerSql);
    const releaseSql = buildLegacyWriterRaceReleaseSql();

    assert.equal(executionSql.split(marker).length - 1, 1);
    assert.equal(releaseSql.includes(marker), false);
    assert.match(executionSql, /jstqb_m1_race_writer_done/u);
    assert.doesNotMatch(releaseSql, /jstqb_m1_race_writer_done/u);
    assert.match(releaseSql, /^rollback;/u);
    assert.match(releaseSql, /jstqb_m1_race_release/u);
  });

  it('legacy writer SQLはhandshake偽装・psql meta・transaction controlを拒否する', () => {
    for (const invalidSql of [
      "select 'jstqb_m1_race_release';",
      '\\q',
      'begin; insert into public.sync_events values (1);',
      'insert into public.sync_events values (1); commit;',
      'select 1; /* controlled rollbackを無効化する */ rollback;',
      'start transaction;',
    ]) {
      assert.throws(() => buildLegacyWriterRaceExecutionSql(invalidSql), /含められません/u);
    }
  });

  it('event trigger catalog差分はcanonical schema署名を変え、runner queryへ含める', async () => {
    const base = calculateCanonicalSchemaSignature([
      '6576656e742d747269676765723a6d315f726163653a656e61626c65643d4f',
    ], []);
    const changed = calculateCanonicalSchemaSignature([
      '6576656e742d747269676765723a6d315f726163653a656e61626c65643d44',
    ], []);
    assert.notEqual(base, changed);
    const runnerSource = await readFile(databaseHarnessRunnerUrl, 'utf8');
    assert.match(runnerSource, /pg_catalog\.pg_event_trigger/u);
    assert.match(runnerSource, /event_trigger\.evtenabled::text/u);
    assert.match(runnerSource, /event_trigger\.evttags/u);
  });

  it('SQLSTATEとcause codeは正規化したexact tokenだけを受理する', () => {
    assert.deepEqual(extractExactSqlStateTokens('error: SQL state: 23p01'), ['23P01']);
    assert.deepEqual(extractExactSqlStateTokens('SQLSTATE 23514\nSQL state: 23P01'), ['23514', '23P01']);
    assert.equal(hasExactCauseCodeToken('error: m1_active_answer_key_missing', 'm1_active_answer_key_missing'), true);
    assert.equal(hasExactCauseCodeToken('error: prefix_m1_active_answer_key_missing_suffix', 'm1_active_answer_key_missing'), false);
    assert.equal(materializeRegisteredFailureScenario({
      id: registeredUpgradeFailureIds[0],
      fixturePath: `upgrade-failures/${registeredUpgradeFailureIds[0]}.sql`,
      causeCode: registeredUpgradeFailureIds[0].slice(3).replaceAll('-', '_'),
      expectedError: registeredUpgradeFailureIds[0].slice(3).replaceAll('-', '_'),
      expectedSqlState: '1',
      snapshotScopes: [...failureSnapshotScopes],
    }, { path: '20260814000200_learning_foundation_v2.sql', content: 'select 1;\n' }).ok, false);
  });

  it('persistent connectionのsignal cancelとfinally closeはTERM/KILLを重複させずregistryを回収する', async () => {
    const child = new EventEmitter();
    const signals = [];
    child.stdin = { write() {}, end() {} };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      signals.push(signal);
      if (signal === 'SIGKILL') queueMicrotask(() => child.emit('exit', null, 'SIGKILL'));
      return true;
    };
    const activeChildren = new Set();
    const persistentConnections = new Set();
    const connection = createPersistentPsqlConnection({
      spawnCommand: () => child,
      activeChildren,
      persistentConnections,
      commandTimeoutMs: 100,
      terminationGraceMs: 10,
      label: 'unit persistent',
    });
    const cancelled = connection.cancel('SIGINT');
    assert.strictEqual(connection.cancel('SIGTERM'), cancelled);
    const closed = connection.close();
    await Promise.all([cancelled, closed]);
    assert.strictEqual(connection.cancel('SIGTERM'), cancelled);
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    assert.equal(activeChildren.size, 0);
    assert.equal(persistentConnections.size, 0);
    assert.equal(child.listenerCount('exit'), 0);
    assert.equal(child.listenerCount('error'), 0);
  });

  it('persistent connectionはsend/close後のEPIPEを例外化せずstream listenerとregistryを回収する', async () => {
    const child = new EventEmitter();
    const stdin = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    child.stdin = stdin;
    child.stdout = stdout;
    child.stderr = stderr;
    stdin.write = () => {
      queueMicrotask(() => stdin.emit('error', new Error('EPIPE')));
      return true;
    };
    stdin.end = () => {};
    child.kill = () => true;
    const activeChildren = new Set();
    const persistentConnections = new Set();
    const connection = createPersistentPsqlConnection({
      spawnCommand: () => child,
      activeChildren,
      persistentConnections,
      commandTimeoutMs: 50,
      terminationGraceMs: 10,
      label: 'unit EPIPE',
    });

    assert.equal(connection.send('select 1;').status, 0);
    const closed = await connection.close();
    assert.equal(closed.status, 1);
    assert.equal(activeChildren.size, 0);
    assert.equal(persistentConnections.size, 0);
    assert.doesNotThrow(() => stdin.emit('error', new Error('late EPIPE')));
    assert.doesNotThrow(() => stdout.emit('error', new Error('late EPIPE')));
    assert.doesNotThrow(() => stderr.emit('error', new Error('late EPIPE')));
  });

  it('persistent connectionのhandshake ticketは送信前に出た偽tokenを受理しない', async () => {
    const child = new EventEmitter();
    child.stdin = { write() {}, end() {} };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    const connection = createPersistentPsqlConnection({
      spawnCommand: () => child,
      commandTimeoutMs: 10,
      terminationGraceMs: 5,
      label: 'unit cursor',
    });
    child.stdout.emit('data', 'jstqb_m1_race_release\n');
    const ticket = connection.send('select 1;');
    assert.equal(ticket.status, 0);
    const waited = await connection.waitForToken(
      'jstqb_m1_race_release',
      [],
      ticket.outputOffset,
    );
    assert.equal(waited.status, 124);
    child.emit('exit', 0, null);
    assert.equal((await connection.close()).status, 0);
  });

  it('production boundary canaryはmanifest宣言fileのbytesだけを読み、README差替えを拒否する', async () => {
    const contract = await loadActualContract();
    const declared = loadDeclaredProductionBoundaryCanaries(contract.fixtureManifest, contract.fixtureFiles);
    assert.equal(declared.ok, true);
    assert.deepEqual(declared.value, contract.canaryRegistry);

    const wrongPath = structuredClone(contract.fixtureManifest);
    const readme = wrongPath.files.find(({ path }) => path === 'README.md');
    assert.ok(readme);
    wrongPath.productionBoundaryCanaries = { path: 'README.md', sha256: readme.sha256 };
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: wrongPath,
      fixtureFiles: contract.fixtureFiles.filter(({ path }) => path !== 'manifest.json'),
      pgTapFiles: contract.pgTapFiles,
    }).ok, false);
    assert.equal(loadDeclaredProductionBoundaryCanaries(wrongPath, contract.fixtureFiles).ok, false);
  });

  it('CIはlegacy DB blockを実行不能化し、harness実行をexactに1件だけ残す', async () => {
    const source = await readFile(ciWorkflowUrl, 'utf8');
    const databaseStart = source.indexOf('\n  database:');
    const databaseEnd = source.indexOf('\n  security:', databaseStart);
    const databaseJob = source.slice(databaseStart, databaseEnd);
    assert.match(databaseJob, /^\s*timeout-minutes: 240$/mu);
    assert.match(databaseJob, /pre-M1実測6分06秒[\s\S]*failure 51件/u);
    assert.match(databaseJob, /id: database-preflight\n[\s\S]*if: \$\{\{ false \}\}/u);
    assert.match(databaseJob, /id: database-start\n\s*if: steps\.database-preflight\.outcome == 'success'/u);
    assert.match(databaseJob, /name: 全migrationを空DBへ再適用\n\s*if: steps\.database-preflight\.outcome == 'success'/u);
    assert.match(databaseJob, /name: RLS・関数・pgTAPを実DBで検証\n\s*if: steps\.database-preflight\.outcome == 'success'/u);
    assert.equal((databaseJob.match(/^\s*run: node scripts\/run-database-harness\.mjs$/gmu) ?? []).length, 1);
    assert.equal((databaseJob.match(/^\s*supabase test db > /gmu) ?? []).length, 1);
  });

  it('production runnerのorigin-main-upgrade phaseはregistered scenario runnerへ2引数で接続する', async () => {
    const contract = createRegisteredM1Contract(await loadActualContract());
    const calls = [];
    const errors = [];
    let registeredCalls = 0;
    const releaseLock = async () => {};
    releaseLock.lockDirectory = '/tmp/jstqb-registered-phase-lock';
    const status = await runProductionDatabaseHarness({
      acquireLock: async () => releaseLock,
      execFileCommand: async (command, argumentsList) => {
        assert.equal(command, 'git');
        assert.deepEqual(argumentsList, ['rev-parse', 'HEAD']);
        return { stdout: 'a'.repeat(40) };
      },
      spawnCommand: createRegisteredPhaseSpawn(calls),
      signalTarget: new EventEmitter(),
      loadContracts: async () => ({ ok: true, value: contract }),
      registeredUpgradeScenariosRunner: async (scenarios, runScenario) => {
        registeredCalls += 1;
        assert.deepEqual(scenarios.map(({ id }) => id), registeredUpgradeScenarioIds);
        assert.equal(typeof runScenario, 'function');
        return { status: 1, output: 'registered stub stop' };
      },
      log: { error(message) { errors.push(message); }, info() {} },
    });

    assert.equal(status, 1);
    assert.equal(registeredCalls, 1, errors.join('\n'));
    assert.equal(errors.some((message) => /TypeError/u.test(message)), false);
    assert.equal(calls.some(([command, argumentsList]) => command === 'supabase' && argumentsList[0] === 'start'), true);
    assert.equal(calls.some(([command, argumentsList]) => command === 'supabase' && argumentsList[0] === 'stop'), true);
  });

  it('M1 migration検出時は未登録profileをDB起動・lock取得より前に拒否する', async () => {
    const contract = await loadActualContract();
    const errors = [];
    let lockAttempted = false;
    let commandAttempted = false;
    const status = await runProductionDatabaseHarness({
      acquireLock: async () => {
        lockAttempted = true;
        return async () => {};
      },
      spawnCommand: () => {
        commandAttempted = true;
        throw new Error('M1未登録時にcommandを実行してはいけません。');
      },
      signalTarget: new EventEmitter(),
      loadContracts: async () => ({
        ok: true,
        value: {
          ...contract,
          headMigrationFiles: [
            ...contract.headMigrationFiles,
            { path: '20260814000200_learning_foundation_v2.sql', content: 'select 1;' },
          ],
        },
      }),
      log: { error(message) { errors.push(message); }, info() {} },
    });

    assert.equal(status, 1);
    assert.equal(lockAttempted, false);
    assert.equal(commandAttempted, false);
    assert.match(errors.join('\n'), /実upgrade scenarioが未登録/u);
  });

  it('M1登録検査は不完全入力をthrowせず拒否する', async () => {
    const contract = await loadActualContract();
    assert.doesNotThrow(() => verifyM1ScenarioRegistration({
      manifest: contract.fixtureManifest,
      migrationFiles: [null],
    }));
    assert.deepEqual(verifyM1ScenarioRegistration({
      manifest: contract.fixtureManifest,
      migrationFiles: [null],
    }), { ok: false, errors: ['M1 scenario登録検査の入力が不正です。'] });
  });
});
