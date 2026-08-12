import { z } from 'zod';

import {
  catalogChannelSchema,
  catalogSnapshotSchema,
  type CatalogChannel,
  type CatalogSnapshot,
} from './catalog-schema';
import {
  catalogCacheStorage,
  type CatalogCacheStorage,
} from './catalog-cache-storage';
import { calculateCatalogHash } from './catalog-hash';

const cacheScopeSchema = z.object({
  certificationCode: z.string().min(1).max(64),
  syllabusVersion: z.string().min(1).max(64),
  channel: catalogChannelSchema,
  userId: z.string().uuid().nullable(),
}).strict().superRefine((scope, context) => {
  if (scope.channel === 'personal_preview' && scope.userId === null) {
    context.addIssue({
      code: 'custom',
      path: ['userId'],
      message: 'personal_previewのキャッシュにはユーザーIDが必要です。',
    });
  }
});

const cacheEnvelopeSchema = z.object({
  formatVersion: z.literal(1),
  scope: cacheScopeSchema,
  snapshot: catalogSnapshotSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  storedAt: z.string().datetime({ offset: true }),
}).strict();

export type CatalogCacheScope = z.infer<typeof cacheScopeSchema>;

export interface CatalogFetchRequest {
  scope: CatalogCacheScope;
  sinceRevision: number | null;
}

export type CatalogFetcher = (request: CatalogFetchRequest) => Promise<unknown>;

export type CatalogCacheReadResult =
  | { status: 'hit'; snapshot: CatalogSnapshot }
  | { status: 'miss' | 'corrupt'; snapshot: null };

export type CatalogRefreshResult =
  | { status: 'updated'; snapshot: CatalogSnapshot }
  | { status: 'offline'; snapshot: CatalogSnapshot | null; error: Error };

export interface CatalogCacheFirstResult {
  cacheStatus: CatalogCacheReadResult['status'];
  cached: CatalogSnapshot | null;
  refresh: Promise<CatalogRefreshResult>;
}

type HashFunction = (value: string) => Promise<string>;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
  return `{${entries.join(',')}}`;
}

async function defaultHash(value: string): Promise<string> {
  return calculateCatalogHash(value);
}

function normalizeScope(scope: CatalogCacheScope): CatalogCacheScope {
  return cacheScopeSchema.parse(scope);
}

function assertSnapshotScope(
  scope: CatalogCacheScope,
  snapshot: CatalogSnapshot,
): void {
  if (snapshot.certificationCode !== scope.certificationCode
    || snapshot.syllabusVersion !== scope.syllabusVersion
    || snapshot.channel !== scope.channel) {
    throw new Error('取得したカタログの資格・シラバス版・channelが要求と一致しません。');
  }
}

function encodedSegment(value: string): string {
  return encodeURIComponent(value);
}

function userKey(userId: string | null): string {
  return userId === null ? 'anonymous' : encodedSegment(userId);
}

export function buildCatalogCacheKey(scopeValue: CatalogCacheScope): string {
  const scope = normalizeScope(scopeValue);
  return [
    'question-catalog',
    'v1',
    userKey(scope.userId),
    scope.channel,
    encodedSegment(scope.certificationCode),
    encodedSegment(scope.syllabusVersion),
  ].join(':');
}

function buildPrivatePreviewPrefix(userId: string): string {
  const parsedUserId = z.string().uuid().parse(userId);
  return `question-catalog:v1:${encodedSegment(parsedUserId)}:personal_preview:`;
}

