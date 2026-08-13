import { execFile as defaultExecFile, spawn as defaultSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  redactDatabaseOutput,
  runDatabaseHarness,
  verifyMigrationManifest,
  verifyProductionBoundary,
} from './database-harness.mjs';
import {
  selectProductionBoundaryPaths,
  verifyFixtureManifestFile,
} from './database-boundary.mjs';
import { acquireRepositoryLock, projectLabel } from './test-database.mjs';

const execFile = promisify(defaultExecFile);
const workspacePath = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(workspacePath, 'supabase', 'migrations');
const fixtureDirectory = join(workspacePath, 'supabase', 'test-fixtures', 'database-harness');
const manifestPath = join(migrationDirectory, 'manifest.json');
const canaryRegistryPath = join(fixtureDirectory, 'production-boundary-canaries.json');
const originFixturePath = join(fixtureDirectory, 'origin-main-shape.sql');
const fixtureManifestPath = join(fixtureDirectory, 'manifest.json');
const projectId = projectLabel.split('=').at(-1) ?? '';
const databaseContainerName = `supabase_db_${projectId}`;
const projectLabelFilter = `label=${projectLabel}`;
const containerFormat = '{{.ID}}\t{{.Names}}';
const migrationFilePattern = /^\d{12,14}_[a-z0-9_]+\.sql$/u;
const pgTapFilePattern = /\.sql$/u;
const defaultCommandTimeoutMs = 5 * 60 * 1000;
const defaultCleanupCommandTimeoutMs = 2 * 60 * 1000;
const defaultTerminationGraceMs = 5 * 1000;

export function createCommandRunner(
  spawnCommand,
  activeChildren = new Set(),
  {
    commandTimeoutMs = defaultCommandTimeoutMs,
    terminationGraceMs = defaultTerminationGraceMs,
  } = {},
) {
  if (!Number.isSafeInteger(commandTimeoutMs) || commandTimeoutMs <= 0) {
    throw new Error('command timeoutは正のsafe integerで指定してください。');
  }
  if (!Number.isSafeInteger(terminationGraceMs) || terminationGraceMs <= 0) {
    throw new Error('command終了猶予は正のsafe integerで指定してください。');
  }
  const activeCommands = new Map();
  const runCommand = (command, argumentsList, options = {}) => new Promise((resolveResult) => {
    const child = spawnCommand(command, argumentsList, {
      cwd: options.cwd ?? workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeChildren.add(child);
    let output = '';
    let settled = false;
    let terminationKind;
    let terminationSignal;
    let timeoutTimer;
    let graceTimer;
    const terminationResult = () => terminationKind === 'timeout'
      ? { status: 124, output: `commandが制限時間${commandTimeoutMs}msを超えたため停止しました。` }
      : { status: 1, output: `${terminationSignal ?? 'signal'}によりcommandを中断しました。` };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      activeChildren.delete(child);
      activeCommands.delete(child);
      resolveResult(result);
    };
    const terminate = (kind, signal) => {
      if (settled || terminationKind !== undefined) return;
      terminationKind = kind;
      terminationSignal = signal;
      clearTimeout(timeoutTimer);
      try { child.kill?.('SIGTERM'); } catch { /* grace後のSIGKILLへ進む。 */ }
      graceTimer = setTimeout(() => {
        if (settled) return;
        try { child.kill?.('SIGKILL'); } catch { /* 中断結果へ必ず収束する。 */ }
        finish(terminationResult());
      }, terminationGraceMs);
    };
    activeCommands.set(child, terminate);
    timeoutTimer = setTimeout(() => {
      terminate('timeout', 'TIMEOUT');
    }, commandTimeoutMs);
    child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', (error) => {
      finish(terminationKind === undefined
        ? { status: 1, output: `${output}${error.message}` }
        : terminationResult());
    });
    child.once('exit', (code, signal) => {
      finish(terminationKind === undefined
        ? { status: signal ? 1 : code ?? 1, output }
        : terminationResult());
    });
    if (options.input !== undefined) {
      child.stdin?.write(options.input);
    }
    child.stdin?.end();
  });
  runCommand.cancelAll = (signal) => {
    for (const terminate of activeCommands.values()) terminate('signal', signal);
  };
  return runCommand;
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

