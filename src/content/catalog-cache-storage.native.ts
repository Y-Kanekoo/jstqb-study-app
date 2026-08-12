import * as SQLite from 'expo-sqlite';

import type { CatalogCacheStorage } from './catalog-cache-storage';

const databasePromise = SQLite.openDatabaseAsync('jstqb-study.db');

async function prepareDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await databasePromise;
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS content_catalog_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      envelope_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

export const catalogCacheStorage: CatalogCacheStorage = {
  async read(key) {
    const database = await prepareDatabase();
    const row = await database.getFirstAsync<{ envelope_json: string }>(
      'SELECT envelope_json FROM content_catalog_cache WHERE cache_key = ?',
      key,
    );
    return row?.envelope_json ?? null;
  },
  async writeAtomic(key, value) {
    const database = await prepareDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO content_catalog_cache (cache_key, envelope_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           envelope_json = excluded.envelope_json,
           updated_at = excluded.updated_at`,
        key,
        value,
        new Date().toISOString(),
      );
    });
  },
  async remove(key) {
    const database = await prepareDatabase();
    await database.runAsync(
      'DELETE FROM content_catalog_cache WHERE cache_key = ?',
      key,
    );
  },
  async removeByPrefix(prefix) {
    const database = await prepareDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `DELETE FROM content_catalog_cache
          WHERE substr(cache_key, 1, length(?)) = ?`,
        prefix,
        prefix,
      );
    });
  },
};
