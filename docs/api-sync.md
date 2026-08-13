# API・同期設計

authorityは[設計書一覧](./README.md)の表に従います。本書は同期概念の説明であり、wire DTO/RPC/hashは[API・DTO契約 v2](./api-contract-v2.md)、workflow/state/受入/PR順は[詳細設計 v2](./detailed-design-v2.md)、content schema/hashは[コンテンツblueprint v1](./content-blueprint-v1.md)を狭い正本とします。

## 1. API

| 処理 | 入力 | 出力・保証 |
|---|---|---|
| `get_current_learning_generation_v2` / `begin_learning_bootstrap_v2` / `get_learning_bootstrap_page_v2` | owner generation discovery、server発行snapshot/section/scope/page | 全sectionのowner/preview acceptance/versionをlockして作るimmutable full snapshot。suspended版、suspend fanout pending版、acceptance-revoked版のcatalog/session item/selection basisは`content:null` tombstone、feedbackは0件とする。basis原本・選択順・lifecycle/hashは不変で、safe contentだけ`available`/`suspended`/`acceptance-revoked` strict unionにする。session item invalidationはfact ID/hash付き。正答・解説を含めずportableの本文なしbasis型とは分離 |
| `issue_learning_selection_basis_v2` | 資格、syllabus、希望数、選定条件、channel、preview acceptance | 同一transactionで固定したgeneration、sync/change上限、projection/catalog revision、候補集合hash、version付きalgorithmによる確定選定結果 |
| `ingest_learning_sync_events_v2` | 単一aggregateのstrict event microbatch | 8 client kindのcanonical ACK。exam terminalはserver-owned |
| `submit_exam_session_v2` | command ID、session、expected revision | DB finalizerが一意terminalへ収束 |
| `get_owned_learning_session_v2` | generation、session | retired/preview/legacy互換を含むowner限定safe pin |
| `get_learning_feedback_v2` | generation、session、任意question | 通常確定後・模試提出後だけの正答、総合/choice解説、canonical `takeaway/commonTrap`。unavailable tombstoneではこれらを全て返さない |
| `get_public_runtime_capabilities_v2` | なし | 署名済みproduction capabilityのsafe projection |
| `enqueue_user_export_v2` | format、purpose-bound reauth | 有効期限付き本人データjob |
| `enqueue_user_restore_v2` | 固定upload、purpose-bound reauth | 空namespace専用restore job |
| `discard_learning_selection_basis_v2` | command ID、basis ID、expected data generation、reason | 本人のcurrent generation未consume basisだけへappend-only discard lifecycle factを作るcanonical receipt。server reasonは通常`user_discarded`、直前restore dry-run列挙対象だけ`restore_empty_namespace_cleanup`。旧generation namespaceはこのRPCへ渡さず、端末内のstale namespace atomic discard auditだけが`generation_superseded`を記録する |
| `issue_offline_practice_pack_v2` / `consume_offline_practice_pack_v2` | API exact operation ID、reserved session/selection条件 / operation ID、pack/basis ID/hash、revision、strict session.created | 各operation receiptへrequest/response hash・strict response JSON・receipt IDをappend。issueは1 pack=1 basis=1 reserved session、consumeはpack/basis/reserved session/event/receiptを一transactionで一回だけ確定。request/pack/basis/receipt/consumeの`reservedSessionId`をexact一致させる。同operation/hashは保存response、異内容は拒否。専用RPCだけをauthenticatedへgrantしoutbox commandとして再送 |
| `submit_offline_unverified_exam_v2` | command ID、generation、bundle/hash、40 ordinal、端末開始/終了、選択 | `timingAssurance='offline_unverified'`の参考結果receipt。verified examへpromoteせず、正式合否/SRS/readinessを更新しない |
| `begin_owner_question_review_session_v2` / `get_owner_question_review_v2` / `submit_owner_question_blind_answer_v2` / `reveal_owner_question_review_v2` / `hide_owner_question_review_v2` / `complete_owner_question_review_audit_v2` / `record_owner_question_review_v2` | review session/content ref/expected current revision/last transition fact hash | runtime stateをCASし、全transition成功responseへ`transitionReceiptId`/`operationResponseHash`を返す。DB strict response bytes/hashとlocal receiptをexact一致させ、same operation/hashは同bytesをreplayする。safe resumeはcurrent revision/fact hashと正答非開示packetを返す。changes_requiredはserver issue・artifact・audit・decision receiptを原子的に作る |
| `get_learning_projection_v2` / `get_chapter_readiness_v2` | generation/scope/acceptance / `projectionSnapshotHash`だけ | 前者が4 source upperとTTLを固定してprojectionをimmutable保存。後者も`expiresAt`/`ttlPolicyVersion`をlossless保存し、readiness hash preimageへ含め、projectionと全scope/hash/time/TTLをexact FK/CHECKする。DB nowが共通expiresAt未満だけ再scanなしで返し、境界値以上はexpired |
| `enqueue_account_deletion_v2` | challenge、purpose-bound reauth | production environment control lock下で唯一有効な`DeletionRetentionPolicySnapshotV2` activation factをpinし、fact/revision/snapshot ID/body/hashをbyte-exact継承する。future/重複/hash不一致はfail closed。DB `acceptedAt`から期限を一度だけ算出し、schemaVersion=`account-deletion-ledger-entry.v2`のledger、Storage digest値を含むtombstone、object metadata、combined receiptまで同policy/preimageを固定 |

