import { openDB, type DBSchema } from 'idb';

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
