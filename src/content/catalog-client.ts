import type { CatalogFetcher } from './catalog-cache';

export interface CatalogRpcError {
  message: string;
}

export interface CatalogRpcClient {
  rpc(
    functionName: 'get_question_catalog_v1',
    parameters: {
      certification_code: string;
      syllabus_version: string;
      since_revision: number | null;
      channel: 'public' | 'personal_preview';
    },
  ): PromiseLike<{ data: unknown; error: CatalogRpcError | null }>;
}

export function createCatalogFetcher(client: CatalogRpcClient): CatalogFetcher {
  return async ({ scope, sinceRevision }) => {
    const { data, error } = await client.rpc('get_question_catalog_v1', {
      certification_code: scope.certificationCode,
      syllabus_version: scope.syllabusVersion,
      since_revision: sinceRevision,
      channel: scope.channel,
    });
    if (error !== null) {
      throw new Error(`問題カタログの取得に失敗しました: ${error.message}`);
    }
    return data;
  };
}