async function readRelativeEntries(rootDirectory, paths) {
  return Promise.all(paths.map(async (path) => ({
    path: relative(rootDirectory, path).split('\\').join('/'),
    content: await readFile(path, 'utf8'),
  })));
}

async function readTrackedProductionEntries(execFileCommand) {
  const result = await execFileCommand('git', ['ls-files', '-z'], {
    cwd: workspacePath,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const paths = selectProductionBoundaryPaths(result.stdout.split('\0').filter(Boolean));
  return Promise.all(paths.map(async (path) => ({
    path,
    content: await readFile(join(workspacePath, path), 'utf8'),
  })));
}

export async function enumeratePgTapTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await enumeratePgTapTestFiles(path));
    } else if (entry.isFile() && pgTapFilePattern.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths;
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
  await cp(join(workspacePath, 'supabase', 'tests'), temporaryTests, { recursive: true });

  const originEntries = await readOriginMigrationEntries(execFileCommand);
  const originByName = new Map(originEntries.map((entry) => [basename(entry.path), entry]));
  const headByName = new Map(headMigrationFiles.map((entry) => [basename(entry.path), entry]));
  for (const [name, originEntry] of originByName) {
    const headEntry = headByName.get(name);
    if (headEntry !== undefined && headEntry.content !== originEntry.content) {
      throw new Error(`origin/main適用済みmigrationがHEADで変更されています: ${name}`);
    }
  }
  for (const entry of originEntries) {
    await writeFile(join(temporaryMigrations, basename(entry.path)), entry.content, { flag: 'wx' });
  }
  const headOnlyEntries = headMigrationFiles.filter((entry) => !originByName.has(basename(entry.path)));
  return { temporaryRoot, originEntries, headOnlyEntries };
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function calculateCanonicalSchemaSignature(catalogHexRows, migrationFiles) {
  const migrationRows = migrationFiles.map((entry, index) => {
    const name = basename(entry.path);
    if (!migrationFilePattern.test(name)) throw new Error(`migration filenameが不正です: ${name}`);
    return `migration-file:${String(index).padStart(8, '0')}:${name}:${sha256(entry.content)}`;
  });
  return sha256([...catalogHexRows, ...migrationRows].join('\n'));
}

export async function queryCanonicalSchemaSignature(runCommand, migrationFiles) {
  const sql = `
    do $jstqb_database_harness$
    begin
      if exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private')
           and p.prokind = 'a'
           and not exists (
             select 1
               from pg_catalog.pg_depend dependency
              where dependency.classid = 'pg_catalog.pg_proc'::regclass
                and dependency.objid = p.oid
                and dependency.deptype = 'e'
           )
      ) then
        raise exception 'application aggregateはcanonical schema署名未対応です。';
      end if;
    end
    $jstqb_database_harness$;

    select encode(convert_to(signature, 'UTF8'), 'hex')
      from (
        select 'schema:' || n.nspname || ':owner=' || pg_get_userbyid(n.nspowner) || ':acl=' || coalesce(n.nspacl::text, '') as signature
          from pg_catalog.pg_namespace n
         where n.nspname in ('public', 'private')
        union all
        select 'relation:' || n.nspname || '.' || c.relname || ':kind=' || c.relkind::text || ':owner=' ||
               pg_get_userbyid(c.relowner) || ':persistence=' || c.relpersistence::text || ':rls=' || c.relrowsecurity ||
               ':force_rls=' || c.relforcerowsecurity || ':options=' || coalesce(c.reloptions::text, '') ||
               ':acl=' || coalesce(c.relacl::text, '')
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'private') and c.relkind in ('r','v','m','p','S')
        union all
        select 'column:' || n.nspname || '.' || c.relname || ':' || a.attnum || ':' || a.attname || ':' ||
               pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' ||
               coalesce(pg_get_expr(d.adbin, d.adrelid), '')
          from pg_catalog.pg_attribute a
          join pg_catalog.pg_class c on c.oid = a.attrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where n.nspname in ('public', 'private') and a.attnum > 0 and not a.attisdropped
        union all
        select 'constraint:' || n.nspname || '.' || c.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid, true)
          from pg_catalog.pg_constraint con
          join pg_catalog.pg_class c on c.oid = con.conrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'private')
        union all
        select 'domain-constraint:' || n.nspname || '.' || typ.typname || ':' || con.conname || ':' ||
               pg_get_constraintdef(con.oid, true)
          from pg_catalog.pg_constraint con
          join pg_catalog.pg_type typ on typ.oid = con.contypid
          join pg_catalog.pg_namespace n on n.oid = typ.typnamespace
         where n.nspname in ('public', 'private')
        union all
        select 'index:' || schemaname || '.' || indexname || ':' || indexdef
          from pg_catalog.pg_indexes where schemaname in ('public', 'private')
        union all
        select 'trigger:' || n.nspname || '.' || c.relname || ':' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
          from pg_catalog.pg_trigger t
          join pg_catalog.pg_class c on c.oid = t.tgrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'private') and not t.tgisinternal
        union all
        select 'type:' || n.nspname || '.' || typ.typname || ':kind=' || typ.typtype::text || ':owner=' ||
               pg_get_userbyid(typ.typowner) || ':base=' || pg_catalog.format_type(typ.typbasetype, typ.typtypmod) ||
               ':notnull=' || typ.typnotnull || ':default=' || coalesce(typ.typdefault, '') ||
               ':acl=' || coalesce(typ.typacl::text, '')
          from pg_catalog.pg_type typ
          join pg_catalog.pg_namespace n on n.oid = typ.typnamespace
         where n.nspname in ('public', 'private') and typ.typtype in ('d', 'e')
        union all
        select 'enum-value:' || n.nspname || '.' || typ.typname || ':' || e.enumsortorder || ':' || e.enumlabel
          from pg_catalog.pg_type typ
          join pg_catalog.pg_namespace n on n.oid = typ.typnamespace
          join pg_catalog.pg_enum e on e.enumtypid = typ.oid
         where n.nspname in ('public', 'private')
        union all
        select 'sequence:' || n.nspname || '.' || c.relname || ':type=' ||
               pg_catalog.format_type(s.seqtypid, null) || ':start=' || s.seqstart || ':increment=' ||
               s.seqincrement || ':max=' || s.seqmax || ':min=' || s.seqmin || ':cache=' || s.seqcache ||
               ':cycle=' || s.seqcycle
          from pg_catalog.pg_sequence s
          join pg_catalog.pg_class c on c.oid = s.seqrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'private')
        union all
        select 'function:' || n.nspname || '.' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' ||
               'owner=' || pg_get_userbyid(p.proowner) || ':security_definer=' || p.prosecdef || ':config=' ||
               coalesce(array_to_string(p.proconfig, E'\\x1f'), '') || ':acl=' || coalesce(p.proacl::text, '') || ':' ||
               pg_get_functiondef(p.oid)
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.prokind <> 'a'
        union all
        select 'policy:' || schemaname || '.' || tablename || ':' || policyname || ':' || permissive || ':' ||
               roles::text || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '')
          from pg_catalog.pg_policies where schemaname in ('public', 'private')
        union all
        select 'table-grant:' || table_schema || '.' || table_name || ':' || grantee || ':' || privilege_type || ':' || is_grantable
          from information_schema.role_table_grants where table_schema in ('public', 'private')
        union all
        select 'sequence-grant:' || object_schema || '.' || object_name || ':' || grantee || ':' || privilege_type || ':' || is_grantable
          from information_schema.role_usage_grants
         where object_schema in ('public', 'private') and object_type = 'SEQUENCE'
        union all
        select 'routine-grant:' || routine_schema || '.' || routine_name || ':' || grantee || ':' || privilege_type || ':' || is_grantable
          from information_schema.role_routine_grants where routine_schema in ('public', 'private')
        union all
        select 'default-acl:' || coalesce(n.nspname, '') || ':owner=' || pg_get_userbyid(d.defaclrole) ||
               ':type=' || d.defaclobjtype::text || ':acl=' || coalesce(d.defaclacl::text, '')
          from pg_catalog.pg_default_acl d
          left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
         where n.nspname in ('public', 'private') or d.defaclnamespace = 0
        union all
        select 'role-membership:' || granted.rolname || ':member=' || member.rolname || ':grantor=' ||
               grantor.rolname || ':admin=' || membership.admin_option || ':inherit=' || membership.inherit_option ||
               ':set=' || membership.set_option
          from pg_catalog.pg_auth_members membership
          join pg_catalog.pg_roles granted on granted.oid = membership.roleid
          join pg_catalog.pg_roles member on member.oid = membership.member
          join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
        union all
        select 'migration-row:' || to_jsonb(migration)::text
          from supabase_migrations.schema_migrations migration
      ) signatures
     order by signature;
  `;
  const result = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: sql });
  if (result.status !== 0) return { ...result, signature: '' };
  const catalogHexRows = result.output.split('\n').map((line) => line.trim()).filter(Boolean);
  if (catalogHexRows.length === 0) return { status: 1, output: 'canonical schema catalogが空です。', signature: '' };
  return { ...result, signature: calculateCanonicalSchemaSignature(catalogHexRows, migrationFiles) };
}