function mergeCatalogSnapshots(
  previous: CatalogSnapshot | null,
  incoming: CatalogSnapshot,
): CatalogSnapshot {
  if (previous !== null && incoming.revision < previous.revision) {
    throw new Error('取得したカタログrevisionがキャッシュより古いため適用できません。');
  }
  if (incoming.fullSnapshot) {
    return incoming;
  }
  if (previous === null) {
    throw new Error('差分カタログの適用には完全スナップショットが必要です。');
  }
  if (incoming.certificationCode !== previous.certificationCode
    || incoming.syllabusVersion !== previous.syllabusVersion
    || incoming.channel !== previous.channel) {
    throw new Error('異なるカタログへの差分は適用できません。');
  }

  const removedVersionIds = new Set(incoming.removedVersionIds);
  const questions = new Map(
    previous.questions
      .filter((question) => !removedVersionIds.has(question.versionId))
      .map((question) => [question.id, question]),
  );
  for (const question of incoming.questions) {
    questions.set(question.id, question);
  }

  return catalogSnapshotSchema.parse({
    ...incoming,
    fullSnapshot: true,
    questions: [...questions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    removedVersionIds: [],
  });
}

export class CatalogCacheRepository {
  private readonly storage: CatalogCacheStorage;
  private readonly hash: HashFunction;
  private readonly now: () => Date;

  constructor(options: {
    storage?: CatalogCacheStorage;
    hash?: HashFunction;
    now?: () => Date;
  } = {}) {
    this.storage = options.storage ?? catalogCacheStorage;
    this.hash = options.hash ?? defaultHash;
    this.now = options.now ?? (() => new Date());
  }

  async read(scopeValue: CatalogCacheScope): Promise<CatalogCacheReadResult> {
    const scope = normalizeScope(scopeValue);
    const key = buildCatalogCacheKey(scope);
    const raw = await this.storage.read(key);
    if (raw === null) {
      return { status: 'miss', snapshot: null };
    }

    try {
      const envelope = cacheEnvelopeSchema.parse(JSON.parse(raw) as unknown);
      if (stableSerialize(envelope.scope) !== stableSerialize(scope)) {
        throw new Error('キャッシュ所有者が一致しません。');
      }
      assertSnapshotScope(scope, envelope.snapshot);
      const expectedHash = await this.hash(stableSerialize({
        scope: envelope.scope,
        snapshot: envelope.snapshot,
      }));
      if (expectedHash !== envelope.payloadHash) {
        throw new Error('キャッシュhashが一致しません。');
      }
      return { status: 'hit', snapshot: envelope.snapshot };
    } catch {
      await this.storage.remove(key);
      return { status: 'corrupt', snapshot: null };
    }
  }

  async write(
    scopeValue: CatalogCacheScope,
    snapshotValue: CatalogSnapshot,
  ): Promise<void> {
    const scope = normalizeScope(scopeValue);
    const snapshot = catalogSnapshotSchema.parse(snapshotValue);
    assertSnapshotScope(scope, snapshot);
    if (!snapshot.fullSnapshot || snapshot.removedVersionIds.length > 0) {
      throw new Error('端末キャッシュには統合済みの完全スナップショットだけを保存できます。');
    }

    const payloadHash = await this.hash(stableSerialize({ scope, snapshot }));
    const envelope = cacheEnvelopeSchema.parse({
      formatVersion: 1,
      scope,
      snapshot,
      payloadHash,
      storedAt: this.now().toISOString(),
    });
    await this.storage.writeAtomic(
      buildCatalogCacheKey(scope),
      JSON.stringify(envelope),
    );
  }

  async clearPrivatePreview(userId: string): Promise<void> {
    await this.storage.removeByPrefix(buildPrivatePreviewPrefix(userId));
  }

  async refresh(
    scopeValue: CatalogCacheScope,
    fetcher: CatalogFetcher,
    cachedSnapshot?: CatalogSnapshot | null,
  ): Promise<CatalogRefreshResult> {
    const scope = normalizeScope(scopeValue);
    const cached = cachedSnapshot === undefined
      ? (await this.read(scope)).snapshot
      : cachedSnapshot;

    try {
      let incoming = catalogSnapshotSchema.parse(await fetcher({
        scope,
        sinceRevision: cached?.revision ?? null,
      }));
      assertSnapshotScope(scope, incoming);
      if (!incoming.fullSnapshot && cached === null) {
        incoming = catalogSnapshotSchema.parse(await fetcher({
          scope,
          sinceRevision: null,
        }));
        assertSnapshotScope(scope, incoming);
        if (!incoming.fullSnapshot) {
          throw new Error('完全スナップショット要求に差分応答が返されました。');
        }
      }

      let merged: CatalogSnapshot;
      try {
        merged = mergeCatalogSnapshots(cached, incoming);
      } catch (error) {
        if (incoming.fullSnapshot) {
          throw error;
        }
        const fullSnapshot = catalogSnapshotSchema.parse(await fetcher({
          scope,
          sinceRevision: null,
        }));
        assertSnapshotScope(scope, fullSnapshot);
        if (!fullSnapshot.fullSnapshot) {
          throw new Error('差分の再取得後も完全スナップショットを取得できませんでした。');
        }
        merged = fullSnapshot;
      }
      await this.write(scope, merged);
      return { status: 'updated', snapshot: merged };
    } catch (error) {
      return {
        status: 'offline',
        snapshot: cached,
        error: error instanceof Error ? error : new Error('カタログ更新に失敗しました。'),
      };
    }
  }

  async loadCacheFirst(
    scopeValue: CatalogCacheScope,
    fetcher: CatalogFetcher,
  ): Promise<CatalogCacheFirstResult> {
    const scope = normalizeScope(scopeValue);
    const cachedResult = await this.read(scope);
    return {
      cacheStatus: cachedResult.status,
      cached: cachedResult.snapshot,
      refresh: this.refresh(scope, fetcher, cachedResult.snapshot),
    };
  }
}

export function createCatalogCacheScope(input: {
  certificationCode: string;
  syllabusVersion: string;
  channel: CatalogChannel;
  userId: string | null;
}): CatalogCacheScope {
  return cacheScopeSchema.parse(input);
}
