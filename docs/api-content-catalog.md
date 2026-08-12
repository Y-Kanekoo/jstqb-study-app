# 問題カタログ配信・端末キャッシュ統合契約

## 1. 対象と非対象

本契約は、Supabaseの問題カタログをWebのIndexedDBまたはiOS / AndroidのSQLiteへ安全に保存し、オフラインで参照するための境界を定義します。

この段階では画面、`learning-store`、演習開始処理へ接続しません。接続側は本契約に従い、別変更として実装します。

## 2. RPC

### `get_question_catalog_v1`

| 項目 | 値 |
|---|---|
| 引数 | `certification_code text`, `syllabus_version text`, `since_revision bigint`, `channel text` |
| 戻り値 | `CatalogSnapshot` JSON |
| 公開上限 | 2,000問、JSON 10 MiB |
| `public` | 匿名・認証済みが利用可能。`published`シラバスに属する`questions.current_version_id`の`published`だけを返す |
| `personal_preview` | 認証済み`profiles.role=reviewer/admin`だけが利用可能。`published/reviewing`シラバスに属する最新の`reviewing/published`を返す |

`personal_preview`の権限判定にはJWTの`auth.uid()`だけを使用します。利用者IDをRPC引数として受け取らないため、他者を指定した権限昇格はできません。`draft/suspended/retired`シラバスは、権限付きプレビューでも取得できません。内部revision表と差分表はRLSを有効にし、`anon` / `authenticated`からの直接参照権限を付与しません。trigger用の`SECURITY DEFINER`関数も直接実行権限を付与しません。

## 3. 応答DTO

```ts
interface CatalogSnapshot {
  schema: 'question-catalog.v1';
  certificationCode: string;
  syllabusVersion: string;
  channel: 'public' | 'personal_preview';
  revision: number;
  etag: string;
  generatedAt: string;
  fullSnapshot: boolean;
  questions: CatalogQuestion[];
  removedVersionIds: string[];
}
```

問題は、問題ID・版ID・版番号・状態・章・学習目標・Kレベル・難易度・選択方式・必要選択数・選択肢shuffle・本文・総合解説・全選択肢別解説・正答集合・参照箇所・`contentHash`を含みます。Zodは未知フィールドを拒否し、次を追加検証します。

- `public`には`published`だけを許可する。
- `correctChoiceIds`と各選択肢の`isCorrect`を完全一致させる。
- `requiredChoiceCount`と正答数を一致させる。
- 単一選択は正答1件、複数選択は正答2件以上とする。
- 問題ID、版ID、選択肢ID、tombstoneをそれぞれ重複させない。
- 完全スナップショットにtombstoneを含めない。

## 4. revisionと差分

- revisionは資格のシラバス版とchannelごとに単調増加します。
- 初回または再同期は`since_revision=null`で完全スナップショットを取得します。
- 端末revisionを渡した場合は、変更問題と`removedVersionIds`だけを返します。
- 問題停止、引退、current版の差し替えは旧版IDをtombstoneにします。
- 同じrevisionを渡した場合、問題とtombstoneはいずれも空です。
- サーバーより未来のrevisionは入力誤りとして拒否されます。
- `etag`はシラバス版・channel・revisionから生成し、revision更新と同一DB transactionで更新します。

## 5. cache keyと所有者分離

キーは次の全要素を含みます。

```text
question-catalog:v1:{userId|anonymous}:{channel}:{certificationCode}:{syllabusVersion}
```

`personal_preview`ではUUIDの`userId`が必須です。ログアウト処理は、認証セッションを破棄する前に`CatalogCacheRepository.clearPrivatePreview(userId)`を呼び出します。別ユーザーや匿名状態のキーからプレビュー内容を探索するAPIは提供しません。

公開channelもログイン利用者ごとにキーを分離できます。匿名利用時は`anonymous`を使用します。

## 6. 保存の原子性と破損時の動作

- Webは専用IndexedDB `jstqb-content-catalog`の単一readwrite transactionでenvelopeを置換します。
- Nativeは既存SQLiteファイル内の専用`content_catalog_cache`表を、exclusive transactionでupsertします。
- 保存envelopeはscopeと統合済み完全スナップショットのSHA-256を含みます。
- 読み出し時に厳格Zod検証、所有scope検証、SHA-256検証を行います。
- JSON不正、schema不正、scope不一致、hash不一致は破損扱いで削除し、`sinceRevision=null`の完全取得へfallbackします。
- 差分だけが取得され、適用可能な完全cacheがない場合も完全取得へfallbackします。
- 差分統合はtombstoneを先に適用し、同じ問題IDの新版で旧版を置換してから、完全スナップショットとして原子的に保存します。

## 7. cache-first接続手順

1. Auth状態から`CatalogCacheScope`を確定します。
2. `createCatalogFetcher`へSupabase RPC adapterを渡します。
3. `CatalogCacheRepository.loadCacheFirst(scope, fetcher)`を呼びます。
4. `cached`があれば、演習の問題候補へ即時供給できます。
5. 同時に返る`refresh`を待ち、`updated`なら次回の候補生成から新版を使用します。
6. `offline`なら既存cacheを維持します。cacheがない場合だけオフライン利用不可を表示します。

進行中セッションは開始時の`question_version_id`を固定するため、カタログ更新で表示中問題を差し替えません。緊急停止の扱いはセッションAPI側の契約に従います。

## 8. 統合側の必須受入条件

- 初回オンライン取得後、通信を切っても同じ公開問題を読み込める。
- 破損cacheを表示せず、オンライン時は完全取得で自己回復する。
- `personal_preview`はlearner・匿名・別reviewerのcache keyから読めない。
- ログアウト完了後、直前ユーザーの`personal_preview` envelopeが端末から削除される。
- revision差分で更新・追加・tombstoneが反映される。
- カタログ更新中も、既に開始したセッションの問題版と選択肢順が変わらない。
- `public`応答・ログ・分析イベントへ`reviewing`本文を送らない。

## 9. 実装ファイル境界

| 責務 | ファイル |
|---|---|
| DB RPC / revision / tombstone | `supabase/migrations/202608120020_content_catalog.sql` |
| DB権限・漏えい・差分・上限試験 | `supabase/tests/content_catalog.test.sql` |
| 厳格DTO | `src/content/catalog-schema.ts` |
| cache統合・cache-first | `src/content/catalog-cache.ts` |
| Web IndexedDB | `src/content/catalog-cache-storage.web.ts` |
| Native SQLite | `src/content/catalog-cache-storage.native.ts` |
| Supabase RPC adapter契約 | `src/content/catalog-client.ts` |

画面、`src/state/learning-store.ts`、演習ドメイン、静的サンプル問題は本変更の対象外です。