学習差分は`pull_learning_sync_events_v2`と`pull_learning_server_changes_v2`を使い、基礎tableを直接SELECTしません。server changeはattempt correction/invalidation、session lifecycle、exam result revision、acceptance revocation、`issue.updated`について各append-only fact ID、単調revision、prior IDを省略せず返し、端末はfact chainとcursorを同じlocal transactionで適用します。

offline referenceの停止訂正は元result/itemを更新せず、採点用result revisionと表示用feedback revisionを別append-only factとして返します。result revisionは0始まり全ordinalをexactに返し、影響ordinalだけ`excluded=true/isCorrect=null/score=null`、非影響ordinalは直前revisionとexact一致、score/denominatorは全ordinalからserver再計算します。feedback revisionも全ordinal exactで、影響ordinalだけtombstone、非影響ordinalは直前feedback ref/hashを保持します。欠番・追加・並替え・全件tombstoneへの縮退をrejectします。

本人状態read/mutationはcurrent data generationと同じuser shared lockを使います。restore finalize/account deletionだけがexclusive lockを取り、bootstrapは全partition/pageのstrict schema、ordinal、count/hash、snapshot hash、source event/sequence/revision/received metadataを検証してからlocal/remote端末状態、stale-generation quarantine、scope別cursorを一transactionで交換します。

generation不一致時のlocal rootは`LocalStaleGenerationNamespaceV2`として、旧generation/namespace、profile/content scopes、local/remote domain/history/basis/cache/outbox/receipt/conflict/change、全scope cursor、root別count/hash、`namespaceSummaryHash`、`namespaceHash`をlosslessに保持します。各row sourceは`sync-request/client-sync-event/server-sync-event/server-change/command-request/command-receipt/bootstrap-snapshot/catalog-projection-read/local-migration`のstrict unionとします。`client-sync-event`だけserver sequence・request/canonical hashを必須、`server-sync-event`は`session.submitted`だけでrequest hashをNULL、`sync-request`は未ACK client request hashだけを持つbranch CHECKとし、event/change/command/snapshot/fact ID、sequence/revision/received at、request/canonical/response/payload/row hashの必須/null条件を固定します。現在namespaceへのoverlay、再送、暗黙ACKを禁止します。

user scopedな全version依存経路の唯一のlock順は`user advisory shared/exclusive → question version UUID byte昇順 shared/exclusive → aggregate/event advisory → session/attempt row → projection/materialized row`です。global問題suspendはversion exclusive lock下で、graded未invalidated attempt、最新実効exam revision、最新offline result/feedback pair、未invalidated session itemだけをID/hash付きimmutable targetへ固定します。workerは保存済みmemberだけを処理し、session item invalidation fact ID/hashを含む生成fact/revision、link、receiptを原子的に確定します。過去/無効/not-graded/後着を再scanしません。retireは各current catalog membershipへexact一件のretired tombstoneをappendするだけで、session/basis/feedback/pinを失効せずfanout/member/linkを0件にします。

