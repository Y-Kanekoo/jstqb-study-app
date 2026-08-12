export interface CatalogCacheStorage {
  read(key: string): Promise<string | null>;
  writeAtomic(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  removeByPrefix(prefix: string): Promise<void>;
}

const memoryValues = new Map<string, string>();

export const catalogCacheStorage: CatalogCacheStorage = {
  async read(key) {
    return memoryValues.get(key) ?? null;
  },
  async writeAtomic(key, value) {
    memoryValues.set(key, value);
  },
  async remove(key) {
    memoryValues.delete(key);
  },
  async removeByPrefix(prefix) {
    for (const key of memoryValues.keys()) {
      if (key.startsWith(prefix)) {
        memoryValues.delete(key);
      }
    }
  },
};
