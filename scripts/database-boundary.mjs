import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const sha256Pattern = /^[0-9a-f]{64}$/u;
const sqlStatePattern = /^[0-9A-Z]{5}$/u;
const atomicKinds = Object.freeze(['preflight', 'constraint', 'trigger', 'worker']);
const m1MigrationName = '20260814000200_learning_foundation_v2.sql';
const legacySecuritySuitePath = 'database_harness_security.test.sql';
const v2SecuritySuitePath = 'database_harness_security_v2.test.sql';
const legacySecuritySuiteSha256 = '3e1e8c886238909f5e042cbecdba3b64fa020f656e5098b6218bcbf1e831c0aa';
const fixedBase = Object.freeze({
  commitSha: '00411ef12777fdda151a66833598f6805fdfdf63',
  sourcePullRequest: 9,
  sourceHeadSha: '31c87247dcf36e6df036912a07318f3cd68f448b',
  migrationManifestSha256: '4dadc4bd785725951cdd5f5438396404ce960c858a1d4e9c9f123b3733b869e1',
  migrations: Object.freeze([
    Object.freeze({ file: '202608110001_initial.sql', sha256: '05b3972f32686fe06d55f3981ded1f02e8a951baedd6154ab67a507a4e90cc48' }),
    Object.freeze({ file: '202608140001_function_execute_security.sql', sha256: 'd08b5a56b156c27385d788670b1c1d3dc73b49379ea9fd3743298790f084660b' }),
  ]),
});
const fixedUpgradeBase = Object.freeze({
  id: 'pr9-main-00411ef',
  fixturePath: 'origin-main-shape.sql',
  fixtureSha256: '46803f9e96df9720931f4355219d5369e6d77c778ce0ffbbb1202bab720ff503',
});
export const failureSnapshotScopes = Object.freeze(['schema', 'acl', 'roles', 'migration-history', 'data', 'sequences']);
export const registeredUpgradeScenarioIds = Object.freeze([
  'm1-expired-decision-table',
  'm1-legacy-content-integrity',
  'm1-legacy-five-kind-acl',
  'm1-legacy-request-fingerprint',
  'm1-normal-upgrade',
]);
export const registeredUpgradeFailureIds = Object.freeze([
  'm1-active-answer-key-count-mismatch',
  'm1-active-answer-key-foreign-choice',
  'm1-active-answer-key-missing',
  'm1-active-completed-at-present',
  'm1-active-revision-negative',
  'm1-active-revision-unsafe',
  'm1-active-updated-before-started',
  'm1-answered-question-set-duplicate',
  'm1-answered-set-foreign',
  'm1-attempt-owner-mismatch',
  'm1-attempt-question-mismatch',
  'm1-attempt-session-mismatch',
  'm1-attempt-version-mismatch',
  'm1-bookmark-time-order-invalid',
  'm1-choice-order-gap',
  'm1-completed-answer-key-count-mismatch',
  'm1-completed-answer-key-foreign-choice',
  'm1-completed-answer-key-missing',
  'm1-completed-answered-set-incomplete',
  'm1-completed-completed-at-missing',
  'm1-completed-effective-attempt-missing',
  'm1-completed-revision-negative',
  'm1-completed-revision-unsafe',
  'm1-completed-updated-before-completed',
  'm1-current-index-invalid',
  'm1-current-version-question-mismatch',
  'm1-draft-owner-mismatch',
  'm1-draft-question-foreign',
  'm1-draft-revision-negative',
  'm1-draft-revision-unsafe',
  'm1-draft-selected-choice-count-exceeded',
  'm1-draft-selected-choice-foreign',
  'm1-duplicate-attempt',
  'm1-duplicate-session-question',
  'm1-empty-question-ids',
  'm1-expired-answer-key-count-mismatch',
  'm1-expired-answer-key-foreign-choice',
  'm1-expired-answer-key-missing',
  'm1-expired-revision-max-safe',
  'm1-expired-revision-max-safe-plus-one',
  'm1-expired-revision-negative',
  'm1-expired-revision-zero',
  'm1-expired-updated-before-started',
  'm1-foreign-selected-choice',
  'm1-invalidation-reason-only',
  'm1-invalidation-timestamp-only',
  'm1-legacy-content-collision',
  'm1-missing-pin',
  'm1-selected-choice-duplicate',
  'm1-started-after-terminal',
  'm1-terminal-after-migration-recorded',
]);
const registeredFailureIdSetHash = '1e1d751eb194f6eb66a8aae95f9a2d610d754742a3ba4d985465245dd15901f8';
const registeredFailurePairSetHash = 'a4aa023b759fe0f70aaec7da014ec235625a6aa4b1baad6910fca7b712a5144b';
const registeredPhaseDefinitions = Object.freeze([
  Object.freeze({ id: 'atomic-failure-reapply-post', phase: 'atomic-failure', checkpoint: 'clean-reapply-post', path: v2SecuritySuitePath }),
  Object.freeze({ id: 'fresh-head', phase: 'fresh', checkpoint: 'post-head', path: v2SecuritySuitePath }),
  Object.freeze({ id: 'm1-normal-post', phase: 'origin-main-upgrade', checkpoint: 'normal-scenario-post', path: v2SecuritySuitePath }),
  Object.freeze({ id: 'm1-race-post', phase: 'combined-order', checkpoint: 'race-reapply-post', path: v2SecuritySuitePath }),
  Object.freeze({ id: 'origin-main-upgrade-base', phase: 'origin-main-upgrade', checkpoint: 'pre-target', path: legacySecuritySuitePath }),
  Object.freeze({ id: 'origin-main-upgrade-post', phase: 'origin-main-upgrade', checkpoint: 'post-target', path: v2SecuritySuitePath }),
  Object.freeze({ id: 'production-boundary-head', phase: 'production-boundary', checkpoint: 'fixture-free-head', path: v2SecuritySuitePath }),
]);

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

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isSortedUnique(values, getKey) {
  const keys = values.map(getKey);
  return keys.every((key, index) => index === 0 || compareUtf8(keys[index - 1], key) < 0);
}