export function normalizeDeterministicPgDump(output) {
  return output.split('\n')
    .filter((line) => !line.startsWith('--') && !line.startsWith('\\restrict ') && !line.startsWith('\\unrestrict '))
    .join('\n')
    .trim();
}

export async function queryCanonicalDatabaseDataSignature(runCommand) {
  const result = await runCommand('docker', [
    'exec', databaseContainerName,
    'pg_dump', '--username', 'postgres', '--dbname', 'postgres', '--data-only', '--column-inserts',
    '--rows-per-insert=1', '--no-owner', '--no-privileges', '--schema=public', '--schema=private',
  ]);
  if (result.status !== 0) return { ...result, signature: '' };
  return { ...result, signature: sha256(normalizeDeterministicPgDump(result.output)) };
}

async function assertAtomicFailures(runCommand, atomicFailures, fixtureByPath, migrationFiles) {
  for (const contract of atomicFailures) {
    const beforeSchema = await queryCanonicalSchemaSignature(runCommand, migrationFiles);
    if (beforeSchema.status !== 0 || beforeSchema.signature === '') return asPhaseResult(beforeSchema);
    const beforeData = await queryCanonicalDatabaseDataSignature(runCommand);
    if (beforeData.status !== 0 || beforeData.signature === '') return asPhaseResult(beforeData);
    const fixture = fixtureByPath.get(contract.path);
    if (fixture === undefined) {
      return { status: 1, output: `atomic fixtureがありません: ${contract.path}` };
    }
    const failed = await runCommand('docker', [
      'exec', '-i', databaseContainerName,
      'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
      '--quiet', '--set', 'ON_ERROR_STOP=1',
    ], { input: fixture });
    if (failed.status === 0 || !failed.output.includes(contract.expectedError)) {
      return { status: 1, output: `${contract.kind}のatomic fixtureが規定の明示失敗になりませんでした。` };
    }
    const afterSchema = await queryCanonicalSchemaSignature(runCommand, migrationFiles);
    if (afterSchema.status !== 0 || afterSchema.signature !== beforeSchema.signature) {
      return { status: 1, output: `${contract.kind}失敗後にDDL・migration履歴・ACLが変化しました。` };
    }
    const afterData = await queryCanonicalDatabaseDataSignature(runCommand);
    if (afterData.status !== 0 || afterData.signature !== beforeData.signature) {
      return { status: 1, output: `${contract.kind}失敗後にdata・audit・operation receiptが変化しました。` };
    }
    const residueExpressions = contract.residueObjects.map((objectName) => {
      const escaped = objectName.replaceAll("'", "''");
      return objectName.endsWith('()')
        ? `coalesce(to_regprocedure('${escaped}')::text, '')`
        : `coalesce(to_regclass('${escaped}')::text, '')`;
    });
    const residue = await runCommand('docker', [
      'exec', '-i', databaseContainerName,
      'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
      '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
    ], { input: `select concat_ws(':', ${residueExpressions.join(', ')});` });
    if (residue.status !== 0 || residue.output.trim() !== ':'.repeat(Math.max(0, residueExpressions.length - 1))) {
      return { status: 1, output: `${contract.kind}失敗後にfixture objectが残留しました。` };
    }
  }
  return { status: 0, output: '' };
}

