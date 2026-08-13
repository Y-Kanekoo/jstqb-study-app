# リリース手順

## 1. PRの最小単位

1つのPRは1つの目的に限定します。

- `feat`: 利用者向け機能1件
- `fix`: 不具合1件
- `test`: テスト・検査基盤1件
- `ops`: CI、CD、監視、配布設定1件
- `docs`: 設計・運用文書1件
- `chore`: 依存更新など動作を変えない保守1件

機能、DB migration、大量の問題追加を同じPRへ混在させません。migrationが必要な機能は、後方互換migration、アプリ実装、不要列の削除を別リリースへ分けます。

追加機能の依存順はPR-A（D03-A schema/ACL/runtime capability/DR policy）→PR-B（offline practice pack/local outbox/offline_unverified）→PR-C（owner-only review origin/RPC/AI・owner coverage）→PR-D（章/readiness projection/API）→PR-E（スマホ/Web adaptive UI・保存4境界の平易な説明）→PR-F（監視、restore drill、受入証跡、personal-only deploy）です。各PRはmigration/RPCをclientより先に配備し、対応capabilityを証跡完了までOFFにします。

## 2. 必須検査

mainへ入る前に次のGitHub Checksを必須にします。

| Check | 内容 |
|---|---|
| `quality` | 禁止型、秘密情報、lint、型、単体、契約、コンテンツ、Webビルド |
| `database` | 空のローカルSupabaseへ全migrationを再適用し、RLS・関数・pgTAPを実DB検証 |
| `e2e` | Chromiumデスクトップ・モバイル、保存、誤答、オフライン、アクセシビリティ |
| `pages` | 本番サブパス成果物、ルーティング、Service WorkerのWeb E2E |
| `security` | 全履歴の秘密検査、実行・ビルド依存のhigh以上の脆弱性、例外期限 |

`scripts/apply-main-ruleset.sh`は、上記5検査、会話解決、squash mergeをGitHub Rulesetへ設定します。実行にはGitHub CLIのAdministration write権限が必要です。

```bash
./scripts/apply-main-ruleset.sh
```

初期はGitHubアカウント1つで運用するため、承認数を0、最新push以外の人による承認をOFFにします。自己承認を作るbotや偽装レビューは設定しません。独立reviewerが固定head SHAへ出したBlocking/High 0の結果だけをPR commentへ記録し、root orchestratorがhead一致・未解決thread 0・正規5 checks成功を再確認するまでauto-mergeをenableしません。PR本文の自己申告は独立review gateとして認めません。

別の人間レビュアーを追加した時点で`.github/rulesets/main.json`を次のように変更し、スクリプトを再実行します。

```json
{
  "required_approving_review_count": 1,
  "require_last_push_approval": true
}
```

## 3. Database CI

`database`はGitHub管理のUbuntu runnerとDockerだけを使用し、外部DBやRepository Secretへ接続しません。

ローカルで同じ検証を行う場合は、Dockerを起動して次を実行します。

```bash
pnpm test:database
```

1. `supabase/setup-cli`の検証済みcommit SHAから固定版CLIを準備し、test専用fixture allowlistとproduction artifact canaryを検証する。
2. `fresh` phase: 空DBへ全migrationを番号順に適用し、全pgTAP/RLS/RPC/正答非開示を実行する。
3. `origin-main-upgrade` phase: origin/main-shaped schemaとfixtureを独立DBへ構築してから追加migrationを適用し、legacy upgrade/ACL/data preservationを実行する。
4. `combined-order` phase: fresh経路とupgrade経路の適用migration ID/hash/順序、最終schema契約、生成RPC signatureを照合し、欠落・重複・順序差を拒否する。
5. `atomic-failure` phase: preflight、constraint、trigger、worker契約の各異常fixtureを注入し、失敗後のschema/data/migration履歴/audit/operation receiptが適用前と完全一致することを確認する。
6. `production-boundary` phase: synthetic fixture stable ID/canary/本文/hashがproduction migration、seed、bundle、artifactへ0件であることを検証する。
7. 全phase成功後だけ`database` checkを成功にし、失敗時は秘密を除くPostgreSQL末尾ログを表示する。成否にかかわらず一時環境をbackupなしで停止し、コンテナ残留を失敗扱いにする。

