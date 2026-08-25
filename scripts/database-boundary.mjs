import { createHash } from 'node:crypto';

const sha256Pattern = /^[0-9a-f]{64}$/u;
const atomicKinds = Object.freeze(['preflight', 'constraint', 'trigger', 'worker']);
const commitShaPattern = /^[0-9a-f]{40}$/u;
const m1MigrationPattern = /_learning_foundation_v2\.sql$/u;

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value) {
  if (!isPlainObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validateFileEntry(entry, errors, label) {
  if (!hasExactKeys(entry, ['path', 'sha256'])
    || typeof entry.path !== 'string'
    || entry.path.trim() === ''
    || entry.path.startsWith('/')
    || entry.path.includes('..')
    || typeof entry.sha256 !== 'string'
    || !sha256Pattern.test(entry.sha256)) {
    errors.push(`${label}のfile entryが不正です。`);
    return false;
  }
  return true;
}

function normalizeActualFiles(files, errors, label) {
  if (!Array.isArray(files)) {
    errors.push(`${label}のfile一覧が不正です。`);
    return [];
  }
  return files.map((entry) => {
    if (!hasExactKeys(entry, ['path', 'content'])
      || typeof entry.path !== 'string'
      || typeof entry.content !== 'string') {
      errors.push(`${label}のfile内容が不正です。`);
      return null;
    }
    return { path: entry.path, sha256: sha256(entry.content) };
  }).filter((entry) => entry !== null).sort((left, right) => left.path.localeCompare(right.path));
}

function validateFileEntries(entries, errors, label) {
  if (!Array.isArray(entries)) {
    errors.push(`${label}のfile一覧が不正です。`);
    return [];
  }
  const normalized = entries.filter((entry) => validateFileEntry(entry, errors, label))
    .map(({ path, sha256: digest }) => ({ path, sha256: digest }));
  if (new Set(normalized.map(({ path }) => path)).size !== normalized.length) {
    errors.push(`${label}のfile pathが重複しています。`);
  }
  return normalized;
}

function validateUpgradeScenario(entry, errors, label, expectedKeys) {
  if (!hasExactKeys(entry, expectedKeys)
    || typeof entry.name !== 'string'
    || entry.name.trim() === ''
    || typeof entry.baseId !== 'string'
    || entry.baseId.trim() === '') {
    errors.push(`${label}契約が不正です。`);
    return false;
  }
  validateFileEntry(entry.fixture, errors, `${label} fixture`);
  validateFileEntries(entry.expectedMigrationFiles, errors, `${label} migration`);
  if (Object.hasOwn(entry, 'pgTapFiles')) validateFileEntries(entry.pgTapFiles, errors, `${label} pgTAP`);
  if (Object.hasOwn(entry, 'expectedError') && (typeof entry.expectedError !== 'string' || entry.expectedError.trim() === '')) {
    errors.push(`${label}のexpectedErrorが不正です。`);
  }
  if (Object.hasOwn(entry, 'residueObjects') && (!Array.isArray(entry.residueObjects)
    || entry.residueObjects.length === 0
    || entry.residueObjects.some((value) => typeof value !== 'string' || value.trim() === '')
    || new Set(entry.residueObjects).size !== entry.residueObjects.length)) {
    errors.push(`${label}のresidueObjectsが不正です。`);
  }
  return true;
}

function assertListedFileEntries(entries, knownEntries, errors, label) {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (isPlainObject(entry) && typeof entry.path === 'string' && typeof entry.sha256 === 'string'
      && knownEntries.get(entry.path) !== entry.sha256) {
      errors.push(`${label}がmanifest完全一覧と一致しません: ${entry.path}`);
    }
  }
}

/**
 * v2はM1の実migration upgradeを固定baseから検証するための契約である。
 * v1は既存の回帰testだけの互換用であり、production runnerでは使用しない。
 */
export function verifyDatabaseFixtureManifestV2({ manifest, fixtureFiles, pgTapFiles }) {
  const errors = [];
  const expectedKeys = [
    'schemaVersion',
    'files',
    'pgTapFiles',
    'originMainFixture',
    'atomicFailures',
    'upgradeBases',
    'upgradeScenarios',
    'upgradeFailures',
    'normalPgTapFiles',
    'racePgTapFiles',
    'postUpgradePgTapFiles',
    'm1ScenarioState',
  ];
  if (!hasExactKeys(manifest, expectedKeys)
    || manifest.schemaVersion !== 'database-harness-fixture-manifest.v2'
    || !Array.isArray(manifest.files)
    || !Array.isArray(manifest.pgTapFiles)
    || !Array.isArray(manifest.atomicFailures)
    || !Array.isArray(manifest.upgradeBases)
    || !Array.isArray(manifest.upgradeScenarios)
    || !Array.isArray(manifest.upgradeFailures)
    || !Array.isArray(manifest.normalPgTapFiles)
    || !Array.isArray(manifest.racePgTapFiles)
    || !Array.isArray(manifest.postUpgradePgTapFiles)
    || !['not-registered', 'registered'].includes(manifest.m1ScenarioState)) {
    return { ok: false, errors: ['DB fixture manifest v2のschemaが不正です。'] };
  }

  const legacyShape = {
    schemaVersion: 'database-harness-fixture-manifest.v1',
    files: manifest.files,
    pgTapFiles: manifest.pgTapFiles,
    originMainFixture: manifest.originMainFixture,
    atomicFailures: manifest.atomicFailures,
  };
  const legacyResult = verifyDatabaseFixtureManifest({
    manifest: legacyShape,
    fixtureFiles,
    pgTapFiles,
  });
  errors.push(...legacyResult.errors);
  const fixtureEntries = new Map(manifest.files.map((entry) => (
    isPlainObject(entry) ? [entry.path, entry.sha256] : ['', '']
  )));
  const pgTapEntries = new Map(manifest.pgTapFiles.map((entry) => (
    isPlainObject(entry) ? [entry.path, entry.sha256] : ['', '']
  )));

  const baseIds = new Set();
  for (const base of manifest.upgradeBases) {
    if (!hasExactKeys(base, ['id', 'commitSha', 'migrations', 'migrationManifestSha256'])
      || typeof base.id !== 'string'
      || base.id.trim() === ''
      || !commitShaPattern.test(base.commitSha)
      || typeof base.migrationManifestSha256 !== 'string'
      || !sha256Pattern.test(base.migrationManifestSha256)) {
      errors.push('immutable upgrade base契約が不正です。');
      continue;
    }
    if (baseIds.has(base.id)) errors.push(`immutable upgrade baseが重複しています: ${base.id}`);
    baseIds.add(base.id);
    const migrations = validateFileEntries(base.migrations, errors, `immutable upgrade base ${base.id}`);
    if (migrations.length === 0) errors.push(`immutable upgrade base ${base.id}のmigrationが0件です。`);
  }
  if (manifest.upgradeBases.length === 0) errors.push('immutable upgrade baseをexactに1件以上要求します。');

  const scenarioNames = new Set();
  for (const scenario of manifest.upgradeScenarios) {
    if (validateUpgradeScenario(
      scenario,
      errors,
      'upgrade scenario',
      ['name', 'baseId', 'fixture', 'expectedMigrationFiles', 'pgTapFiles'],
    )) {
      if (scenarioNames.has(scenario.name)) errors.push(`upgrade scenarioが重複しています: ${scenario.name}`);
      scenarioNames.add(scenario.name);
      if (!baseIds.has(scenario.baseId)) errors.push(`upgrade scenarioのbaseが未登録です: ${scenario.baseId}`);
      assertListedFileEntries([scenario.fixture], fixtureEntries, errors, 'upgrade scenario fixture');
      assertListedFileEntries(scenario.pgTapFiles, pgTapEntries, errors, 'upgrade scenario pgTAP');
    }
  }
  for (const failure of manifest.upgradeFailures) {
    if (validateUpgradeScenario(
      failure,
      errors,
      'upgrade failure',
      ['name', 'baseId', 'fixture', 'expectedMigrationFiles', 'expectedError', 'residueObjects'],
    )) {
      if (scenarioNames.has(failure.name)) errors.push(`upgrade scenario/failure名が重複しています: ${failure.name}`);
      scenarioNames.add(failure.name);
      if (!baseIds.has(failure.baseId)) errors.push(`upgrade failureのbaseが未登録です: ${failure.baseId}`);
      assertListedFileEntries([failure.fixture], fixtureEntries, errors, 'upgrade failure fixture');
    }
  }
  validateFileEntries(manifest.normalPgTapFiles, errors, 'normal pgTAP');
  validateFileEntries(manifest.racePgTapFiles, errors, 'race pgTAP');
  validateFileEntries(manifest.postUpgradePgTapFiles, errors, 'post-upgrade pgTAP');
  assertListedFileEntries(manifest.normalPgTapFiles, pgTapEntries, errors, 'normal pgTAP');
  assertListedFileEntries(manifest.racePgTapFiles, pgTapEntries, errors, 'race pgTAP');
  assertListedFileEntries(manifest.postUpgradePgTapFiles, pgTapEntries, errors, 'post-upgrade pgTAP');
  if (manifest.m1ScenarioState === 'not-registered'
    && (manifest.upgradeScenarios.length !== 0
      || manifest.upgradeFailures.length !== 0
      || manifest.normalPgTapFiles.length !== 0
      || manifest.racePgTapFiles.length !== 0
      || manifest.postUpgradePgTapFiles.length !== 0)) {
    errors.push('M1 scenario未登録状態ではupgrade scenario/failure/専用pgTAPをexactに0件にします。');
  }
  if (manifest.m1ScenarioState === 'registered'
    && (manifest.upgradeScenarios.length === 0
      || manifest.upgradeFailures.length === 0
      || manifest.normalPgTapFiles.length === 0
      || manifest.racePgTapFiles.length === 0
      || manifest.postUpgradePgTapFiles.length === 0)) {
    errors.push('M1 scenario登録状態ではnormal/race/post-upgradeと実migration失敗scenarioを全て要求します。');
  }
  if (manifest.m1ScenarioState === 'registered' && manifest.upgradeScenarios.length !== 1) {
    errors.push('M1 scenario登録状態では正常upgrade scenarioをexactに1件要求します。');
  }
  if (manifest.m1ScenarioState === 'registered' && manifest.upgradeScenarios.length === 1) {
    const [normalScenario] = manifest.upgradeScenarios;
    if (isPlainObject(normalScenario)
      && JSON.stringify(normalScenario.pgTapFiles) !== JSON.stringify(manifest.normalPgTapFiles)) {
      errors.push('正常upgrade scenarioのpgTAP一覧はnormalPgTapFilesとexact一致させます。');
    }
  }

  const phasePgTapPaths = [
    ...manifest.normalPgTapFiles,
    ...manifest.racePgTapFiles,
    ...manifest.postUpgradePgTapFiles,
  ].filter((entry) => isPlainObject(entry) && typeof entry.path === 'string').map((entry) => entry.path);
  if (new Set(phasePgTapPaths).size !== phasePgTapPaths.length) {
    errors.push('phase専用pgTAPを複数phaseへ重複登録できません。');
  }

  return { ok: errors.length === 0, errors };
}

export function verifyM1ScenarioRegistration({ manifest, migrationFiles }) {
  if (!isPlainObject(manifest)
    || !['not-registered', 'registered'].includes(manifest.m1ScenarioState)
    || !Array.isArray(migrationFiles)
    || !migrationFiles.every((entry) => isPlainRecord(entry)
      && typeof entry.path === 'string'
      && typeof entry.content === 'string')) {
    return { ok: false, errors: ['M1 scenario登録検査の入力が不正です。'] };
  }
  const m1Exists = migrationFiles.some(({ path }) => (
    typeof path === 'string' && m1MigrationPattern.test(path)
  ));
  if (!m1Exists) return { ok: manifest.m1ScenarioState === 'not-registered', errors: manifest.m1ScenarioState === 'not-registered' ? [] : ['M1 migration不在時はscenario登録状態にできません。'] };
  if (manifest.m1ScenarioState !== 'registered') {
    return { ok: false, errors: ['M1 migrationを検出しましたが、実upgrade scenarioが未登録です。'] };
  }
  return { ok: true, errors: [] };
}

export function verifyFixtureManifestV2File({ manifestContent, fixtureFiles, pgTapFiles }) {
  let manifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch {
    return { ok: false, errors: ['DB fixture manifest v2をJSONとして解析できません。'] };
  }
  const referencedFixtures = fixtureFiles.filter(({ path }) => path !== 'manifest.json');
  const result = verifyDatabaseFixtureManifestV2({ manifest, fixtureFiles: referencedFixtures, pgTapFiles });
  if (fixtureFiles.filter(({ path }) => path === 'manifest.json').length !== 1) {
    return { ok: false, errors: [...result.errors, 'fixture manifest.jsonをexactに1件要求します。'] };
  }
  return result;
}

export function verifyDatabaseFixtureManifest({ manifest, fixtureFiles, pgTapFiles }) {
  const errors = [];
  if (!hasExactKeys(manifest, [
    'schemaVersion',
    'files',
    'pgTapFiles',
    'originMainFixture',
    'atomicFailures',
  ]) || manifest.schemaVersion !== 'database-harness-fixture-manifest.v1'
    || !Array.isArray(manifest.files)
    || !Array.isArray(manifest.pgTapFiles)
    || !Array.isArray(manifest.atomicFailures)) {
    return { ok: false, errors: ['DB fixture manifestのschemaが不正です。'] };
  }

  const expectedFiles = manifest.files.filter((entry) => validateFileEntry(entry, errors, 'fixture'))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const actualFiles = normalizeActualFiles(fixtureFiles, errors, 'fixture');
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    errors.push('fixtureのfilename・SHA-256完全一覧がmanifestと一致しません。');
  }

  const expectedPgTap = manifest.pgTapFiles.filter((entry) => validateFileEntry(entry, errors, 'pgTAP'))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const actualPgTap = normalizeActualFiles(pgTapFiles, errors, 'pgTAP');
  if (JSON.stringify(expectedPgTap) !== JSON.stringify(actualPgTap)) {
    errors.push('再帰取得した全pgTAPのfilename・SHA-256がmanifestと一致しません。');
  }

  if (!hasExactKeys(manifest.originMainFixture, ['path', 'sha256'])
    || !validateFileEntry(manifest.originMainFixture, errors, 'origin-main')) {
    errors.push('origin-main fixture契約が不正です。');
  }

  const foundKinds = [];
  for (const atomic of manifest.atomicFailures) {
    if (!hasExactKeys(atomic, ['kind', 'path', 'sha256', 'expectedError', 'residueObjects'])
      || !atomicKinds.includes(atomic.kind)
      || typeof atomic.expectedError !== 'string'
      || atomic.expectedError.trim() === ''
      || !Array.isArray(atomic.residueObjects)
      || atomic.residueObjects.length === 0
      || atomic.residueObjects.some((value) => typeof value !== 'string' || value.trim() === '')
      || new Set(atomic.residueObjects).size !== atomic.residueObjects.length) {
      errors.push('atomic failure fixture契約が不正です。');
      continue;
    }
    validateFileEntry({ path: atomic.path, sha256: atomic.sha256 }, errors, 'atomic failure');
    foundKinds.push(atomic.kind);
  }
  if (JSON.stringify([...foundKinds].sort()) !== JSON.stringify([...atomicKinds].sort())) {
    errors.push('preflight・constraint・trigger・workerのatomic fixtureをexactに1件ずつ要求します。');
  }

  const fileMap = new Map(expectedFiles.map((entry) => [entry.path, entry.sha256]));
  const semanticEntries = [manifest.originMainFixture, ...manifest.atomicFailures];
  for (const entry of semanticEntries) {
    if (isPlainObject(entry)
      && typeof entry.path === 'string'
      && typeof entry.sha256 === 'string'
      && fileMap.get(entry.path) !== entry.sha256) {
      errors.push(`fixture意味契約がfile一覧と一致しません: ${entry.path}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function verifyFixtureManifestFile({ manifestContent, fixtureFiles, pgTapFiles }) {
  let manifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch {
    return { ok: false, errors: ['DB fixture manifestをJSONとして解析できません。'] };
  }
  const referencedFixtures = fixtureFiles.filter(({ path }) => path !== 'manifest.json');
  const result = verifyDatabaseFixtureManifest({ manifest, fixtureFiles: referencedFixtures, pgTapFiles });
  if (fixtureFiles.filter(({ path }) => path === 'manifest.json').length !== 1) {
    return { ok: false, errors: [...result.errors, 'fixture manifest.jsonをexactに1件要求します。'] };
  }
  return result;
}

export function selectProductionBoundaryPaths(paths) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) return [];
  return paths.filter((path) => (
    /^supabase\/migrations\/[^/]+\.sql$/u.test(path)
    || path === 'supabase/migrations/manifest.json'
    || path === 'supabase/seed.sql'
    || /^supabase\/seeds\//u.test(path)
    || /^src\/content\//u.test(path)
    || /^outputs\/production\//u.test(path)
    || /^artifacts\/production\//u.test(path)
    || /^release\/artifacts\//u.test(path)
  )).sort();
}
