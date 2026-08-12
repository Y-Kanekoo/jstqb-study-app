import { describe, expect, it } from 'vitest';

import { getQuestion } from './questions';

describe('full Questionのサンプル経路gate', () => {
  it('固定サンプル以外の新規問題IDをfull Question経路へ通さない', () => {
    expect(getQuestion('new-production-question')).toBeUndefined();
  });

  it('既存の固定サンプルは移行前の検証用として取得できる', () => {
    expect(getQuestion('fl-001')?.id).toBe('fl-001');
  });
});
