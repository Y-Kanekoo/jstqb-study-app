import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  verifyDatabaseFixtureManifestV2,
  verifyM1ScenarioRegistration,
} from './database-boundary.mjs';
import {
  queryCanonicalSchemaSignature,
  runDeclaredPgTapTests,
  runRegisteredUpgradeFailures,
  runProductionDatabaseHarness,
  selectGenericPgTapFiles,
  verifyUpgradeScenarioMigrationFiles,
} from './run-database-harness.mjs';

const workspacePath = join(dirname(fileURLToPath(import.meta.url)), '..');

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function fixture(path, content) {
  return { path, content };
}

function fileEntry({ path, content }) {
  return { path, sha256: sha256(content) };
}

function createV2Manifest() {
  const origin = fixture('origin-main-shape.sql', 'origin');
  const preflight = fixture('atomic-preflight-failure.sql', 'preflight');
  const constraint = fixture('atomic-constraint-failure.sql', 'constraint');
  const trigger = fixture('atomic-trigger-failure.sql', 'trigger');
  const worker = fixture('atomic-worker-failure.sql', 'worker');
  const fixtures = [origin, preflight, constraint, trigger, worker];
  const pgTap = [fixture('database.test.sql', 'select 1;')];
  return {
    fixtures,
    pgTap,
    manifest: {
      schemaVersion: 'database-harness-fixture-manifest.v2',
      files: fixtures.map(fileEntry),
      pgTapFiles: pgTap.map(fileEntry),
      originMainFixture: fileEntry(origin),
      atomicFailures: [
        ['preflight', preflight],
        ['constraint', constraint],
        ['trigger', trigger],
        ['worker', worker],
      ].map(([kind, entry]) => ({
        kind,
        ...fileEntry(entry),
        expectedError: `EXPECTED_${kind.toUpperCase()}`,
        residueObjects: [`public.${kind}`],
      })),
      upgradeBases: [{
        id: 'fixed-base',
        commitSha: 'a'.repeat(40),
        migrations: [{ path: '202608110001_initial.sql', sha256: sha256('initial') }],
        migrationManifestSha256: sha256('manifest'),
      }],
      upgradeScenarios: [],
      upgradeFailures: [],
      normalPgTapFiles: [],
      racePgTapFiles: [],
      postUpgradePgTapFiles: [],
      m1ScenarioState: 'not-registered',
    },
  };
}

function createRegisteredV2Manifest() {
  const contract = createV2Manifest();
  const normal = fixture('m1-normal-upgrade.sql', 'normal fixture');
  const failure = fixture('m1-invalid-upgrade.sql', 'invalid fixture');
  const normalPgTap = fixture('m1-normal.test.sql', 'select 1;');
  const racePgTap = fixture('m1-race.test.sql', 'select 1;');
  const postPgTap = fixture('m1-post.test.sql', 'select 1;');
  contract.fixtures.push(normal, failure);
  contract.pgTap.push(normalPgTap, racePgTap, postPgTap);
  contract.manifest.files = contract.fixtures.map(fileEntry);
  contract.manifest.pgTapFiles = contract.pgTap.map(fileEntry);
  const expectedMigrationFiles = [{
    path: '20260814000200_learning_foundation_v2.sql',
    sha256: sha256('m1 migration'),
  }];
  contract.manifest.m1ScenarioState = 'registered';
  contract.manifest.upgradeScenarios = [{
    name: 'm1-normal',
    baseId: 'fixed-base',
    fixture: fileEntry(normal),
    expectedMigrationFiles,
    pgTapFiles: [fileEntry(normalPgTap)],
  }];
  contract.manifest.upgradeFailures = [{
    name: 'm1-invalid',
    baseId: 'fixed-base',
    fixture: fileEntry(failure),
    expectedMigrationFiles,
    expectedError: 'M1_EXPECTED_FAILURE',
    residueObjects: ['public.m1_residue'],
  }];
  contract.manifest.normalPgTapFiles = [fileEntry(normalPgTap)];
  contract.manifest.racePgTapFiles = [fileEntry(racePgTap)];
  contract.manifest.postUpgradePgTapFiles = [fileEntry(postPgTap)];
  return contract;
}

