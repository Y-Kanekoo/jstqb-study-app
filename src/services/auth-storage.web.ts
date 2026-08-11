export const authStorage = {
  getItem: async (key: string): Promise<string | null> => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => { globalThis.localStorage?.setItem(key, value); },
  removeItem: async (key: string): Promise<void> => { globalThis.localStorage?.removeItem(key); },
};