通常演習のoffline新規開始は事前発行・durable保存済みの未consume basisがある場合だけです。bootstrapはbasis原本/lifecycle/hashを変えず、各版のsafe contentだけを`available`または`suspended(content=null)`で返し、consumeはunconsumedかつ必要版availableの場合だけです。restore dry runはpayloadから再計算したidentity artifact、upload tuple、current namespace empty、active未consume basis IDを返し、active basisがあれば`canApply=false`です。明示discard後に新dry runを作り、finalizeはbasisをdiscardせずexclusive user lock下で同一artifact/hashと空条件を再検証します。

portable restoreはpayloadからsourceExportId/sourcePayloadHash、owner/user identity、actor principal digest集合とactor export pseudonym集合、0件を含むkind別全portable fact registry、content ref、session/event/command/basis集合を正規化子rowへ再構築し、各count/hash/setsHash/artifactHashをserver再計算してdry-run reportのstrict sets JSON/hashとfinalize reauth bindingまで同一artifactへ一致させます。restore linkはlink ID/materializedAt/linkHashを持ち、session-item invalidation branchはfact ID/hash/session/item、remote-source branchはsource kind/ID/generation/sequence/revision/receivedAt/hashをlossless保存します。legacy v1 branchだけsource generationをNULLにし、legacy schema/event ID/sequence/fact hashを検証してcanonical hashを補造しません。restored command replayは`exam.submit`、`session.abandon`、`exam.offline-reference`だけです。selection-basis discardのbasis/fact/request/receiptはportable validatorが拒否し、archive/linkへ保存しません。bootstrap basisのsafe content unionとportable本文なし型を混同しません。

同一generation bootstrap mergeはserver lifecycle/content/tombstone/attempt/session-item invalidation factを優先します。保持可能なのはowner/generation/aggregate/request hashが一致する未ACK `session.created`、pending answer、draft/note/bookmark/issue未ACK mutation、未解決conflictだけです。basisはrow hash exact一致かつserver lifecycle=`unconsumed`だけをrebaseし、それ以外はquarantine、terminal/suspended/revokedとの競合はsupersededにします。terminal state、purge済み本文、回答後draftをlocal stateから復活させません。

semantic/CAS conflictの本文同期は`LocalConflictRecordV2`を正本とし、owner/data generation/aggregate、strict `draft/note/answer` kind、local/remote bodyと各version hash、adopted hash、status、DB created/updated/expires atをlosslessに保持します。clientは`resolve_learning_conflict_v2`へoperation ID、current generation、conflict ID、expected両version hash、keep-local/accept-remoteまたは同kindのmerge body/hashを送り、server再計算hashと一致したACKだけをdomain・receipt・outboxへ一local transactionで適用します。same-operation replayは保存response bytesへ収束し、期限切れ・別owner・hash不一致・未知kindはquarantine後にpullします。server本文はowner本人RLSのget/resolve以外へ流さず、本文なしaudit/logにはconflict ID、pseudonymous owner ref、version/adopted hash、operation、DB時刻だけを許します。端末表示名はclient presentationでdevice IDから一時解決し、server conflict本文、audit、log、analyticsへ保存しません。期限sweeper/account deletion後はbody再取得を試みずterminal purgeとしてlocal本文も同transactionで削除します。

全`SECURITY DEFINER`関数はneutral NOLOGIN function-ownerが所有し、関数実行中のdefiner identityをcaller識別へ使用しません。client RPCはPUBLIC/anon/service_role/internal専用roleからEXECUTEをREVOKEしauthenticatedだけへgrantし、JWTの`auth.uid()`を必須としてownerをserver側で導出し、client入力に`userId`を許しません。internal control-plane RPCはPUBLIC/anon/authenticated/service_role/他専用roleからREVOKEし、用途ごとのexact専用NOLOGIN execution roleだけへgrantします。worker LOGIN roleは対応する一roleへの`SET ROLE`だけを許され、内部RPCはclaim済みjob/member、lease owner/expiry/fencing tokenを検証し、`auth.uid()`やclient user IDへ依存しません。`service_role`を含む接続roleへ基礎table直接SELECT/DMLをgrantしません。runtime capabilityだけは基礎tableへ到達しない固定safe RPCをanon/authenticatedへgrantします。

