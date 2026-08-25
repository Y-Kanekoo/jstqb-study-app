import { execFile as defaultExecFile, spawn as defaultSpawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
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
  failureSnapshotScopes,
  registeredUpgradeFailureIds,
  registeredUpgradeScenarioIds,
  selectProductionBoundaryPaths,
  verifyFixtureManifestV2File,
  verifyM1ScenarioRegistration,
} from './database-boundary.mjs';
import { acquireRepositoryLock, projectLabel } from './test-database.mjs';

const execFile = promisify(defaultExecFile);
const workspacePath = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(workspacePath, 'supabase', 'migrations');
const fixtureDirectory = join(workspacePath, 'supabase', 'test-fixtures', 'database-harness');
const manifestPath = join(migrationDirectory, 'manifest.json');
const fixtureManifestPath = join(fixtureDirectory, 'manifest.json');
const projectId = projectLabel.split('=').at(-1) ?? '';
const databaseContainerName = `supabase_db_${projectId}`;
const projectLabelFilter = `label=${projectLabel}`;
const containerFormat = '{{.ID}}\t{{.Names}}';
const migrationFilePattern = /^\d{12,14}_[a-z0-9_]+\.sql$/u;
const pgTapFilePattern = /\.sql$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const sqlStatePattern = /^[0-9A-Z]{5}$/u;
const defaultCommandTimeoutMs = 5 * 60 * 1000;
const defaultCleanupCommandTimeoutMs = 2 * 60 * 1000;
const defaultTerminationGraceMs = 5 * 1000;
const raceHandshake = Object.freeze({
  // M1 fixtureのddl_command_end event triggerも同じ固定advisory keyを待機する。
  advisoryKey: 741852963,
  ready: 'jstqb_m1_race_ready',
  locked: 'jstqb_m1_race_locked',
  observerReady: 'jstqb_m1_race_observer_ready',
  observerLocked: 'jstqb_m1_race_observer_locked',
  writerDone: 'jstqb_m1_race_writer_done',
  release: 'jstqb_m1_race_release',
});

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function buildLegacyWriterRaceExecutionSql(writerContent) {
  if (typeof writerContent !== 'string' || writerContent.trim() === '') {
    throw new Error('legacy writer SQLが不正です。');
  }
  if (Object.values(raceHandshake).some((token) => typeof token === 'string' && writerContent.includes(token))
    || /(?:^|\n)\s*\\/mu.test(writerContent)
    || /\b(?:begin|start\s+transaction|commit|end|rollback|abort|prepare\s+transaction)\b/iu.test(writerContent)) {
    throw new Error('legacy writer SQLにrace handshakeまたはtransaction controlを含められません。');
  }
  return `${writerContent}\nselect '${raceHandshake.writerDone}';`;
}

export function buildLegacyWriterRaceReleaseSql() {
  return `rollback;\nselect '${raceHandshake.release}';\n\\q`;
}

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

export function createPersistentPsqlConnection({
  spawnCommand,
  activeChildren = new Set(),
  persistentConnections = new Set(),
  commandTimeoutMs = defaultCommandTimeoutMs,
  terminationGraceMs = defaultTerminationGraceMs,
  label,
}) {
  if (typeof spawnCommand !== 'function' || typeof label !== 'string' || label === ''
    || !Number.isSafeInteger(commandTimeoutMs) || commandTimeoutMs <= 0
    || !Number.isSafeInteger(terminationGraceMs) || terminationGraceMs <= 0) {
    throw new Error('persistent psql connectionの入力が不正です。');
  }
  const child = spawnCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], {
    cwd: workspacePath,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  activeChildren.add(child);
  let output = '';
  let errorOutput = '';
  let exited = false;
  let exitStatus = 1;
  let terminationTimer;
  let terminationPromise;
  let connection;
  let onError;
  let onExit;
  let onStreamError;
  const waiters = new Set();
  const settleWaiters = () => {
    for (const waiter of waiters) waiter();
    waiters.clear();
  };
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString();
    settleWaiters();
  });
  child.stderr?.on('data', (chunk) => {
    errorOutput += chunk.toString();
    settleWaiters();
  });
  const finish = (status, error) => {
    if (exited) return;
    if (error !== undefined) errorOutput += error;
    exited = true;
    exitStatus = status;
    if (terminationTimer !== undefined) clearTimeout(terminationTimer);
    if (onError !== undefined) child.removeListener('error', onError);
    if (onExit !== undefined) child.removeListener('exit', onExit);
    activeChildren.delete(child);
    if (connection !== undefined) persistentConnections.delete(connection);
    settleWaiters();
  };
  onError = (error) => {
    finish(1, error.message);
  };
  onExit = (code, signal) => {
    finish(signal === null ? code ?? 1 : 1);
  };
  child.once('error', onError);
  child.once('exit', onExit);
  // child終了後にもstream側のEPIPEが遅れて届くため、listenerはstream lifetime中に維持する。
  onStreamError = () => {
    if (!exited) finish(1, `${label} connectionのstream I/O errorを検出しました。`);
  };
  child.stdin?.on?.('error', onStreamError);
  child.stdout?.on?.('error', onStreamError);
  child.stderr?.on?.('error', onStreamError);
  const waitForToken = async (token, rejectedTokens = [], outputOffset = 0) => {
    if (!Number.isSafeInteger(outputOffset) || outputOffset < 0 || outputOffset > output.length) {
      return { status: 1, output: `${label} connectionのhandshake cursorが不正です。` };
    }
    const tokenLine = new RegExp(`(?:^|\\n)${token}(?:\\r?\\n|$)`, 'u');
    const rejectedLines = rejectedTokens.map((rejectedToken) => new RegExp(
      `(?:^|\\n)${rejectedToken}(?:\\r?\\n|$)`, 'u',
    ));
    const deadline = Date.now() + commandTimeoutMs;
    while (!tokenLine.test(output.slice(outputOffset))) {
      const visibleOutput = output.slice(outputOffset);
      const rejectedIndex = rejectedLines.findIndex((pattern) => pattern.test(visibleOutput));
      if (rejectedIndex >= 0) {
        return {
          status: 2,
          output: `${label} connectionが${token}ではないhandshake結果を返しました。`,
          rejectedToken: rejectedTokens[rejectedIndex],
        };
      }
      if (exited) {
        return { status: 1, output: `${label} connectionが${token}待機中に終了しました。${errorOutput}` };
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { status: 124, output: `${label} connectionが${token} handshakeを待機中にtimeoutしました。` };
      }
      await new Promise((resolveWaiter) => {
        const timer = setTimeout(() => {
          waiters.delete(wake);
          resolveWaiter();
        }, remaining);
        const wake = () => {
          clearTimeout(timer);
          resolveWaiter();
        };
        waiters.add(wake);
      });
    }
    return { status: 0, output: '' };
  };
  const sendAndWait = async (sql, token, rejectedTokens = []) => {
    if (exited || child.stdin === null || child.stdin === undefined) {
      return { status: 1, output: `${label} connectionへSQLを送信できません。` };
    }
    try {
      const outputOffset = output.length;
      child.stdin.write(`${sql}\n`);
      return waitForToken(token, rejectedTokens, outputOffset);
    } catch {
      finish(1, `${label} connectionへのSQL送信でstream I/O errorを検出しました。`);
      return { status: 1, output: `${label} connectionへSQLを送信できません。` };
    }
  };
  const send = (sql) => {
    if (exited || child.stdin === null || child.stdin === undefined) {
      return { status: 1, output: `${label} connectionへSQLを送信できません。` };
    }
    try {
      const outputOffset = output.length;
      child.stdin.write(`${sql}\n`);
      return { status: 0, output: '', outputOffset };
    } catch {
      finish(1, `${label} connectionへのSQL送信でstream I/O errorを検出しました。`);
      return { status: 1, output: `${label} connectionへSQLを送信できません。` };
    }
  };
  const getUniqueIntegerToken = (prefix) => {
    const values = output.split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(prefix))
      .map((line) => Number(line.slice(prefix.length)))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
    return values.length === 1 ? values[0] : undefined;
  };
  const waitForExit = async (deadline) => {
    while (!exited && Date.now() < deadline) {
      await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 10));
    }
    return exited;
  };
  const cancel = (signal = 'SIGTERM') => {
    if (terminationPromise !== undefined) return terminationPromise;
    if (exited) return Promise.resolve({ status: exitStatus === 0 ? 0 : 1, output: '' });
    terminationPromise = (async () => {
      try { child.kill?.('SIGTERM'); } catch { /* grace後のSIGKILLへ進む。 */ }
      terminationTimer = setTimeout(() => {
        if (exited) return;
        try { child.kill?.('SIGKILL'); } catch { /* finish待機へ進む。 */ }
      }, terminationGraceMs);
      const settled = await waitForExit(Date.now() + terminationGraceMs + 1000);
      if (!settled) {
        try { child.kill?.('SIGKILL'); } catch { /* 失敗として返す。 */ }
        return { status: 1, output: `${label} connectionを${signal}後に終了できません。` };
      }
      return { status: 1, output: `${label} connectionを${signal}で中断しました。` };
    })();
    return terminationPromise;
  };
  const close = async () => {
    if (!exited) {
      try {
        child.stdin?.write('rollback;\n\\q\n');
        child.stdin?.end();
      } catch { /* exit待機へ進む。 */ }
      const deadline = Date.now() + commandTimeoutMs;
      while (!exited && Date.now() < deadline) {
        await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 10));
      }
      if (!exited) {
        return cancel('CLOSE_TIMEOUT');
      }
    }
    return exitStatus === 0 ? { status: 0, output: '' } : {
      status: 1,
      output: `${label} connectionが異常終了しました。${errorOutput}`,
    };
  };
  connection = { sendAndWait, send, waitForToken, getUniqueIntegerToken, cancel, close };
  persistentConnections.add(connection);
  return connection;
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

