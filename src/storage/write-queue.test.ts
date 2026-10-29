import { describe, expect, it } from 'vitest';

import { createWriteQueue } from './write-queue';

describe('保存キュー', () => {
  it('失敗した保存を呼び出し元へ返し、次の保存を順番に再試行できる', async () => {
    const writes: string[] = [];
    const enqueue = createWriteQueue(async (value: string) => {
      writes.push(value);
      if (value === 'first') throw new Error('storage unavailable');
    });

    const first = enqueue('first');
    const second = enqueue('second');

    await expect(first).rejects.toThrow('storage unavailable');
    await expect(second).resolves.toBeUndefined();
    expect(writes).toEqual(['first', 'second']);
  });
});
