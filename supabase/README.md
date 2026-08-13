# Supabase セットアップ

1. Supabaseプロジェクトを環境ごとに作成します。
2. `supabase db push`でmigrationを適用します。
3. Project URLとPublishable keyだけをローカル`.env`へ設定します。
4. Service role keyはクライアントへ設定しません。
5. メール確認、リダイレクトURL、バックアップ、MFAを本番用に設定します。

```env
EXPO_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

`sync_events`はappend-onlyの同期受信箱です。RLSにより本人の行だけを挿入・参照でき、`event_id`の一意制約により再送を重複登録しません。

## ローカルDB検証

Dockerを起動し、CIと同じ順序で実行します。

```bash
pnpm test:database
```

`pnpm test:database`は共有排他lockを取得し、次の5 phaseを固定順で実行します。

1. `fresh`: 空DBへ全production migrationを適用し、全pgTAPを実行します。
2. `origin-main-upgrade`: `origin/main`のmigrationとsynthetic既存データから現在HEADへupgradeし、全pgTAPを実行します。
3. `combined-order`: fresh/upgradeのmigration履歴と最終schema・RPC署名が一致することを確認します。
4. `atomic-failure`: 意図的な失敗後にDDL、data、migration履歴が残らないことを確認します。
5. `production-boundary`: `supabase/test-fixtures/database-harness/manifest.json`で完全列挙したtest fixtureのstable ID/canaryが、production migration・seed・content bundle・release artifact・public/private DBへ混入していないことを確認します。

各phaseは共通security suiteを実行し、RLS、default privilege、`SECURITY DEFINER` owner/search path、関数ACLを照合します。runnerは同projectの既存containerがあればfail-closedで中止し、stop直前にlabel/nameが所有証跡と完全一致したcontainerだけを停止します。SIGINT/SIGTERMでは実行中commandを停止して所有確認付きcleanupへ移り、CIは独立した`always()` cleanupでも残留container/lock 0を検査します。接続URL、DBパスワード、service role keyをログ・ファイル・Gitへ保存しません。

`pnpm test:database:legacy`は旧経路の局所診断に限って使用します。5 phase、production boundary、upgrade、atomicityを検証しないため、CI・release gate・`pnpm test:database`の代替にはできません。
