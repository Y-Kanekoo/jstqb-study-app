# DB upgrade harness fixture

このディレクトリは完全syntheticなDB検証データだけを置くtest専用境界です。`supabase test db`のpgTAP探索対象外に隔離し、5 phase harnessだけがmanifest照合後に明示実行します。

- `origin-main-shape.sql`: `origin/main`適用後へ投入し、後続migrationで既存データが保持されることを検証します。
- `atomic-*-failure.sql`: preflight・constraint・trigger・workerの意図的失敗を個別発生させ、DDL・data・migration history・audit・operation receiptが残らないことを検証します。
- `production-boundary-canaries.json`: production migration、seed、bundle、release artifactへの混入を拒否する固定canaryです。
- `manifest.json`: fixtureと再帰pgTAPのfilename・SHA-256・意味契約を完全列挙します。

アプリ、production migration、seed、release artifactからこのディレクトリを参照してはいけません。
