import { openDB, type DBSchema } from 'idb';

import { StorageConflictError } from './persistence-conflict';

interface LearningDatabase extends DBSchema {
  values: {
    key: string;
    value: string;
  };
}

const databasePromise = openDB<LearningDatabase>('jstqb-study', 1, {
  upgrade(database) {
    database.createObjectStore('values');
  },
});

export async function getStoredValue(key: string): Promise<string | null> {
  const database = await databasePromise;
  return (await database.get('values', key)) ?? null;
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  const database = await databasePromise;
  await database.put('values', value, key);
}

export async function compareAndSetStoredValue(key: string, expected: string | null, value: string): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction('values', 'readwrite');
  const current = (await transaction.store.get(key)) ?? null;
  if (current !== expected) {
    throw new StorageConflictError();
  }
  await transaction.store.put(value, key);
  await transaction.done;
}