function isFixtureTemporaryPath(path) {
  return path.split('/').some((segment) => segment.startsWith('.')
    || segment.endsWith('~')
    || segment.endsWith('.tmp')
    || segment.endsWith('.swp'));
}

async function readFixtureEntries(rootDirectory, relativeDirectory = '') {
  const directory = join(rootDirectory, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((left, right) => compareUtf8(left.name, right.name))) {
    const relativePath = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (isFixtureTemporaryPath(relativePath)) {
      throw new Error(`fixture rootに隠しまたはtemporary fileを置けません: ${relativePath}`);
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`fixture rootにsymbolic linkを置けません: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      result.push(...await readFixtureEntries(rootDirectory, relativePath));
      continue;
    }
    if (!entry.isFile()) throw new Error(`fixture rootに通常file以外を置けません: ${relativePath}`);
    result.push({ path: relativePath, content: await readFile(join(rootDirectory, relativePath), 'utf8') });
  }
  return result;
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
  for (const entry of entries.sort((left, right) => compareUtf8(left.name, right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await enumeratePgTapTestFiles(path));
    } else if (entry.isFile() && pgTapFilePattern.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths.sort(compareUtf8);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function loadDeclaredProductionBoundaryCanaries(fixtureManifest, fixtureFiles) {
  if (fixtureManifest === null || typeof fixtureManifest !== 'object'
    || fixtureManifest.productionBoundaryCanaries === null
    || typeof fixtureManifest.productionBoundaryCanaries !== 'object'
    || fixtureManifest.productionBoundaryCanaries.path !== 'production-boundary-canaries.json'
    || typeof fixtureManifest.productionBoundaryCanaries.sha256 !== 'string'
    || !sha256Pattern.test(fixtureManifest.productionBoundaryCanaries.sha256)
    || !Array.isArray(fixtureFiles)) {
    return { ok: false, errors: ['production boundary canaryの宣言入力が不正です。'] };
  }
  const declaredPath = fixtureManifest.productionBoundaryCanaries.path;
  const matches = fixtureFiles.filter((entry) => entry !== null && typeof entry === 'object'
    && entry.path === declaredPath && typeof entry.content === 'string');
  if (matches.length !== 1 || sha256(matches[0].content) !== fixtureManifest.productionBoundaryCanaries.sha256) {
    return { ok: false, errors: ['production boundary canaryの宣言fileをexactに1件要求します。'] };
  }
  try {
    return { ok: true, value: JSON.parse(matches[0].content) };
  } catch {
    return { ok: false, errors: ['production boundary canaryの宣言fileをJSONとして解析できません。'] };
  }
}

async function getMigrationNamesAtRef(execFileCommand, ref) {
  const result = await execFileCommand('git', [
    'ls-tree', '-r', '--name-only', ref, 'supabase/migrations',
  ], { cwd: workspacePath, encoding: 'utf8' });
  return result.stdout.split('\n').map((line) => line.trim()).filter((line) => migrationFilePattern.test(basename(line)));
}

async function readMigrationEntriesAtRef(execFileCommand, ref) {
  const names = await getMigrationNamesAtRef(execFileCommand, ref);
  return Promise.all(names.map(async (path) => {
    const result = await execFileCommand('git', ['show', `${ref}:${path}`], {
      cwd: workspacePath,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return { path, content: result.stdout };
  }));
}

function migrationEntryFromManifest(entry) {
  return { path: entry.path, content: entry.content, sha256: sha256(entry.content) };
}

export async function buildImmutableUpgradeRoot({ execFileCommand, base, headMigrationFiles }) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'jstqb-immutable-upgrade-'));
  const temporarySupabase = join(temporaryRoot, 'supabase');
  const temporaryMigrations = join(temporarySupabase, 'migrations');
  const temporaryTests = join(temporarySupabase, 'tests');
  await mkdir(temporaryMigrations, { recursive: true });
  await mkdir(temporaryTests, { recursive: true });
  await cp(join(workspacePath, 'supabase', 'config.toml'), join(temporarySupabase, 'config.toml'));
  await cp(join(workspacePath, 'supabase', 'tests'), temporaryTests, { recursive: true });

  const baseEntries = await readMigrationEntriesAtRef(execFileCommand, base.commitSha);
  const expectedBaseEntries = base.migrations.map(({ file, sha256: digest }) => ({ path: file, sha256: digest }));
  const actualBaseEntries = baseEntries.map(migrationEntryFromManifest)
    .map(({ path, sha256: digest }) => ({ path: basename(path), sha256: digest }));
  if (JSON.stringify(actualBaseEntries) !== JSON.stringify(expectedBaseEntries)) {
    throw new Error('immutable upgrade baseのmigration filename・SHA-256がcommitと一致しません。');
  }
  const baseManifest = await execFileCommand('git', ['show', `${base.commitSha}:supabase/migrations/manifest.json`], {
    cwd: workspacePath,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (sha256(baseManifest.stdout) !== base.migrationManifestSha256) {
    throw new Error('immutable upgrade baseのmigration manifest SHA-256がcommitと一致しません。');
  }
  const originByName = new Map(baseEntries.map((entry) => [basename(entry.path), entry]));
  const headByName = new Map(headMigrationFiles.map((entry) => [basename(entry.path), entry]));
  for (const [name, originEntry] of originByName) {
    const headEntry = headByName.get(name);
    if (headEntry !== undefined && headEntry.content !== originEntry.content) {
      throw new Error(`origin/main適用済みmigrationがHEADで変更されています: ${name}`);
    }
  }
  for (const entry of baseEntries) {
    await writeFile(join(temporaryMigrations, basename(entry.path)), entry.content, { flag: 'wx' });
  }
  const headOnlyEntries = headMigrationFiles.filter((entry) => !originByName.has(basename(entry.path)));
  return { temporaryRoot, baseEntries, headOnlyEntries };
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
        select 'event-trigger:' || event_trigger.evtname || ':event=' || event_trigger.evtevent ||
               ':owner=' || pg_get_userbyid(event_trigger.evtowner) || ':function=' || function_namespace.nspname ||
               '.' || event_function.proname || '(' || pg_get_function_identity_arguments(event_function.oid) || ')' ||
               ':enabled=' || event_trigger.evtenabled::text || ':tags=' ||
               coalesce(array_to_string(event_trigger.evttags, E'\\x1f'), '')
          from pg_catalog.pg_event_trigger event_trigger
          join pg_catalog.pg_proc event_function on event_function.oid = event_trigger.evtfoid
          join pg_catalog.pg_namespace function_namespace on function_namespace.oid = event_function.pronamespace
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
         where granted.rolname ~ '^jstqb_[a-z0-9_]+_owner$'
            or member.rolname ~ '^jstqb_[a-z0-9_]+_owner$'
        union all
        select 'role:' || role.rolname || ':super=' || role.rolsuper || ':inherit=' || role.rolinherit ||
               ':createrole=' || role.rolcreaterole || ':createdb=' || role.rolcreatedb || ':canlogin=' ||
               role.rolcanlogin || ':replication=' || role.rolreplication || ':bypassrls=' || role.rolbypassrls ||
               ':connlimit=' || role.rolconnlimit || ':validuntil=' || coalesce(role.rolvaliduntil::text, '')
          from pg_catalog.pg_roles role
         where role.rolname ~ '^jstqb_[a-z0-9_]+_owner$'
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

function exactMigrationEntries(entries) {
  return entries.map(({ path, content }) => ({ path: basename(path), sha256: sha256(content) }));
}

function isPlainRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMigrationFileEntry(entry) {
  return isPlainRecord(entry)
    && typeof entry.path === 'string'
    && typeof entry.content === 'string';
}

function isExpectedMigrationFileEntry(entry) {
  return isPlainRecord(entry)
    && typeof entry.path === 'string'
    && typeof entry.sha256 === 'string'
    && sha256Pattern.test(entry.sha256);
}

export function verifyUpgradeScenarioMigrationFiles({ baseMigrationFiles, headMigrationFiles, expectedMigrationFiles }) {
  if (!Array.isArray(baseMigrationFiles)
    || !Array.isArray(headMigrationFiles)
    || !Array.isArray(expectedMigrationFiles)
    || !baseMigrationFiles.every(isMigrationFileEntry)
    || !headMigrationFiles.every(isMigrationFileEntry)
    || !expectedMigrationFiles.every(isExpectedMigrationFileEntry)) {
    return { ok: false, errors: ['upgrade scenario migration入力が不正です。'] };
  }
  const baseNames = new Set(baseMigrationFiles.map(({ path }) => basename(path)));
  const headOnlyEntries = headMigrationFiles.filter(({ path }) => !baseNames.has(basename(path)));
  const actual = exactMigrationEntries(headOnlyEntries);
  const expected = expectedMigrationFiles.map(({ path, sha256: digest }) => ({ path, sha256: digest }));
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? { ok: true, errors: [] }
    : { ok: false, errors: ['upgrade scenarioの対象migration filename・SHA-256がHEADとの差分と一致しません。'] };
}

async function executeFixtureSql(runCommand, fixtureContent) {
  return runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: fixtureContent });
}

async function assertNoResidueObjects(runCommand, residueObjects, name) {
  const expressions = residueObjects.map((objectName) => {
    const escaped = objectName.replaceAll("'", "''");
    return objectName.endsWith('()')
      ? `coalesce(to_regprocedure('${escaped}')::text, '')`
      : `coalesce(to_regclass('${escaped}')::text, '')`;
  });
  const residue = await runCommand('docker', [
    'exec', '-i', databaseContainerName,
    'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
    '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
  ], { input: `select concat_ws(':', ${expressions.join(', ')});` });
  if (residue.status !== 0 || residue.output.trim() !== ':'.repeat(Math.max(0, expressions.length - 1))) {
    return { status: 1, output: `${name}失敗後にfixture objectが残留しました。` };
  }
  return { status: 0, output: '' };
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]);
}

function failureFixtureBasename(path) {
  return typeof path === 'string' ? (path.split('/').at(-1) ?? '') : '';
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function extractExactSqlStateTokens(output) {
  if (typeof output !== 'string') return [];
  return [...new Set([...output.matchAll(/\bSQL\s*STATE\s*:?\s*([0-9A-Za-z]{5})\b/giu)]
    .map((match) => (match[1] ?? '').toUpperCase())
    .filter((token) => sqlStatePattern.test(token)))];
}

export function hasExactCauseCodeToken(output, causeCode) {
  if (typeof output !== 'string' || typeof causeCode !== 'string' || causeCode === '') return false;
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegularExpression(causeCode)}(?:$|[^A-Za-z0-9_])`, 'u').test(output);
}

export function materializeRegisteredFailureScenario(failure, targetMigrationEntry) {
  if (failure === null || typeof failure !== 'object'
    || !registeredUpgradeFailureIds.includes(failure.id)
    || typeof failure.fixturePath !== 'string'
    || failureFixtureBasename(failure.fixturePath) !== `${failure.id}.sql`
    || failure.causeCode !== failure.id.slice(3).replaceAll('-', '_')
    || failure.expectedError !== failure.causeCode
    || typeof failure.expectedSqlState !== 'string' || !sqlStatePattern.test(failure.expectedSqlState)
    || !sameStringArray(failure.snapshotScopes, failureSnapshotScopes)
    || targetMigrationEntry === null || typeof targetMigrationEntry !== 'object'
    || typeof targetMigrationEntry.path !== 'string' || typeof targetMigrationEntry.content !== 'string') {
    return { ok: false, errors: ['registered upgrade failureの実行契約が不正です。'] };
  }
  return {
    ok: true,
    value: {
      ...failure,
      name: failure.id,
      fixture: { path: failure.fixturePath },
      expectedMigrationFiles: [{
        path: basename(targetMigrationEntry.path),
        sha256: sha256(targetMigrationEntry.content),
      }],
    },
  };
}

async function captureFailureSnapshot(runCommand, scopes, migrationFiles) {
  if (!sameStringArray(scopes, failureSnapshotScopes)) {
    return { status: 1, output: 'failure snapshot scopeが正本literalと一致しません。', values: {} };
  }
  const schema = await queryCanonicalSchemaSignature(runCommand, migrationFiles);
  if (schema.status !== 0 || schema.signature === '') return { ...schema, values: {} };
  const data = await queryCanonicalDatabaseDataSignature(runCommand);
  if (data.status !== 0 || data.signature === '') return { ...data, values: {} };
  return {
    status: 0,
    output: '',
    values: {
      schema: schema.signature,
      acl: schema.signature,
      roles: schema.signature,
      'migration-history': schema.signature,
      data: data.signature,
      sequences: data.signature,
    },
  };
}

/**
 * M1 PRで登録する異常upgrade scenarioの実行API。
 * 呼出元はimmutable baseだけをreset済みのtemporaryRootを渡す。fixture投入、実migration適用、
 * schema/data/history/residueの全てをその場で検証するため、synthetic SQLだけの擬似失敗を許可しない。
 */
export async function runUpgradeFailureScenario({
  runCommand,
  temporaryRoot,
  baseMigrationFiles,
  headMigrationFiles,
  scenario,
  fixtureContent,
  captureSnapshot = captureFailureSnapshot,
}) {
  if (scenario === null || typeof scenario !== 'object'
    || failureFixtureBasename(scenario.fixture?.path) !== `${scenario.id}.sql`
    || scenario.expectedError !== scenario.causeCode
    || !sameStringArray(scenario.snapshotScopes, failureSnapshotScopes)
    || typeof scenario.expectedSqlState !== 'string' || !sqlStatePattern.test(scenario.expectedSqlState)) {
    return { status: 1, output: 'upgrade failureのfixture/cause/snapshot契約が不正です。' };
  }
  const contract = verifyUpgradeScenarioMigrationFiles({
    baseMigrationFiles,
    headMigrationFiles,
    expectedMigrationFiles: scenario.expectedMigrationFiles,
  });
  if (!contract.ok) return { status: 1, output: contract.errors.join('\n') };
  const fixture = await executeFixtureSql(runCommand, fixtureContent);
  if (fixture.status !== 0) return fixture;
  const before = await captureSnapshot(runCommand, scenario.snapshotScopes, baseMigrationFiles);
  if (before.status !== 0) return asPhaseResult(before);
  const baseNames = new Set(baseMigrationFiles.map(({ path }) => basename(path)));
  for (const entry of headMigrationFiles.filter(({ path }) => !baseNames.has(basename(path)))) {
    await writeFile(join(temporaryRoot, 'supabase', 'migrations', basename(entry.path)), entry.content, { flag: 'wx' });
  }
  const failed = await runCommand('supabase', ['migration', 'up', '--local'], { cwd: temporaryRoot });
  const sqlStates = extractExactSqlStateTokens(failed.output);
  if (failed.status === 0 || !hasExactCauseCodeToken(failed.output, scenario.expectedError)
    || sqlStates.length !== 1 || sqlStates[0] !== scenario.expectedSqlState) {
    return { status: 1, output: `${scenario.name}が規定の実migration失敗になりませんでした。` };
  }
  const after = await captureSnapshot(runCommand, scenario.snapshotScopes, baseMigrationFiles);
  if (after.status !== 0 || JSON.stringify(after.values) !== JSON.stringify(before.values)) {
    return { status: 1, output: `${scenario.name}失敗後にsnapshot scopeが変化しました。` };
  }
  const history = await verifyMigrationHistory(runCommand, baseMigrationFiles);
  if (history.status !== 0) return history;
  return assertNoResidueObjects(runCommand, scenario.residueObjects, scenario.name);
}

export async function runDeclaredPgTapTests(runCommand, cwd, testDirectory, declaredFiles) {
  if (!Array.isArray(declaredFiles)) return { status: 1, output: 'declared pgTAP file一覧が不正です。' };
  if (declaredFiles.length === 0) return { status: 0, output: '' };
  const root = resolve(testDirectory);
  const paths = declaredFiles.map(({ path }) => resolve(root, path));
  if (paths.some((path) => path !== root && !path.startsWith(`${root}/`))) {
    return { status: 1, output: 'declared pgTAP pathがtest root外を指しています。' };
  }
  return runCommand('supabase', ['test', 'db', ...paths], { cwd });
}

function selectPhasePgTapFiles(fixtureManifest, id) {
  if (!Array.isArray(fixtureManifest.phasePgTapFiles)) {
    return { ok: false, errors: ['phase pgTAP registryが不正です。'], files: [] };
  }
  const matches = fixtureManifest.phasePgTapFiles.filter((entry) => entry !== null
    && typeof entry === 'object' && entry.id === id);
  if (matches.length !== 1) {
    return { ok: false, errors: [`phase pgTAP entryをexactに1件要求します: ${id}`], files: [] };
  }
  const [entry] = matches;
  if (typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
    return { ok: false, errors: [`phase pgTAP entryが不正です: ${id}`], files: [] };
  }
  return { ok: true, errors: [], files: [{ path: entry.path, sha256: entry.sha256 }] };
}

export function selectGenericPgTapFiles(pgTapFiles, fixtureManifest) {
  if (!Array.isArray(pgTapFiles) || fixtureManifest === null || typeof fixtureManifest !== 'object') {
    return { ok: false, errors: ['pgTAP phase分離入力が不正です。'], files: [] };
  }
  if (!Array.isArray(fixtureManifest.genericPgTapExclusions)
    || fixtureManifest.genericPgTapExclusions.some((path) => typeof path !== 'string')
    || !Array.isArray(fixtureManifest.pgTapFiles)) {
    return { ok: false, errors: ['generic pgTAP exclusion契約が不正です。'], files: [] };
  }
  if (pgTapFiles.some((entry) => entry === null || typeof entry !== 'object'
    || typeof entry.path !== 'string' || typeof entry.content !== 'string')) {
    return { ok: false, errors: ['発見済みpgTAP一覧が不正です。'], files: [] };
  }
  const exclusionPaths = new Set(fixtureManifest.genericPgTapExclusions);
  const files = pgTapFiles.filter(({ path }) => !exclusionPaths.has(path))
    .slice().sort((left, right) => compareUtf8(left.path, right.path));
  const expected = fixtureManifest.pgTapFiles.map((entry) => (
    entry !== null && typeof entry === 'object' && typeof entry.path === 'string' && typeof entry.sha256 === 'string'
      ? { path: entry.path, sha256: entry.sha256 }
      : null
  )).sort((left, right) => compareUtf8(left?.path ?? '', right?.path ?? ''));
  if (expected.includes(null)
    || files.length !== expected.length
    || files.some((entry, index) => entry === null || typeof entry !== 'object'
      || typeof entry.path !== 'string' || typeof entry.content !== 'string'
      || entry.path !== expected[index]?.path || sha256(entry.content) !== expected[index]?.sha256)) {
    return { ok: false, errors: ['generic pgTAPのmanifest完全一覧が発見結果と一致しません。'], files: [] };
  }
  return { ok: true, errors: [], files };
}

function hasExactIdentifierSequence(entries, expectedIds) {
  return Array.isArray(entries)
    && Array.isArray(expectedIds)
    && entries.length === expectedIds.length
    && entries.every((entry, index) => entry !== null && typeof entry === 'object'
      && entry.id === expectedIds[index]);
}

async function runExactRegisteredEntries(entries, expectedIds, runEntry, label) {
  if (!hasExactIdentifierSequence(entries, expectedIds) || typeof runEntry !== 'function') {
    return { status: 1, output: `${label} registryが正本ID順と一致しません。`, results: [] };
  }
  const results = [];
  for (const entry of entries) {
    const result = await runEntry(entry);
    if (result === null || typeof result !== 'object' || typeof result.status !== 'number') {
      return { status: 1, output: `${label} ${entry.id}の実行結果が不正です。`, results };
    }
    results.push({ id: entry.id, ...result });
    if (result.status !== 0) return { ...result, results };
  }
  return { status: 0, output: '', results };
}

export async function runRegisteredUpgradeScenarios(scenarios, runScenario) {
  return runExactRegisteredEntries(
    scenarios,
    registeredUpgradeScenarioIds,
    runScenario,
    'registered upgrade scenario',
  );
}

export async function executeRegisteredUpgradeScenario({
  scenario,
  prepareFixedBase,
  injectFixture,
  applyTargetMigration,
  runAssertion,
  cleanup,
}) {
  if (scenario === null || typeof scenario !== 'object'
    || !registeredUpgradeScenarioIds.includes(scenario.id)
    || typeof scenario.fixturePath !== 'string' || scenario.fixturePath === ''
    || typeof scenario.assertionPath !== 'string' || scenario.assertionPath === ''
    || typeof prepareFixedBase !== 'function'
    || typeof injectFixture !== 'function'
    || typeof applyTargetMigration !== 'function'
    || typeof runAssertion !== 'function'
    || typeof cleanup !== 'function') {
    return { status: 1, output: 'registered upgrade scenario実行契約が不正です。' };
  }
  let context;
  try {
    context = await prepareFixedBase(scenario);
    if (context === null || typeof context !== 'object' || context.status !== 0) {
      return { status: 1, output: `${scenario.id}のfixed baseを準備できません。` };
    }
    const fixture = await injectFixture(context, scenario);
    if (fixture === null || typeof fixture !== 'object' || fixture.status !== 0) {
      return { status: 1, output: `${scenario.id}のfixture注入に失敗しました。` };
    }
    const migration = await applyTargetMigration(context, scenario);
    if (migration === null || typeof migration !== 'object' || migration.status !== 0) {
      return { status: 1, output: `${scenario.id}のtarget migration適用に失敗しました。` };
    }
    const assertion = await runAssertion(context, scenario);
    if (assertion === null || typeof assertion !== 'object' || assertion.status !== 0) {
      return { status: 1, output: `${scenario.id}のassertion実行に失敗しました。` };
    }
    return { status: 0, output: '', context };
  } finally {
    if (context !== undefined) await cleanup(context, scenario);
  }
}

export async function runRegisteredUpgradeFailures(scenarios, runScenario) {
  return runExactRegisteredEntries(
    scenarios,
    registeredUpgradeFailureIds,
    runScenario,
    'registered upgrade failure',
  );
}

export async function runRegisteredWriteRaces(races, runRace) {
  return runExactRegisteredEntries(
    races,
    ['m1-legacy-write-race'],
    runRace,
    'registered write race',
  );
}

export async function runTwoConnectionTableLockRace({
  scenario,
  openBlockerConnection,
  openWriterConnection,
  runMigration,
  confirmMigrationWaiting,
  confirmWriterWaiting,
  verifyRollback,
  cleanReapply,
  migrationSettleTimeoutMs = defaultCommandTimeoutMs,
}) {
  if (scenario === null || typeof scenario !== 'object'
    || scenario.id !== 'm1-legacy-write-race'
    || scenario.barrierProtocol !== 'two-connection-table-lock-v1'
    || typeof openBlockerConnection !== 'function'
    || typeof openWriterConnection !== 'function'
    || typeof runMigration !== 'function'
    || typeof confirmMigrationWaiting !== 'function'
    || typeof confirmWriterWaiting !== 'function'
    || typeof verifyRollback !== 'function'
    || typeof cleanReapply !== 'function'
    || !Number.isSafeInteger(migrationSettleTimeoutMs) || migrationSettleTimeoutMs <= 0) {
    return { status: 1, output: 'two-connection table-lock race契約が不正です。', outcome: 'invalid' };
  }
  let blocker;
  let writer;
  let migrationPromise;
  let result = { status: 1, output: 'two-connection table-lock raceを開始できません。', outcome: 'invalid' };
  const awaitMigration = async () => {
    if (migrationPromise === undefined) return { status: 0, output: '' };
    let timeout;
    const settled = await Promise.race([
      migrationPromise,
      new Promise((resolve) => {
        timeout = setTimeout(() => {
          resolve({ status: 1, output: 'target migrationの終了待機が期限を超過しました。' });
        }, migrationSettleTimeoutMs);
      }),
    ]);
    clearTimeout(timeout);
    return settled;
  };
  try {
    blocker = await openBlockerConnection();
    writer = await openWriterConnection();
    if (blocker === null || typeof blocker !== 'object' || typeof blocker.prepare !== 'function'
      || typeof blocker.release !== 'function' || typeof blocker.close !== 'function'
      || writer === null || typeof writer !== 'object' || typeof writer.prepare !== 'function'
      || typeof writer.release !== 'function' || typeof writer.close !== 'function'
    ) {
      result = { status: 1, output: 'two-connection table-lock raceのpersistent connection契約が不正です。', outcome: 'invalid' };
      return result;
    }
    const blockerPrepared = await blocker.prepare();
    if (blockerPrepared === null || typeof blockerPrepared !== 'object' || blockerPrepared.status !== 0
      || !Number.isSafeInteger(blockerPrepared.blockerPid) || blockerPrepared.blockerPid <= 0) {
      result = { status: 1, output: 'blocker ready/locked handshakeに失敗しました。', outcome: 'handshake-failed' };
      return result;
    }
    try {
      migrationPromise = Promise.resolve(runMigration()).then(
        (migration) => (migration !== null && typeof migration === 'object'
          && typeof migration.status === 'number'
          ? migration
          : { status: 1, output: 'target migrationの実行結果が不正です。' }),
        () => ({ status: 1, output: 'target migrationの実行で例外が発生しました。' }),
      );
    } catch {
      migrationPromise = Promise.resolve({ status: 1, output: 'target migrationの実行で例外が発生しました。' });
    }
    const migrationWaiting = await confirmMigrationWaiting(blockerPrepared.blockerPid);
    if (migrationWaiting === null || typeof migrationWaiting !== 'object' || migrationWaiting.status !== 0
      || !Number.isSafeInteger(migrationWaiting.migrationPid) || migrationWaiting.migrationPid <= 0) {
      result = { status: 1, output: 'migration connectionのtable-lock待機を確認できません。', outcome: 'handshake-failed' };
      return result;
    }
    const writerPrepared = await writer.prepare();
    if (writerPrepared === null || typeof writerPrepared !== 'object' || writerPrepared.status !== 0
      || !Number.isSafeInteger(writerPrepared.writerPid) || writerPrepared.writerPid <= 0) {
      result = { status: 1, output: 'legacy writer ready handshakeに失敗しました。', outcome: 'handshake-failed' };
      return result;
    }
    const writerWaiting = await confirmWriterWaiting({
      blockerPid: blockerPrepared.blockerPid,
      migrationPid: migrationWaiting.migrationPid,
      writerPid: writerPrepared.writerPid,
    });
    if (writerWaiting === null || typeof writerWaiting !== 'object' || writerWaiting.status !== 0) {
      result = { status: 1, output: 'legacy writer connectionのtable-lock待機を確認できません。', outcome: 'handshake-failed' };
      return result;
    }
    const blockerRelease = await blocker.release();
    if (blockerRelease === null || typeof blockerRelease !== 'object' || blockerRelease.status !== 0) {
      result = { status: 1, output: 'blocker release handshakeに失敗しました。', outcome: 'handshake-failed' };
      return result;
    }
    const writerResult = await writer.release();
    const migration = await awaitMigration();
    if (migration === null || typeof migration !== 'object' || typeof migration.status !== 'number'
      || writerResult === null || typeof writerResult !== 'object' || typeof writerResult.status !== 'number') {
      result = { status: 1, output: 'two-connection table-lock raceの実行結果が不正です。', outcome: 'invalid' };
      return result;
    }
    if (migration.status === 0 || writerResult.status !== 0) {
      result = { status: 1, output: '競合段階ではwriter完了後もtarget migration全rollbackを要求します。', outcome: 'rollback-required' };
      return result;
    }
    const rollback = await verifyRollback({ migration, writer: writerResult });
    if (rollback === null || typeof rollback !== 'object' || rollback.status !== 0) {
      result = { status: 1, output: 'two-connection table-lock race後の全rollbackを確認できません。', outcome: 'rollback-failed' };
      return result;
    }
    const reapply = await cleanReapply();
    if (reapply === null || typeof reapply !== 'object' || reapply.status !== 0) {
      result = { status: 1, output: 'two-connection table-lock race後のclean fixed-base再適用に失敗しました。', outcome: 'reapply-failed' };
      return result;
    }
    result = { status: 0, output: '', outcome: 'rollback-clean-reapply' };
    return result;
  } catch {
    result = { status: 1, output: 'two-connection table-lock raceの実行中に例外が発生しました。', outcome: 'execution-failed' };
    return result;
  } finally {
    const blockerClose = blocker !== undefined ? await blocker.close() : { status: 0 };
    const writerClose = writer !== undefined ? await writer.close() : { status: 0 };
    const migration = await awaitMigration();
    const migrationDidNotSettle = migration.status !== 0
      && migration.output === 'target migrationの終了待機が期限を超過しました。';
    if ((blockerClose.status !== 0 || writerClose.status !== 0 || migrationDidNotSettle)
      && result.status === 0) result = { status: 1, output: 'two-connection table-lock raceのpersistent connection cleanupに失敗しました。', outcome: 'cleanup-failed' };
    return result;
  }
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
  const fixtureFiles = await readFixtureEntries(fixtureDirectory);
  const pgTapRoot = join(workspacePath, 'supabase', 'tests');
  const pgTapPaths = await enumeratePgTapTestFiles(pgTapRoot);
  const pgTapFiles = await readRelativeEntries(pgTapRoot, pgTapPaths);
  const fixtureManifestContent = await readFile(fixtureManifestPath, 'utf8');
  const fixtureV2Result = verifyFixtureManifestV2File({
    manifestContent: fixtureManifestContent,
    fixtureFiles,
    pgTapFiles,
  });
  if (!fixtureV2Result.ok) return fixtureV2Result;
  const fixtureManifest = JSON.parse(fixtureManifestContent);
  const canaries = loadDeclaredProductionBoundaryCanaries(fixtureManifest, fixtureFiles);
  if (!canaries.ok) return canaries;
  return {
    ok: true,
    value: {
      headMigrationFiles,
      fixtureFiles,
      pgTapFiles,
      fixtureManifestContent,
      fixtureManifest,
      manifest: await readJson(manifestPath),
      canaryRegistry: canaries.value,
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
  registeredUpgradeScenariosRunner = runRegisteredUpgradeScenarios,
  log = console,
} = {}) {
  const activeChildren = new Set();
  const persistentConnections = new Set();
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
    for (const connection of persistentConnections) {
      void connection.cancel(signal);
    }
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
  const fixtureV2Result = verifyFixtureManifestV2File({
    manifestContent: fixtureManifestContent,
    fixtureFiles,
    pgTapFiles,
  });
  if (!fixtureV2Result.ok) {
    log.error(fixtureV2Result.errors.join('\n'));
    return 1;
  }
  const m1Result = verifyM1ScenarioRegistration({
    manifest: fixtureManifest,
    migrationFiles: headMigrationFiles,
  });
  if (!m1Result.ok) {
    log.error(m1Result.errors.join('\n'));
    return 1;
  }
  const fixtureByPath = new Map(fixtureFiles.map(({ path, content }) => [path, content]));
  const genericPgTapResult = selectGenericPgTapFiles(pgTapFiles, fixtureManifest);
  if (!genericPgTapResult.ok) {
    log.error(genericPgTapResult.errors.join('\n'));
    return 1;
  }
  const genericPgTapFiles = genericPgTapResult.files;
  const primaryUpgradeBase = fixtureManifest.upgradeBases.length === 1
    ? fixtureManifest.upgradeBases[0]
    : undefined;
  const executedPhasePgTapIds = new Set();

  const persistOwnership = async () => {
    if (ownershipFilePath === undefined || ownershipFilePath === '') return;
    await writeOwnershipFile(ownershipFilePath, expectedNames, repositoryLockDirectory);
    ownershipFileWritten = true;
  };

  const runPhasePgTap = async (id, cwd) => {
    if (executedPhasePgTapIds.has(id)) {
      return { status: 1, output: `phase pgTAP ${id}を同一harness実行で重複実行できません。` };
    }
    executedPhasePgTapIds.add(id);
    const selected = selectPhasePgTapFiles(fixtureManifest, id);
    if (!selected.ok) return { status: 1, output: selected.errors.join('\n') };
    return runDeclaredPgTapTests(
      runCommand,
      cwd,
      join(cwd, 'supabase', 'tests'),
      selected.files,
    );
  };

  const registerFailureScenario = (failure) => {
    const target = headMigrationFiles.find(({ path }) => basename(path) === fixtureManifest.targetMigration);
    if (target === undefined) throw new Error('registered M1 target migrationがHEADにありません。');
    const materialized = materializeRegisteredFailureScenario(failure, target);
    if (!materialized.ok) throw new Error(materialized.errors.join('\n'));
    return materialized.value;
  };

  const runRegisteredFailureScenario = async (scenario) => {
    let built;
    let result = { status: 1, output: `${scenario.name}を開始できませんでした。` };
    let cleanupStatus = 0;
    try {
      built = await buildImmutableUpgradeRoot({
        execFileCommand,
        base: fixtureManifest.base,
        headMigrationFiles,
      });
      const started = await runCommand('supabase', ['start'], { cwd: built.temporaryRoot });
      const afterStart = await listProjectContainers(runCommand);
      if (afterStart.status === 0) expectedNames = afterStart.containers.map(({ name }) => name);
      if (afterStart.status !== 0 || expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        result = started.status !== 0
          ? started
          : { status: 1, output: `${scenario.name}のfixed-base stack所有権を確定できません。` };
      } else {
        await persistOwnership();
        if (started.status !== 0) {
          result = started;
        } else {
          const beforeResetNames = [...expectedNames];
          const reset = await runCommand('supabase', ['db', 'reset'], { cwd: built.temporaryRoot });
          const afterReset = await listProjectContainers(runCommand);
          if (afterReset.status !== 0 || !sameContainerNames(afterReset.containers, beforeResetNames)) {
            result = reset.status !== 0
              ? reset
              : { status: 1, output: `${scenario.name}のreset後所有権を確定できません。` };
          } else {
            expectedNames = afterReset.containers.map(({ name }) => name);
            await persistOwnership();
            if (reset.status !== 0) {
              result = reset;
            } else {
              const baseHistory = await verifyMigrationHistory(runCommand, built.baseEntries);
              const fixtureContent = fixtureByPath.get(scenario.fixture.path);
              if (baseHistory.status !== 0) {
                result = baseHistory;
              } else if (fixtureContent === undefined) {
                result = { status: 1, output: `${scenario.name}のfixtureがありません。` };
              } else {
                result = await runUpgradeFailureScenario({
                  runCommand,
                  temporaryRoot: built.temporaryRoot,
                  baseMigrationFiles: built.baseEntries,
                  headMigrationFiles,
                  scenario,
                  fixtureContent,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { status: 1, output: `${scenario.name}の独立実行に失敗しました: ${redactDatabaseOutput(message)}` };
    } finally {
      if (built !== undefined && expectedNames.length > 0) {
        const stopped = await stopOwnedStack(runCleanupCommand, expectedNames, built.temporaryRoot);
        if (stopped.status !== 0) cleanupStatus = stopped.status;
      }
      expectedNames = [];
      try { await persistOwnership(); } catch { cleanupStatus = cleanupStatus || 1; }
      const remaining = await listProjectContainers(runCleanupCommand);
      if (remaining.status !== 0 || remaining.containers.length > 0) cleanupStatus = remaining.status || 1;
      if (built !== undefined) {
        try { await rm(built.temporaryRoot, { recursive: true, force: true }); } catch { cleanupStatus = cleanupStatus || 1; }
      }
    }
    return cleanupStatus === 0
      ? result
      : { status: cleanupStatus, output: `${scenario.name}の独立cleanupに失敗しました。` };
  };

  const runRegisteredUpgradeScenario = async (scenario) => {
    let cleanupStatus = 0;
    try {
      const result = await executeRegisteredUpgradeScenario({
        scenario,
        prepareFixedBase: async () => {
          const built = await buildImmutableUpgradeRoot({
            execFileCommand,
            base: fixtureManifest.base,
            headMigrationFiles,
          });
          const started = await runCommand('supabase', ['start'], { cwd: built.temporaryRoot });
          const afterStart = await listProjectContainers(runCommand);
          if (afterStart.status === 0) expectedNames = afterStart.containers.map(({ name }) => name);
          if (started.status !== 0 || afterStart.status !== 0
            || expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
            return { status: 1, built };
          }
          await persistOwnership();
          const beforeResetNames = [...expectedNames];
          const reset = await runCommand('supabase', ['db', 'reset'], { cwd: built.temporaryRoot });
          const afterReset = await listProjectContainers(runCommand);
          if (reset.status !== 0 || afterReset.status !== 0
            || !sameContainerNames(afterReset.containers, beforeResetNames)) {
            return { status: 1, built };
          }
          expectedNames = afterReset.containers.map(({ name }) => name);
          await persistOwnership();
          const history = await verifyMigrationHistory(runCommand, built.baseEntries);
          return history.status === 0 ? { status: 0, built } : { status: 1, built };
        },
        injectFixture: async () => {
          const fixtureContent = fixtureByPath.get(scenario.fixturePath);
          if (fixtureContent === undefined) return { status: 1 };
          return executeFixtureSql(runCommand, fixtureContent);
        },
        applyTargetMigration: async (context) => {
          for (const entry of context.built.headOnlyEntries) {
            await writeFile(
              join(context.built.temporaryRoot, 'supabase', 'migrations', basename(entry.path)),
              entry.content,
              { flag: 'wx' },
            );
          }
          const migration = await runCommand('supabase', ['migration', 'up', '--local'], {
            cwd: context.built.temporaryRoot,
          });
          if (migration.status !== 0) return migration;
          return verifyMigrationHistory(runCommand, headMigrationFiles);
        },
        runAssertion: async (context) => {
          const assertionContent = fixtureByPath.get(scenario.assertionPath);
          if (assertionContent === undefined) return { status: 1 };
          const assertion = await (scenario.assertionPath.endsWith('.test.sql')
            ? runCommand('supabase', ['test', 'db', resolve(fixtureDirectory, scenario.assertionPath)], {
              cwd: context.built.temporaryRoot,
            })
            : executeFixtureSql(runCommand, assertionContent));
          if (assertion.status !== 0) return assertion;
          if (scenario.id !== 'm1-normal-upgrade') return { status: 0, output: '' };
          const generic = await runDeclaredPgTapTests(
            runCommand,
            context.built.temporaryRoot,
            join(context.built.temporaryRoot, 'supabase', 'tests'),
            genericPgTapFiles,
          );
          if (generic.status !== 0) return generic;
          const normal = await runPhasePgTap('m1-normal-post', context.built.temporaryRoot);
          if (normal.status !== 0) return normal;
          const signature = await queryCanonicalSchemaSignature(runCommand, headMigrationFiles);
          if (signature.status !== 0 || signature.signature === '') return asPhaseResult(signature);
          context.signature = signature.signature;
          return { status: 0, output: '' };
        },
        cleanup: async (context) => {
          if (context?.built === undefined) return;
          if (expectedNames.length > 0) {
            const stopped = await stopOwnedStack(runCleanupCommand, expectedNames, context.built.temporaryRoot);
            if (stopped.status !== 0) cleanupStatus = stopped.status;
          }
          expectedNames = [];
          try { await persistOwnership(); } catch { cleanupStatus = cleanupStatus || 1; }
          const remaining = await listProjectContainers(runCleanupCommand);
          if (remaining.status !== 0 || remaining.containers.length > 0) cleanupStatus = remaining.status || 1;
          try { await rm(context.built.temporaryRoot, { recursive: true, force: true }); } catch { cleanupStatus = cleanupStatus || 1; }
          if (cleanupStatus !== 0) throw new Error(`${scenario.id}の独立cleanupに失敗しました。`);
        },
      });
      return result.status === 0
        ? { status: 0, output: '', signature: result.context?.signature ?? '' }
        : result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 1, output: `${scenario.id}の独立実行に失敗しました: ${redactDatabaseOutput(message)}` };
    }
  };

  const runRegisteredWriteRace = async (race) => {
    let built;
    let cleanupStatus = 0;
    const stopRaceRoot = async () => {
      if (built === undefined) return;
      if (expectedNames.length > 0) {
        const stopped = await stopOwnedStack(runCleanupCommand, expectedNames, built.temporaryRoot);
        if (stopped.status !== 0) cleanupStatus = stopped.status;
      }
      expectedNames = [];
      try { await persistOwnership(); } catch { cleanupStatus = cleanupStatus || 1; }
      const remaining = await listProjectContainers(runCleanupCommand);
      if (remaining.status !== 0 || remaining.containers.length > 0) cleanupStatus = remaining.status || 1;
      try { await rm(built.temporaryRoot, { recursive: true, force: true }); } catch { cleanupStatus = cleanupStatus || 1; }
      built = undefined;
    };
    const prepareFixedBase = async () => {
      built = await buildImmutableUpgradeRoot({
        execFileCommand,
        base: fixtureManifest.base,
        headMigrationFiles,
      });
      const started = await runCommand('supabase', ['start'], { cwd: built.temporaryRoot });
      const afterStart = await listProjectContainers(runCommand);
      if (started.status !== 0 || afterStart.status !== 0) return started.status !== 0 ? started : afterStart;
      expectedNames = afterStart.containers.map(({ name }) => name);
      if (expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        return { status: 1, output: 'write raceのfixed-base stack所有権を確定できません。' };
      }
      await persistOwnership();
      const beforeResetNames = [...expectedNames];
      const reset = await runCommand('supabase', ['db', 'reset'], { cwd: built.temporaryRoot });
      const afterReset = await listProjectContainers(runCommand);
      if (reset.status !== 0 || afterReset.status !== 0
        || !sameContainerNames(afterReset.containers, beforeResetNames)) {
        return reset.status !== 0 ? reset : { status: 1, output: 'write race reset後の所有権を確定できません。' };
      }
      expectedNames = afterReset.containers.map(({ name }) => name);
      await persistOwnership();
      return verifyMigrationHistory(runCommand, built.baseEntries);
    };
    const applyHead = async () => {
      if (built === undefined) return { status: 1, output: 'write raceのfixed baseがありません。' };
      for (const entry of built.headOnlyEntries) {
        await writeFile(
          join(built.temporaryRoot, 'supabase', 'migrations', basename(entry.path)),
          entry.content,
          { flag: 'wx' },
        );
      }
      const migration = await runCommand('supabase', ['migration', 'up', '--local'], { cwd: built.temporaryRoot });
      if (migration.status !== 0) return migration;
      return verifyMigrationHistory(runCommand, headMigrationFiles);
    };
    const runPostRaceChecks = async () => {
      if (built === undefined) return { status: 1, output: 'write raceのpost-check対象がありません。' };
      const generic = await runDeclaredPgTapTests(
        runCommand,
        built.temporaryRoot,
        join(built.temporaryRoot, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (generic.status !== 0) return generic;
      return runPhasePgTap('m1-race-post', built.temporaryRoot);
    };
    try {
      if (race === null || typeof race !== 'object'
        || race.id !== 'm1-legacy-write-race'
        || race.barrierProtocol !== 'two-connection-table-lock-v1'
        || typeof race.fixturePath !== 'string' || typeof race.writerPath !== 'string') {
        return { status: 1, output: 'registered write raceの実行入力が不正です。' };
      }
      const fixtureContent = fixtureByPath.get(race.fixturePath);
      const writerContent = fixtureByPath.get(race.writerPath);
      if (fixtureContent === undefined || writerContent === undefined) {
        return { status: 1, output: 'registered write raceのfixtureまたはwriterがありません。' };
      }
      const prepared = await prepareFixedBase();
      if (prepared.status !== 0 || built === undefined) return prepared;
      const fixture = await executeFixtureSql(runCommand, fixtureContent);
      if (fixture.status !== 0) return fixture;
      const before = await captureFailureSnapshot(runCommand, failureSnapshotScopes, built.baseEntries);
      if (before.status !== 0) return asPhaseResult(before);
      const raceResult = await runTwoConnectionTableLockRace({
        scenario: race,
        openBlockerConnection: async () => {
          const connection = createPersistentPsqlConnection({
            spawnCommand,
            activeChildren,
            persistentConnections,
            commandTimeoutMs,
            terminationGraceMs,
            label: 'write race writer',
          });
          return {
            prepare: async () => {
              const ready = await connection.sendAndWait(
                `begin;\nselect 'jstqb_m1_race_blocker_pid:' || pg_backend_pid()::text;\nselect '${raceHandshake.ready}';`,
                raceHandshake.ready,
              );
              if (ready.status !== 0) return ready;
              const locked = await connection.sendAndWait(
                `select pg_advisory_lock(${String(raceHandshake.advisoryKey)});\nselect '${raceHandshake.locked}';`,
                raceHandshake.locked,
              );
              const blockerPid = connection.getUniqueIntegerToken('jstqb_m1_race_blocker_pid:');
              return locked.status === 0 && blockerPid !== undefined
                ? { status: 0, output: '', blockerPid }
                : { status: 1, output: 'blocker backend PIDまたはadvisory lockを確認できません。' };
            },
            release: async () => connection.sendAndWait(
              `select pg_advisory_unlock(${String(raceHandshake.advisoryKey)});\ncommit;\nselect '${raceHandshake.release}';\n\\q`,
              raceHandshake.release,
            ),
            close: connection.close,
          };
        },
        openWriterConnection: async () => {
          const connection = createPersistentPsqlConnection({
            spawnCommand,
            activeChildren,
            persistentConnections,
            commandTimeoutMs,
            terminationGraceMs,
            label: 'write race legacy writer',
          });
          let writerOutputOffset;
          return {
            prepare: async () => {
              const ready = await connection.sendAndWait(
                `begin;\nselect 'jstqb_m1_race_writer_pid:' || pg_backend_pid()::text;\nselect '${raceHandshake.observerReady}';`,
                raceHandshake.observerReady,
              );
              if (ready.status !== 0) return ready;
              const writerPid = connection.getUniqueIntegerToken('jstqb_m1_race_writer_pid:');
              const waiting = connection.send(
                buildLegacyWriterRaceExecutionSql(writerContent),
              );
              writerOutputOffset = waiting.outputOffset;
              return waiting.status === 0 && writerPid !== undefined
                && Number.isSafeInteger(writerOutputOffset)
                ? { status: 0, output: '', writerPid }
                : { status: 1, output: 'legacy writer backend PIDまたはlock requestを開始できません。' };
            },
            release: async () => {
              const completed = await connection.waitForToken(
                raceHandshake.writerDone,
                [],
                writerOutputOffset,
              );
              if (completed.status !== 0) return completed;
              return connection.sendAndWait(
                buildLegacyWriterRaceReleaseSql(),
                raceHandshake.release,
              );
            },
            close: connection.close,
          };
        },
        runMigration: applyHead,
        confirmMigrationWaiting: async (blockerPid) => {
          const deadline = Date.now() + commandTimeoutMs;
          while (Date.now() < deadline) {
            const observed = await runCommand('docker', [
              'exec', '-i', databaseContainerName,
              'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
              '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
            ], { input: `select coalesce((select lock.pid::text from pg_catalog.pg_locks lock where lock.relation = 'public.sync_events'::regclass and lock.mode = 'AccessExclusiveLock' and lock.granted and ${String(blockerPid)} = any(pg_catalog.pg_blocking_pids(lock.pid)) order by lock.pid limit 1), 'not-waiting');` });
            if (observed.status !== 0) return observed;
            const migrationPid = Number(observed.output.trim());
            if (Number.isSafeInteger(migrationPid) && migrationPid > 0) return { status: 0, output: '', migrationPid };
            await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 50));
          }
          return { status: 1, output: 'migration connectionのtable-lock待機を期限内に確認できません。' };
        },
        confirmWriterWaiting: async ({ blockerPid, migrationPid, writerPid }) => {
          const deadline = Date.now() + commandTimeoutMs;
          while (Date.now() < deadline) {
            const observed = await runCommand('docker', [
              'exec', '-i', databaseContainerName,
              'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
              '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
            ], { input: `select case when exists (select 1 from pg_catalog.pg_locks lock where lock.relation = 'public.sync_events'::regclass and lock.mode = 'RowExclusiveLock' and not lock.granted and lock.pid = ${String(writerPid)} and ${String(migrationPid)} = any(pg_catalog.pg_blocking_pids(lock.pid)) and lock.pid <> ${String(blockerPid)}) then 'waiting' else 'not-waiting' end;` });
            if (observed.status !== 0) return observed;
            if (observed.output.trim() === 'waiting') return { status: 0, output: '' };
            await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 50));
          }
          return { status: 1, output: 'legacy writer connectionのtable-lock待機を期限内に確認できません。' };
        },
        verifyRollback: async () => {
          if (built === undefined) return { status: 1, output: 'rollback確認対象がありません。' };
          const after = await captureFailureSnapshot(runCommand, failureSnapshotScopes, built.baseEntries);
          if (after.status !== 0 || JSON.stringify(after.values) !== JSON.stringify(before.values)) {
            return { status: 1, output: 'write race後にfixed-base snapshotが変化しました。' };
          }
          return verifyMigrationHistory(runCommand, built.baseEntries);
        },
        cleanReapply: async () => {
          await stopRaceRoot();
          if (cleanupStatus !== 0) return { status: cleanupStatus, output: 'write race rollback後の旧stack cleanupに失敗しました。' };
          const cleanPrepared = await prepareFixedBase();
          if (cleanPrepared.status !== 0 || built === undefined) return cleanPrepared;
          const cleanFixture = fixtureByPath.get(primaryUpgradeBase?.fixturePath ?? '');
          if (cleanFixture === undefined) return { status: 1, output: 'write race clean reapply用fixtureがありません。' };
          const injected = await executeFixtureSql(runCommand, cleanFixture);
          if (injected.status !== 0) return injected;
          const reapply = await applyHead();
          if (reapply.status !== 0) return reapply;
          return runPostRaceChecks();
        },
      });
      if (raceResult.status !== 0) return raceResult;
      return raceResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 1, output: `write raceの独立実行に失敗しました: ${redactDatabaseOutput(message)}` };
    } finally {
      await stopRaceRoot();
      if (cleanupStatus !== 0) {
        return { status: cleanupStatus, output: 'write raceの独立cleanupに失敗しました。' };
      }
    }
  };

  const runCleanFixedBaseCheckpoint = async (phaseId) => {
    let built;
    let cleanupStatus = 0;
    try {
      built = await buildImmutableUpgradeRoot({
        execFileCommand,
        base: fixtureManifest.base,
        headMigrationFiles,
      });
      const started = await runCommand('supabase', ['start'], { cwd: built.temporaryRoot });
      const afterStart = await listProjectContainers(runCommand);
      if (started.status !== 0 || afterStart.status !== 0) return started.status !== 0 ? started : afterStart;
      expectedNames = afterStart.containers.map(({ name }) => name);
      if (expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        return { status: 1, output: `${phaseId}のclean fixed-base stack所有権を確定できません。` };
      }
      await persistOwnership();
      const beforeResetNames = [...expectedNames];
      const reset = await runCommand('supabase', ['db', 'reset'], { cwd: built.temporaryRoot });
      const afterReset = await listProjectContainers(runCommand);
      if (reset.status !== 0 || afterReset.status !== 0
        || !sameContainerNames(afterReset.containers, beforeResetNames)) {
        return reset.status !== 0 ? reset : { status: 1, output: `${phaseId}のclean fixed-base resetに失敗しました。` };
      }
      expectedNames = afterReset.containers.map(({ name }) => name);
      await persistOwnership();
      const baseHistory = await verifyMigrationHistory(runCommand, built.baseEntries);
      if (baseHistory.status !== 0) return baseHistory;
      const fixtureContent = fixtureByPath.get(primaryUpgradeBase?.fixturePath ?? '');
      if (fixtureContent === undefined) return { status: 1, output: `${phaseId}のclean reapply fixtureがありません。` };
      const fixture = await executeFixtureSql(runCommand, fixtureContent);
      if (fixture.status !== 0) return fixture;
      for (const entry of built.headOnlyEntries) {
        await writeFile(
          join(built.temporaryRoot, 'supabase', 'migrations', basename(entry.path)),
          entry.content,
          { flag: 'wx' },
        );
      }
      const migration = await runCommand('supabase', ['migration', 'up', '--local'], { cwd: built.temporaryRoot });
      if (migration.status !== 0) return migration;
      const history = await verifyMigrationHistory(runCommand, headMigrationFiles);
      if (history.status !== 0) return history;
      const generic = await runDeclaredPgTapTests(
        runCommand,
        built.temporaryRoot,
        join(built.temporaryRoot, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (generic.status !== 0) return generic;
      return runPhasePgTap(phaseId, built.temporaryRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 1, output: `${phaseId}のclean fixed-base再適用に失敗しました: ${redactDatabaseOutput(message)}` };
    } finally {
      if (built !== undefined && expectedNames.length > 0) {
        const stopped = await stopOwnedStack(runCleanupCommand, expectedNames, built.temporaryRoot);
        if (stopped.status !== 0) cleanupStatus = stopped.status;
      }
      expectedNames = [];
      try { await persistOwnership(); } catch { cleanupStatus = cleanupStatus || 1; }
      const remaining = await listProjectContainers(runCleanupCommand);
      if (remaining.status !== 0 || remaining.containers.length > 0) cleanupStatus = remaining.status || 1;
      if (built !== undefined) {
        try { await rm(built.temporaryRoot, { recursive: true, force: true }); } catch { cleanupStatus = cleanupStatus || 1; }
      }
      if (cleanupStatus !== 0) {
        return { status: cleanupStatus, output: `${phaseId}のclean fixed-base cleanupに失敗しました。` };
      }
    }
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
      const fixtureV2Result = verifyFixtureManifestV2File({
        manifestContent: fixtureManifestContent,
        fixtureFiles,
        pgTapFiles,
      });
      if (!fixtureV2Result.ok) return { status: 1, output: fixtureV2Result.errors.join('\n') };
      const m1Result = verifyM1ScenarioRegistration({
        manifest: fixtureManifest,
        migrationFiles: headMigrationFiles,
      });
      if (!m1Result.ok) return { status: 1, output: m1Result.errors.join('\n') };
      if (primaryUpgradeBase === undefined) {
        return { status: 1, output: '現行5 phaseではimmutable upgrade baseをexactに1件要求します。' };
      }
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
      const tests = await runDeclaredPgTapTests(
        runCommand,
        workspacePath,
        join(workspacePath, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (tests.status !== 0) return tests;
      if (fixtureManifest.m1ScenarioState === 'registered') {
        const freshHead = await runPhasePgTap('fresh-head', workspacePath);
        if (freshHead.status !== 0) return freshHead;
      }
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
      if (fixtureManifest.m1ScenarioState === 'registered') {
        const scenarios = await registeredUpgradeScenariosRunner(
          fixtureManifest.upgradeScenarios,
          runRegisteredUpgradeScenario,
        );
        if (scenarios.status !== 0) return scenarios;
      }
      const built = await buildImmutableUpgradeRoot({
        execFileCommand,
        base: fixtureManifest.base,
        headMigrationFiles,
      });
      const normalScenario = undefined;
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
      const originHistory = await verifyMigrationHistory(runCommand, built.baseEntries);
      if (originHistory.status !== 0) return originHistory;
      const normalFixturePath = normalScenario?.fixturePath ?? primaryUpgradeBase.fixturePath;
      const normalFixtureContent = fixtureByPath.get(normalFixturePath);
      if (normalFixtureContent === undefined) {
        return { status: 1, output: `正常upgrade fixtureがありません: ${normalFixturePath}` };
      }
      const fixture = await runCommand('docker', [
        'exec', '-i', databaseContainerName,
        'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
        '--quiet', '--set', 'ON_ERROR_STOP=1',
      ], { input: normalFixtureContent });
      if (fixture.status !== 0) return fixture;
      const baseSuite = await runPhasePgTap('origin-main-upgrade-base', temporaryUpgradeRoot);
      if (baseSuite.status !== 0) return baseSuite;
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
      if (normalScenario === undefined) {
        const fixtureCheck = await runCommand('docker', [
          'exec', '-i', databaseContainerName,
          'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
          '--tuples-only', '--no-align', '--quiet', '--set', 'ON_ERROR_STOP=1',
        ], { input: "select count(*) from public.certifications where code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1';" });
        if (fixtureCheck.status !== 0 || fixtureCheck.output.trim() !== '1') {
          return { status: 1, output: 'origin/main-shaped fixtureの保持を確認できません。' };
        }
      }
      const tests = await runDeclaredPgTapTests(
        runCommand,
        temporaryUpgradeRoot,
        join(temporaryUpgradeRoot, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (tests.status !== 0) return tests;
      if (fixtureManifest.m1ScenarioState === 'registered') {
        const upgradePost = await runPhasePgTap('origin-main-upgrade-post', temporaryUpgradeRoot);
        if (upgradePost.status !== 0) return upgradePost;
      }
      if (normalScenario === undefined) {
        const removeFixtureData = await runCommand('docker', [
          'exec', '-i', databaseContainerName,
          'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc',
          '--quiet', '--set', 'ON_ERROR_STOP=1',
        ], { input: "delete from public.certifications where id = 'db000000-0000-4000-8000-000000000001' and code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1';" });
        if (removeFixtureData.status !== 0) return removeFixtureData;
      }
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
      if (fixtureManifest.m1ScenarioState === 'registered') {
        const stopped = await stopOwnedStack(runCommand, expectedNames, temporaryUpgradeRoot ?? workspacePath);
        if (stopped.status !== 0) return stopped;
        expectedNames = [];
        const remaining = await listProjectContainers(runCommand);
        if (remaining.status !== 0 || remaining.containers.length > 0) {
          return { status: 1, output: 'write race開始前にorigin-main upgrade stackを停止できません。' };
        }
        const races = await runRegisteredWriteRaces(fixtureManifest.writeRaces, runRegisteredWriteRace);
        return races.status === 0 ? { status: 0, output: '' } : races;
      }
      const generic = await runDeclaredPgTapTests(
        runCommand,
        temporaryUpgradeRoot ?? workspacePath,
        join(temporaryUpgradeRoot ?? workspacePath, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (generic.status !== 0) return generic;
      return { status: 0, output: '' };
    },
    async 'atomic-failure'() {
      if (fixtureManifest.m1ScenarioState === 'registered') {
        const failures = await runRegisteredUpgradeFailures(
          fixtureManifest.upgradeFailures.map(registerFailureScenario),
          runRegisteredFailureScenario,
        );
        if (failures.status !== 0) return failures;
        return runCleanFixedBaseCheckpoint('atomic-failure-reapply-post');
      }
      const generic = await runDeclaredPgTapTests(
        runCommand,
        temporaryUpgradeRoot ?? workspacePath,
        join(temporaryUpgradeRoot ?? workspacePath, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (generic.status !== 0) return generic;
      return { status: 0, output: '' };
    },
    async 'production-boundary'() {
      // rich fixtureを使ったupgrade検証のstackを破棄し、fixture-freeなHEAD DBから境界を確認する。
      const stopped = await stopOwnedStack(runCommand, expectedNames, temporaryUpgradeRoot ?? workspacePath);
      if (stopped.status !== 0) return stopped;
      expectedNames = [];
      const remaining = await listProjectContainers(runCommand);
      if (remaining.status !== 0 || remaining.containers.length !== 0) {
        return { status: 1, output: 'fixture stack停止後にcontainerが残留しています。' };
      }
      const started = await runCommand('supabase', ['start'], { cwd: workspacePath });
      const afterStart = await listProjectContainers(runCommand);
      if (afterStart.status === 0) expectedNames = afterStart.containers.map(({ name }) => name);
      if (afterStart.status !== 0 || expectedNames.length === 0 || !expectedNames.includes(databaseContainerName)) {
        return started.status !== 0
          ? started
          : { status: 1, output: 'fixture-free current-head stackの所有権を確定できません。' };
      }
      await persistOwnership();
      if (started.status !== 0) return started;
      const resetNames = [...expectedNames];
      const reset = await runCommand('supabase', ['db', 'reset'], { cwd: workspacePath });
      const afterReset = await listProjectContainers(runCommand);
      if (afterReset.status !== 0 || !sameContainerNames(afterReset.containers, resetNames)) {
        return reset.status !== 0
          ? reset
          : { status: 1, output: 'fixture-free current-head reset後の所有権を確定できません。' };
      }
      expectedNames = afterReset.containers.map(({ name }) => name);
      await persistOwnership();
      if (reset.status !== 0) return reset;
      const freshHeadHistory = await verifyMigrationHistory(runCommand, headMigrationFiles);
      if (freshHeadHistory.status !== 0) return freshHeadHistory;
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
      const generic = await runDeclaredPgTapTests(
        runCommand,
        workspacePath,
        join(workspacePath, 'supabase', 'tests'),
        genericPgTapFiles,
      );
      if (generic.status !== 0) return generic;
      return fixtureManifest.m1ScenarioState === 'registered'
        ? runPhasePgTap('production-boundary-head', workspacePath)
        : { status: 0, output: '' };
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
    const persistentCleanup = await Promise.all(
      [...persistentConnections].map(async (connection) => connection.cancel('HARNESS_CLEANUP')),
    );
    if (persistentCleanup.some((result) => result.status !== 0) && status === 0) status = 1;
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
  if (status === 0 && fixtureManifest.m1ScenarioState === 'registered') {
    const expectedPhaseIds = fixtureManifest.phasePgTapFiles.map(({ id }) => id);
    if (expectedPhaseIds.length !== executedPhasePgTapIds.size
      || expectedPhaseIds.some((id) => !executedPhasePgTapIds.has(id))) {
      log.error('registered profileのphase pgTAP実行IDがregistry完全一覧と一致しません。');
      status = 1;
    }
  }
  if (terminationSignal !== undefined) return 1;
  return status;
}

const isMainModule = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) process.exitCode = await runProductionDatabaseHarness();
