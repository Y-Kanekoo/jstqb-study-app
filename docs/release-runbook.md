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

`docs-contract`はGitHubのrequired job/checkではなく、既存required job `quality`内の必須step名である。M1実装PRはpackage script `contract:check-api-ts-fences`（`node scripts/check-doc-ts-fences.mjs`）を`pnpm check`の依存として実行し、dev alias `typescript-doc-contract: npm:typescript@5.9.3`とlockfileのexact 5.9.3を追加する。scriptはAPI契約のdocument-order `ts`/`typescript` fence exact 41 blockを個別解析し、ordinal連結virtual fileもTypeScript 5.9.3でコンパイルする。compilerOptionsは`strict:true`、`exactOptionalPropertyTypes:true`、`noUncheckedIndexedAccess:true`、`noEmit:true`、`skipLibCheck:false`、`target:'ES2022'`、`module:'NodeNext'`、`moduleResolution:'NodeNext'`、`lib:['ES2022']`だけである。個別parserと連結fileのsyntactic/semantic Error diagnosticsはfilterなしで0、block ordinal・Markdown開始行のline mapping、block count=41、TypeScript 5.9.3、artifact名`docs-contract`を保存・検証する。stepの失敗は`quality` jobの失敗とし、Rulesetと`apply-main-ruleset.sh`は`quality`、`database`、`e2e`、`pages`、`security`のexact 5 required checksだけを維持して第6チェックを追加しない。本roundは設計契約のみでscript本体・package/lockを追加しない。

| Check | 内容 |
|---|---|
| `quality` | 禁止型、秘密情報、lint、型、単体、契約、コンテンツ、Webビルド。必須step `docs-contract`でAPI TypeScript fence契約を検査し、失敗時はqualityを失敗にする |
| `database` | 空のローカルSupabaseへ全migrationを再適用し、RLS・関数・pgTAPを実DB検証 |
| `e2e` | Chromiumデスクトップ・モバイル、保存、誤答、オフライン、アクセシビリティ |
| `pages` | 本番サブパス成果物、ルーティング、Service WorkerのWeb E2E |
| `security` | 全履歴の秘密検査、実行・ビルド依存のhigh以上の脆弱性、例外期限 |

`scripts/apply-main-ruleset.sh`は、上記5検査、会話解決、squash mergeをGitHub Rulesetへ設定します。実行にはGitHub CLIのAdministration write権限が必要です。

```bash
./scripts/apply-main-ruleset.sh
```

初期はGitHubアカウント1つで運用するため、承認数を0、最新push以外の人による承認をOFFにします。自己承認を作るbotや偽装レビューは設定しません。独立reviewerが固定head SHAへ出したBlocking/High 0の結果だけをPR commentへ記録し、root orchestratorがhead一致・未解決thread 0・正規5 checks成功を再確認するまでauto-mergeをenableしません。PR本文の自己申告は独立review gateとして認めません。

後続DB/tooling PRでtrusted artifact検証step `independent-review`を既存required job `quality`内へ実装します。trusted GitHub Appだけが、許可済み独立reviewer identity、対象PR/head SHA、review artifact hash、Blocking=0/High=0、未解決対象0を検証してstepを成功にでき、head更新でstaleにします。root orchestrator/PR作者の自己申告や任意status contextは受理せず、このstepの失敗は`quality` jobを失敗にし、正規5 checks（`quality`、`database`、`e2e`、`pages`、`security`）の全成功前にauto-mergeを許可しません。Ruleset required contextsと`apply-main-ruleset.sh`はこのexact 5のままとし、`independent-review`を第6 context/checkに追加しません。現Rulesetをこの文書設計PRで即変更することはscope外であり、後続PRはApp issuer偽装、別head、B/H残存、stale reviewのnegative試験とquality stepを含むRuleset実適用証跡を受入条件にします。

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
2. `fresh` phase: 空DBへ全migrationを番号順に適用し、registered profileだけmanifest `pgTapFiles`のgeneric全件とHEAD専用`database_harness_security_v2.test.sql`でRLS/RPC/正答非開示を実行する。本書の「全pgTAP」はgeneric全件＋当該phase suiteを意味する。
3. `origin-main-upgrade` phase: harness manifestに固定したbase commit `00411ef12777fdda151a66833598f6805fdfdf63`とmigration hashからschemaとfixtureを独立DBへ構築し、target migration適用前のbase checkpointでだけbyte不変`database_harness_security.test.sql`を実行する。registered profileでは追加migration適用後に同fileを再実行せず、HEAD専用`database_harness_security_v2.test.sql`でlegacy upgrade/ACL/data preservationを検査する。moving `origin/main`をupgrade根拠に使わない。
4. `combined-order` phase: fresh経路とupgrade経路の適用migration ID/hash/順序、最終schema契約、生成RPC signatureを照合し、欠落・重複・順序差を拒否する。
5. `atomic-failure` phase: preflight、constraint、trigger、worker契約の各異常fixtureを固定baseから独立再構築して注入し、実migration失敗後のschema/ACL/role/data/sequence/migration履歴/audit/operation receiptが適用前と完全一致し、対象migration history/residueが0であることを確認する。
6. `production-boundary` phase: synthetic fixture stable ID/canary/本文/hashがproduction migration、seed、bundle、artifactへ0件であることを検証し、fixtureなしHEADへ`database_harness_security_v2.test.sql`を実行する。
7. registered profileのphase-specific registryに従い、fresh、M1 normal post、M1 race post、origin-main-upgrade post、atomic failure rollback後、production-boundary HEADで新規v2 suiteが実DBのM1 ACL/RLS/temporary allowlist/owner・cross-user/正答非開示を検査する。各checkpointはgeneric全件も実行する。base suiteとv2 suiteはgeneric discoveryから除外し、manifest指定外のphase、同一contextでの二重実行、skipを拒否する。全phase成功後だけ`database` checkと対応capabilityを成功にする。

