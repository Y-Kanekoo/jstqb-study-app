# 実装状況

本書の「利用可能」は既存prototype機能を示し、詳細設計v2の本番受入証拠ではありません。static sample content、回答後feedback境界、同期/DB v2、500問、実機・復旧証拠が未完了のため、PR A以降の全受入が完了するまでproduction unavailableです。

## Prototypeで利用可能

- iOS / Android / Web共通画面
- 1問未満でも残る選択下書き
- 1問確定ごとの回答履歴、誤答状態、再開位置保存
- 複数の中断セッション
- 未克服、直近誤答、7/30/90日、全誤答、克服済みフィルター
- 別セッション2回連続正解で克服、誤答時の再オープン
- 1/3/7/14/30/90日の復習予定
- 章別、未回答、今日の復習、ブックマーク演習
- Supabase Auth、RLS、append-only同期イベント、サーバー再採点
- SQLite / IndexedDB、Outbox、PWA shell
- 学習記録、章別カバレッジ、レスポンシブUI

## 本番開始までに外部設定・承認が必要

- 本番Supabaseプロジェクト、メール送信元、許可URLの設定
- 独立レビュー済み500問の非公開DB投入と本人承認
- 全500 current versionの生成来歴、独立AI blind solve、構造化品質評価、最終adjudication、本人passのcoverage exact 500
- 本人限定review originと、正答を初期response・bundle・cacheへ含めないowner review plane
- Apple / Google開発者アカウントでの実機ビルド、署名、配布
- D-03 Aの暗号化DR backup・復旧worker、最大30日rotation、RPO 24時間、RTO 8時間、削除再適用、監視、アカウント削除workerの設定
- iOS / Android実機、複数端末、低速回線での受入試験
- 通常演習offline pack、模試offline参考結果の分離、スマホ/Web adaptive layoutの受入試験

公開リポジトリのサンプル問題は機能検証用で、本番500問の公開数には算入しません。

初期本番は本人限定personal previewです。一般公開用technical/editorial/mobile reviewと4人attestationは将来の公開gateとして維持しますが、個人利用開始条件にはしません。

## M1設計補遺の実装前条件

M1は`20260814000200_learning_foundation_v2.sql`として、固定base
`00411ef12777fdda151a66833598f6805fdfdf63`を用います。M1実装開始条件はSol最終監査のBlocking/Highが0、`m1ScenarioState='not-registered'`のharness runner PRがmerge済みで、fixed base・旧base suite・generic全件・fixture-free boundaryの必須CI `database`が成功済みであることです。M1 merge条件は同PR内でmanifestを`registered`へatomic更新し、target/scenario/failure/race/v2 suiteを登録した全5 phase・全checkpoint CI成功です。
このbaseはPR #9 head `31c87247dcf36e6df036912a07318f3cd68f448b`をmainへmergeした基線で、moving `origin/main`では代替しません。
対象はUUIDv5移行、legacy expiredのappend-only lifecycle変換、18問`legacy_compatibility`隔離、immutable bundle/manifest正本、旧request fingerprint、exact base ACL hardeningです。M1はauthenticatedの`sync_events SELECT/INSERT + identity USAGE`だけをcutoverまでtemporary allowlistとして残し、他base/sequence権限を0にします。9-kind同期/RPC、worker、safe catalog、policy/materializationはM2以後で、最後のcutover migrationだけがtemporary allowlistを撤回します。

既存`supabase/tests/database_harness_security.test.sql`は固定base専用の47,709 byte、SHA-256 `3e1e8c886238909f5e042cbecdba3b64fa020f656e5098b6218bcbf1e831c0aa`としてpath/blob/SHA/bytes不変で、origin-main-upgrade base checkpointだけに実行します。not-registered runner PRがmanifest v1旧entryをbase phaseへ移設し、target/scenario/failure/race/M1 v2 entry exact 0でCIを通します。M1 registered PRはbase entryを維持し、新規v2 suiteの他6 contextだけを追加します。fixture README bytes/hashはpre-M1 runner PRで不変、registered PRでmanifest hashと同時更新します。既存test変更は禁止であり、外部承認を待つblockはありません。

