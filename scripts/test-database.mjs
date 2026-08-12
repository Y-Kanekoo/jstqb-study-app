import { execFile as defaultExecFile, spawn as defaultSpawn } from 'node:child_process';
import { mkdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

export const projectId = 'jstqb-study-app';
export const projectLabel = `com.supabase.cli.project=${projectId}`;
export const databaseContainerName = `supabase_db_${projectId}`;

const projectLabelFilter = `label=${projectLabel}`;
const projectContainerFormat = '{{.ID}}\\t{{.Names}}';
const containerQueryAttempts = 3;
const containerQueryRetryDelayMs = 100;
const execFile = promisify(defaultExecFile);
const databaseCommands = [
  ['supabase', ['start']],
  ['supabase', ['db', 'reset']],
  ['supabase', ['test', 'db']],
];

function createCommandRunner(spawnCommand) {
  return (command, argumentsList) => new Promise((resolveResult) => {
    const child = spawnCommand(command, argumentsList, { stdio: ['inherit', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', (error) => {
      resolveResult({ status: 1, output: `${output}${error.message}` });
    });
    child.once('exit', (code, signal) => {
      resolveResult({ status: signal ? 1 : code ?? 1, output });
    });
  });
}

function parseContainers(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split('\t');
      return { id: id ?? '', name: name ?? '' };
    })
    .filter((container) => container.id !== '');
}

function redactOutput(output) {
  return output
    .replaceAll(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/giu, '[機密接続情報を伏せました]')
    .replaceAll(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/gu, '[JWTを伏せました]')
    .replaceAll(/\b[A-Za-z0-9_-]{24,}\b/gu, '[長いtoken候補を伏せました]')
    .replaceAll(/\b(?:password|token|secret|key|credential)\b\s*[:=]\s*[^\s]+/giu, '[機密値を伏せました]');
}

function logFailure(log, label, result) {
  log.error(`${label}に失敗しました（終了コード${result.status}）。`);
  if (result.output.trim() !== '') log.error(redactOutput(result.output));
}

async function listProjectContainers(runCommand) {
  let result = { status: 1, output: '' };
  for (let attempt = 1; attempt <= containerQueryAttempts; attempt += 1) {
    result = await runCommand('docker', [
      'ps',
      '--all',
      '--filter',
      projectLabelFilter,
      '--format',
      projectContainerFormat,
    ]);
    if (result.status === 0) return { ...result, containers: parseContainers(result.output) };
    const retryable = /(?:daemon|temporar|busy|unavailable|connection|timeout)/iu.test(result.output);
    if (attempt < containerQueryAttempts && retryable) {
      await new Promise((resolveResult) => setTimeout(resolveResult, containerQueryRetryDelayMs));
    } else {
      break;
    }
  }
  return { ...result, containers: [] };
}

function includesOnly(expectedContainerNames, currentContainers) {
  const knownNames = new Set(expectedContainerNames);
  return currentContainers.every((container) => knownNames.has(container.name));
}

async function showDiagnostics(runCommand, log) {
  log.error(`Supabase検証に失敗したため、label=${projectLabel}のコンテナを確認します。`);
  const containers = await listProjectContainers(runCommand);
  if (containers.status === 0 && containers.containers.length > 0) {
    log.error(containers.containers.map((container) => `${container.id}\t${container.name}`).join('\n'));
    const databaseContainer = containers.containers.find(({ name }) => name === databaseContainerName);
    if (databaseContainer !== undefined) {
      const databaseLogs = await runCommand('docker', ['logs', '--tail', '300', databaseContainer.name]);
      if (databaseLogs.output.trim() !== '') log.error(redactOutput(databaseLogs.output));
    }
  }
}

function logContainerQueryFailure(log, label, result) {
  logFailure(log, label, result);
  log.error(`${label}のDocker照会が${containerQueryAttempts}回すべて失敗したため、所有権を確定せず停止を中止します。`);
}

