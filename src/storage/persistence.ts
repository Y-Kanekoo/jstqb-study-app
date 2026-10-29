import { StorageConflictError } from './persistence-conflict';

const memory = new Map<string, string>();

export async function getStoredValue(key: string): Promise<string | null> {
  return memory.get(key) ?? null;
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  memory.set(key, value);
}

export async function compareAndSetStoredValue(key: string, expected: string | null, value: string): Promise<void> {
  if ((memory.get(key) ?? null) !== expected) throw new StorageConflictError();
  memory.set(key, value);
}
