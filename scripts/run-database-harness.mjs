import { execFile as defaultExecFile, spawn as defaultSpawn } from 'node:child_process';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  redactDatabaseOutput,
  runDatabaseHarness,
  verifyMigrationManifest,
  verifyProductionBoundary,
} from './database-harness.mjs';
import { acquireRepositoryLock, projectLabel } from './test-database.mjs';

const execFile = promisify(defaultExecFile);
const workspacePath = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(workspacePath, 'supabase', 'migrations');
const fixtureDirectory = join(workspacePath, 'supabase', 'tests', 'fixtures');
const manifestPath = join(migrationDirectory, 'manifest.json');
const canaryRegistryPath = join(fixtureDirectory, 'production-boundary-canaries.json');
const originFixturePath = join(fixtureDirectory, 'origin-main-shape.sql');
const atomicFailureFixturePath = join(fixtureDirectory, 'atomic-failure.sql');
const projectId = projectLabel.split('=').at(-1) ?? '';
const databaseContainerName = `supabase_db_${projectId}`;
const projectLabelFilter = `label=${projectLabel}`;
const containerFormat = '{{.ID}}\t{{.Names}}';
const migrationFilePattern = /^\d{12,14}_[a-z0-9_]+\.sql$/u;
const fixtureMigrationVersion = '20260812999999';

function createCommandRunner(spawnCommand) {
  return (command, argumentsList, options = {}) => new Promise((resolveResult) => {
    const child = spawnCommand(command, argumentsList, {
      cwd: options.cwd ?? workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', (error) => resolveResult({ status: 1, output: `${output}${error.message}` }));
    child.once('exit', (code, signal) => resolveResult({ status: signal ? 1 : code ?? 1, output }));
    if (options.input !== undefined) {
      child.stdin?.write(options.input);
    }
    child.stdin?.end();
  });
}

function parseContainers(output) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [id = '', name = ''] = line.split('\t');
    return { id, name };
  }).filter(({ id, name }) => id !== '' && name !== '');
}

function asPhaseResult(result) {
  return { status: result.status, output: result.output };
}

async function listProjectContainers(runCommand) {
  const result = await runCommand('docker', [
    'ps', '--all', '--filter', projectLabelFilter, '--format', containerFormat,
  ]);
  return { ...result, containers: result.status === 0 ? parseContainers(result.output) : [] };
}

async function readFileEntries(directory, predicate) {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(names.map(async (name) => ({
    path: join(directory, name),
    content: await readFile(join(directory, name), 'utf8'),
  })));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function getOriginMigrationNames(execFileCommand) {
  const result = await execFileCommand('git', [
    'ls-tree', '-r', '--name-only', 'origin/main', 'supabase/migrations',
  ], { cwd: workspacePath, encoding: 'utf8' });
  return result.stdout.split('\n').map((line) => line.trim()).filter((line) => migrationFilePattern.test(basename(line)));
}

async function readOriginMigrationEntries(execFileCommand) {
  const names = await getOriginMigrationNames(execFileCommand);
  return Promise.all(names.map(async (path) => {
    const result = await execFileCommand('git', ['show', `origin/main:${path}`], {
      cwd: workspacePath,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return { path, content: result.stdout };
  }));
}

async function buildOriginUpgradeRoot({ execFileCommand, headMigrationFiles }) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'jstqb-origin-upgrade-'));
  const temporarySupabase = join(temporaryRoot, 'supabase');
  const temporaryMigrations = join(temporarySupabase, 'migrations');
  const temporaryTests = join(temporarySupabase, 'tests');
  await mkdir(temporaryMigrations, { recursive: true });
  await mkdir(temporaryTests, { recursive: true });
  await cp(join(workspacePath, 'supabase', 'config.toml'), join(temporarySupabase, 'config.toml'));
  const testFiles = await readFileEntries(join(workspacePath, 'supabase', 'tests'), (name) => name.endsWith('.sql'));
  for (const testFile of testFiles) {
    await writeFile(join(temporaryTests, basename(testFile.path)), testFile.content, { flag: 'wx' });
  }

  const originEntries = await readOriginMigrationEntries(execFileCommand);
  const originNames = new Set(originEntries.map(({ path }) => basename(path)));
  const originVersions = [...originNames].map((name) => name.split('_')[0] ?? '');
  const headOnlyVersions = headMigrationFiles
    .map(({ path }) => basename(path))
    .filter((name) => !originNames.has(name))
    .map((name) => name.split('_')[0] ?? '');
  if (originVersions.some((version) => version >= fixtureMigrationVersion)
    || headOnlyVersions.some((version) => version <= fixtureMigrationVersion)) {
    throw new Error('origin/main fixture用migration versionをorigin後・head追加migration前へ配置できません。');
  }
  for (const entry of originEntries) {
    await writeFile(join(temporaryMigrations, basename(entry.path)), entry.content, { flag: 'wx' });
  }
  await writeFile(
    join(temporaryMigrations, `${fixtureMigrationVersion}_origin_main_fixture.sql`),
    await readFile(originFixturePath, 'utf8'),
    { flag: 'wx' },
  );
  for (const entry of headMigrationFiles) {
    const name = basename(entry.path);
    if (!originNames.has(name)) await writeFile(join(temporaryMigrations, name), entry.content, { flag: 'wx' });
  }
  return { temporaryRoot, originEntries };
}

