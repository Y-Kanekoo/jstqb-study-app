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

1. `fresh`: 空DBへ全production migrationを適用し、generic pgTAP全件＋`fresh-head` phase suiteを実行します。
2. `origin-main-upgrade`: harness manifestに固定したbase commit `00411ef12777fdda151a66833598f6805fdfdf63`のmigration hashとsynthetic既存データから現在HEADへupgradeします。適用前base checkpointはgeneric全件＋旧base suite、適用後はgeneric全件＋`origin-main-upgrade-post` suiteです。moving `origin/main`は使用しません。
3. `combined-order`: fresh/upgradeのmigration履歴と最終schema・RPC署名が一致することを確認します。
4. `atomic-failure`: 固定baseをcaseごとに再構築し、意図的な実migration失敗後にDDL、ACL、role、data、sequence、migration履歴が残らないことを確認します。
5. `production-boundary`: `supabase/test-fixtures/database-harness/manifest.json`で完全列挙したtest fixtureのstable ID/canaryが、production migration・seed・content bundle・release artifact・public/private DBへ混入していないことを確認します。

security suiteはmanifest v2のphase-specific registryだけで実行します。既存`database_harness_security.test.sql`は固定base `00411ef12777fdda151a66833598f6805fdfdf63`のorigin-main-upgrade target適用前checkpoint専用、新規`database_harness_security_v2.test.sql`はregistered profileのfresh、M1 normal/race/upgrade post、atomic clean-reapply post、production boundary HEAD専用です。両fileをgeneric pgTAP discoveryから除外し、各checkpointでは除外後のgeneric全件＋当該phase suiteを実行します。本書の「全pgTAP」はこの和集合で、誤phase・同一context二重実行・skipを拒否します。runnerは同projectの既存containerがあればfail-closedで中止し、stop直前にlabel/nameが所有証跡と完全一致したcontainerだけを停止します。SIGINT/SIGTERMでは実行中commandを停止して所有確認付きcleanupへ移り、CIは独立した`always()` cleanupでも残留container/lock 0を検査します。接続URL、DBパスワード、service role keyをログ・ファイル・Gitへ保存しません。