DBパスワード、privileged credential、ローカル環境の状態出力はログやartifactへ保存しません。fixture phaseはproduction deployコマンドから参照不能なtest専用path/roleだけを使います。上記5検証phaseの一つでもskipされたrunはrequired evidenceとして認めません。migration失敗は既存migrationの書換えで直さず、原則として加算的な修正migrationで解決します。

### 3.1 本番DB適用

1. exact main SHAからstaging migration artifactを作成し、hashを記録する。
2. D-03 A policyの`restorePointMaxAgeDays=30`,`rpoHours=24`,`rtoHours=8`,`deletionSloHours=24`,`backupEffectivePurgeDays=30`を確認する。live deadline=`acceptedAt+24h`とbackup retention=`acceptedAt+30d`を別列/JCSでexact照合し、`<=720`や30日live SLOを拒否する。
3. 本番migration advisory lockと対象table write-conflicting lockをtransaction開始直後に固定順序で取得し、新規write trafficをfeature controlでも停止する。
4. lock下でpreflight/hashを再計算し、stagingで検査済みの同一artifactをexpansion-onlyで適用する。staging値を本番expectedへ流用しない。
5. schema migration履歴、ACL、RLS、trigger、RPC signature/hashを照合する。
6. old/new client smoke、cross-user拒否、正答非開示、冪等replayを確認する。
7. 段階公開後にwrite trafficを再開する。
8. 失敗時は破壊的down migrationをせず、feature disableまたは後方互換forward-fixを適用する。

D-03 Aのbackup適用前に、manifestの両policy ID/body/hash、consistency barrier、DB/Auth/Storage上限、deletion tombstone/ledger/external archive upper bound、KMS、署名preimage、restore point age<=30日を検証します。事故後は待機せず別の隔離projectで復旧を開始し、最大contiguous ledger sequenceまでgap 0、実RPO<=24h、実RTO<=8h、削除受付30日超の復元可能data 0を証明します。

## 4. GitHub Pages

`品質検査`がmainで成功すると`Web本番デプロイ`が開始します。手動実行は現在のmainからだけ可能で、同じcommitに対する`quality`、`database`、`e2e`、`pages`、`security`の成功をGitHub APIで再検証します。client featureごとのappend-only署名済みproduction capability snapshotをsafe RPCで読み、environment、revision、main SHA、期限、必要migration/worker version、RPC signature、ACL、old/new smokeが揃わない、または署名不正の機能はbuild時・runtimeともOFFにします。cryptographic release runtime controlは明示falseならD-01/P0 recent-auth、明示trueならcryptographic attestation完備を要求し、欠落・未知値をfalseへdefaultしません。`legacy_sync_bridge_enabled && restore_enabled`はDB CHECKで拒否します。DB-first expansionの本番適用・照合前に対応UIを公開しません。

初回だけGitHubのSettings、Pages、Build and deploymentでSourceを`GitHub Actions`にします。Pagesデプロイには外部シークレットは不要です。

本番releaseで必須のRepository Variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

本番buildでは両方を必須とし、未設定時はreleaseを失敗させます。未設定buildはCI用synthetic previewまたは「設定されていません」画面だけを生成でき、本番デプロイしません。P0要件である同一アカウント同期を欠くlocal-only版を本番と呼びません。Service role keyは登録しません。

Pages用ビルドではリポジトリ名をExpo Routerの`baseUrl`へ設定し、SPA用`404.html`、`.nojekyll`、サブパス対応manifestとService Workerを生成します。

## 5. 問題コンテンツ

公開リポジトリのサンプルは`pnpm test:content`で検査します。本番500題は公開リポジトリへ置かず、controlled offline release runnerで公開候補のJSONエクスポートに対して次を実行します。

```bash
CONTENT_EXACT_COUNT=500 pnpm content:verify /安全な場所/questions.json
```