DBパスワード、privileged credential、ローカル環境の状態出力はログやartifactへ保存しません。fixture phaseはproduction deployコマンドから参照不能なtest専用path/roleだけを使います。上記5検証phaseの一つでもskipされたrunはrequired evidenceとして認めません。migration失敗は既存migrationの書換えで直さず、原則として加算的な修正migrationで解決します。

M1 harness v2 manifestは未知fieldを拒否するstrict objectで、次の形以外を受理しません。

```text
schemaVersion = 'database-harness-fixture-manifest.v2'
m1ScenarioState = 'not-registered' | 'registered'
targetMigration = null | '20260814000200_learning_foundation_v2.sql'
base = {
  commitSha: '00411ef12777fdda151a66833598f6805fdfdf63',
  sourcePullRequest: 9,
  sourceHeadSha: '31c87247dcf36e6df036912a07318f3cd68f448b',
  migrationManifestSha256: '4dadc4bd785725951cdd5f5438396404ce960c858a1d4e9c9f123b3733b869e1',
  migrations: [
    {file:'202608110001_initial.sql', sha256:'05b3972f32686fe06d55f3981ded1f02e8a951baedd6154ab67a507a4e90cc48'},
    {file:'202608140001_function_execute_security.sql', sha256:'d08b5a56b156c27385d788670b1c1d3dc73b49379ea9fd3743298790f084660b'}
  ]
}
files = [{path,sha256}]
pgTapFiles = [{path,sha256}]
phasePgTapFiles = [{id,path,sha256,phase,checkpoint}]
genericPgTapExclusions = [path]
upgradeBases = [{id:'pr9-main-00411ef',fixturePath:'origin-main-shape.sql',fixtureSha256:'46803f9e96df9720931f4355219d5369e6d77c778ce0ffbbb1202bab720ff503'}]
upgradeScenarios = [{id,baseId,fixturePath,fixtureSha256,targetMigration:'20260814000200_learning_foundation_v2.sql',assertionPath,assertionSha256}]
upgradeFailures = [{id,causeCode,baseId,fixturePath,fixtureSha256,targetMigration:'20260814000200_learning_foundation_v2.sql',expectedSqlState,expectedError,residueObjects,snapshotScopes}]
writeRaces = [{id,baseId,fixturePath,fixtureSha256,targetMigration:'20260814000200_learning_foundation_v2.sql',writerPath,writerSha256,barrierProtocol:'two-connection-table-lock-v1'}]
productionBoundaryCanaries = {path,sha256}
```

