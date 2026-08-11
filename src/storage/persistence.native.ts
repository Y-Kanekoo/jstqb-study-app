import * as SQLite from 'expo-sqlite';

const databasePromise = SQLite.openDatabaseAsync('jstqb-study.db');

async function prepareDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await databasePromise;
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

export async function getStoredValue(key: string): Promise<string | null> {
  const database = await prepareDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM key_value_store WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  const database = await prepareDatabase();
  await database.runAsync(
    `INSERT INTO key_value_store (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString(),
  );
}
