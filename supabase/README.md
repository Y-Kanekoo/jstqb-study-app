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

`pnpm test:database`は`db reset`で全migrationを空DBから再適用し、`test db`で`supabase/tests/*.sql`のpgTAPを実DBで実行した後、成否にかかわらずローカルSupabaseを停止します。失敗時はコンテナ一覧とPostgreSQL末尾ログだけを表示します。接続URL、DBパスワード、service role keyをログ・ファイル・Gitへ保存しません。
