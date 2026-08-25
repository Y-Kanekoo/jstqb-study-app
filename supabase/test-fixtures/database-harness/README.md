# DB upgrade harness fixture

このディレクトリは完全syntheticなDB検証データだけを置くtest専用境界です。`supabase test db`のpgTAP探索対象外に隔離し、5 phase harnessだけがmanifest照合後に明示実行します。fixtureを`supabase/tests`配下へ置くことは許可しません。

- `origin-main-shape.sql`: `origin/main`適用後へ投入し、後続migrationで既存データが保持されることを検証します。
- `atomic-*-failure.sql`: preflight・constraint・trigger・workerの意図的失敗を個別発生させ、DDL・data・migration history・audit・operation receiptが残らないことを検証します。
- `production-boundary-canaries.json`: production migration、seed、bundle、release artifactへの混入を拒否する固定canaryです。
- `manifest.json`: v2ではfixtureと再帰pgTAPに加え、immutable upgrade base（固定commit・migration filename/SHA-256・migration manifest SHA-256）を完全列挙します。現在はM1前のため、`m1ScenarioState: not-registered`とnormal/race/post-upgrade/異常upgrade scenarioのexact 0件を明示しています。

M1 migrationを追加するPRでは、同じPRで`m1ScenarioState`を`registered`へ変更し、normal・race・post-upgrade pgTAPの各SHA-256、正常upgrade、実migrationが異常baseで失敗してrollbackするscenarioを登録しなければなりません。未登録のままM1 migrationを検出するとharnessはfail-closedで停止します。rich fixtureを使用した後、production-boundary phaseはfixture-freeなcurrent HEAD DBを新規resetしてから検証します。

アプリ、production migration、seed、release artifactからこのディレクトリを参照してはいけません。
