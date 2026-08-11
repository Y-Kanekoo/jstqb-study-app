import { openDB, type DBSchema } from 'idb';

import type { CatalogCacheStorage } from './catalog-cache-storage';

interface CatalogCacheDatabase extends DBSchema {
  catalogs: {
    key: string;
    value: string;
  };
}

const databasePromise = openDB<CatalogCacheDatabase>('jstqb-content-catalog', 1, {
  upgrade(database) {
    database.createObjectStore('catalogs');
  },
});

export const catalogCacheStorage: CatalogCacheStorage = {
  async read(key) {
    const database = await databasePromise;
    return (await database.get('catalogs', key)) ?? null;
  },
  async writeAtomic(key, value) {
    const database = await databasePromise;
    const transaction = database.transaction('catalogs', 'readwrite');
    await transaction.store.put(value, key);
    await transaction.done;
  },
  async remove(key) {
    const database = await databasePromise;
    await database.delete('catalogs', key);
  },
  async removeByPrefix(prefix) {
    const database = await databasePromise;
    const transaction = database.transaction('catalogs', 'readwrite');
    const keys = await transaction.store.getAllKeys();
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        await transaction.store.delete(key);
      }
    }
    await transaction.done;
  },
};
