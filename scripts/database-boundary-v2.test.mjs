import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  selectProductionBoundaryPaths,
  verifyDatabaseFixtureManifest,
  verifyFixtureManifestFile,
} from './database-boundary.mjs';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function createEntry(path, content) {
  return { path, content };
}

describe('DB fixture・production境界 v2', () => {
  it('fixtureと再帰pgTAPをfilename・hash・4異常種別で完全照合する', () => {
    const fixtures = [
      createEntry('atomic-preflight-failure.sql', 'preflight'),
      createEntry('atomic-constraint-failure.sql', 'constraint'),
      createEntry('atomic-trigger-failure.sql', 'trigger'),
      createEntry('atomic-worker-failure.sql', 'worker'),
      createEntry('origin-main-shape.sql', 'origin'),
    ];
    const pgTap = [
      createEntry('database.test.sql', 'root'),
      createEntry('nested/security.test.sql', 'nested'),
    ];
    const fileEntry = ({ path, content }) => ({ path, sha256: sha256(content) });
    const manifest = {
      schemaVersion: 'database-harness-fixture-manifest.v1',
      files: fixtures.map(fileEntry),
      pgTapFiles: pgTap.map(fileEntry),
      originMainFixture: fileEntry(fixtures[4]),
      atomicFailures: [
        { kind: 'preflight', ...fileEntry(fixtures[0]), expectedError: 'EXPECTED_PREFLIGHT', residueObjects: ['public.preflight'] },
        { kind: 'constraint', ...fileEntry(fixtures[1]), expectedError: 'EXPECTED_CONSTRAINT', residueObjects: ['public.constraint'] },
        { kind: 'trigger', ...fileEntry(fixtures[2]), expectedError: 'EXPECTED_TRIGGER', residueObjects: ['public.trigger'] },
        { kind: 'worker', ...fileEntry(fixtures[3]), expectedError: 'EXPECTED_WORKER', residueObjects: ['public.worker'] },
      ],
    };

    assert.equal(verifyDatabaseFixtureManifest({ manifest, fixtureFiles: fixtures, pgTapFiles: pgTap }).ok, true);
    assert.equal(verifyDatabaseFixtureManifest({
      manifest,
      fixtureFiles: fixtures.slice(1),
      pgTapFiles: pgTap,
    }).ok, false, 'fixture欠落を拒否する');
    assert.equal(verifyDatabaseFixtureManifest({
      manifest,
      fixtureFiles: fixtures,
      pgTapFiles: pgTap.slice(0, 1),
    }).ok, false, 'nested pgTAP欠落を拒否する');
    assert.equal(verifyDatabaseFixtureManifest({
      manifest: { ...manifest, atomicFailures: manifest.atomicFailures.slice(0, 3) },
      fixtureFiles: fixtures,
      pgTapFiles: pgTap,
    }).ok, false, '4異常種別の不足を拒否する');
  });

  it('production migration・seed・bundle・release artifactだけを完全な検査対象へ選ぶ', () => {
    assert.deepEqual(selectProductionBoundaryPaths([
      'docs/design.md',
      'supabase/tests/fixtures/canary.sql',
      'src/content/questions.ts',
      'supabase/migrations/202608110001_initial.sql',
      'supabase/migrations/manifest.json',
      'supabase/seed.sql',
      'supabase/seeds/catalog.sql',
      'outputs/production/catalog.json',
      'artifacts/production/release.json',
      'release/artifacts/manifest.json',
    ]), [
      'artifacts/production/release.json',
      'outputs/production/catalog.json',
      'release/artifacts/manifest.json',
      'src/content/questions.ts',
      'supabase/migrations/202608110001_initial.sql',
      'supabase/migrations/manifest.json',
      'supabase/seed.sql',
      'supabase/seeds/catalog.sql',
    ]);
  });

  it('manifest自身はself hash対象外としてexactに1件だけ許可する', () => {
    const fixture = createEntry('origin-main-shape.sql', 'origin');
    const pgTap = createEntry('database.test.sql', 'tap');
    const fileEntry = ({ path, content }) => ({ path, sha256: sha256(content) });
    const manifest = {
      schemaVersion: 'database-harness-fixture-manifest.v1',
      files: [fileEntry(fixture)],
      pgTapFiles: [fileEntry(pgTap)],
      originMainFixture: fileEntry(fixture),
      atomicFailures: [
        { kind: 'preflight', ...fileEntry(fixture), expectedError: 'PREFLIGHT', residueObjects: ['public.preflight'] },
        { kind: 'constraint', ...fileEntry(fixture), expectedError: 'CONSTRAINT', residueObjects: ['public.constraint'] },
        { kind: 'trigger', ...fileEntry(fixture), expectedError: 'TRIGGER', residueObjects: ['public.trigger'] },
        { kind: 'worker', ...fileEntry(fixture), expectedError: 'WORKER', residueObjects: ['public.worker'] },
      ],
    };
    const manifestFile = createEntry('manifest.json', JSON.stringify(manifest));
    assert.equal(verifyFixtureManifestFile({
      manifestContent: manifestFile.content,
      fixtureFiles: [fixture, manifestFile],
      pgTapFiles: [pgTap],
    }).ok, true);
    assert.equal(verifyFixtureManifestFile({
      manifestContent: manifestFile.content,
      fixtureFiles: [fixture],
      pgTapFiles: [pgTap],
    }).ok, false);
  });
});