function createExitedChild({ output = '', status = 0 } = {}) {
  const listeners = new Map();
  const child = {
    stdout: { on(event, listener) { listeners.set(`stdout:${event}`, listener); } },
    stderr: { on(event, listener) { listeners.set(`stderr:${event}`, listener); } },
    stdin: { write() {}, end() {} },
    once(event, listener) { listeners.set(event, listener); },
    kill() { return true; },
  };
  queueMicrotask(() => {
    if (output !== '') listeners.get('stdout:data')?.(Buffer.from(output));
    listeners.get('exit')?.(status, null);
  });
  return child;
}

describe('DB harness manifest v2', () => {
  it('固定baseとM1未登録exact 0件をstrictに検証する', () => {
    const contract = createV2Manifest();
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: contract.manifest,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, true);
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: { ...contract.manifest, unexpected: true },
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, false, '余剰fieldを許可しない');
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: {
        ...contract.manifest,
        m1ScenarioState: 'not-registered',
        normalPgTapFiles: [fileEntry(contract.pgTap[0])],
      },
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, false, 'M1未登録なのに専用pgTAPを置けない');
  });

  it('壊れたbase配列とscenario入力を例外ではなく構造化errorで拒否する', () => {
    const contract = createV2Manifest();
    const invalid = structuredClone(contract.manifest);
    invalid.upgradeBases[0].migrations = null;
    assert.doesNotThrow(() => verifyDatabaseFixtureManifestV2({
      manifest: invalid,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }));
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: invalid,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, false);
    assert.deepEqual(verifyM1ScenarioRegistration({
      manifest: undefined,
      migrationFiles: [],
    }), { ok: false, errors: ['M1 scenario登録検査の入力が不正です。'] });
  });

  it('M1 migrationを検出した場合、scenario未登録をfail-closedで拒否する', () => {
    const { manifest } = createV2Manifest();
    const migrationFiles = [{
      path: '20260814000200_learning_foundation_v2.sql',
      content: 'select 1;',
    }];
    const result = verifyM1ScenarioRegistration({ manifest, migrationFiles });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /未登録/u);
  });

  it('fresh gateはM1 migrationと未登録scenarioを検出し、DB起動前に停止する', async () => {
    const contract = createV2Manifest();
    const fixtureFiles = [
      ...contract.fixtures,
      fixture('manifest.json', JSON.stringify(contract.manifest)),
    ];
    const headMigrationFiles = [
      { path: '202608110001_initial.sql', content: 'initial' },
      { path: '20260814000200_learning_foundation_v2.sql', content: 'm1 migration' },
    ];
    const calls = [];
    const errors = [];
    const releaseLock = async () => {};
    releaseLock.lockDirectory = '/tmp/jstqb-fresh-gate.lock';
    const status = await runProductionDatabaseHarness({
      acquireLock: async () => releaseLock,
      execFileCommand: async (_command, argumentsList) => {
        assert.deepEqual(argumentsList, ['rev-parse', 'HEAD']);
        return { stdout: 'a'.repeat(40) };
      },
      spawnCommand: (command, argumentsList) => {
        calls.push([command, argumentsList]);
        return createExitedChild({ output: '' });
      },
      signalTarget: new EventEmitter(),
      loadContracts: async () => ({
        ok: true,
        value: {
          headMigrationFiles,
          fixtureFiles,
          pgTapFiles: contract.pgTap,
          fixtureManifestContent: JSON.stringify(contract.manifest),
          fixtureManifest: contract.manifest,
          manifest: {
            schemaVersion: 'production-migration-manifest.v1',
            migrations: headMigrationFiles.map(({ path, content }) => ({ file: path, sha256: sha256(content) })),
          },
          canaryRegistry: { canaries: [] },
          productionFiles: [],
        },
      }),
      log: { error(message) { errors.push(message); }, info() {} },
    });
    assert.equal(status, 1);
    assert.match(errors.join('\n'), /実upgrade scenarioが未登録/u);
    assert.equal(calls.some(([command]) => command === 'supabase'), false);
    assert.equal(calls.filter(([command, argumentsList]) => command === 'docker' && argumentsList[0] === 'ps').length, 3);
  });

  it('registered contractは正常scenario exact 1、異常scenario、phase専用pgTAPを全て要求する', () => {
    const contract = createRegisteredV2Manifest();
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: contract.manifest,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, true);
    const duplicateNormal = structuredClone(contract.manifest);
    duplicateNormal.upgradeScenarios.push(structuredClone(duplicateNormal.upgradeScenarios[0]));
    duplicateNormal.upgradeScenarios[1].name = 'm1-normal-duplicate';
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: duplicateNormal,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, false, '正常scenarioを複数登録できない');
  });

  it('scenario対象migrationを固定baseとの差分とfilename・SHA-256で完全照合する', () => {
    const baseMigrationFiles = [{ path: '202608110001_initial.sql', content: 'initial' }];
    const headMigrationFiles = [
      ...baseMigrationFiles,
      { path: '20260814000200_learning_foundation_v2.sql', content: 'm1' },
    ];
    const expectedMigrationFiles = [{
      path: '20260814000200_learning_foundation_v2.sql',
      sha256: sha256('m1'),
    }];
    assert.equal(verifyUpgradeScenarioMigrationFiles({
      baseMigrationFiles,
      headMigrationFiles,
      expectedMigrationFiles,
    }).ok, true);
    assert.equal(verifyUpgradeScenarioMigrationFiles({
      baseMigrationFiles,
      headMigrationFiles,
      expectedMigrationFiles: [],
    }).ok, false);
  });

  it('migration validatorはnull・number・不完全objectをthrowせずfail-closedにする', () => {
    const validBase = [{ path: '202608110001_initial.sql', content: 'initial' }];
    const validHead = [
      ...validBase,
      { path: '20260814000200_learning_foundation_v2.sql', content: 'm1' },
    ];
    const validExpected = [{
      path: '20260814000200_learning_foundation_v2.sql',
      sha256: sha256('m1'),
    }];
    const malformedActualEntries = [null, 1, {}, { path: 1, content: 'm1' }, { path: 'm1.sql', content: 1 }];
    for (const invalid of malformedActualEntries) {
      assert.doesNotThrow(() => verifyUpgradeScenarioMigrationFiles({
        baseMigrationFiles: [invalid],
        headMigrationFiles: validHead,
        expectedMigrationFiles: validExpected,
      }));
      assert.equal(verifyUpgradeScenarioMigrationFiles({
        baseMigrationFiles: [invalid],
        headMigrationFiles: validHead,
        expectedMigrationFiles: validExpected,
      }).ok, false);
      assert.equal(verifyUpgradeScenarioMigrationFiles({
        baseMigrationFiles: validBase,
        headMigrationFiles: [invalid],
        expectedMigrationFiles: validExpected,
      }).ok, false);
    }
    for (const invalid of [null, 1, {}, { path: 1, sha256: sha256('m1') }, { path: 'm1.sql', sha256: 1 }]) {
      assert.doesNotThrow(() => verifyUpgradeScenarioMigrationFiles({
        baseMigrationFiles: validBase,
        headMigrationFiles: validHead,
        expectedMigrationFiles: [invalid],
      }));
      assert.equal(verifyUpgradeScenarioMigrationFiles({
        baseMigrationFiles: validBase,
        headMigrationFiles: validHead,
        expectedMigrationFiles: [invalid],
      }).ok, false);
    }

    const { manifest } = createV2Manifest();
    for (const invalid of malformedActualEntries) {
      assert.doesNotThrow(() => verifyM1ScenarioRegistration({
        manifest,
        migrationFiles: [invalid],
      }));
      assert.equal(verifyM1ScenarioRegistration({
        manifest,
        migrationFiles: [invalid],
      }).ok, false);
    }
  });

  it('canonical署名はneutral role属性を含みpassword値を参照しない', async () => {
    let sql = '';
    await queryCanonicalSchemaSignature(async (_command, _arguments, options) => {
      sql = options.input;
      return { status: 0, output: '01\n' };
    }, [{ path: '202608110001_initial.sql', content: 'select 1;' }]);
    for (const attribute of [
      'rolsuper', 'rolinherit', 'rolcreaterole', 'rolcreatedb', 'rolcanlogin',
      'rolreplication', 'rolbypassrls', 'rolconnlimit', 'rolvaliduntil',
    ]) assert.match(sql, new RegExp(`role\\.${attribute}`, 'u'));
    assert.equal(sql.includes('rolpassword'), false);
    assert.match(sql, /role\.rolname ~ '\^jstqb_\[a-z0-9_\]\+_owner\$'/u);
    assert.doesNotMatch(sql, /from pg_catalog\.pg_roles role\s+union all/u);
  });

  it('phase専用pgTAPをgeneric集合から除外し各failureをexact一回逐次実行する', async () => {
    const pgTapFiles = [
      fixture('generic.test.sql', 'generic'),
      fixture('normal.test.sql', 'normal'),
      fixture('race.test.sql', 'race'),
      fixture('post.test.sql', 'post'),
    ];
    const separated = selectGenericPgTapFiles(pgTapFiles, {
      normalPgTapFiles: [fileEntry(pgTapFiles[1])],
      racePgTapFiles: [fileEntry(pgTapFiles[2])],
      postUpgradePgTapFiles: [fileEntry(pgTapFiles[3])],
    });
    assert.equal(separated.ok, true);
    assert.deepEqual(separated.files.map(({ path }) => path), ['generic.test.sql']);

    const executed = [];
    const result = await runRegisteredUpgradeFailures(
      [{ name: 'a' }, { name: 'b' }],
      async ({ name }) => {
        executed.push(name);
        return { status: 0, output: '' };
      },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(executed, ['a', 'b']);
    assert.equal((await runRegisteredUpgradeFailures(
      [{ name: 'a' }, { name: 'a' }],
      async () => ({ status: 0, output: '' }),
    )).status, 1);

    const cleaned = [];
    const stopped = await runRegisteredUpgradeFailures(
      [{ name: 'first' }, { name: 'second' }],
      async ({ name }) => {
        try {
          return name === 'first'
            ? { status: 1, output: 'expected failure' }
            : { status: 0, output: '' };
        } finally {
          cleaned.push(name);
        }
      },
    );
    assert.equal(stopped.status, 1);
    assert.deepEqual(cleaned, ['first'], 'failure後も当該独立stackのfinally cleanupは必須');
  });

  it('malformedな登録scenarioとrole scope外の署名対象を構造化拒否する', async () => {
    const contract = createRegisteredV2Manifest();
    const malformed = structuredClone(contract.manifest);
    malformed.upgradeFailures = [null];
    assert.doesNotThrow(() => verifyDatabaseFixtureManifestV2({
      manifest: malformed,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }));
    assert.equal(verifyDatabaseFixtureManifestV2({
      manifest: malformed,
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTap,
    }).ok, false);

    let sql = '';
    await queryCanonicalSchemaSignature(async (_command, _argumentsList, options) => {
      sql = options.input;
      return { status: 0, output: '01\n' };
    }, [{ path: '202608110001_initial.sql', content: 'select 1;' }]);
    assert.match(sql, /where role\.rolname ~ '\^jstqb_\[a-z0-9_\]\+_owner\$'/u);
    assert.doesNotMatch(sql, /where role\.rolname ~ '\^jstqb_\[a-z0-9_\]\+_owner\$'\s*or role\.rolname =/u);
  });

  it('登録pgTAPをtest root外へ解決するpathは拒否する', async () => {
    const result = await runDeclaredPgTapTests(
      async () => ({ status: 0, output: '' }),
      '/tmp',
      '/tmp/supabase/tests',
      [{ path: '../outside.test.sql', sha256: sha256('outside') }],
    );
    assert.equal(result.status, 1);
    assert.match(result.output, /root外/u);
  });

  it('実manifestはfixed SHAのbaseとM1未登録contractを満たす', async () => {
    const fixtureRoot = join(workspacePath, 'supabase', 'test-fixtures', 'database-harness');
    const manifest = JSON.parse(await readFile(join(fixtureRoot, 'manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 'database-harness-fixture-manifest.v2');
    assert.equal(manifest.upgradeBases[0].commitSha, '00411ef12777fdda151a66833598f6805fdfdf63');
    assert.equal(manifest.m1ScenarioState, 'not-registered');
    assert.deepEqual(manifest.normalPgTapFiles, []);
    assert.deepEqual(manifest.racePgTapFiles, []);
    assert.deepEqual(manifest.postUpgradePgTapFiles, []);
  });
});
