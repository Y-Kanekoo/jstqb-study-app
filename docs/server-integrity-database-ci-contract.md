# Server integrity の Database CI 統合契約

このbranchは、server integrity upgrade harnessを独自のGitHub Actions workflowから実行しない。
Database検査の所有者はPR #6で導入する `database` jobと、同jobから呼び出される
`scripts/test-database.mjs` とする。

## 統合待ちの実行契約

PR #6のrunnerがこのbranchへ統合された後、次の順序で検証する。

1. `scripts/test-database.mjs` が既存のrepository共通排他lockを取得する。
2. runnerが所有確認付きで `supabase start`、`supabase db reset`、`supabase test db` を順次実行する。
3. 同じlockを保持したまま、runnerが `pnpm test:database:upgrade` を呼び出す。
4. upgrade harness終了後、runnerが所有確認付きcleanupを実行してlockを解放する。

`pnpm test:database:upgrade` は、このbranchで保持している
`scripts/run-server-integrity-upgrade-harness.mjs` のpackage scriptである。PR #6のrunnerが
統合されるまでは、このbranch単独でDatabase検証を実行しない。

## CI安全性の受入条件

- server integrity専用のworkflowを追加しない。
- Database検査をworkflowから直接 `supabase start`、`supabase db reset`、`supabase test db`
  する経路を追加しない。
- Actionは可変tagではなく検証済みcommit SHAへ固定し、Supabase CLIも固定versionを使う。
- `latest`、workflow外の共通lockを迂回する実行、所有確認なしのcleanupを受け入れない。
- PR #6のrunner統合後に、上記の順序と共通lock内でのupgrade harness実行を検証する。