path rootはfield別に固定する。`files.path|fixturePath|assertionPath|writerPath|productionBoundaryCanaries.path`は`supabase/test-fixtures/database-harness/`相対、`pgTapFiles.path|phasePgTapFiles.path|genericPgTapExclusions`は`supabase/tests/`相対、`base.migrations.file|targetMigration`は`supabase/migrations/`のbasenameだけである。`files`はmanifest自身をself-hash循環回避のためexact除外し、READMEを含むfixture root配下の全通常fileを再帰的に列挙する。未知・欠落・重複・隠し/temporary file・symlinkを拒否する。phase aliasは説明用でありmanifestの実pathを置換しない。digestはlowercase SHA-256。arrayごとのsort/unique keyは、`base.migrations`=`file`、`files`=`path`、`pgTapFiles`=`path`、`genericPgTapExclusions`=`path`、`upgradeBases|upgradeScenarios|upgradeFailures|writeRaces`=`id`で、いずれもkeyのUTF-8 byte昇順かつunique。`phasePgTapFiles`だけは`id`のUTF-8 byte昇順・uniqueに加えtuple `(phase,checkpoint,path)`をuniqueとする。同じcontextで同じsuiteを二重実行してはならない。`snapshotScopes`はliteral `['schema','acl','roles','migration-history','data','sequences']`の順でexact全件を要求する。`upgradeFailures`はbasename=`id`のfixture一件・causeCode一件・expectedError=原因codeのexact相関を持ち、baseを毎回新規構築する。failure後に全scopeのcanonical signatureがbefore=after、target migration history 0、`residueObjects` 0を照合する。`upgradeScenarios`はnormal upgrade、expired decision table、immutable legacy content正本、旧5-kind/JWT/RLS/DB再採点、strict request fingerprintを含む。`writeRaces`はmigration接続とlegacy writer接続を名前付きbarrierで同期し、待機後成功またはmigration全rollbackの二結果だけを許可する。最後に全failure rollback証明後、clean fixed baseを新規再構築してM1を正常適用し、generic全件＋v2 suiteを実行する。v1 fallback、moving ref、base file/hash差、profile不整合、skipは失敗である。

profileは二段階です。harness runner単独PRのpre-M1 profileは`m1ScenarioState='not-registered'`、`targetMigration=null`、`upgradeScenarios=[]`、`upgradeFailures=[]`、`writeRaces=[]`、M1固有v2 phase entry exact 0です。`upgradeBases`は固定base exact一件、`phasePgTapFiles`は`origin-main-upgrade-base` exact一件、`genericPgTapExclusions=['database_harness_security.test.sql']` exact一件で、generic `pgTapFiles`は旧suiteを除く発見済みpgTAP全件をpath/SHA付きでexact列挙します。このPRがmanifest JSONをv2へ変更し、manifest v1 `pgTapFiles`の旧suiteを`phasePgTapFiles.origin-main-upgrade-base`へ移します。このprofileは固定base/hash、base checkpoint旧suite、旧suiteを除くgeneric pgTAP全件、fixture-free production boundaryの既存generic security semanticsを実行してrunner自体を検証し、M1 migration/scenario/failure/race/v2 suiteを実行したと主張しません。M1 PRはbase entryを変更せず維持したまま、manifestを同一commitで`m1ScenarioState='registered'`、target literal、全scenario/failure/race、他6 phase entryへatomic拡張します。一部だけ登録した中間profileを拒否します。M1実装開始条件はnot-registered runner PRのmergeとCI成功、M1 merge条件はregistered profileの全5 phase・全checkpoint成功です。本設計PRではfixture READMEと現manifest v1を不変にします。pre-M1 runner PRでもfixture READMEのbytes/hashは保持し、M1 registered PRでREADMEとmanifest hashを同時更新します。

registered profileの`phasePgTapFiles` literal tableは次の7行exactで、表の`id`順がUTF-8 byte昇順です。`old`は`database_harness_security.test.sql`、`v2`は`database_harness_security_v2.test.sql`を意味します。

| id | phase | checkpoint | suite |
|---|---|---|---|
| `atomic-failure-reapply-post` | `atomic-failure` | `clean-reapply-post` | `v2` |
| `fresh-head` | `fresh` | `post-head` | `v2` |
| `m1-normal-post` | `origin-main-upgrade` | `normal-scenario-post` | `v2` |
| `m1-race-post` | `combined-order` | `race-reapply-post` | `v2` |
| `origin-main-upgrade-base` | `origin-main-upgrade` | `pre-target` | `old` |
| `origin-main-upgrade-post` | `origin-main-upgrade` | `post-target` | `v2` |
| `production-boundary-head` | `production-boundary` | `fixture-free-head` | `v2` |