async function querySchemaSignature(runCommand) {
  const sql = `
    select md5(string_agg(signature, E'\\n' order by signature))
      from (
        select 'table:' || n.nspname || '.' || c.relname || ':' || c.relkind || ':' || c.relrowsecurity as signature
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r','v','m','p')
        union all
        select 'column:' || n.nspname || '.' || c.relname || ':' || a.attnum || ':' || a.attname || ':' ||
               pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' ||
               coalesce(pg_get_expr(d.adbin, d.adrelid), '')
          from pg_catalog.pg_attribute a
          join pg_catalog.pg_class c on c.oid = a.attrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
        union all
        select 'constraint:' || n.nspname || '.' || c.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid, true)
          from pg_catalog.pg_constraint con
          join pg_catalog.pg_class c on c.oid = con.conrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
        union all
        select 'index:' || schemaname || '.' || indexname || ':' || indexdef
          from pg_catalog.pg_indexes where schemaname = 'public'
        union all
        select 'trigger:' || n.nspname || '.' || c.relname || ':' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
          from pg_catalog.pg_trigger t
          join pg_catalog.pg_class c on c.oid = t.tgrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and not t.tgisinternal
        union all
        select 'enum:' || n.nspname || '.' || typ.typname || ':' || e.enumsortorder || ':' || e.enumlabel
          from pg_catalog.pg_type typ
          join pg_catalog.pg_namespace n on n.oid = typ.typnamespace
          join pg_catalog.pg_enum e on e.enumtypid = typ.oid
         where n.nspname = 'public'
        union all
        select 'function:' || n.nspname || '.' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' ||
               pg_get_functiondef(p.oid)
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
        union all
        select 'policy:' || schemaname || '.' || tablename || ':' || policyname || ':' || permissive || ':' ||
               roles::text || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '')
          from pg_catalog.pg_policies where schemaname = 'public'
        union all
        select 'table-grant:' || table_schema || '.' || table_name || ':' || grantee || ':' || privilege_type || ':' || is_grantable
          from information_schema.role_table_grants where table_schema = 'public'
        union all
        select 'routine-grant:' || routine_schema || '.' || routine_name || ':' || grantee || ':' || privilege_type || ':' || is_grantable
          from information_schema.role_routine_grants where routine_schema = 'public'
        union all
        select 'migration:' || version
          from supabase_migrations.schema_migrations
         where version <> '${fixtureMigrationVersion}'
      ) signatures;
  `;
  const result = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: sql });
  return result.status === 0 ? { ...result, signature: result.output.trim() } : { ...result, signature: '' };
}

async function assertAtomicFailure(runCommand) {
  const historyBefore = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: 'select count(*) from supabase_migrations.schema_migrations;' });
  if (historyBefore.status !== 0) return historyBefore;
  const fixture = await readFile(atomicFailureFixturePath, 'utf8');
  const result = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: fixture });
  if (result.status === 0 || !result.output.includes('DB_HARNESS_EXPECTED_ATOMIC_FAILURE_V1')) {
    return { status: 1, output: 'atomic-failure fixtureが規定の明示失敗になりませんでした。' };
  }
  const residue = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: "select coalesce(to_regclass('public.db_harness_atomic_failure_canary')::text, '') || ':' || (select count(*) from supabase_migrations.schema_migrations);" });
  if (residue.status !== 0 || residue.output.trim() !== `:${historyBefore.output.trim()}`) {
    return { status: 1, output: 'atomic-failure後にDDLまたはdataが残留しました。' };
  }
  return { status: 0, output: '' };
}