エクスポートはコミットせず、検査後もCI artifactへ保存しません。publish前検証時の問題版statusは`reviewing`だけを許可し、runner成功だけでpublishedとは扱いません。countが500以外、owner承認済みallocationVersionの章/K/64LO/single/multiple/multiple章/multiple K exact配分不一致、未レビュー、重複、根拠不足、正答数不整合、`questionExplanation/takeaway/commonTrap`欠落・空文字・canonical/DB不一致、quality/review artifact hash不一致が1件でもある場合は公開しません。499件、501件、single/multiple一件不一致、LO一件ずれ、正答だけswapの旧hash流用拒否fixtureを必須にします。M1の`compatibility_only`18問は入力・count・catalog・exam blueprintへ0件でなければ失敗します。公開repoへ返す証跡は本文・正答を含まないhash、count、gate version、attestation IDだけです。

作問入力は`content-blueprint-v1.md`の`ContentPrivateQuestionV3` strict schemaへ一致させます。release順序は (1) controlled private artifactをcreate-only保存してprivate/独立canonicalを一致、(2) `content-allocation-approval-artifact.v1`のauthenticated owner recent-auth記録、one-shot sampling/reviewを確定、(3) private release storeでpersonal/public immutable manifestを生成、(4) content-control stage transactionがprivate object version/etag/raw hashとDB canonicalを再検証してcontent import、import versions、review/provenance artifacts、manifestを同時append、です。manifest前のDB importとimport tableからmanifestへの逆FK/hashを禁止します。human review coverageは`reviewCoverageHash`へ統合します。

controlled artifactのbucket=`controlled-private-release`、content type=`application/json`、positive safe size、固定key/version/etag/raw hashとcreate-only制約を検証します。stage/publish jobのenqueue receiptがNULL、suspend/retire jobのenqueue receiptがnon-nullで、human operation IDとserver internal operation IDが別値であることを確認します。receiptのrequested-by principal/human request/response hashとjob/claimのinternal operation principal/internal request hashは別preimageで、job/internal operation ID/kind/target/server mappingだけがdeferred exact一対一です。human response hashはstrict responseから`operationResponseHash`だけを除いたJCSのSHA-256で、JSON内同fieldとのdeferred equality、自己包含0をgolden照合します。principal/hashのコピー・等値化をnegative fixtureで拒否します。human recent-authはpersonal操作とUI suspend/retire enqueueでだけ消費し、stage/publish/suspend/retire internal receiptはreauth NULLです。authenticated direct internal call、任意URL/client key、未claimを拒否します。保存internal receipt replayはACL/ID/kind/internal principal/internal request hash一致をlease freshness/claim再消費より先に検証します。

緊急停止smokeでは実効targetだけがfreezeされること、session item invalidation fact ID/hash/session/itemとchange/bootstrap/local/portable/restore/materialization linkのexact結合、retireのcurrent membership `reason='retired'` tombstone exact一件・pin維持・fanout/member/link 0、全bootstrap sectionのowner/acceptance/version lockとsuspended/fanout pending/acceptance-revoked content-null tombstone、同版本文/feedback purgeを確認します。同期smokeでは同一generationでserver terminal/content/tombstone/factが優先され、literal local intent allowlist外とbasis row hash/lifecycle mismatchがquarantineされること、回答後の`draft.saved`がdraft非更新かつattempt ID/hash付き`superseded-by-answer` ACKとなり、kill/restart/bootstrap後も確定回答へ収束することを確認します。restore smokeではsourceExportId/sourcePayloadHash、actor digest/pseudonym別集合、全registry kindの0件summaryを含むidentity子row、全集合/count/hash/setsHash/artifactHashのpayload→artifact→dry-run→finalize再計算一致、link ID/time/hash、session invalidation exact FK、remote-source metadata/generation lossless、legacy source generation NULL・legacy schema/event/sequence/fact hash・canonical hash 0件、selection-basis discardのportable/archive/link拒否を確認します。