async function runPgTapTests(runCommand, cwd, testDirectory) {
  const testFiles = await enumeratePgTapTestFiles(testDirectory);
  if (testFiles.length === 0) return { status: 1, output: '再帰列挙したpgTAP testが0件です。' };
  return runCommand('supabase', ['test', 'db', ...testFiles], { cwd });
}

async function runCommonSecuritySuite(runCommand, cwd, testDirectory) {
  const matches = (await enumeratePgTapTestFiles(testDirectory))
    .filter((path) => basename(path) === 'database_harness_security.test.sql');
  if (matches.length !== 1) {
    return { status: 1, output: '共通security suiteをexactに1件確認できません。' };
  }
  return runCommand('supabase', ['test', 'db', matches[0]], { cwd });
}

export function sameContainerNames(containers, expectedNames) {
  const actual = containers.map(({ name }) => name).sort();
  const expected = [...expectedNames].sort();
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

async function stopOwnedStack(runCommand, expectedNames, cwd) {
  const ownership = await listProjectContainers(runCommand);
  if (ownership.status !== 0) return asPhaseResult(ownership);
  if (expectedNames.length === 0 || !sameContainerNames(ownership.containers, expectedNames)) {
    return { status: 1, output: '停止直前のlabel/name所有再確認に失敗しました。未知の同project containerは停止しません。' };
  }
  return runCommand('supabase', ['stop', '--no-backup'], { cwd });
}

async function writeOwnershipFile(path, names, lockDirectory) {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const lines = [`known=${names.length > 0 ? 'true' : 'false'}`, ...[...names].sort().map((name) => `name=${name}`)];
  if (typeof lockDirectory === 'string' && lockDirectory.trim() !== '') lines.push(`lock=${lockDirectory}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${lines.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporaryPath, path);
}

async function resolveRepositoryLockDirectory(execFileCommand) {
  const result = await execFileCommand('git', ['rev-parse', '--git-common-dir'], {
    cwd: workspacePath,
    encoding: 'utf8',
  });
  const gitCommonDirectory = result.stdout.trim();
  if (gitCommonDirectory === '') throw new Error('所有証跡用のGit共通ディレクトリを確認できません。');
  const lockKey = sha256(resolve(workspacePath, gitCommonDirectory));
  return resolve(tmpdir(), `.supabase-database-ci-${lockKey}.lock`);
}

async function verifyMigrationHistory(runCommand, expectedMigrationFiles) {
  const result = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: 'select version from supabase_migrations.schema_migrations order by version;' });
  if (result.status !== 0) return result;
  const actualVersions = result.output.split('\n').map((line) => line.trim()).filter(Boolean);
  const expectedVersions = expectedMigrationFiles.map(({ path }) => basename(path).split('_')[0] ?? '');
  return JSON.stringify(actualVersions) === JSON.stringify(expectedVersions)
    ? { status: 0, output: '' }
    : { status: 1, output: 'schema_migrationsがproduction migration versionのexact順序と一致しません。fixture row混入の可能性があります。' };
}

async function cleanupOwnedStack(runCommand, expectedNames, log) {
  const current = await listProjectContainers(runCommand);
  if (current.status !== 0) {
    log.error(`cleanup前のDocker照会に失敗しました: ${redactDatabaseOutput(current.output)}`);
    return current.status;
  }
  if (current.containers.length > 0 && !sameContainerNames(current.containers, expectedNames)) {
    log.error('停止直前のlabel/name所有再確認で未知の同project containerを検出したため停止しません。');
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

export async function loadDatabaseHarnessContracts(execFileCommand = execFile) {
  const headMigrationFiles = await readFileEntries(migrationDirectory, (name) => migrationFilePattern.test(name));
  const fixtureFiles = (await readFileEntries(fixtureDirectory, () => true))
    .map((entry) => ({ path: basename(entry.path), content: entry.content }));
  const pgTapRoot = join(workspacePath, 'supabase', 'tests');
  const pgTapPaths = await enumeratePgTapTestFiles(pgTapRoot);
  const pgTapFiles = await readRelativeEntries(pgTapRoot, pgTapPaths);
  const fixtureManifestContent = await readFile(fixtureManifestPath, 'utf8');
  const fixtureResult = verifyFixtureManifestFile({
    manifestContent: fixtureManifestContent,
    fixtureFiles,
    pgTapFiles,
  });
  if (!fixtureResult.ok) return fixtureResult;
  return {
    ok: true,
    value: {
      headMigrationFiles,
      fixtureFiles,
      pgTapFiles,
      fixtureManifestContent,
      fixtureManifest: JSON.parse(fixtureManifestContent),
      manifest: await readJson(manifestPath),
      canaryRegistry: await readJson(canaryRegistryPath),
      productionFiles: await readTrackedProductionEntries(execFileCommand),
    },
  };
}

export async function runProductionDatabaseHarness({
  spawnCommand = defaultSpawn,
  execFileCommand = execFile,
  acquireLock = acquireRepositoryLock,
  ownershipFilePath = process.env.DB_HARNESS_OWNERSHIP_FILE,
  commandTimeoutMs = defaultCommandTimeoutMs,
  cleanupCommandTimeoutMs = defaultCleanupCommandTimeoutMs,
  terminationGraceMs = defaultTerminationGraceMs,
  signalTarget = process,
  loadContracts = loadDatabaseHarnessContracts,
  log = console,
} = {}) {
  const activeChildren = new Set();
  const runCommand = createCommandRunner(spawnCommand, activeChildren, {
    commandTimeoutMs,
    terminationGraceMs,
  });
  const runCleanupCommand = createCommandRunner(spawnCommand, activeChildren, {
    commandTimeoutMs: cleanupCommandTimeoutMs,
    terminationGraceMs,
  });
  let expectedNames = [];
  let temporaryUpgradeRoot;
  let freshSignature = '';
  let upgradeSignature = '';
  let startHead = '';
  let ownershipFileWritten = false;
  let releaseLock;
  let repositoryLockDirectory;
  let terminationSignal;

  const handleTermination = (signal) => {
    if (terminationSignal !== undefined) return;
    terminationSignal = signal;
    log.error(`DB harnessが${signal}を受信したため、実行中commandを停止して所有確認付きcleanupへ移行します。`);
    runCommand.cancelAll(signal);
    runCleanupCommand.cancelAll(signal);
  };
  const handleSigint = () => handleTermination('SIGINT');
  const handleSigterm = () => handleTermination('SIGTERM');
  let contracts;
  try {
    contracts = await loadContracts(execFileCommand);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harnessの契約fileを読み込めません: ${redactDatabaseOutput(message)}`);
    return 1;
  }
  if (!contracts.ok) {
    log.error(contracts.errors.map((error) => redactDatabaseOutput(error)).join('\n'));
    return 1;
  }
  const {
    headMigrationFiles,
    fixtureFiles,
    pgTapFiles,
    fixtureManifestContent,
    fixtureManifest,
    manifest,
    canaryRegistry,
    productionFiles,
  } = contracts.value;
  const fixtureByPath = new Map(fixtureFiles.map(({ path, content }) => [path, content]));

  const persistOwnership = async () => {
    if (ownershipFilePath === undefined || ownershipFilePath === '') return;
    await writeOwnershipFile(ownershipFilePath, expectedNames, repositoryLockDirectory);
    ownershipFileWritten = true;
  };

  const phases = {
    async fresh() {
      const preflight = await listProjectContainers(runCommand);
      if (preflight.status !== 0) return asPhaseResult(preflight);
      if (preflight.containers.length > 0) {
        return { status: 1, output: '同projectの既存containerがあるためDB操作を中止します。' };
      }
      const manifestResult = verifyMigrationManifest({ manifest, migrationFiles: headMigrationFiles });
      if (!manifestResult.ok) return { status: 1, output: manifestResult.errors.join('\n') };
      const fixtureResult = verifyFixtureManifestFile({
        manifestContent: fixtureManifestContent,
        fixtureFiles,
        pgTapFiles,
      });
      if (!fixtureResult.ok) return { status: 1, output: fixtureResult.errors.join('\n') };
      const start = await runCommand('supabase', ['start']);
      const afterStart = await listProjectContainers(runCommand);
      if (afterStart.status === 0) expectedNames = afterStart.containers.map(({ name }) => name);
      if (afterStart.status !== 0 || expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        return start.status !== 0 ? start : { status: 1, output: '起動後の同project container所有権を確定できません。' };
      }
      await persistOwnership();
      if (start.status !== 0) return start;
      const namesBeforeReset = [...expectedNames];
      const reset = await runCommand('supabase', ['db', 'reset']);
      const afterReset = await listProjectContainers(runCommand);
      if (afterReset.status !== 0 || !sameContainerNames(afterReset.containers, namesBeforeReset)) {
        return reset.status !== 0 ? reset : { status: 1, output: 'reset後の同project container所有権を確定できません。' };
      }
      expectedNames = afterReset.containers.map(({ name }) => name);
      await persistOwnership();
      if (reset.status !== 0) return reset;
      const tests = await runPgTapTests(runCommand, workspacePath, join(workspacePath, 'supabase', 'tests'));
      if (tests.status !== 0) return tests;
      const signature = await queryCanonicalSchemaSignature(runCommand, headMigrationFiles);
      freshSignature = signature.signature;
      return signature.status === 0 && freshSignature !== ''
        ? { status: 0, output: '' }
        : asPhaseResult(signature);
    },
    async 'origin-main-upgrade'() {
      const stopped = await stopOwnedStack(runCommand, expectedNames, workspacePath);
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
      if (afterStart.status !== 0 || expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        return started.status !== 0
          ? started
          : { status: 1, output: 'origin-main upgrade stack起動後の所有権を確定できません。' };
      }
      await persistOwnership();
      if (started.status !== 0) return started;
      const upgradeNamesBeforeReset = [...expectedNames];
      const reset = await runCommand('supabase', ['db', 'reset'], { cwd: temporaryUpgradeRoot });
      const afterReset = await listProjectContainers(runCommand);
      if (afterReset.status !== 0 || !sameContainerNames(afterReset.containers, upgradeNamesBeforeReset)) {
        return reset.status !== 0
          ? reset
          : { status: 1, output: 'origin-main upgrade stackの所有権を確定できません。' };
      }
      expectedNames = afterReset.containers.map(({ name }) => name);
      await persistOwnership();
      if (reset.status !== 0) return reset;
      const originHistory = await verifyMigrationHistory(runCommand, built.originEntries);
      if (originHistory.status !== 0) return originHistory;
      const fixture = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
        '--quiet', '--set', 'ON_ERROR_STOP=1',
      ], { input: await readFile(originFixturePath, 'utf8') });
      if (fixture.status !== 0) return fixture;
      for (const entry of built.headOnlyEntries) {
        await writeFile(
          join(temporaryUpgradeRoot, 'supabase', 'migrations', basename(entry.path)),
          entry.content,
          { flag: 'wx' },
        );
      }
      const upgrade = await runCommand('supabase', ['migration', 'up', '--local'], { cwd: temporaryUpgradeRoot });
      if (upgrade.status !== 0) return upgrade;
      const headHistory = await verifyMigrationHistory(runCommand, headMigrationFiles);
      if (headHistory.status !== 0) return headHistory;
      const fixtureCheck = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
        '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
      ], { input: "select count(*) from public.certifications where code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1';" });
      if (fixtureCheck.status !== 0 || fixtureCheck.output.trim() !== '1') {
        return { status: 1, output: 'origin/main-shaped fixtureの保持を確認できません。' };
      }
      const tests = await runPgTapTests(
        runCommand,
        temporaryUpgradeRoot,
        join(temporaryUpgradeRoot, 'supabase', 'tests'),
      );
      if (tests.status !== 0) return tests;
      const removeFixtureData = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
        '--quiet', '--set', 'ON_ERROR_STOP=1',
      ], { input: "delete from public.certifications where id = 'db000000-0000-4000-8000-000000000001' and code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1';" });
      if (removeFixtureData.status !== 0) return removeFixtureData;
      const signature = await queryCanonicalSchemaSignature(runCommand, headMigrationFiles);
      upgradeSignature = signature.signature;
      return signature.status === 0 && upgradeSignature !== ''
        ? { status: 0, output: '' }
        : asPhaseResult(signature);
    },
    async 'combined-order'() {
      if (freshSignature === '' || upgradeSignature === '' || freshSignature !== upgradeSignature) {
        return { status: 1, output: 'freshとorigin-main-upgradeの最終schema/migration署名が一致しません。' };
      }
      return runCommonSecuritySuite(
        runCommand,
        temporaryUpgradeRoot ?? workspacePath,
        join(temporaryUpgradeRoot ?? workspacePath, 'supabase', 'tests'),
      );
    },
    async 'atomic-failure'() {
      const atomic = await assertAtomicFailures(
        runCommand,
        fixtureManifest.atomicFailures,
        fixtureByPath,
        headMigrationFiles,
      );
      if (atomic.status !== 0) return atomic;
      return runCommonSecuritySuite(
        runCommand,
        temporaryUpgradeRoot ?? workspacePath,
        join(temporaryUpgradeRoot ?? workspacePath, 'supabase', 'tests'),
      );
    },
    async 'production-boundary'() {
      const boundary = verifyProductionBoundary({
        canaryRegistry,
        productionFiles,
        fixtureFiles,
      });
      if (!boundary.ok) return { status: 1, output: boundary.errors.join('\n') };
      const databaseDump = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'pg_dump', '--username', 'postgres', '--dbname', 'postgres', '--schema', 'public', '--schema', 'private',
        '--no-owner', '--no-privileges',
      ]);
      if (databaseDump.status !== 0) return databaseDump;
      if (canaryRegistry.canaries.some((canary) => databaseDump.output.includes(canary))) {
        return { status: 1, output: 'production DB schemaへfixture canaryが混入しています。' };
      }
      return runCommonSecuritySuite(
        runCommand,
        temporaryUpgradeRoot ?? workspacePath,
        join(temporaryUpgradeRoot ?? workspacePath, 'supabase', 'tests'),
      );
    },
  };

  try {
    releaseLock = await acquireLock();
    repositoryLockDirectory = typeof releaseLock.lockDirectory === 'string'
      ? releaseLock.lockDirectory
      : await resolveRepositoryLockDirectory(execFileCommand);
    await persistOwnership();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harnessの共有排他lockを取得できません: ${redactDatabaseOutput(message)}`);
    if (typeof releaseLock === 'function') {
      try { await releaseLock(); } catch { /* 所有未確定のため外側cleanupへ委ねる。 */ }
    }
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
    try {
      await releaseLock();
      if (ownershipFileWritten && ownershipFilePath !== undefined) await rm(ownershipFilePath, { force: true });
    } catch { /* 取得済みlockは外側cleanupでも回収する。 */ }
    return 1;
  }

  signalTarget.on('SIGINT', handleSigint);
  signalTarget.on('SIGTERM', handleSigterm);

  let status;
  try {
    status = await runDatabaseHarness({
      acquireLock: async () => async () => {},
      runPhase: async (phaseName) => terminationSignal === undefined
        ? phases[phaseName]()
        : { status: 1, output: `${terminationSignal}により中断しました。` },
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
    const cleanupStatus = await cleanupOwnedStack(runCleanupCommand, expectedNames, log);
    if (temporaryUpgradeRoot !== undefined) {
      await rm(temporaryUpgradeRoot, { recursive: true, force: true });
    }
    if (cleanupStatus !== 0 && status === 0) status = cleanupStatus;
    try {
      await releaseLock();
      if (cleanupStatus === 0 && ownershipFileWritten && ownershipFilePath !== undefined) {
        await rm(ownershipFilePath, { force: true });
        ownershipFileWritten = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`DB harnessの共有排他lock解放に失敗しました: ${redactDatabaseOutput(message)}`);
      if (status === 0) status = 1;
    }
    signalTarget.removeListener('SIGINT', handleSigint);
    signalTarget.removeListener('SIGTERM', handleSigterm);
  }
  if (terminationSignal !== undefined) return 1;
  return status;
}

const isMainModule = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) process.exitCode = await runProductionDatabaseHarness();