`origin-main-upgrade-base`だけが旧suite、SHA-256 `3e1e8c886238909f5e042cbecdba3b64fa020f656e5098b6218bcbf1e831c0aa`、47,709 byteを参照し、他6行はv2 suiteを参照します。旧fileは固定base `00411ef12777fdda151a66833598f6805fdfdf63`以外で実行不可で、不変対象はpath/blob/SHA/bytesです。manifest v1 `pgTapFiles`の旧security entry削除と上記base entryへの移設はpre-M1 not-registered harness PRの責務です。M1 registered PRはbase entryを維持して他6行だけを追加します。registered profileは`genericPgTapExclusions=['database_harness_security.test.sql','database_harness_security_v2.test.sql']`をexact要求し、generic `pgTapFiles`はこの二fileを除く発見済みpgTAP全件をpath/SHA付きでexact列挙します。`pgTapFiles`とexclusionの積集合0、phase registry path集合とexclusion集合のexact一致をvalidatorで照合します。v2 suiteはM1 ACL/RLS、temporary allowlist、owner/cross-user、answer nonleakを全6 HEAD/post contextで検査します。

`m1-race-post`は二段階です。第一段階は競合fixtureをfixed baseへ入れて実M1を競合させ、migration全rollback、schema/data/migration-history/ACL/roles/sequences/auditのbefore=after exactを確認します。第二段階はclean fixed baseを別構築するか同stackをverified clean resetし、競合fixtureなしでM1を再適用して成功したDBへgeneric全件＋`m1-race-post` v2 suiteを実行します。第一段階のrollback DB、target migration history 0のDB、clean reset未証明DBでHEAD suiteを実行してはならず、二段階のいずれもskip不可です。