account deletion/DR smokeはchallenge/job/receipt/schemaVersion=`account-deletion-ledger-entry.v2`のledger/external tombstone/combined receipt/DR manifestのactivation fact ID/revision、environment=`production`、policy ID/body/hash、期限、strict JSON、署名preimageをdeferred exact照合します。Storage subject digest値/algorithm/key IDを別domain goldenから再計算し、combined receiptが直持ちする値と`externalTombstoneHash`、external tombstoneの署名済み値、object key exact segment、immutable metadataをbyte exact照合します。algorithm/key ID/rule versionはreceiptへ存在せず、tombstone hash経由で拘束されることも確認します。negative evidenceはfixture ID、environment/main SHA/migration/capability、実行role/RPC、期待SQLSTATE/error、拒否前後の行数/hash/cursor/job state、runner versionを署名artifactへ保存します。human response hash自己包含/JSON不一致、combined receiptのStorage digest欠落・1-bit差替え・署名対象外、algorithm/key tuple直持ち、external tombstone hash差替え、policy tuple差替え、controlled artifact literal違反、human/internal principal/preimage混同、identity子row/0件summary欠落、legacy canonical hash補造、revoked本文再配布、terminal復活、basis mismatch overlay、remote source欠落、retire fanout、invalidation session/fact ID/hash差替え、draft attempt hash欠落のどれかが想定外成功、期待error不一致、拒否後state変更、証跡欠落ならrequired `database` checkとreleaseを失敗させます。public error本文にSQLSTATE/constraint/internal identifier/private tupleが含まれず、A11y通知も固定安全文だけであることを検査します。

owner-only review smokeは7 RPCそれぞれをauthenticated owner/PUBLIC/anon/service_role/一般learner/adminで実行してACL matrixを照合します。transition成功responseの`transitionReceiptId`/`operationResponseHash`、DB strict response bytes、local receiptをexact一致させ、same-op replayと応答消失/reloadを検証します。

offline/analysis smokeはreservedSessionId exact gateを維持します。projection/readiness双方のexpiresAt/ttlPolicyVersion、hash、projection exact FKを照合し、期限直前成功・exact境界/直後expiredを確認します。DataGenerationのnumber/bigint/integer golden 1と最大safe integerを通し、文字列/小数/0/負数/2^53をnegative fixtureで拒否します。

synthetic DB fixtureはtest専用allowlistだけから投入し、production migration/seed/artifactへ含めません。fixture canary/stable IDが本番artifactと本番DBに0件であることをpreflightで検証します。

## 6. Webリリース確認

1. `quality`、`database`、`e2e`、`pages`、`security`が成功している。
2. `pages-build`と`pages-deploy`が成功している。
3. 公開URLのホーム、問題、再読み込み、オフライン復帰を確認する。
4. 本番必須Supabase設定を使い、別端末同期を必ず確認する。
5. 問題500題検査の結果をリリース記録へ添付する。
6. 有効化するclient featureごとにproduction capability manifest、migration/worker version、RPC/ACL smoke、feature-disable rollbackを照合する。
7. `personal_learning_enabled=true`、owner allowlist exact 1、self-sign-up/public registration/public content release=falseをAuth、DB runtime control、client safe capabilityの三箇所で照合する。

問題がある場合はGitHub Pagesの直前の成功デプロイを再実行するか、修正PRを作成します。DB変更はロールバックSQLに依存せず、後方互換の修正migrationでロールフォワードします。

## 7. iOS・Android

`eas.json`は秘密情報を含まないビルドテンプレートです。EASへ接続するまでは自動ストア配布を行いません。

- `development`: Development Client、内部配布
- `preview`: 本人向け内部配布
- `production`: ストア提出用、ビルド番号を自動更新

GitHub Actionsへモバイル配布を追加する場合は、GitHub Environment `mobile-production`を作り、承認者を設定してから`EAS_TOKEN`をEnvironment Secretに保存します。Secretがない場合に代替値や個人トークンをコードへ入れてはいけません。

## 8. Dependabot

npmとGitHub Actionsを毎週月曜に確認します。minor・patchは本番依存と開発依存に分けてグループ化します。自動マージする場合も通常PRと同じ5検査を必須にし、人間レビュアー追加後は承認1件も必須にします。

Workflowで利用するActionは、検証したリリースcommitの40桁SHAへ固定します。行末の`# vN`は追跡対象のリリース系列を示し、DependabotがSHAと注記を同じPRで更新します。可変tagやbranchへ戻しません。必須checkはGitHub Actions App（integration ID `15368`）が発行したものだけをRulesetで受理します。