controlled private artifactはbucket=`controlled-private-release`、content type=`application/json`、positive safe sizeと固定key/version/etag/raw hashをcreate-only保存し、任意URL/client keyを拒否します。human enqueue receiptはrequestedBy principal snapshot、humanRequestHash、humanResponseJSON/hashを固定し、content-control job/claimは別主体のoperation principal snapshot、internalRequestHash、operation kind/target/hash、lease/fencing/capabilityを固定します。job/internal operationのID/kind/target/server mappingだけをreceiptへexact一対一結合し、人間principal/requestをinternal principal/requestへコピー・等値化しません。保存済みinternal receipt replayはACL、operation ID/kind/internal principal/internal request hash一致をlease freshnessやclaim再消費より先に検証します。human recent-authはaccept/activate/revoke/attestとUI suspend/retire enqueueでだけ消費し、stage/publish/suspend/retire internal receiptのreauthはNULLです。authenticatedからinternal RPCを直接呼べません。

owner review ACLのEXECUTE allowlistは上記7 RPCだけです。`authenticated`かつ`auth.uid()`がdeployment owner本人に一致する接続だけを許し、PUBLIC、anon、service_role、allowlist外の一般learner、admin/運用者、internal専用roleから全7 RPCをREVOKEします。beginだけpurpose-bound recent-authを消費し、残る6 RPCはowner、review session TTL、CSRF、manifest/member hashを毎回検証します。基礎table/answer keyへのdirect SELECT/DMLを許しません。

`DataGeneration`はJSON/TypeScriptの正のsafe integer numberだけです。DB BIGINTと端末SQLite INTEGERはいずれも`1..9007199254740991`をCHECKし、文字列・小数・0・負数・範囲外を拒否してJCS/hash、namespace、RPC引数を数値exact一致させます。

bootstrapはoffline pack/status/member tombstone、ownerが使う章/readiness projection revision/hashを独立section/scopeとしてpage化できますが、全sectionでowner/generation/version lock、snapshot upper bound、row count/hashを固定します。offline packのsafe contentはselection basisと同じ正答非開示境界に従い、章/readinessはprojection値だけを返して基礎attemptや他ownerを返しません。

human enqueueの`humanResponseHash`はstrict responseから`operationResponseHash`だけを除いたRFC 8785 JCSのSHA-256で、保存JSON内`operationResponseHash`とdeferred exact一致させます。hash field自身をpreimageへ含む自己包含や未知fieldを落とした別projectionは拒否します。account deletion combined receiptはStorage subject digest値と`externalTombstoneHash`を物理列・strict JSON・署名preimageへ必須化し、同sequence tombstone、object key exact segment、immutable metadataとbyte exact一致させます。algorithm/key ID/rule versionはreceiptへ直持ちせず、署名済みtombstone hashから検証します。

通常の`draft.saved`で同一`(sessionId,questionId,questionVersionId)`かつ同じsession itemに実効attemptが既にある場合、serverはdraftを更新せず、`supersededByAttemptId`と`supersededByAttemptHash`をそのexact attemptへ結合したcanonical `superseded-by-answer` ACKを返します。別session、別question/version、同session内別itemのattemptをsupersessionに使いません。DB trigger/RPC/bootstrap/outbox replayは同じ複合keyとitem FKを使い、kill/restart後も確定回答からdraftへ巻き戻しません。

D-03はAで固定します。DR manifestは`restorePointMaxAgeDays=30`、`rpoHours=24`、`rtoHours=8`、`deletionSloHours=24`、`backupEffectivePurgeDays=30`を別fieldでpinします。live削除deadlineはDBで`acceptedAt + 24 hours` exact、30日はbackupからの実効消去期限です。challengeからcombined receiptまで両期限を物理保存・deferred exact一致させます。

## 2. 回答確定の原子処理

1. JWTから利用者を確定します。
2. `event_id`が既存で、同じ利用者・同じrequest hashなら保存済み結果を返します。異内容は拒否します。
3. セッション所有者、問題版、期限、停止状態を検証します。
4. 選択集合を正規化し、DB上の正答と比較します。
5. attemptをappendします。
6. 誤答・克服・復習段階を更新します。
7. 日次活動とセッション進捗を更新します。
8. すべてを1トランザクションでcommitします。