async function acquireRepositoryLock({ execFileCommand = execFile } = {}) {
  const gitCommonDirectoryResult = await execFileCommand(
    'git',
    ['rev-parse', '--git-common-dir'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const gitCommonDirectory = gitCommonDirectoryResult.stdout.trim();
  if (gitCommonDirectory === '') throw new Error('Git共通ディレクトリを確認できません。');

  const lockKey = createHash('sha256').update(resolve(gitCommonDirectory)).digest('hex');
  const lockDirectory = resolve(tmpdir(), `.supabase-database-ci-${lockKey}.lock`);
  try {
    await mkdir(lockDirectory, { mode: 0o700 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`共有排他lockを取得できません（${lockDirectory}）: ${message}`);
  }
  return async () => rmdir(lockDirectory);
}

async function runDatabaseChecksUnlocked({ spawnCommand, log }) {
  const runCommand = createCommandRunner(spawnCommand);
  const preflight = await listProjectContainers(runCommand);
  if (preflight.status !== 0) {
    logContainerQueryFailure(log, `Supabase ${projectLabel} の事前確認`, preflight);
    return preflight.status;
  }
  if (preflight.containers.length > 0) {
    log.error(`Supabase ${projectLabel} の既存containerがあるため、他agentのDBを操作せず中止します。`);
    return 1;
  }

  let expectedContainerNames = [];
  let startAttempted = false;
  let status = 0;
  const startResult = await runCommand(...databaseCommands[0]);
  startAttempted = true;
  const afterStart = await listProjectContainers(runCommand);
  if (afterStart.status !== 0) {
    if (startResult.status !== 0) logFailure(log, 'supabase start', startResult);
    logContainerQueryFailure(log, 'Supabase起動後の所有確認', afterStart);
    status = startResult.status === 0 ? 1 : startResult.status;
  } else {
    expectedContainerNames = afterStart.containers.map((container) => container.name);
    if (startResult.status !== 0) {
      logFailure(log, 'supabase start', startResult);
      await showDiagnostics(runCommand, log);
      status = startResult.status;
    } else if (expectedContainerNames.length === 0 || expectedContainerNames.some((name) => name === '')) {
      log.error('Supabase起動後に同project labelのcontainerを確認できないため、中止します。');
      status = 1;
    }
  }

  if (status === 0) {
    const resetResult = await runCommand(...databaseCommands[1]);
    if (resetResult.status !== 0) {
      logFailure(log, 'supabase db reset', resetResult);
      await showDiagnostics(runCommand, log);
      status = resetResult.status;
    }
  }

  if (status === 0) {
    const testResult = await runCommand(...databaseCommands[2]);
    if (testResult.status !== 0) {
      logFailure(log, 'supabase test db', testResult);
      await showDiagnostics(runCommand, log);
      status = testResult.status;
    }
  }

  if (startAttempted && expectedContainerNames.length > 0) {
    const beforeCleanup = await listProjectContainers(runCommand);
    if (beforeCleanup.status !== 0) {
      logContainerQueryFailure(log, 'cleanup前の所有確認', beforeCleanup);
      if (status === 0) status = beforeCleanup.status;
    } else if (!includesOnly(expectedContainerNames, beforeCleanup.containers)) {
      log.error('cleanup前に未知の同project containerを検出したため、他agentのDBを停止せず中止します。');
      if (status === 0) status = 1;
    } else if (beforeCleanup.containers.length > 0) {
      const stopResult = await runCommand('supabase', ['stop', '--no-backup']);
      if (stopResult.status !== 0) {
        logFailure(log, 'supabase stop --no-backup', stopResult);
        if (status === 0) status = stopResult.status;
      }
    }

    const afterCleanup = await listProjectContainers(runCommand);
    if (afterCleanup.status !== 0) {
      logContainerQueryFailure(log, 'cleanup後の残留確認', afterCleanup);
      if (status === 0) status = afterCleanup.status;
    } else if (afterCleanup.containers.length > 0) {
      log.error(`cleanup後も${projectLabel}のcontainerが残っています。`);
      if (status === 0) status = 1;
    }
  }

  return status;
}

export async function runDatabaseChecks({
  spawnCommand = defaultSpawn,
  log = console,
  acquireLock = acquireRepositoryLock,
} = {}) {
  let releaseLock;
  try {
    releaseLock = await acquireLock();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Supabase検証の共有排他lockを取得できないため、中止します: ${message}`);
    return 1;
  }

  let status = 1;
  try {
    status = await runDatabaseChecksUnlocked({ spawnCommand, log });
  } finally {
    try {
      await releaseLock();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Supabase検証の共有排他lockを解放できないため、失敗扱いにします: ${message}`);
      status = status === 0 ? 1 : status;
    }
  }
  return status;
}

const isMainModule = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) process.exitCode = await runDatabaseChecks();
