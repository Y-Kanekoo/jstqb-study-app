import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspacePath = process.cwd();
const supabasePath = join(workspacePath, 'supabase');
const migrationPath = join(supabasePath, 'migrations');
const fixturePath = join(supabasePath, 'upgrade_fixtures');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'jstqb-upgrade-harness-'));
const temporarySupabasePath = join(temporaryRoot, 'supabase');
const temporaryMigrationPath = join(temporarySupabasePath, 'migrations');
const databaseUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const scenarios = [
  {
    name: '有効attempt重複',
    fixture: 'upgrade_duplicate_attempt.sql',
    expectedFailure: '有効なanswer_attemptsが重複しています'
  },
  {
    name: 'question/version解決不能',
    fixture: 'upgrade_unresolvable_version.sql',
    expectedFailure: 'バックフィル対象を解決できません'
  },
  {
    name: 'question_ids重複array',
    fixture: 'upgrade_duplicate_question_ids.sql',
    expectedFailure: 'question_idsが重複しています'
  },
  { name: '正常backfill', fixture: null, expectedFailure: null }
];

function run(command, args, cwd, input = '') {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function runRequired(label, command, args, cwd, input = '') {
  const result = run(command, args, cwd, input);
  if (result.status !== 0) {
    throw new Error(`${label}が失敗しました（終了コード: ${result.status ?? '不明'}）。`);
  }
  return result;
}

function queryRequired(sql) {
  const result = runRequired(
    'データベース検証',
    'psql',
    ['--dbname', databaseUrl, '--no-psqlrc', '--tuples-only', '--no-align', '--quiet', '--command', sql],
    workspacePath
  );
  return result.stdout.trim();
}

function stageMigration(sourceName, targetName) {
  cpSync(join(migrationPath, sourceName), join(temporaryMigrationPath, targetName));
}

function stageScenario(scenario) {
  rmSync(temporaryRoot, { recursive: true, force: true });
  mkdirSync(temporaryMigrationPath, { recursive: true });
  cpSync(join(supabasePath, 'config.toml'), join(temporarySupabasePath, 'config.toml'));

  stageMigration('202608110001_initial.sql', '202608110001_initial.sql');
  stageMigration('202608120001_learning_p0.sql', '20260812000100_learning_p0.sql');
  stageMigration('202608120002_server_integrity.sql', '202608120002_server_integrity.sql');
  stageMigration('202608120003_server_integrity_read_acl.sql', '202608120003_server_integrity_read_acl.sql');
  stageMigration('202608120004_server_integrity_content_protection.sql', '202608120004_server_integrity_content_protection.sql');

  cpSync(
    join(fixturePath, 'upgrade_legacy_base.sql'),
    join(temporaryMigrationPath, '20260812000150_legacy_fixture.sql')
  );
  if (scenario.fixture !== null) {
    cpSync(
      join(fixturePath, scenario.fixture),
      join(temporaryMigrationPath, '20260812000175_legacy_scenario.sql')
    );
  }
}

function resetTemporaryDatabase() {
  return run(
    'supabase',
    ['db', 'reset', '--local', '--no-seed'],
    temporaryRoot,
    'y\n'
  );
}

function assertFailedUpgradeHasNoLaterMigrations() {
  const count = queryRequired(
    "select count(*) from supabase_migrations.schema_migrations where version in ('202608120002', '202608120003', '202608120004');"
  );
  if (count !== '0') {
    throw new Error('preflight失敗後に002以降のmigrationが記録されています。');
  }
}

function assertSuccessfulUpgrade() {
  const checkSql = readFileSync(
    join(workspacePath, 'scripts', 'server-integrity-upgrade-success.sql'),
    'utf8'
  );
  runRequired(
    'upgrade成功検証',
    'psql',
    ['--dbname', databaseUrl, '--no-psqlrc', '--quiet', '--command', checkSql],
    workspacePath
  );
}

try {
  if (!existsSync(join(migrationPath, '202608120004_server_integrity_content_protection.sql'))) {
    throw new Error('content protection migrationが見つかりません。');
  }

  for (const scenario of scenarios) {
    stageScenario(scenario);
    const resetResult = resetTemporaryDatabase();
    const resetSucceeded = resetResult.status === 0;
    if (scenario.fixture === null) {
      if (!resetSucceeded) {
        throw new Error('正常upgradeが失敗しました。');
      }
      assertSuccessfulUpgrade();
    } else {
      if (resetSucceeded) {
        throw new Error(`${scenario.name}でupgradeが成功してしまいました。`);
      }
      const failureText = `${resetResult.stdout}\n${resetResult.stderr}`;
      if (!failureText.includes('SERVER_INTEGRITY_PREFLIGHT_FAILED')
        || !failureText.includes(scenario.expectedFailure)) {
        throw new Error(`${scenario.name}のpreflightエラーが明示されていません。`);
      }
      assertFailedUpgradeHasNoLaterMigrations();
    }
  }
  console.log('server integrity upgrade harness: 成功');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