端末は正答集合を保持せず、`isCorrect`、grading status、score、訂正・無効化をサーバーcanonical response/changeから検証して適用します。client domainは選択集合から正誤を再計算せず、未同期回答を「採点待ち」として保持します。

## 3. ローカル保存

| 契機 | 端末 | サーバー |
|---|---|---|
| セッション開始 | 問題版・順番・選択肢順を保存 | セッション作成 |
| 選択・scroll変更 | 選択集合と`scrollOffset`を即時保存 | 500msデバウンス同期 |
| 回答確定 | pending attempt intentとoutboxを同一transaction保存。採点値は作らない | 即時同期しDB採点canonicalを返す |
| 次問表示 | 現在位置とscrollを保存 | 位置同期 |
| ブックマーク | 即時保存 | 非同期同期 |
| メモ | 即時保存 | 500msデバウンス同期 |

端末保存に失敗した場合は次問へ進ませません。

offline packのissue/consumeは通常sync eventへ偽装せず専用command outboxへoperation ID/request hashとstrict requestを保存します。issue ACKでpack/basis/reserved session/receiptを、consume ACKでsession/canonical event/receiptを同一local transactionへ適用します。kill/retryは同operation/hashで保存responseを取得し、別operationによる二重consumeを拒否します。

同じaccountのiOS/Android/Webは同じsession/item/attempt/fact ID、generation、sync/change cursorを使います。SQLiteとIndexedDBは同じstrict local DTOを保存し、responsive layoutやWebの複数tabはpresentation差として扱います。競合画面はowner本人へstrict local/remote bodyの時刻・選択と、client presentationがdevice IDから一時解決した表示ラベルを示せますが、表示ラベルをserver/audit/logへ送らず、client clockでserver revision順を決めません。

保存の用語は次に固定します。「この端末に保存」はoffline/kill復帰、「アカウントへ同期」はcross-device server正本、「運営のDR backup」は障害時のサービス復旧、「portable export」は本人の履歴downloadです。portable JSON/CSVへ問題文・選択肢・正答・解説を含めず、CSVはrestore入力にしません。

## 4. 同期状態

```text
SYNCED
  └─ローカル変更→ DIRTY_LOCAL
                    └─outbox追加→ QUEUED
                                  └─送信→ SYNCING
                                           ├─成功→ SYNCED
                                           ├─通信失敗→ QUEUED
                                           ├─認証切れ→ AUTH_REQUIRED
                                           └─版競合→ CONFLICT
```

## 5. Outbox

- 変更とoutboxイベントを同一端末DBトランザクションで作成します。
- 全イベントへUUIDの`event_id`を付けます。
- サーバーは`event_id`を一意制約とし、同じ利用者・同じrequest hashの再送だけを成功扱いにします。
- 同一entity内の送信順を維持します。
- 一時失敗は指数バックオフとジッターで再送します。
- 恒久エラーは無限再送せず、原因と復旧操作を表示します。
- 未送信中のログアウトはaccount namespaceを保持してmemoryからunloadするのを既定とします。明示破棄は件数・不可逆警告・再確認付きの別操作です。
- `discard-selection-basis` commandもoutboxのstrict unionへ格納し、command ID、basis ID、expected generation、strict reasonとrequest hashを同一端末transactionで永続化します。server canonical ACKのresponse hash/JSON、discard lifecycle fact ID/reason/timeを`local_command_receipts`とlifecycleへ同一transactionで適用するまでbasisをdiscard済みとして扱いません。

## 6. 競合

- 同じsession/questionへの別event二重確定はACKせず、同一intentならlocal eventを`SUPERSEDED`、異内容なら`CONFLICT`にします。解き直しは別sessionの新attemptです。
- ブックマークはlast-write-winsです。
- メモとドラフトは`revision`による楽観ロックです。
- 同一問題の未確定回答が衝突した場合だけ利用者へ選択を求めます。
- 端末名、更新日時、選択内容を表示し、採用されなかった内容も監査用に保持します。
