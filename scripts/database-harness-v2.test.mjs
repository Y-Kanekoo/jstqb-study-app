import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  databasePhaseNames,
  runDatabaseHarness,
  verifyMigrationManifest,
  verifyProductionBoundary,
} from './database-harness.mjs';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function createLog() {
  const messages = [];
  return {
    messages,
    error(message) {
      messages.push(String(message));
    },
  };
}

function createManifest(files) {
  return {
    schemaVersion: 'production-migration-manifest.v1',
    migrations: files.map(({ path, content }) => ({
      file: path.split('/').at(-1),
      sha256: sha256(content),
    })),
  };
}

const migrationFiles = [
  {
    path: 'supabase/migrations/202608110001_initial.sql',
    content: 'create table public.one (id integer primary key);\n',
  },
  {
    path: 'supabase/migrations/202608140001_learning.sql',
    content: 'create table public.two (id integer primary key);\n',
  },
];

const canaryRegistry = {
  schemaVersion: 'database-harness-canary-registry.v1',
  canaries: ['DB-HARNESS-CANARY-ONE', 'DB_HARNESS_CANARY_TWO'],
};

describe('DB upgrade harness v2', () => {
  it('5 phaseを固定順で一つも省略せず実行し、成功時にlockを解放する', async () => {
    const calls = [];
    let releaseCount = 0;

    const status = await runDatabaseHarness({
      acquireLock: async () => {
        calls.push('acquire');
        return async () => {
          releaseCount += 1;
          calls.push('release');
        };
      },
      runPhase: async (phaseName) => {
        calls.push(phaseName);
        return { status: 0, output: '' };
      },
      log: createLog(),
    });

    assert.deepEqual(databasePhaseNames, [
      'fresh',
      'origin-main-upgrade',
      'combined-order',
      'atomic-failure',
      'production-boundary',
    ]);
    assert.equal(status, 0);
    assert.deepEqual(calls, ['acquire', ...databasePhaseNames, 'release']);
    assert.equal(releaseCount, 1);
  });

  it('途中phaseの失敗で後続phaseを実行せず、lockを必ず解放する', async () => {
    const calls = [];
    let releaseCount = 0;
    const failedPhase = 'combined-order';

    const status = await runDatabaseHarness({
      acquireLock: async () => async () => {
        releaseCount += 1;
      },
      runPhase: async (phaseName) => {
        calls.push(phaseName);
        return phaseName === failedPhase
          ? { status: 17, output: 'phase failed' }
          : { status: 0, output: '' };
      },
      log: createLog(),
    });

    assert.equal(status, 17);
    assert.deepEqual(calls, ['fresh', 'origin-main-upgrade', 'combined-order']);
    assert.equal(releaseCount, 1);
  });

  it('lock取得失敗時はphaseを一つも開始しない', async () => {
    let phaseCount = 0;
    const log = createLog();

    const status = await runDatabaseHarness({
      acquireLock: async () => {
        throw new Error('lock is busy');
      },
      runPhase: async () => {
        phaseCount += 1;
        return { status: 0, output: '' };
      },
      log,
    });

    assert.equal(status, 1);
    assert.equal(phaseCount, 0);
    assert.match(log.messages.join('\n'), /lock/iu);
  });

  it('lock解放失敗は全phase成功でも失敗扱いにする', async () => {
    const log = createLog();
    const status = await runDatabaseHarness({
      acquireLock: async () => async () => {
        throw new Error('release failed');
      },
      runPhase: async () => ({ status: 0, output: '' }),
      log,
    });

    assert.equal(status, 1);
    assert.match(log.messages.join('\n'), /解放/iu);
  });

  it('manifestはfilename、順序、hashの完全一致だけを許可する', () => {
    const manifest = createManifest(migrationFiles);

    assert.equal(verifyMigrationManifest({ manifest, migrationFiles }).ok, true);
    assert.equal(verifyMigrationManifest({
      manifest: { ...manifest, migrations: manifest.migrations.slice(0, 1) },
      migrationFiles,
    }).ok, false, 'missing migrationを拒否する');
    assert.equal(verifyMigrationManifest({
      manifest: {
        ...manifest,
        migrations: [...manifest.migrations, { file: 'unexpected.sql', sha256: sha256('unexpected') }],
      },
      migrationFiles,
    }).ok, false, 'extra migrationを拒否する');
    assert.equal(verifyMigrationManifest({
      manifest: { ...manifest, migrations: [...manifest.migrations].reverse() },
      migrationFiles,
    }).ok, false, 'migration順序改変を拒否する');
    assert.equal(verifyMigrationManifest({
      manifest: {
        ...manifest,
        migrations: [{ ...manifest.migrations[0], sha256: sha256('tampered') }, manifest.migrations[1]],
      },
      migrationFiles,
    }).ok, false, 'hash改変を拒否する');
    assert.equal(verifyMigrationManifest({
      manifest: {
        ...manifest,
        migrations: [{
          ...manifest.migrations[0],
          file: 'supabase/migrations/202608110001_initial.sql',
        }, manifest.migrations[1]],
      },
      migrationFiles,
    }).ok, false, 'manifest entryのbasename以外を拒否する');
  });

  it('canary registryはstrictで、canaryのproduction混入を拒否しfixture内だけを許可する', () => {
    const fixtureFiles = [{
      path: 'supabase/tests/fixtures/origin-main-shape.sql',
      content: "select 'DB-HARNESS-CANARY-ONE', 'DB_HARNESS_CANARY_TWO';\n",
    }];
    const safeProductionFiles = [{
      path: 'supabase/migrations/202608110001_initial.sql',
      content: 'create table public.safe_table (id integer primary key);\n',
    }];

    assert.equal(verifyProductionBoundary({
      canaryRegistry,
      productionFiles: safeProductionFiles,
      fixtureFiles,
    }).ok, true);
    assert.equal(verifyProductionBoundary({
      canaryRegistry,
      productionFiles: [{
        path: 'supabase/migrations/202608110001_initial.sql',
        content: "select 'DB-HARNESS-CANARY-ONE';\n",
      }],
      fixtureFiles,
    }).ok, false, 'production migrationへのcanary混入を拒否する');
    assert.equal(verifyProductionBoundary({
      canaryRegistry: { ...canaryRegistry, canaries: ['DB-HARNESS-CANARY-ONE', 'DB-HARNESS-CANARY-ONE'] },
      productionFiles: safeProductionFiles,
      fixtureFiles,
    }).ok, false, '重複canaryを拒否する');
    assert.equal(verifyProductionBoundary({
      canaryRegistry: { ...canaryRegistry, ignored: true },
      productionFiles: safeProductionFiles,
      fixtureFiles,
    }).ok, false, 'registryの余剰fieldを拒否する');
    assert.equal(verifyProductionBoundary({
      canaryRegistry,
      productionFiles: safeProductionFiles,
      fixtureFiles: [{
        path: 'supabase/test-fixtures/database-harness/unregistered.sql',
        content: "select 'DB-HARNESS-UNREGISTERED-MARKER';\n",
      }, ...fixtureFiles],
    }).ok, false, 'fixture内の未登録stable markerを拒否する');
  });

  it('phase失敗ログから接続文字列の機密値をredactする', async () => {
    const log = createLog();
    const databaseScheme = ['postgre', 'sql'].join('');
    const credential = ['super', 'secret'].join('-');
    const status = await runDatabaseHarness({
      acquireLock: async () => async () => {},
      runPhase: async () => ({
        status: 1,
        output: `${databaseScheme}://user:${credential}@database.example.test:5432/jstqb`,
      }),
      log,
    });

    assert.equal(status, 1);
    assert.equal(log.messages.join('\n').includes(credential), false);
  });
});
