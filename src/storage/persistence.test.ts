import { describe, expect, it } from 'vitest';

import { compareAndSetStoredValue, getStoredValue } from './persistence';
import { StorageConflictError } from './persistence-conflict';

describe('端末保存の競合検知', () => {
  it('旧版を元にした書込みを拒否し、新版を保持する', async () => {
    const key = crypto.randomUUID();
    await compareAndSetStoredValue(key, null, 'first');
    await compareAndSetStoredValue(key, 'first', 'second');
    await expect(compareAndSetStoredValue(key, 'first', 'stale')).rejects.toBeInstanceOf(StorageConflictError);
    expect(await getStoredValue(key)).toBe('second');
  });
});
