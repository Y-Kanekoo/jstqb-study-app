const memory = new Map<string, string>();

export async function getStoredValue(key: string): Promise<string | null> {
  return memory.get(key) ?? null;
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  memory.set(key, value);
}