function isSafeRelativePath(path) {
  if (typeof path !== 'string' || path === '' || path.startsWith('/') || path.includes('\\')) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== ''
    && segment !== '.'
    && segment !== '..'
    && !segment.startsWith('.')
    && !segment.endsWith('~')
    && !segment.endsWith('.tmp')
    && !segment.endsWith('.swp'));
}

function isFixturePath(path) {
  return isSafeRelativePath(path) && path !== 'manifest.json';
}

function isPgTapPath(path) {
  return isSafeRelativePath(path) && path.endsWith('.sql');
}

function validateFileEntry(entry, errors, label) {
  if (!hasExactKeys(entry, ['path', 'sha256'])
    || !isSafeRelativePath(entry.path)
    || typeof entry.sha256 !== 'string'
    || !sha256Pattern.test(entry.sha256)) {
    errors.push(`${label}のfile entryが不正です。`);
    return false;
  }
  return true;
}

function normalizeActualFiles(files, errors, label, pathValidator = isSafeRelativePath) {
  if (!Array.isArray(files)) {
    errors.push(`${label}のfile一覧が不正です。`);
    return [];
  }
  return files.map((entry) => {
    if (!hasExactKeys(entry, ['path', 'content'])
      || !pathValidator(entry.path)
      || typeof entry.content !== 'string') {
      errors.push(`${label}のfile内容が不正です。`);
      return null;
    }
    return { path: entry.path, sha256: sha256(entry.content) };
  }).filter((entry) => entry !== null).sort((left, right) => compareUtf8(left.path, right.path));
}

function validateFileEntries(entries, errors, label, pathValidator = isSafeRelativePath) {
  if (!Array.isArray(entries)) {
    errors.push(`${label}のfile一覧が不正です。`);
    return [];
  }
  const normalized = entries.filter((entry) => validateFileEntry(entry, errors, label) && pathValidator(entry.path))
    .map(({ path, sha256: digest }) => ({ path, sha256: digest }));
  if (new Set(normalized.map(({ path }) => path)).size !== normalized.length) {
    errors.push(`${label}のfile pathが重複しています。`);
  }
  return normalized;
}

