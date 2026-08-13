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
5. `production-boundary`: test fixtureのstable ID/canaryがproduction migrationと最終DBへ混入していないことを確認します。

runnerは同projectの既存containerがあればfail-closedで中止し、所有を確認したcontainerだけを停止します。成否にかかわらず残留container 0を検査し、接続URL、DBパスワード、service role keyをログ・ファイル・Gitへ保存しません。