M1開始前のrunner PRはnot-registered profile、M1 PRはregistered atomic profileを用いる。registered failure registryは一原因一ID/causeCode exact51、count51、UTF-8順ID JCS SHA-256 `1e1d751eb194f6eb66a8aae95f9a2d610d754742a3ba4d985465245dd15901f8`、pair SHA-256 `a4aa023b759fe0f70aaec7da014ec235625a6aa4b1baad6910fca7b712a5144b`である。manifest/fixture/required registryの1:1、fixed base、strict sort/unique/phase tuple契約は[release runbook §3](../docs/release-runbook.md#3-database-ci)を正本とする。

`m1-race-post`は、競合fixtureで実M1全rollbackとschema/data/history/ACL/sequence/audit before=afterを確認した後、clean fixed baseを再構築またはverified resetし、競合なしM1を成功させたDBでだけgeneric全件＋v2 suiteを実行します。rollback DB、M1 history 0、clean reset未証明のDBでHEAD suiteを実行しません。`atomic-failure`も全51件のrollback後にclean fixed baseを再構築し、`clean-reapply-post` checkpointの`atomic-failure-reapply-post` contextでnormal applyとgeneric/v2 suiteを確認します。manifest `files.path`はfixture root相対で、manifest自身はself hash循環回避のinventory除外、READMEを含むfixture root配下の全通常fileを再帰的にexact列挙し、未知・欠落・重複・隠し/temporary file/symlinkを拒否します。

M1 exact hardening後の旧client temporary ACL allowlistは`authenticated`の`sync_events SELECT,INSERT`とidentity sequence `USAGE`だけです。authenticatedのその他table/sequence privilege、`PUBLIC/anon/service_role`の全base privilegeは0です。固定baseのglobal `UNIQUE(event_id)`をM1後もlegacy cutoverまで保持します。M1以前rowは`historical_reconstructed`としてactual stored payloadの`LegacyHistoricalCanonicalSourceV1`/`legacySourceFactHash`（answerのDB採点済み`isCorrect`を含む）と、receivedAtを比較外にする`LegacyHistoricalReplayIdentityV1`/hashを別保存し、baseにないv2 canonical hash、raw/client `isCorrect`を補造しません。incomingはDB再採点outcomeをstored sourceへexact照合後、replay identity exactだけno-opにします。M1以後rowは`post_m1_raw`としてclient `isCorrect`を含むraw全field exactだけno-opです。両branchのcross-user同IDを拒否し、実`onConflict:'event_id',ignoreDuplicates:true`とraceでもtrigger比較を迂回できません。M2 cutover後変更は別設計/前後試験なしに行いません。

互換18問のruntime正本はimmutable source bundle、sanitized manifest、ordinal 0..17のmember exact 18、sidecar bundle/manifest FKです。Session/AttemptFact/Local/DBはmodern binding+modern provenanceまたはlegacy binding+legacy provenanceの明示unionだけを再利用します。Session/Draft/Attempt/Bookmark/IssueはAPIのfact別provenance unionをDB/local/bootstrap/portableで再利用します。legacy directはevent ID/sequence NULL＋source metadata/JCS hash、legacy syncはliteral対応kindの最大sequence（一意）candidateがmaterialized比較projection/revision/timeとexact一致し、後続同aggregate event 0だけです。IssueはM1 direct-onlyで`issue.reported`はM2です。sessionと現行main direct DMLのdraft/attempt/bookmark/issue positive、event 0/1、mismatch/later event negativeを検査し、偽eventを生成しません。legacy sessionのrequestedはNULL、actualはstaged item countの1..40です。M1 lifecycleはDB時計一回値を使い、active/completed revision 0/max-safeを許可、expired変換だけ1..9007199254740990へ固定します。

`pnpm test:database:legacy`は旧経路の局所診断に限って使用します。5 phase、production boundary、upgrade、atomicityを検証しないため、CI・release gate・`pnpm test:database`の代替にはできません。

M1 upgrade smokeはfixed-base legacy pullの5 kindをouter/payload UTC 6桁で読み、normal local metadataを`legacy-sync-event`または`legacy-direct-row`としてowner/generation、event/direct ID・sequence、JCS hashまで照合します。initial `answer_attempts.invalidation_reason text`/`invalidated_at timestamptz`はbase attemptを更新せず、both null=legacy fact 0、both non-null=free-text（空文字を含む）/6桁/direct provenanceのdeterministic `LegacyAttemptInvalidationFactV1` exactly 1、片側だけ=transaction rollbackです。effective view、local、bootstrap、portable、restoreは同一strict union/identityを使用し、actor/operation/reason codeの補造、modern/restore field混在を拒否します。bootstrap sessionはcanonical fact/session/immutable creation sourceの三strict hashとfact provenance exactを照合し、current materialization sourceを別hashでstatus/revisionへ照合する。terminal `session.submitted`のsourceRevision、abandon/invalidate lifecycle branch、legacy direct/sync/restore、同件数source swapを検査します。portable legacy invalidationはfact countだけへ含め、actor map/principal digest/pseudonym/actor link exact 0を検査します。

Round 18 smokeはbootstrap `snapshotReceivedAt`を全branch取得clock 3桁、source receivedをmodern 3桁/legacy-sync 6桁/legacy-direct NULL/restore 3桁として分離し、distributive hydrationのmodern/fixed6/post-M1 legacy3に加えM1 completed mixed（updated 3桁/completed 6桁）各branch非`never`とcross-product `never`を検査します。Bootstrap Sessionはcanonical current fact/derived session/immutable creation sourceの三hashとfact provenance exactを、append-only `SessionCurrentMaterializationFactV2`（initial=creation/fixed-row/restore初回のみ、mutation=progress/terminal/lifecycle/invalidation/restore更新のみ、full projection/hash/cause ID/hash）でcurrent status/revisionへ照合します。M1 expired completedは完全legacy lifecycle factをcauseにし、`learning_sessions.updated_at=migrationRecordedAt`、current/materialization/portable restoreのupdated 3桁/completed 6桁をexact照合する。invalidatedはupdated 3桁/completed NULLを維持し、`.123456Z` terminalはpositive、completedAtの3桁化とphase/cause/status swapはnegativeにする。restore primary sourceはportable `session-current-materialization` fact ID/hashで、内部cause→event/fact/link二段FK/hash、local/stale/bootstrap `session-lifecycle`/portable/dry-run/finalizeの`sessionCurrentMaterializations` payload length、portable kind count、count/hashを再計算します。Session local intentは3桁deltaとimmutable `modern-target|legacy-target`へ分離し、entityはtarget×source kindのdistributive restore unionだけをdecoderへ通します。legacy remote+modern local editをpositive、fabricated binding/count、Note legacy、Issue legacy-sync、direct/restore source差、eventからのcurrent補造、source/cause/initial-mutation swapをnegativeにします。legacy invalidation sourceはtable=`answer_attempts`、kind=`attempt`、revision NULL、aggregate/owner/generation/time exact、`direct-row-id.v1` SHA row IDを要求します。literal goldenでDはD/F除外、FはF除外・D包含を独立再計算し、attempt UUIDそのもののrow IDやhash片側差替えをrollbackします。

Round 19 smokeはowned summary/detail、local legacy sync/direct、session restore materialization link、bootstrap legacy sync/directを通常post-M1・M1 completed mixed・M1 invalidatedの別unionとして検査します。通常branchへM1 sourceを混ぜる、completed/invalidated portable causeをswapする、link sourceをstatus違いで差替える入力をnegative、各M1 direct/restore branchと一覧decoderをpositiveにします。`docs-contract`はGitHubのrequired job/checkではなく、既存required job `quality`内の必須step名である。M1実装PRはpackage script `contract:check-api-ts-fences`（`node scripts/check-doc-ts-fences.mjs`）を`pnpm check`の依存として実行し、dev alias `typescript-doc-contract: npm:typescript@5.9.3`とlockfileのexact 5.9.3を追加する。scriptはAPI契約のdocument-order `ts`/`typescript` fence exact 41 blockを個別解析し、ordinal連結virtual fileもTypeScript 5.9.3でコンパイルする。compilerOptionsは`strict:true`、`exactOptionalPropertyTypes:true`、`noUncheckedIndexedAccess:true`、`noEmit:true`、`skipLibCheck:false`、`target:'ES2022'`、`module:'NodeNext'`、`moduleResolution:'NodeNext'`、`lib:['ES2022']`だけである。個別parserと連結fileのsyntactic/semantic Error diagnosticsはfilterなしで0、block ordinal・Markdown開始行のline mapping、block count=41、TypeScript 5.9.3、artifact名`docs-contract`を保存・検証する。stepの失敗は`quality` jobの失敗とし、Rulesetと`apply-main-ruleset.sh`は`quality`、`database`、`e2e`、`pages`、`security`のexact 5 required checksだけを維持して第6チェックを追加しない。本設計roundはscript本体・package/lockを追加しない。