現行harness実装と現在のharness PR差分は旧round契約のため再実装が必要です。registered failure registryは一原因一ID/causeCode exact51件、`upgradeFailureCount=51`、UTF-8順ID JCS SHA-256 `1e1d751eb194f6eb66a8aae95f9a2d610d754742a3ba4d985465245dd15901f8`、JCS `{causeCode,id}` pair SHA-256 `a4aa023b759fe0f70aaec7da014ec235625a6aa4b1baad6910fca7b712a5144b`で、manifest/required registryを1:1照合する。二段階profile、base entry、race/atomic clean reapplyの既存契約を維持する。

設計正本では、M1 lifecycleを`legacyTerminalAt: LegacyStoredTimestampV1`（fixed-base instantのUTC6桁）と`migrationRecordedAt: IsoUtcTimestamp`（clockのUTC3桁）へ分離してDB/portable/bootstrap/change/localへlosslessに保持する。JCS/hashは6桁wireを使用し、両時刻はinstant比較する。historical event、legacy provenance、fixed-baseの5 fact mapping、互換18問、strict binding、ACLの既存契約は維持する。一方canonical rootはNoteを含む6 factであり、modern branchへ6桁を混在させない。さらにlegacy pullは5 kindのouter/payload 6桁strict union、通常local sourceはsync/direct metadata/hash branch、initial attempt invalidationはfree-text/6桁のdeterministic append-only legacy factとして実装対象へ固定する。both-null=0、both-non-null=1、片側のみrollbackとし、effective/local/bootstrap/portable/restoreの全経路で同一identityを検証する。Round 19ではOwned session summary/detail、local sync/direct、typed restore link、bootstrap sync/directを通常post-M1・M1 completed mixed・M1 invalidatedのstrict source branchへ分配する。Session currentはeventから補造せずappend-only `SessionCurrentMaterializationFactV2`を唯一正本にし、initialはcreation/fixed-row/restore初回、mutationは進行/terminal/lifecycle/invalidation/restore更新だけをcauseにする。M1 expiredは旧revision/status/6桁updatedAt/旧nullable 6桁completedAtを保持するfixed-row initialと、そのfactをprior参照するlifecycle mutationのexact二件とし、expired projectionをM1後currentへ露出させない。M1 completedは`updatedAt=migrationRecordedAt`（3桁）と`completedAt=legacyTerminalAt`（6桁）、invalidatedはupdated 3桁/completed nullであり、local/bootstrap/portable/restore/dry-runは二件性・順序・ID/hash/cause chainを保持する。`docs-contract`はGitHubのrequired job/checkではなく、既存required job `quality`内の必須step名である。M1実装PRはpackage script `contract:check-api-ts-fences`（`node scripts/check-doc-ts-fences.mjs`）を`pnpm check`の依存として実行し、dev alias `typescript-doc-contract: npm:typescript@5.9.3`とlockfileのexact 5.9.3を追加する。scriptはAPI契約のdocument-order `ts`/`typescript` fence exact 41 blockを個別解析し、ordinal連結virtual fileもTypeScript 5.9.3でコンパイルする。compilerOptionsは`strict:true`、`exactOptionalPropertyTypes:true`、`noUncheckedIndexedAccess:true`、`noEmit:true`、`skipLibCheck:false`、`target:'ES2022'`、`module:'NodeNext'`、`moduleResolution:'NodeNext'`、`lib:['ES2022']`だけである。個別parserと連結fileのsyntactic/semantic Error diagnosticsはfilterなしで0、block ordinal・Markdown開始行のline mapping、block count=41、TypeScript 5.9.3、artifact名`docs-contract`を保存・検証する。stepの失敗は`quality` jobの失敗とし、Rulesetと`apply-main-ruleset.sh`は`quality`、`database`、`e2e`、`pages`、`security`のexact 5 required checksだけを維持して第6チェックを追加しない。本設計roundはscript本体・package/lockを追加しない。

Round 14の残契約は、bootstrap hydrationの分配item置換とnon-`never` type fixture、全branch 3桁`snapshotReceivedAt`とtransport固有receivedの分離、Session delta/immutable target、entity別remote fact union、legacy remote+modern local edit、legacy invalidation専用direct sourceおよび一方向D→F hashへ固定した。専用sourceはtable/kind/revision/aggregate/owner/generation/timeとSHA-256 row IDを物理CHECKし、DはD/F除外、FはF除外かつD包含とする。APIのliteral source-row/UUIDv5/D/F goldenを実装自身で生成せず独立検証する。failure registryはfinal 51件と二hashへ同期する。
