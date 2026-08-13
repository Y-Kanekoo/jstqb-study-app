import { createHash } from 'node:crypto';

export const databasePhaseNames = Object.freeze([
  'fresh',
  'origin-main-upgrade',
  'combined-order',
  'atomic-failure',
  'production-boundary',
]);

const sha256Pattern = /^[0-9a-f]{64}$/u;
const migrationFilePattern = /^\d{12,14}_[a-z0-9_]+\.sql$/u;

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function basename(path) {
  return path.split('/').at(-1) ?? '';
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function redactDatabaseOutput(output) {
  return String(output)
    .replaceAll(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/giu, '[機密接続情報を伏せました]')
    .replaceAll(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/gu, '[JWTを伏せました]')
    .replaceAll(/\b[A-Za-z0-9_-]{24,}\b/gu, '[長いtoken候補を伏せました]')
    .replaceAll(/\b(?:password|token|secret|key|credential)\b\s*[:=]\s*[^\s]+/giu, '[機密値を伏せました]');
}

export function verifyMigrationManifest({ manifest, migrationFiles }) {
  const errors = [];
  if (!hasExactKeys(manifest, ['schemaVersion', 'migrations'])
    || manifest.schemaVersion !== 'production-migration-manifest.v1'
    || !Array.isArray(manifest.migrations)) {
    return { ok: false, errors: ['production migration manifestのschemaが不正です。'] };
  }
  if (!Array.isArray(migrationFiles)) {
    return { ok: false, errors: ['migration file一覧が不正です。'] };
  }

  const normalizedFiles = migrationFiles.map((entry) => {
    if (!hasExactKeys(entry, ['path', 'content'])
      || typeof entry.path !== 'string'
      || typeof entry.content !== 'string') {
      errors.push('migration file entryが不正です。');
      return null;
    }
    const file = basename(entry.path);
    if (!migrationFilePattern.test(file) || entry.path !== file && !entry.path.endsWith(`/migrations/${file}`)) {
      errors.push(`migration file pathが不正です: ${entry.path}`);
    }
    return { file, sha256: sha256(entry.content) };
  });

  const manifestEntries = manifest.migrations.map((entry) => {
    if (!hasExactKeys(entry, ['file', 'sha256'])
      || typeof entry.file !== 'string'
      || typeof entry.sha256 !== 'string'
      || !migrationFilePattern.test(entry.file)
      || !sha256Pattern.test(entry.sha256)) {
      errors.push('migration manifest entryが不正です。');
      return null;
    }
    return { file: entry.file, sha256: entry.sha256 };
  });

  if (errors.length === 0 && JSON.stringify(normalizedFiles) !== JSON.stringify(manifestEntries)) {
    errors.push('production migrationのfilename・順序・SHA-256がmanifestと一致しません。');
  }
  return { ok: errors.length === 0, errors };
}

export function verifyProductionBoundary({ canaryRegistry, productionFiles, fixtureFiles }) {
  const errors = [];
  if (!hasExactKeys(canaryRegistry, ['schemaVersion', 'canaries'])
    || canaryRegistry.schemaVersion !== 'database-harness-canary-registry.v1'
    || !Array.isArray(canaryRegistry.canaries)) {
    return { ok: false, errors: ['DB harness canary registryのschemaが不正です。'] };
  }
  const canaries = canaryRegistry.canaries;
  if (canaries.some((canary) => typeof canary !== 'string' || canary.trim() === '' || canary !== canary.trim())) {
    errors.push('canaryはtrim後non-empty文字列でなければなりません。');
  }
  if (new Set(canaries).size !== canaries.length) errors.push('canaryが重複しています。');
  if (canaries.length === 0) errors.push('canary registryを空にはできません。');

  const validateFileList = (entries, boundary) => {
    if (!Array.isArray(entries)) {
      errors.push(`${boundary} file一覧が不正です。`);
      return [];
    }
    return entries.filter((entry) => {
      const valid = hasExactKeys(entry, ['path', 'content'])
        && typeof entry.path === 'string'
        && entry.path.trim() !== ''
        && typeof entry.content === 'string';
      if (!valid) errors.push(`${boundary} file entryが不正です。`);
      return valid;
    });
  };
  const production = validateFileList(productionFiles, 'production');
  const fixtures = validateFileList(fixtureFiles, 'fixture');
  if (fixtures.length === 0) errors.push('test専用fixtureがありません。');
  const registeredCanaries = new Set(canaries);
  const markerPatterns = [
    /\bDB[-_]HARNESS[-_][A-Z0-9_-]+\b/gu,
    /\bdb_harness_[a-z0-9_]+\b/gu,
    /\bdb[0-9a-f]{6}-[0-9a-f-]{27}\b/gu,
  ];
  for (const file of fixtures) {
    const discovered = markerPatterns.flatMap((pattern) => [...file.content.matchAll(pattern)].map(([value]) => value));
    for (const marker of new Set(discovered)) {
      if (!registeredCanaries.has(marker)) {
        errors.push(`fixture内のstable markerがcanary registryにありません: ${file.path}:${marker}`);
      }
    }
  }
  for (const canary of canaries) {
    if (!fixtures.some((file) => file.path.endsWith('.sql') && file.content.includes(canary))) {
      errors.push(`canaryをtest専用fixture内で確認できません: ${canary}`);
    }
  }
  for (const file of production) {
    for (const canary of canaries) {
      if (file.content.includes(canary)) errors.push(`production境界へcanaryが混入しています: ${file.path}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function runDatabaseHarness({ acquireLock, runPhase, log = console }) {
  if (typeof acquireLock !== 'function' || typeof runPhase !== 'function') {
    log.error('DB harnessの必須dependencyが不足しています。');
    return 1;
  }
  let releaseLock;
  try {
    releaseLock = await acquireLock();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harnessの共有排他lockを取得できません: ${redactDatabaseOutput(message)}`);
    return 1;
  }

  let status = 0;
  try {
    for (const phaseName of databasePhaseNames) {
      let result;
      try {
        result = await runPhase(phaseName);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`database phase ${phaseName}が例外で停止しました: ${redactDatabaseOutput(message)}`);
        status = 1;
        break;
      }
      if (!hasExactKeys(result, ['status', 'output'])
        || !Number.isInteger(result.status)
        || typeof result.output !== 'string') {
        log.error(`database phase ${phaseName}の実行結果が不正です。`);
        status = 1;
        break;
      }
      if (result.status !== 0) {
        log.error(`database phase ${phaseName}に失敗しました（終了コード${result.status}）。`);
        if (result.output.trim() !== '') log.error(redactDatabaseOutput(result.output));
        status = result.status;
        break;
      }
      if (typeof log.info === 'function') log.info(`database phase ${phaseName}: 成功`);
    }
  } finally {
    try {
      if (typeof releaseLock !== 'function') throw new Error('lock解放関数がありません。');
      await releaseLock();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`DB harnessの共有排他lock解放に失敗しました: ${redactDatabaseOutput(message)}`);
      if (status === 0) status = 1;
    }
  }
  return status;
}