function hasExactEntries(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function exactBase(base, errors) {
  if (!hasExactKeys(base, ['commitSha', 'sourcePullRequest', 'sourceHeadSha', 'migrationManifestSha256', 'migrations'])) {
    errors.push('immutable fixed base契約が正本literalと一致しません。');
    return;
  }
  if (base.commitSha !== fixedBase.commitSha
    || base.sourcePullRequest !== fixedBase.sourcePullRequest
    || base.sourceHeadSha !== fixedBase.sourceHeadSha
    || base.migrationManifestSha256 !== fixedBase.migrationManifestSha256
    || !Array.isArray(base.migrations)
    || !isSortedUnique(base.migrations, (entry) => (isPlainObject(entry) && typeof entry.file === 'string' ? entry.file : ''))
    || !hasExactEntries(base.migrations, fixedBase.migrations)) {
    errors.push('immutable fixed base契約が正本literalと一致しません。');
  }
}

function causeCodeFromId(id) {
  return id.slice(3).replaceAll('-', '_');
}

function fixtureBasename(path) {
  return path.split('/').at(-1) ?? '';
}

function sha256Jcs(value) {
  return sha256(JSON.stringify(value));
}

function validatePathAndHash(path, digest, fileEntries, errors, label) {
  if (!isFixturePath(path) || typeof digest !== 'string' || !sha256Pattern.test(digest)
    || fileEntries.get(path) !== digest) {
    errors.push(`${label}がfixture完全一覧と一致しません。`);
  }
}

function validatePhaseEntries(entries, errors, pgTapEntries) {
  if (!Array.isArray(entries)
    || !isSortedUnique(entries, (entry) => (isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : ''))) {
    errors.push('phase pgTAP registryのid順または構造が不正です。');
    return;
  }
  const tuples = new Set();
  for (const entry of entries) {
    if (!hasExactKeys(entry, ['id', 'path', 'sha256', 'phase', 'checkpoint'])
      || typeof entry.id !== 'string' || entry.id === ''
      || !isPgTapPath(entry.path) || typeof entry.sha256 !== 'string' || !sha256Pattern.test(entry.sha256)
      || !['fresh', 'origin-main-upgrade', 'combined-order', 'atomic-failure', 'production-boundary'].includes(entry.phase)
      || typeof entry.checkpoint !== 'string' || entry.checkpoint === '') {
      errors.push('phase pgTAP entryが不正です。');
      continue;
    }
    const tuple = `${entry.phase}\u0000${entry.checkpoint}\u0000${entry.path}`;
    if (tuples.has(tuple)) errors.push('phase pgTAP contextが重複しています。');
    tuples.add(tuple);
    if (pgTapEntries.get(entry.path) !== entry.sha256) errors.push(`phase pgTAPが発見済みfileと一致しません: ${entry.id}`);
  }
}

function validateUpgradeBaseEntries(entries, errors, fileEntries) {
  if (!Array.isArray(entries) || !isSortedUnique(entries, (entry) => (
    isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : ''
  )) || !hasExactEntries(entries, [fixedUpgradeBase])) {
    errors.push('upgrade base registryがfixed base正本と一致しません。');
    return;
  }
  validatePathAndHash(entries[0].fixturePath, entries[0].fixtureSha256, fileEntries, errors, 'upgrade base fixture');
}

function validateRegisteredScenarios(entries, errors, fileEntries) {
  if (!Array.isArray(entries) || !isSortedUnique(entries, (entry) => (
    isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : ''
  )) || !hasExactEntries(entries.map((entry) => entry?.id), registeredUpgradeScenarioIds)) {
    errors.push('registered upgrade scenario registryが正本literalと一致しません。');
    return;
  }
  for (const entry of entries) {
    if (!hasExactKeys(entry, ['id', 'baseId', 'fixturePath', 'fixtureSha256', 'targetMigration', 'assertionPath', 'assertionSha256'])) {
      errors.push('registered upgrade scenarioの構造が不正です。');
      continue;
    }
    if (entry.baseId !== fixedUpgradeBase.id || entry.targetMigration !== m1MigrationName) {
      errors.push('registered upgrade scenarioの構造が不正です。');
      continue;
    }
    validatePathAndHash(entry.fixturePath, entry.fixtureSha256, fileEntries, errors, `upgrade scenario ${entry.id} fixture`);
    validatePathAndHash(entry.assertionPath, entry.assertionSha256, fileEntries, errors, `upgrade scenario ${entry.id} assertion`);
  }
}

function validateRegisteredFailures(entries, errors, fileEntries) {
  if (!Array.isArray(entries) || !isSortedUnique(entries, (entry) => (
    isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : ''
  )) || !hasExactEntries(entries.map((entry) => entry?.id), registeredUpgradeFailureIds)) {
    errors.push('registered upgrade failure registryが正本literal 51件と一致しません。');
    return;
  }
  const pairs = [];
  for (const entry of entries) {
    if (!hasExactKeys(entry, ['id', 'causeCode', 'baseId', 'fixturePath', 'fixtureSha256', 'targetMigration', 'expectedSqlState', 'expectedError', 'residueObjects', 'snapshotScopes'])) {
      errors.push(`registered upgrade failureが不正です: ${entry?.id ?? 'unknown'}`);
      continue;
    }
    if (entry.causeCode !== causeCodeFromId(entry.id)
      || entry.baseId !== fixedUpgradeBase.id
      || entry.targetMigration !== m1MigrationName
      || fixtureBasename(entry.fixturePath) !== `${entry.id}.sql`
      || typeof entry.expectedSqlState !== 'string' || !sqlStatePattern.test(entry.expectedSqlState)
      || entry.expectedError !== entry.causeCode
      || !Array.isArray(entry.residueObjects) || entry.residueObjects.length === 0
      || entry.residueObjects.some((value) => typeof value !== 'string' || value === '')
      || new Set(entry.residueObjects).size !== entry.residueObjects.length
      || !hasExactEntries(entry.snapshotScopes, failureSnapshotScopes)) {
      errors.push(`registered upgrade failureが不正です: ${entry?.id ?? 'unknown'}`);
      continue;
    }
    validatePathAndHash(entry.fixturePath, entry.fixtureSha256, fileEntries, errors, `upgrade failure ${entry.id} fixture`);
    pairs.push({ causeCode: entry.causeCode, id: entry.id });
  }
  if (sha256Jcs(entries.map((entry) => entry.id)) !== registeredFailureIdSetHash
    || sha256Jcs(pairs) !== registeredFailurePairSetHash) {
    errors.push('registered upgrade failure registryのJCS SHA-256が正本と一致しません。');
  }
}

function validateRegisteredWriteRaces(entries, errors, fileEntries) {
  if (!Array.isArray(entries) || !isSortedUnique(entries, (entry) => (
    isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : ''
  )) || !hasExactEntries(entries.map((entry) => entry?.id), ['m1-legacy-write-race'])) {
    errors.push('registered write race registryが正本literalと一致しません。');
    return;
  }
  const [entry] = entries;
  if (!hasExactKeys(entry, ['id', 'baseId', 'fixturePath', 'fixtureSha256', 'targetMigration', 'writerPath', 'writerSha256', 'barrierProtocol'])) {
    errors.push('registered write raceの構造が不正です。');
    return;
  }
  if (entry.baseId !== fixedUpgradeBase.id
    || entry.targetMigration !== m1MigrationName
    || entry.barrierProtocol !== 'two-connection-table-lock-v1') {
    errors.push('registered write raceの構造が不正です。');
    return;
  }
  validatePathAndHash(entry.fixturePath, entry.fixtureSha256, fileEntries, errors, 'write race fixture');
  validatePathAndHash(entry.writerPath, entry.writerSha256, fileEntries, errors, 'write race writer');
}

/**
 * v2はM1の実migration upgradeを固定baseから検証するための契約である。
 * v1は既存の回帰testだけの互換用であり、production runnerでは使用しない。
 */
export function verifyDatabaseFixtureManifestV2({ manifest, fixtureFiles, pgTapFiles }) {
  const errors = [];
  const expectedKeys = [
    'schemaVersion',
    'm1ScenarioState',
    'targetMigration',
    'base',
    'files',
    'pgTapFiles',
    'phasePgTapFiles',
    'genericPgTapExclusions',
    'upgradeBases',
    'upgradeScenarios',
    'upgradeFailures',
    'writeRaces',
    'productionBoundaryCanaries',
  ];
  if (!hasExactKeys(manifest, expectedKeys)
    || manifest.schemaVersion !== 'database-harness-fixture-manifest.v2'
    || !['not-registered', 'registered'].includes(manifest.m1ScenarioState)
    || !Array.isArray(manifest.files)
    || !Array.isArray(manifest.pgTapFiles)
    || !Array.isArray(manifest.phasePgTapFiles)
    || !Array.isArray(manifest.genericPgTapExclusions)
    || !Array.isArray(manifest.upgradeBases)
    || !Array.isArray(manifest.upgradeScenarios)
    || !Array.isArray(manifest.upgradeFailures)
    || !Array.isArray(manifest.writeRaces)) {
    return { ok: false, errors: ['DB fixture manifest v2のschemaが不正です。'] };
  }

  exactBase(manifest.base, errors);
  const expectedFixtures = validateFileEntries(manifest.files, errors, 'fixture', isFixturePath)
    .sort((left, right) => compareUtf8(left.path, right.path));
  const actualFixtures = normalizeActualFiles(fixtureFiles, errors, 'fixture', isFixturePath);
  if (!isSortedUnique(manifest.files, (entry) => (isPlainObject(entry) && typeof entry.path === 'string' ? entry.path : ''))
    || !hasExactEntries(expectedFixtures, actualFixtures)) {
    errors.push('fixtureのfilename・SHA-256完全一覧がmanifestと一致しません。');
  }
  const fileEntries = new Map(expectedFixtures.map(({ path, sha256: digest }) => [path, digest]));
  const expectedGenericPgTap = validateFileEntries(manifest.pgTapFiles, errors, 'generic pgTAP', isPgTapPath)
    .sort((left, right) => compareUtf8(left.path, right.path));
  const actualPgTap = normalizeActualFiles(pgTapFiles, errors, 'pgTAP', isPgTapPath);
  const pgTapEntries = new Map(actualPgTap.map(({ path, sha256: digest }) => [path, digest]));
  validatePhaseEntries(manifest.phasePgTapFiles, errors, pgTapEntries);
  if (!isSortedUnique(manifest.pgTapFiles, (entry) => (isPlainObject(entry) && typeof entry.path === 'string' ? entry.path : ''))
    || !isSortedUnique(manifest.genericPgTapExclusions, (entry) => (typeof entry === 'string' ? entry : ''))
    || manifest.genericPgTapExclusions.some((path) => !isPgTapPath(path))
    || new Set(manifest.genericPgTapExclusions).size !== manifest.genericPgTapExclusions.length
    || expectedGenericPgTap.some(({ path }) => manifest.genericPgTapExclusions.includes(path))) {
    errors.push('generic pgTAP exclusion契約が不正です。');
  }
  const phasePaths = [...new Set(manifest.phasePgTapFiles.map((entry) => (
    isPlainObject(entry) ? entry.path : ''
  )))].sort(compareUtf8);
  if (!hasExactEntries(phasePaths, [...manifest.genericPgTapExclusions].sort(compareUtf8))) {
    errors.push('phase pgTAP registryとgeneric exclusionのpath集合が一致しません。');
  }
  const phasePgTapByPath = new Map();
  for (const entry of manifest.phasePgTapFiles) {
    if (!isPlainObject(entry) || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') continue;
    const { path, sha256: digest } = entry;
    const existing = phasePgTapByPath.get(path);
    if (existing !== undefined && existing !== digest) errors.push(`phase pgTAPのSHA-256がpathごとに不一致です: ${path}`);
    phasePgTapByPath.set(path, digest);
  }
  const allDeclaredPgTap = [...expectedGenericPgTap, ...[...phasePgTapByPath].map(([path, digest]) => ({ path, sha256: digest }))]
    .sort((left, right) => compareUtf8(left.path, right.path));
  if (!hasExactEntries(allDeclaredPgTap, actualPgTap)) {
    errors.push('pgTAPの発見済み完全一覧がgeneric/phase registryと一致しません。');
  }
  validateUpgradeBaseEntries(manifest.upgradeBases, errors, fileEntries);
  if (!hasExactKeys(manifest.productionBoundaryCanaries, ['path', 'sha256'])) {
    errors.push('production boundary canary契約が不正です。');
  } else {
    if (manifest.productionBoundaryCanaries.path !== 'production-boundary-canaries.json') {
      errors.push('production boundary canaryのpathはproduction-boundary-canaries.jsonで固定します。');
    }
    validatePathAndHash(
      manifest.productionBoundaryCanaries.path,
      manifest.productionBoundaryCanaries.sha256,
      fileEntries,
      errors,
      'production boundary canary',
    );
  }

  const expectedPreM1Phase = [{
    id: 'origin-main-upgrade-base',
    path: legacySecuritySuitePath,
    sha256: legacySecuritySuiteSha256,
    phase: 'origin-main-upgrade',
    checkpoint: 'pre-target',
  }];
  if (manifest.m1ScenarioState === 'not-registered') {
    if (manifest.targetMigration !== null
      || !hasExactEntries(manifest.upgradeScenarios, [])
      || !hasExactEntries(manifest.upgradeFailures, [])
      || !hasExactEntries(manifest.writeRaces, [])
      || !hasExactEntries(manifest.genericPgTapExclusions, [legacySecuritySuitePath])
      || !hasExactEntries(manifest.phasePgTapFiles, expectedPreM1Phase)) {
      errors.push('M1 scenario未登録profileがfixed pre-M1契約と一致しません。');
    }
  } else {
    if (manifest.targetMigration !== m1MigrationName
      || !hasExactEntries(manifest.genericPgTapExclusions, [legacySecuritySuitePath, v2SecuritySuitePath])) {
      errors.push('M1 scenario登録profileのtargetまたはgeneric exclusionが不正です。');
    }
    const actualDefinitions = manifest.phasePgTapFiles.map((entry) => {
      if (!isPlainObject(entry)) return null;
      return {
        id: entry.id,
        phase: entry.phase,
        checkpoint: entry.checkpoint,
        path: entry.path,
      };
    });
    if (!hasExactEntries(actualDefinitions, registeredPhaseDefinitions)) {
      errors.push('M1 scenario登録profileのphase pgTAP registryが正本7件と一致しません。');
    }
    validateRegisteredScenarios(manifest.upgradeScenarios, errors, fileEntries);
    validateRegisteredFailures(manifest.upgradeFailures, errors, fileEntries);
    validateRegisteredWriteRaces(manifest.writeRaces, errors, fileEntries);
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
  const m1Exists = migrationFiles.some(({ path }) => typeof path === 'string' && path === m1MigrationName);
  if (!m1Exists) {
    return manifest.m1ScenarioState === 'not-registered' && manifest.targetMigration === null
      ? { ok: true, errors: [] }
      : { ok: false, errors: ['M1 migration不在時は未登録profileとtarget nullを要求します。'] };
  }
  if (manifest.m1ScenarioState !== 'registered' || manifest.targetMigration !== m1MigrationName) {
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
    .sort((left, right) => compareUtf8(left.path, right.path));
  const actualFiles = normalizeActualFiles(fixtureFiles, errors, 'fixture');
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    errors.push('fixtureのfilename・SHA-256完全一覧がmanifestと一致しません。');
  }

  const expectedPgTap = manifest.pgTapFiles.filter((entry) => validateFileEntry(entry, errors, 'pgTAP'))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort((left, right) => compareUtf8(left.path, right.path));
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
