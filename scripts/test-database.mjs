import { spawn } from 'node:child_process';

const databaseContainerName = 'supabase_db_jstqb-study-app';
const databaseCommands = [
  ['supabase', ['start']],
  ['supabase', ['db', 'reset']],
  ['supabase', ['test', 'db']],
];

function runCommand(command, argumentsList, options = {}) {
  const { captureOutput = false, quiet = false } = options;
  return new Promise((resolve) => {
    const child = spawn(command, argumentsList, {
      stdio: quiet ? ['inherit', 'ignore', 'ignore'] : captureOutput ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', (error) => {
      console.error(`${command}の起動に失敗しました: ${error.message}`);
      resolve({ status: 1, output });
    });
    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(`${command}がシグナル${signal}で終了しました。`);
        resolve({ status: 1, output });
        return;
      }
      resolve({ status: code ?? 1, output });
    });
  });
}

async function showDiagnostics() {
  console.error('Supabase検証に失敗したため、コンテナ一覧を表示します。');
  await runCommand('docker', [
    'ps',
    '--all',
    '--filter',
    'name=supabase_',
    '--format',
    'table {{.Names}}\\t{{.Status}}\\t{{.Image}}',
  ]);
  console.error('PostgreSQLの末尾300行を表示します。');
  await runCommand('docker', ['logs', '--tail', '300', databaseContainerName]);
}

async function main() {
  let status = 0;
  for (const [command, argumentsList] of databaseCommands) {
    const commandResult = await runCommand(command, argumentsList, { quiet: command === 'supabase' && argumentsList[0] === 'start' });
    if (commandResult.status !== 0) {
      status = commandResult.status;
      await showDiagnostics();
      break;
    }
  }

  console.log('ローカルSupabaseを停止します。');
  const cleanupResult = await runCommand('supabase', ['stop', '--no-backup'], { quiet: true });
  if (cleanupResult.status !== 0) {
    console.error('ローカルSupabaseの停止に失敗しました。');
    if (status === 0) status = cleanupResult.status;
  }
  if (cleanupResult.status === 0) console.log('ローカルSupabaseを停止しました。');

  const remainingResult = await runCommand('docker', [
    'ps',
    '--all',
    '--quiet',
    '--filter',
    'name=supabase_',
  ], { captureOutput: true });
  if (remainingResult.status !== 0 && status === 0) status = remainingResult.status;
  if (remainingResult.output.trim() !== '') {
    console.error('Supabaseコンテナがcleanup後も残っています。');
    if (status === 0) status = 1;
  }
  return status;
}

process.exitCode = await main();
