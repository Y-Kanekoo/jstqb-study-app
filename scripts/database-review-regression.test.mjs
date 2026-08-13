import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  cleanupDatabaseHarness,
  runCleanupCli,
} from './cleanup-database-harness.mjs';
import { verifyDatabaseFixtureManifest } from './database-boundary.mjs';
import { verifyMigrationManifest } from './database-harness.mjs';
import {
  queryCanonicalSchemaSignature,
  runProductionDatabaseHarness,
} from './run-database-harness.mjs';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function privateConnectionMessage() {
  return ['postgresql', '://person:password@db.example/app'].join('');
}

function privateTokenMessage() {
  return ['token', '=review-fixture-value'].join('');
}

function createExitedChild(output = '', status = 0) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  queueMicrotask(() => {
    if (output !== '') child.stdout.emit('data', output);
    child.emit('exit', status, null);
  });
  return child;
}

function createFixtureContract() {
  const fixtures = [
    ['origin-main-shape.sql', 'origin'],
    ['atomic-preflight-failure.sql', 'preflight'],
    ['atomic-constraint-failure.sql', 'constraint'],
    ['atomic-trigger-failure.sql', 'trigger'],
    ['atomic-worker-failure.sql', 'worker'],
  ].map(([path, content]) => ({ path, content }));
  const fileEntry = ({ path, content }) => ({ path, sha256: sha256(content) });
  const byPath = new Map(fixtures.map((entry) => [entry.path, entry]));
  return {
    fixtures,
    pgTapFiles: [{ path: 'database.test.sql', content: 'select 1;' }],
    manifest: {
      schemaVersion: 'database-harness-fixture-manifest.v1',
      files: fixtures.map(fileEntry),
      pgTapFiles: [{ path: 'database.test.sql', sha256: sha256('select 1;') }],
      originMainFixture: fileEntry(byPath.get('origin-main-shape.sql')),
      atomicFailures: [
        ['preflight', 'atomic-preflight-failure.sql'],
        ['constraint', 'atomic-constraint-failure.sql'],
        ['trigger', 'atomic-trigger-failure.sql'],
        ['worker', 'atomic-worker-failure.sql'],
      ].map(([kind, path]) => ({
        kind,
        ...fileEntry(byPath.get(path)),
        expectedError: `EXPECTED_${kind.toUpperCase()}`,
        residueObjects: [`public.${kind}`],
      })),
    },
  };
}

const lockDirectory = join(
  tmpdir(),
  '.supabase-database-ci-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.lock',
);

