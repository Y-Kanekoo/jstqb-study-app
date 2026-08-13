import { spawn as defaultSpawn } from 'node:child_process';
import { readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redactDatabaseOutput } from './database-harness.mjs';
import { projectLabel } from './test-database.mjs';

const projectLabelFilter = `label=${projectLabel}`;
const containerFormat = '{{.ID}}\t{{.Names}}';

function createCommandRunner(spawnCommand) {
  return (command, argumentsList) => new Promise((resolveResult) => {
    const child = spawnCommand(command, argumentsList, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', (error) => resolveResult({ status: 1, output: `${output}${error.message}` }));
    child.once('exit', (code, signal) => resolveResult({ status: signal ? 1 : code ?? 1, output }));
  });
}

function parseContainerNames(output) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [, name = ''] = line.split('\t');
    return name;
  }).filter(Boolean);
}

function parseOwnership(content) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const known = lines.filter((line) => line === 'known=true').length === 1;
  const names = lines.filter((line) => line.startsWith('name=')).map((line) => line.slice(5));
  const lockLines = lines.filter((line) => line.startsWith('lock=')).map((line) => line.slice(5));
  const validNames = names.length > 0 && names.every((name) => /^supabase_[a-z0-9_-]+_jstqb-study-app$/u.test(name));
  const lockDirectory = lockLines.length === 1 ? resolve(lockLines[0]) : undefined;
  const validLock = lockDirectory !== undefined
    && dirname(lockDirectory) === resolve(tmpdir())
    && /^\.supabase-database-ci-[0-9a-f]{64}\.lock$/u.test(basename(lockDirectory));
  return {
    validLock,
    trustedContainers: known && validNames && new Set(names).size === names.length,
    names,
    lockDirectory,
  };
}

export async function cleanupDatabaseHarness({
  ownershipFile,
  spawnCommand = defaultSpawn,
  log = console,
  readOwnershipFile = readFile,
  removeOwnershipFile = (path) => rm(path, { force: true }),
  removeLockDirectory = rmdir,
} = {}) {
  const runCommand = createCommandRunner(spawnCommand);
  const containers = await runCommand('docker', [
    'ps', '--all', '--filter', projectLabelFilter, '--format', containerFormat,
  ]);
  if (containers.status !== 0) {
    log.error(`DB harness外側cleanupのDocker照会に失敗しました: ${redactDatabaseOutput(containers.output)}`);
    return containers.status;
  }
  const currentNames = parseContainerNames(containers.output);

  let ownership;
  try {
    if (typeof ownershipFile !== 'string' || ownershipFile.trim() === '') throw new Error('ownership file未指定');
    ownership = parseOwnership(await readOwnershipFile(ownershipFile, 'utf8'));
  } catch (error) {
    if (currentNames.length === 0) return 0;
    const message = error instanceof Error ? error.message : String(error);
    log.error(`DB harnessの所有証跡を確認できないためcontainerを停止しません: ${redactDatabaseOutput(message)}`);
    return 1;
  }
  if (!ownership.validLock) {
    if (currentNames.length > 0) log.error('DB harnessのlock所有証跡が不正なためcontainerを停止しません。');
    return currentNames.length === 0 ? 0 : 1;
  }
  if (currentNames.length > 0 && !ownership.trustedContainers) {
    log.error('DB harnessのcontainer所有証跡が不正なためcontainerを停止しません。');
    return 1;
  }
  const expected = new Set(ownership.names);
  if (currentNames.some((name) => !expected.has(name))) {
    log.error('未知の同project containerを検出したため外側cleanupで停止しません。');
    return 1;
  }
  if (currentNames.length > 0) {
    const stopped = await runCommand('supabase', ['stop', '--no-backup']);
    if (stopped.status !== 0) {
      log.error(`DB harness外側cleanupのsupabase stopに失敗しました: ${redactDatabaseOutput(stopped.output)}`);
      return stopped.status;
    }
  }
  const remaining = await runCommand('docker', [
    'ps', '--all', '--filter', projectLabelFilter, '--format', containerFormat,
  ]);
  if (remaining.status !== 0 || parseContainerNames(remaining.output).length > 0) {
    log.error('DB harness外側cleanup後にcontainerが残留しています。');
    return remaining.status === 0 ? 1 : remaining.status;
  }
  try {
    await removeLockDirectory(ownership.lockDirectory);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'ENOENT') {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`DB harnessの共有排他lockを解放できません: ${redactDatabaseOutput(message)}`);
      return 1;
    }
  }
  await removeOwnershipFile(ownershipFile);
  return 0;
}

const isMainModule = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  process.exitCode = await cleanupDatabaseHarness({ ownershipFile: process.env.DB_HARNESS_OWNERSHIP_FILE });
}