array registryもliteral自体をUTF-8 byte昇順へ固定します。`upgradeBases=['pr9-main-00411ef']`、`upgradeScenarios=['m1-expired-decision-table','m1-legacy-content-integrity','m1-legacy-five-kind-acl','m1-legacy-request-fingerprint','m1-normal-upgrade']`、`writeRaces=['m1-legacy-write-race']`です。registered `upgradeFailures`は次の一原因一ID exact 51件です。これは[詳細設計 §7.3](./detailed-design-v2.md#73-m1実装固定補遺)のrequired構造原因を、注入一件が一つだけ壊す粒度で全展開した正本です。

| UTF-8順 | failure ID | 独立注入cause |
|---:|---|---|
| 1 | `m1-active-answer-key-count-mismatch` | active answer keyのcorrect件数不一致
| 2 | `m1-active-answer-key-foreign-choice` | active correct choiceが別version所属
| 3 | `m1-active-answer-key-missing` | active answer key欠落
| 4 | `m1-active-completed-at-present` | active fixed-base sessionの`completed_at`がnon-NULL
| 5 | `m1-active-revision-negative` | active revisionが負
| 6 | `m1-active-revision-unsafe` | active revisionが`9007199254740992`以上
| 7 | `m1-active-updated-before-started` | active fixed-base sessionの`updated_at < started_at`
| 8 | `m1-answered-question-set-duplicate` | answered question IDが重複
| 9 | `m1-answered-set-foreign` | answered question IDがsession外
| 10 | `m1-attempt-owner-mismatch` | attempt ownerがsession ownerと不一致
| 11 | `m1-attempt-question-mismatch` | attempt questionがsession item pinと不一致
| 12 | `m1-attempt-session-mismatch` | attempt sessionがsession itemのsessionと不一致
| 13 | `m1-attempt-version-mismatch` | attempt versionがsession item pinと不一致
| 14 | `m1-bookmark-time-order-invalid` | fixed-base bookmarkの`updated_at < created_at`
| 15 | `m1-choice-order-gap` | choice order ordinalにgap
| 16 | `m1-completed-answer-key-count-mismatch` | completed answer keyのcorrect件数不一致
| 17 | `m1-completed-answer-key-foreign-choice` | completed correct choiceが別version所属
| 18 | `m1-completed-answer-key-missing` | completed answer key欠落
| 19 | `m1-completed-answered-set-incomplete` | completed answered setがanswerable question全件を含まない
| 20 | `m1-completed-completed-at-missing` | completed fixed-base sessionの`completed_at`がNULL
| 21 | `m1-completed-effective-attempt-missing` | completed answered questionに実効attemptがない
| 22 | `m1-completed-revision-negative` | completed revisionが負
| 23 | `m1-completed-revision-unsafe` | completed revisionが`9007199254740992`以上
| 24 | `m1-completed-updated-before-completed` | completed fixed-base sessionの`updated_at < completed_at`
| 25 | `m1-current-index-invalid` | current indexが範囲外
| 26 | `m1-current-version-question-mismatch` | questionのcurrent versionが別questionを参照
| 27 | `m1-draft-owner-mismatch` | fixed-base answer_draftsの`user_id`が同session ownerと不一致
| 28 | `m1-draft-question-foreign` | fixed-base draftの`question_id`がsession `question_ids`外
| 29 | `m1-draft-revision-negative` | fixed-base draft revisionが負
| 30 | `m1-draft-revision-unsafe` | fixed-base draft revisionが`9007199254740992`以上
| 31 | `m1-draft-selected-choice-count-exceeded` | single-choice draftの選択数がrequired count超過
| 32 | `m1-draft-selected-choice-foreign` | fixed-base draftのselected choiceがpin版外
| 33 | `m1-duplicate-attempt` | 同itemの有効attemptが重複
| 34 | `m1-duplicate-session-question` | session questionが重複
| 35 | `m1-empty-question-ids` | session question_idsが空
| 36 | `m1-expired-answer-key-count-mismatch` | expired answer keyのcorrect件数不一致
| 37 | `m1-expired-answer-key-foreign-choice` | expired correct choiceが別version所属
| 38 | `m1-expired-answer-key-missing` | expired answer key欠落
| 39 | `m1-expired-revision-max-safe` | expired prior revisionが`9007199254740991`
| 40 | `m1-expired-revision-max-safe-plus-one` | expired prior revisionが`9007199254740992`
| 41 | `m1-expired-revision-negative` | expired prior revisionが負
| 42 | `m1-expired-revision-zero` | expired prior revisionが0
| 43 | `m1-expired-updated-before-started` | expired fixed-base sessionの`updated_at < started_at`
| 44 | `m1-foreign-selected-choice` | attemptのselected choiceが別version所属
| 45 | `m1-invalidation-reason-only` | legacy invalidation reasonだけnon-NULL
| 46 | `m1-invalidation-timestamp-only` | legacy invalidation timestampだけnon-NULL
| 47 | `m1-legacy-content-collision` | 18問stable ref/content hash衝突
| 48 | `m1-missing-pin` | question/version pin欠落
| 49 | `m1-selected-choice-duplicate` | attemptのselected choiceが重複
| 50 | `m1-started-after-terminal` | started_atがterminalAtより後
| 51 | `m1-terminal-after-migration-recorded` | terminalAtがmigrationRecordedAtより後

`upgradeFailureCount=51`です。causeCodeはIDから`m1-`を外して`-`を`_`へ置換したliteralだけを許可します。ID arrayは表の真UTF-8 byte昇順そのままとし、`upgradeFailureIdSetHash=SHA-256(RFC 8785 JCS(failure ID文字列array))='1e1d751eb194f6eb66a8aae95f9a2d610d754742a3ba4d985465245dd15901f8'`へ固定します。pair arrayは同じ順の`{causeCode,id}`で、`upgradeFailureIdCausePairSetHash=SHA-256(RFC 8785 JCS(pair array))='a4aa023b759fe0f70aaec7da014ec235625a6aa4b1baad6910fca7b712a5144b'`です。manifest/required registry/fixture basename/expectedErrorはこの51 pairと1:1で、swap/extra/missing/duplicate/unsortedを拒否します。

51 fixtureはfixed-baseに一原因だけを実注入できるものに限る。6桁`LegacyStoredTimestampV1`はPostgreSQL保存instantの正当なwireでありfailureにしない。各fixtureはまず全構造条件を通るbase-valid control rowを作り、次のliteral mutationだけを適用する。(a) active sessionの`completed_at='2026-08-14T00:00:01.000000Z'`、(b) completed sessionの`completed_at=NULL`、(c) draftの`question_id='fixture-foreign-question'`（session `question_ids`には含めない）、(d) draftの`revision=-1`、(e) draftの`revision=9007199254740992`、(f) single `fl-001-v1` pinのdraftへ同version所属かつdistinctな`selected_choice_ids=ARRAY['fl-001-A','fl-001-B']`、(g) `fl-001-v1` pinのdraftへ実在する別version `fl-002-v1`所属の`selected_choice_ids=ARRAY['fl-002-A']`、(h) `m1-current-version-question-mismatch`はcontrolのfixture record `fl-001`へ`current_version_id=fl-002-v1.id`をliteral更新する。`fl-002-v1.question_id <> fl-001.id`、参照先versionは実在、他の全構造条件は正とする。hのpreflight predicateは`questions q LEFT JOIN question_versions qv ON qv.id=q.current_version_id WHERE q.current_version_id IS NULL OR qv.question_id <> q.id`の`count(*)=0`だけであり、status/updatedAt/UUID orderによる任意一件選択を禁止する。a/bは状態別の`updated_at`順序を正、cはowner/selected choice、d/eはquestion/pin/selected choice、fはowner/question/pin/revisionとchoice所属を正、gは`fl-002-A`の実在・`fl-002-v1`所属、single required count=1、revision、duplicateなしを正に保つ。h以外のsession item/choice/answer key/attempt/owner/timeはcontrolを保持する。fの`fl-001-v1`はsingle/required count=1、A/Bはいずれも同version所属なのでforeignやduplicateを同時発火しない。`m1-foreign-selected-choice` と `m1-selected-choice-duplicate` は`answer_attempts`だけを対象とし、draft 2件の代用にしない。answer-key count mismatchはcorrect choice IDが重複しないdistinct集合だけで判定し、duplicate predicateへ優先順依存を導入しない。`m1-draft-owner-mismatch`は`answer_drafts.user_id`と同session ownerの不一致、`m1-bookmark-time-order-invalid`は`bookmarks.updated_at < bookmarks.created_at`だけであり、post-M1のsession item owner/generation mismatchを代用しない。`updated_at=created_at`と`updated_at>created_at`は独立positiveである。validatorはID/pairのliteral RFC 8785 JCS preimage UTF-8 bytes、expected digest、swap/1-byte差を独立fixtureで検証し、実装関数や入力をsortした値からexpectedを自己生成してはならない。

legacy invalidation failure 45/46はinitial `answer_attempts`の片側non-NULLだけを注入する。both non-NULL（空reasonを含む）は`LegacyAttemptInvalidationFactV1` exactly一件へ成功し、deterministic UUIDv5、6桁wire、direct provenance/hash、effective/local/bootstrap/portable/restore linkを照合する。legacy factはportable fact countへ含める一方、actor map/principal digest/pseudonym/actor materialization link exact 0を確認する。failure registryへ新IDを追加せず、5-kind legacy pullの`.123456Z` source、portable fact hash、normal local `legacy-sync-event|legacy-direct-row` owner/generation exact一致をpositive、modern/restore branch mixをnegativeとして同一database checkで検証する。bootstrap session smokeはcanonical fact/session/sourceの三hashと全ID/binding/time/count/itemを照合し、別row swapをrejectする。

Round 16 smokeは追加failure IDなしで次を同じregistered database checkへ含める。(1) bootstrap `snapshotReceivedAt`はmodern/legacyとも取得clockの3桁、source receivedはmodern 3桁/legacy-sync 6桁/legacy-direct NULL/restore 3桁、(2) client/legacy sourceはkind literal genericだけから生成し、Draft/Note/Bookmark/Issue/Sessionの許可source non-`never`、Note legacy・Issue legacy-sync・Sessionへの他entity source `never`をtype/decoderで検証する、(3) typed restore linkのtarget kind/ID/hash、source identity kind/fact-or-event kind/revision/hash、owner、source/target generation、job/link ID/hashをlocal table/FK/DB CHECK/portable/bootstrapへlosslessに照合する、(4) `LocalSessionRecordV2`のmodern delta（current answerableを含む）とimmutable targetのrequested/actual/initial answerableを分離し、modern target=remote absent/modern、legacy target=legacy sync/directだけを許可し、suspend 10→9、fabricated target、branch混在を検査する、(5) Bootstrap/local共通`SessionCurrentProjectionV2`の全7 field/hashをcreation/session-event/terminal/legacy-fixed-row-snapshot/lifecycle/server-change/restoreへ照合し、terminal化answerは同transaction lifecycle、legacy event単独current禁止、server-change lifecycle偽装禁止、restored active/lifecycle、completed/advanced/review/answer/submit/abandon/invalidateの正負を検査する、(6) canonical 6 rootの`NoteFactV2` strict provenance、local sequence/request hashとoutbox、fixture g=`fl-002-A`を確認する。attempt UUIDそのもののrow ID、D/F相互参照、片hash差替え、snapshot/source時刻同値化はatomic rollbackにする。

同smokeのSession currentはsource eventをprojection正本にせず、transactionごとのappend-only `SessionCurrentMaterializationFactV2`を参照する。initialはcreation/fixed-row/restore初回だけのprior revision/fact ID NULL、mutationは進行/terminal/lifecycle/invalidation/restore更新だけの両non-NULLかつrevision +1、full projection/hashとcause ID/hashはfact/session/owned/local/bootstrap/portableへexact一致する。変換しないfixed-base active/completed currentは6桁initial一件である。M1 expired→completed|invalidatedは、旧revision/status expired/6桁updatedAt/旧nullable 6桁completedAtのfixed-row initialと、完全legacy lifecycle factだけをcauseにするmutationのexact二件を作る。mutationのprior fact ID/revision、resulting revision、`legacyTerminalAt=initial.completedAt ?? initial.updatedAt`を照合し、expired currentを拒否する。completed current projection/materialization/portable restoreはupdated 3桁/completed 6桁のmixed、invalidatedはupdated 3桁/completed nullである。Session restore primary sourceはportable `session-current-materialization` fact ID/hashで、cause event/fact/linkはfact内部の二段FK/hashへ固定する。local/stale/bootstrap `session-lifecycle`/portable/restore dry-run/finalizeの`sessionCurrentMaterializations` payload length、portable kind、M1 pairを二件として含むfact count/hash、第一fact欠落、prior/source/cause/initial-mutation swap、eventからのcurrent補造を同じdatabase checkで検査する。

Round 18で前段のM1両branchを3桁とする文言を置換する。expired completedはfull lifecycle factをcauseに、`learning_sessions.updated_at=migrationRecordedAt`、`updatedAt=migrationRecordedAt`（3桁）、`completedAt=legacyTerminalAt`（6桁）のmixed fact/session/local/bootstrap/materialization/portable/restoreをexact照合する。`.123456Z` terminalはpositive、completedAtを3桁へ変換する入力はnegativeである。invalidatedはupdated 3桁/completed nullを維持する。その直前に`LegacyExpiredSessionCurrentProjectionV2`のfixed-row initialを必須とし、old revision/status/updated/completed、lifecycle mutationのprior fact ID/revision、二件順序を照合する。materialization initial causeはcreation/fixed-row/restore初回だけ、mutation causeはprogress/terminal/lifecycle/invalidation/restore更新だけで、実object candidateのinitial+advanced/mutation+created、expired initial/pairの`never`化、expired current source、M1 completed/invalidated portable source/cause status swapをdatabase/decoder/compilerで拒否する。M1 portable restoreはactual `LegacyBoundPostM1CurrentMaterializationSourceV2`内のnon-never branchである。

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

managed runnerは`CONTENT_PRIVATE_EXPORT_PATH`を必須にし、non-empty、絶対path、allowlist済みcontrolled directory配下のregular file、placeholderでないことを`realpath`後に検証します。symlink escape、`..`、相対path、未設定、`/安全な場所/...`等の例示文字列、任意URL、位置引数fallbackを拒否します。

```bash
export CONTENT_PRIVATE_EXPORT_PATH="/srv/jstqb-controlled-private/release/questions.json"
CONTENT_EXACT_COUNT=500 pnpm content:verify -- "${CONTENT_PRIVATE_EXPORT_PATH}"
```

エクスポートはコミットせず、検査後もCI artifactへ保存しません。publish前検証時の問題版statusは`reviewing`だけを許可し、runner成功だけでpublishedとは扱いません。countが500以外、owner承認済みallocationVersionの章/K/64LO/single/multiple/multiple章/multiple K exact配分不一致、未レビュー、重複、根拠不足、正答数不整合、`questionExplanation/takeaway/commonTrap`欠落・空文字・canonical/DB不一致、quality/review artifact hash不一致が1件でもある場合は公開しません。499件、501件、single/multiple一件不一致、LO一件ずれ、正答だけswapの旧hash流用拒否fixtureを必須にします。M1の`compatibility_only`18問は入力・count・catalog・exam blueprintへ0件でなければ失敗します。公開repoへ返す証跡は本文・正答を含まないhash、count、gate version、attestation IDだけです。

作問入力は`content-blueprint-v1.md`のstrict schemaへ一致させます。D-04未決定中はpersonal/public manifest、stage、preview activation、content-control job、対応runtime capabilityをすべて0件にします。owner本人がpurpose-bound recent-authで`ContentAllocationApprovalArtifactV1`をappend-only確定し、allocation definition/version/hashへexact結合した後だけ初期personal manifest生成・stage・accept・activation用job/capabilityを順に許可します。public manifest/job/capabilityはowner approval後も0件で、将来のpublic review、4者attestation、parent personal hash等のpublic gate完了後にだけ別operationで生成します。artifact未確定・hash不一致・personal gateだけでいずれの経路も先行させません。

公式根拠取得はcontrolled runnerが`OfficialSourceVerificationEvidenceV1`をappend-only生成し、`artifactHash`を自身だけ除外したRFC 8785 JCSから独立再計算します。`OfficialSourceRequirementRegistryV1`のexact 3 source/6 claimと`OfficialSourceVerificationCoverageV1`のsource順3 evidence tupleをDB/private/独立runnerで照合し、manifestの`officialSourceVerificationCoverageHash`、official exam basisのevidence ID/hash、source version/document bytes hash/retrievedAtへ固定します。HTTP取得失敗、required source/evidence欠落、unverified、bytes 1-bit不一致、URL/version/hash差替え、推測digest、source不足ならallocation生成、stage、40問/60分/26点policy activationを失敗させます。

DB transaction失敗はDB row/migration履歴をrollbackしますが、Auth Admin、Storage、外部archive/KMS side effectは自動rollbackされたとは扱いません。各外部stepへoperation ID、expected hash、immutable receiptを付け、failure injection後はidempotent retryまたは規定compensationを行います。全scopeのmatching external receiptがDB job/manifest/upper boundと一致するまでcompleted、capability発行、traffic cutoverを禁止します。

controlled artifactのbucket=`controlled-private-release`、content type=`application/json`、positive safe size、固定key/version/etag/raw hashとcreate-only制約を検証します。stage/publish jobのenqueue receiptがNULL、suspend/retire jobのenqueue receiptがnon-nullで、human operation IDとserver internal operation IDが別値であることを確認します。receiptのrequested-by principal/human request/response hashとjob/claimのinternal operation principal/internal request hashは別preimageで、job/internal operation ID/kind/target/server mappingだけがdeferred exact一対一です。human response hashはstrict responseから`operationResponseHash`だけを除いたJCSのSHA-256で、JSON内同fieldとのdeferred equality、自己包含0をgolden照合します。principal/hashのコピー・等値化をnegative fixtureで拒否します。human recent-authはpersonal操作とUI suspend/retire enqueueでだけ消費し、stage/publish/suspend/retire internal receiptはreauth NULLです。authenticated direct internal call、任意URL/client key、未claimを拒否します。保存internal receipt replayはACL/ID/kind/internal principal/internal request hash一致をlease freshness/claim再消費より先に検証します。

緊急停止smokeでは実効targetだけがfreezeされること、session item invalidation fact ID/hash/session/itemとchange/bootstrap/local/portable/restore/materialization linkのexact結合、retireのcurrent membership `reason='retired'` tombstone exact一件・pin維持・fanout/member/link 0、全bootstrap sectionのowner/acceptance/version lockとsuspended/fanout pending/acceptance-revoked content-null tombstone、同版本文/feedback purgeを確認します。同期smokeでは同一generationでserver terminal/content/tombstone/factが優先され、literal local intent allowlist外とbasis row hash/lifecycle mismatchがquarantineされること、回答後の`draft.saved`がdraft非更新かつattempt ID/hash付き`superseded-by-answer` ACKとなり、kill/restart/bootstrap後も確定回答へ収束することを確認します。Session current smokeはtransactionごとのappend-only `SessionCurrentMaterializationFactV2`を、initial（creation/fixed-row/restore初回・prior revision/fact ID=NULL）またはmutation（進行/terminal/lifecycle/invalidation/restore更新・両non-NULL、revision +1）としてfact/session/projection/current sourceへexact照合する。M1 expired completed/invalidatedは旧6桁/旧revision/status expiredのfixed-row initialとlegacy lifecycle mutationのexact二件であり、第二factが第一factをprior ID/revisionで参照する。completedはupdated 3桁/completed 6桁mixed current、invalidatedはupdated 3桁/completed null、変換しないfixed active/completed current snapshotは6桁であり、expired currentとanswer event単独からのprojection補造を拒否する。local/stale/bootstrap `session-lifecycle`/portable/restore dry-run/finalizeの各経路で同fact ID/hash、portable identity `session-current-materialization`、`sessionCurrentMaterializations` payload length/portable kind/count/hash、M1 pair二件と内部prior fact→cause→event/fact/link二段FK/hashを再計算し、片側欠落、source/cause/initial-mutationとcompleted/invalidated branchのswapを拒否します。restore smokeではsourceExportId/sourcePayloadHash、actor digest/pseudonym別集合、全registry kindの0件summaryを含むidentity子row、全集合/count/hash/setsHash/artifactHashのpayload→artifact→dry-run→finalize再計算一致、link ID/time/hash、session invalidation exact FK、remote-source metadata/generation lossless、legacy source generation NULL・legacy schema/event/sequence/fact hash・canonical hash 0件、selection-basis discardのportable/archive/link拒否を確認します。

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