describe('DB review回帰', () => {
  it('fixture意味契約のnullを例外ではなくschema errorとして拒否する', () => {
    const contract = createFixtureContract();
    const result = verifyDatabaseFixtureManifest({
      manifest: { ...contract.manifest, originMainFixture: null },
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTapFiles,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('origin-main fixture契約')), true);
  });

  it('atomic fixture意味契約のnullを例外ではなくschema errorとして拒否する', () => {
    const contract = createFixtureContract();
    const result = verifyDatabaseFixtureManifest({
      manifest: { ...contract.manifest, atomicFailures: [null] },
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTapFiles,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('atomic failure fixture契約')), true);
  });

  it('fixture意味契約とfile一覧のhash不一致を構造化errorで拒否する', () => {
    const contract = createFixtureContract();
    const result = verifyDatabaseFixtureManifest({
      manifest: {
        ...contract.manifest,
        originMainFixture: {
          ...contract.manifest.originMainFixture,
          sha256: sha256('different'),
        },
      },
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTapFiles,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('fixture意味契約')), true);
  });

  it('migration manifestはJSON key挿入順で誤拒否しない', () => {
    const content = 'select 1;\n';
    const file = '202608140001_example.sql';
    const result = verifyMigrationManifest({
      manifest: {
        schemaVersion: 'production-migration-manifest.v1',
        migrations: [{ sha256: sha256(content), file }],
      },
      migrationFiles: [{ path: file, content }],
    });
    assert.equal(result.ok, true);
  });

  it('fixture manifestはJSON key挿入順で誤拒否しない', () => {
    const contract = createFixtureContract();
    const result = verifyDatabaseFixtureManifest({
      manifest: {
        ...contract.manifest,
        files: contract.manifest.files.map(({ path, sha256: digest }) => ({ sha256: digest, path })),
        pgTapFiles: contract.manifest.pgTapFiles.map(({ path, sha256: digest }) => ({ sha256: digest, path })),
      },
      fixtureFiles: contract.fixtures,
      pgTapFiles: contract.pgTapFiles,
    });
    assert.equal(result.ok, true);
  });

  it('cleanup commandの同期spawn例外をredact済みstatusへ変換する', async () => {
    const errors = [];
    const status = await cleanupDatabaseHarness({
      ownershipFile: '/tmp/unused',
      spawnCommand: () => { throw new Error(privateConnectionMessage()); },
      log: { error(message) { errors.push(message); } },
    });
    assert.equal(status, 1);
    assert.equal(errors.join('\n').includes('person:password'), false);
    assert.equal(errors.join('\n').includes('[機密接続情報を伏せました]'), true);
  });

  it('所有証跡file削除失敗をredact済みstatusへ変換する', async () => {
    const errors = [];
    const status = await cleanupDatabaseHarness({
      ownershipFile: '/tmp/owned',
      spawnCommand: () => createExitedChild(),
      readOwnershipFile: async () => `known=false\nlock=${lockDirectory}\n`,
      removeLockDirectory: async () => {},
      removeOwnershipFile: async () => { throw new Error(privateTokenMessage()); },
      log: { error(message) { errors.push(message); } },
    });
    assert.equal(status, 1);
    assert.equal(errors.join('\n').includes('review-fixture-value'), false);
    assert.equal(errors.join('\n').includes('[機密値を伏せました]'), true);
  });

  it('cleanup CLI境界で予期しないrejectionをredactする', async () => {
    const errors = [];
    const status = await runCleanupCli({
      cleanup: async () => { throw new Error(privateConnectionMessage()); },
      log: { error(message) { errors.push(message); } },
    });
    assert.equal(status, 1);
    assert.equal(errors.join('\n').includes('person:password'), false);
  });

  it('harness契約file読込例外をlock取得前にredactして拒否する', async () => {
    const errors = [];
    let lockAttempted = false;
    const status = await runProductionDatabaseHarness({
      loadContracts: async () => { throw new Error(privateConnectionMessage()); },
      acquireLock: async () => {
        lockAttempted = true;
        return async () => {};
      },
      log: { error(message) { errors.push(message); } },
    });
    assert.equal(status, 1);
    assert.equal(lockAttempted, false);
    assert.equal(errors.join('\n').includes('person:password'), false);
    assert.equal(errors.join('\n').includes('[機密接続情報を伏せました]'), true);
  });

  it('fixture manifest parse errorを確立済みの日本語errorとして返す', async () => {
    const errors = [];
    const status = await runProductionDatabaseHarness({
      loadContracts: async () => ({
        ok: false,
        errors: ['DB fixture manifestをJSONとして解析できません。'],
      }),
      log: { error(message) { errors.push(message); } },
    });
    assert.equal(status, 1);
    assert.deepEqual(errors, ['DB fixture manifestをJSONとして解析できません。']);
  });

  it('canonical function取得はapplication aggregateを明示拒否してdefinition対象外にする', async () => {
    let sql = '';
    const result = await queryCanonicalSchemaSignature(async (_command, _argumentsList, options) => {
      sql = options.input;
      return { status: 0, output: '01\n' };
    }, [{ path: '202608140001_example.sql', content: 'select 1;\n' }]);
    assert.equal(result.status, 0);
    assert.match(sql, /application aggregateはcanonical schema署名未対応/u);
    assert.match(sql, /p\.prokind = 'a'/u);
    assert.match(sql, /dependency\.deptype = 'e'/u);
    assert.match(sql, /p\.prokind <> 'a'/u);
    assert.doesNotMatch(sql, /p\.prokind in \('f', 'p'\)/u);
  });

  it('canonical schema queryのaggregate preflight失敗を署名なしで伝播する', async () => {
    const result = await queryCanonicalSchemaSignature(async () => ({
      status: 1,
      output: 'application aggregateはcanonical schema署名未対応です。',
    }), [{ path: '202608140001_example.sql', content: 'select 1;\n' }]);
    assert.equal(result.status, 1);
    assert.equal(result.signature, '');
  });
});
