import { describe, expect, it, vi } from 'vitest';

import { createCatalogFetcher, type CatalogRpcClient } from './catalog-client';

describe('createCatalogFetcher', () => {
  it('RPC引数をsnake_case契約へ変換する', async () => {
    const rpc = vi.fn<CatalogRpcClient['rpc']>().mockResolvedValue({
      data: { schema: 'question-catalog.v1' },
      error: null,
    });
    const fetcher = createCatalogFetcher({ rpc });

    await fetcher({
      scope: {
        certificationCode: 'JSTQB-FL',
        syllabusVersion: '2023V4.0.J02',
        channel: 'public',
        userId: null,
      },
      sinceRevision: 12,
    });

    expect(rpc).toHaveBeenCalledWith('get_question_catalog_v1', {
      certification_code: 'JSTQB-FL',
      syllabus_version: '2023V4.0.J02',
      since_revision: 12,
      channel: 'public',
    });
  });

  it('RPCエラーを利用者向けErrorへ変換する', async () => {
    const fetcher = createCatalogFetcher({
      rpc: () => Promise.resolve({
        data: null,
        error: { message: '権限がありません' },
      }),
    });

    await expect(fetcher({
      scope: {
        certificationCode: 'JSTQB-FL',
        syllabusVersion: '2023V4.0.J02',
        channel: 'personal_preview',
        userId: USER_ID,
      },
      sinceRevision: null,
    })).rejects.toThrow(/権限がありません/);
  });
});

const USER_ID = '11111111-1111-4111-8111-111111111111';