async function cleanupOwnedStack(runCommand, expectedNames, log) {
  const current = await listProjectContainers(runCommand);
  if (current.status !== 0) {
    log.error(`cleanup前のDocker照会に失敗しました: ${redactDatabaseOutput(current.output)}`);
    return current.status;
  }
  const known = new Set(expectedNames);
  if (current.containers.some(({ name }) => !known.has(name))) {
    log.error('未知の同project containerを検出したため、他agentのDBを停止しません。');
    return 1;
  }
  if (current.containers.length > 0) {
    const stopped = await runCommand('supabase', ['stop', '--no-backup']);
    if (stopped.status !== 0) {
      log.error(`supabase stopに失敗しました: ${redactDatabaseOutput(stopped.output)}`);
      return stopped.status;
    }
  }
  const remaining = await listProjectContainers(runCommand);
  if (remaining.status !== 0 || remaining.containers.length > 0) {
    log.error('DB harness終了後に同project containerが残留しています。');
    return remaining.status === 0 ? 1 : remaining.status;
  }
  return 0;
}

export async function runProductionDatabaseHarness({
  spawnCommand = defaultSpawn,
  execFileCommand = execFile,
  acquireLock = acquireRepositoryLock,
  log = console,
} = {}) {
  const runCommand = createCommandRunner(spawnCommand);
  let expectedNames = [];
  let temporaryUpgradeRoot;
  let freshSignature = '';
  let upgradeSignature = '';
  let startHead = '';

  const headMigrationFiles = await readFileEntries(migrationDirectory, (name) => migrationFilePattern.test(name));
  const fixtureFiles = await readFileEntries(fixtureDirectory, () => true);
  const manifest = await readJson(manifestPath);
  const canaryRegistry = await readJson(canaryRegistryPath);

  const phases = {
    async fresh() {
      const preflight = await listProjectContainers(runCommand);
      if (preflight.status !== 0) return asPhaseResult(preflight);
      if (preflight.containers.length > 0) {
        return { status: 1, output: '同projectの既存containerがあるためDB操作を中止します。' };
      }
      const manifestResult = verifyMigrationManifest({ manifest, migrationFiles: headMigrationFiles });
      if (!manifestResult.ok) return { status: 1, output: manifestResult.errors.join('\n') };
      const start = await runCommand('supabase', ['start']);
      const afterStart = await listProjectContainers(runCommand);
      if (afterStart.status === 0) expectedNames = afterStart.containers.map(({ name }) => name);
      if (start.status !== 0) return start;
      if (afterStart.status !== 0 || expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        return { status: 1, output: '起動後の同project container所有権を確定できません。' };
      }
      const reset = await runCommand('supabase', ['db', 'reset']);
      if (reset.status !== 0) return reset;
      const tests = await runCommand('supabase', ['test', 'db']);
      if (tests.status !== 0) return tests;
      const signature = await querySchemaSignature(runCommand);
      freshSignature = signature.signature;
      return signature.status === 0 && freshSignature !== ''
        ? { status: 0, output: '' }
        : asPhaseResult(signature);
    },
    async 'origin-main-upgrade'() {
      const stopped = await runCommand('supabase', ['stop', '--no-backup']);
      if (stopped.status !== 0) return stopped;
      expectedNames = [];
      const remaining = await listProjectContainers(runCommand);
      if (remaining.status !== 0 || remaining.containers.length > 0) {
        return { status: 1, output: 'fresh stack停止後にcontainerが残留しています。' };
      }
      const built = await buildOriginUpgradeRoot({ execFileCommand, headMigrationFiles });
      temporaryUpgradeRoot = built.temporaryRoot;
      const started = await runCommand('supabase', ['start'], { cwd: temporaryUpgradeRoot });
      const afterStart = await listProjectContainers(runCommand);
      if (afterStart.status === 0) expectedNames = afterStart.containers.map(({ name }) => name);
      if (started.status !== 0) return started;
      if (!expectedNames.includes(databaseContainerName)) {
        return { status: 1, output: 'origin-main upgrade stack起動後の所有権を確定できません。' };
      }
      const reset = await runCommand('supabase', ['db', 'reset'], { cwd: temporaryUpgradeRoot });
      const afterReset = await listProjectContainers(runCommand);
      if (afterReset.status === 0) expectedNames = afterReset.containers.map(({ name }) => name);
      if (reset.status !== 0) return reset;
      if (!expectedNames.includes(databaseContainerName)) {
        return { status: 1, output: 'origin-main upgrade stackの所有権を確定できません。' };
      }
      const fixtureCheck = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
        '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
      ], { input: "select count(*) from public.certifications where code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1';" });
      if (fixtureCheck.status !== 0 || fixtureCheck.output.trim() !== '1') {
        return { status: 1, output: 'origin/main-shaped fixtureの保持を確認できません。' };
      }
      const tests = await runCommand('supabase', ['test', 'db'], { cwd: temporaryUpgradeRoot });
      if (tests.status !== 0) return tests;
      const removeFixtureData = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
        '--quiet', '--set', 'ON_ERROR_STOP=1',
      ], { input: "delete from public.certifications where id = 'db000000-0000-4000-8000-000000000001' and code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1';" });
      if (removeFixtureData.status !== 0) return removeFixtureData;
      const signature = await querySchemaSignature(runCommand);
      upgradeSignature = signature.signature;
      return signature.status === 0 && upgradeSignature !== ''
        ? { status: 0, output: '' }
        : asPhaseResult(signature);
    },
    async 'combined-order'() {
      if (freshSignature === '' || upgradeSignature === '' || freshSignature !== upgradeSignature) {
        return { status: 1, output: 'freshとorigin-main-upgradeの最終schema/migration署名が一致しません。' };
      }
      return { status: 0, output: '' };
    },
    async 'atomic-failure'() {
      return assertAtomicFailure(runCommand);
    },
    async 'production-boundary'() {
      const boundary = verifyProductionBoundary({
        canaryRegistry,
        productionFiles: headMigrationFiles,
        fixtureFiles,
      });
      if (!boundary.ok) return { status: 1, output: boundary.errors.join('\n') };
      const databaseDump = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'pg_dump', '--username', 'postgres', '--dbname', 'postgres', '--schema', 'public',
        '--no-owner', '--no-privileges',
      ]);
      if (databaseDump.status !== 0) return databaseDump;
      if (canaryRegistry.canaries.some((canary) => databaseDump.output.includes(canary))) {
        return { status: 1, output: 'production DB schemaへfixture canaryが混入しています。' };
      }
      return { status: 0, output: '' };
    },
  };

  let releaseLock;
  try {
    releaseLock = await acquireLock();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harnessの共有排他lockを取得できません: ${redactDatabaseOutput(message)}`);
    return 1;
  }

  try {
    const head = await execFileCommand('git', ['rev-parse', 'HEAD'], { cwd: workspacePath, encoding: 'utf8' });
    startHead = head.stdout.trim();
    if (!/^[0-9a-f]{40}$/u.test(startHead)) throw new Error('開始HEAD SHAが不正です。');
    log.info?.(`database harness start_head=${startHead}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harnessの開始HEADを固定できません: ${redactDatabaseOutput(message)}`);
    try { await releaseLock(); } catch { /* 取得済みlockはbest effortで解放する。 */ }
    return 1;
  }

  let status;
  try {
    status = await runDatabaseHarness({
      acquireLock: async () => async () => {},
      runPhase: async (phaseName) => phases[phaseName](),
      log,
    });
    const endHeadResult = await execFileCommand('git', ['rev-parse', 'HEAD'], { cwd: workspacePath, encoding: 'utf8' });
    const endHead = endHeadResult.stdout.trim();
    log.info?.(`database harness end_head=${endHead}`);
    if (endHead !== startHead) {
      log.error(`DB harness実行中にHEADが変化しました: ${startHead} -> ${endHead}`);
      status = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harness準備に失敗しました: ${redactDatabaseOutput(message)}`);
    status = 1;
  } finally {
    const cleanupStatus = await cleanupOwnedStack(runCommand, expectedNames, log);
    if (temporaryUpgradeRoot !== undefined) {
      await rm(temporaryUpgradeRoot, { recursive: true, force: true });
    }
    if (cleanupStatus !== 0 && status === 0) status = cleanupStatus;
    try {
      await releaseLock();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`DB harnessの共有排他lock解放に失敗しました: ${redactDatabaseOutput(message)}`);
      if (status === 0) status = 1;
    }
  }
  return status;
}

const isMainModule = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) process.exitCode = await runProductionDatabaseHarness();
