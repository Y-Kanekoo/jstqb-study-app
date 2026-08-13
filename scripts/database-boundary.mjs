import { createHash } from 'node:crypto';

const sha256Pattern = /^[0-9a-f]{64}$/u;
const atomicKinds = Object.freeze(['preflight', 'constraint', 'trigger', 'worker']);

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    .sort((left, right) => left.path.localeCompare(right.path));
  const actualFiles = normalizeActualFiles(fixtureFiles, errors, 'fixture');
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    errors.push('fixtureのfilename・SHA-256完全一覧がmanifestと一致しません。');
  }

  const expectedPgTap = manifest.pgTapFiles.filter((entry) => validateFileEntry(entry, errors, 'pgTAP'))
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
    if (typeof entry.path === 'string'
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
