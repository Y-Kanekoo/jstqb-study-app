# 運用設計

## 1. 環境

- development: ローカルSupabase、サンプル問題
- staging: 本番同等、テストアカウント、レビュー候補
- production: 本人の実データ、公開問題

環境ごとにSupabaseプロジェクトと秘密情報を分離します。

## 2. バックアップ

- D-03はAで確定します。本番DB/Auth/private Storageを同一backup setとして日次backup/PITR対象にし、通常アクセス不能・KMS暗号化・最大restore point age 30日でrotationします。30日は復旧開始を待つ期間ではありません。事故検知直後に隔離復旧を開始し、RPO 24時間以内、RTO 8時間以内を必須目標にします。D-03 B/C用runtime capability、deployment branch、backup manifestをproductionで発行しません。
- 本番DBは正答key、問題/choice解説を含むauthoritative正本ごと暗号化します。このDR artifactはportable archive/exportとは別境界で、learner RPC、export job、download URLへ射影しません。backupは利用者が任意の時点へ戻す機能ではありません。
- environment control lock下でD03-A activation factを作ります。DR policyは`restorePointMaxAgeDays=30`、`rpoHours=24`、`rtoHours=8`、`deletionSloHours=24`、`backupEffectivePurgeDays=30`を固定します。live削除24時間とbackup実効消去30日を別deadline・別alertとして扱います。
- backup coordinatorは各backup setに一意な`consistencyBarrierId`を発行します。DB writeをquiesceするか、DB開始/終了LSN、Auth change upper bound、Storage object-version inventory upper boundを同barrierへ固定し、barrier前後の変更を一つのbackup setへ混在させません。
- backup manifestは両policy ID/body/hash、consistency barrier、DB/Auth/Storage上限、`deletionTombstoneUpperBound`、`accountDeletionLedgerUpperBound`、`deletionExternalArchiveUpperBound`を一組にします。全count/bytes/sequence/hoursをsafe integerへ制限し、DB列・strict JSON・RFC 8785署名preimageをexact一致させます。未知key、D03-A以外、30日超restore point、policy差替え、upper bound逆転、署名/hash/barrier不一致を復元前に拒否します。
- durable `account_deletion_ledger`はlive learner PIIとFK分離し、schemaVersion=`account-deletion-ledger-entry.v2`、API `AccountDeletionLedgerEntryV2`の単調sequence、deletion job、principal snapshot、subject digest version/issuer/algorithm/key ID/digest、exact全削除scope、受付/完了時刻、operation、main commit、signer/署名を全scope完了後だけappend-only保存します。全段のDeletionPolicyBindingはenvironment=`production`、activation fact ID/revision、snapshot ID/body/hash、保持期限/SLO期限を物理列・strict JSON・署名preimageでexact一致させます。各sequenceには`external-account-deletion-tombstone.v2`をexact一件結合します。external tombstoneはStorage subject digest値・algorithm=`HMAC-SHA-256`・subjectとは異なるStorage key IDを署名対象へ含め、その値を別key/domainから再計算してobject key/immutable metadataへ結合します。raw subject/user UUIDとraw由来prefixを保存しません。ledger entryとexternal tombstoneは同一外部objectへ格納し、archive sequenceを持つ一件のcombined `AccountDeletionArchiveReceiptV2`が物理`storageSubjectDigest`値、ledger/external tombstone両hash、policy binding、object version/etag/SHA-256をstrict JSON・署名preimageに保持します。receiptのStorage digest値はtombstone、object key exact segment、immutable metadata tupleとbyte exact一致させ、receipt確定までjobをcompletedにしません。
- 復元は外部公開されない隔離projectで即時開始し、DB/Auth/Storageを同じconsistency barrierへ揃えます。Storage object version inventoryとcombined deletion object/receiptを最大contiguous ledger sequenceまで検証・再適用します。Auth principalはcanonical issuer＋v2/version/key ID付きdomain-separated subject digest、Storage objectは`owner-subject-digest.v2`のdigestをobject keyのexact一segmentとimmutable metadata tupleの双方に持ち、その両方が一致するobject versionだけを照合します。client指定prefix、raw UUID部分一致、keyまたはmetadata片方だけの一致では削除しません。migration/ACL/RLS/RPC ACL/hash/cross-user/正答非開示/sync smokeが成功し、実RPO<=24h、実RTO<=8h、barrier不一致0、combined receipt gap 0、ledger/tombstone両hash不一致0、削除済みprincipal復活0をownerが承認した場合だけtrafficを切り替えます。
- 月次drillはbackup set/barrier ID、開始/終了時刻、DB開始/終了LSN、Auth/Storage upper bound、実RPO/RTO、件数/hash/ACL、deletion watermark、fallback結果を証跡化します。少なくとも四半期ごとにprimary DBの削除ledger/tombstoneを利用不能とした隔離条件で、外部署名objectとreceiptだけからsubject digest tupleを検証し、Auth/Storageの削除済み対象復活0を証明します。回答件数、未克服状態、復習予定、メモ件数、章projection hashも照合します。

combined archive receiptはschema literal、archive sequence、ledger sequence/entry hash、external tombstone hash、`storageSubjectDigest`値、deletion policy activation fact ID/revision/environment、policy ID/body/hash/両期限、archive system、object key/version/etag/SHA-256、archive/verify時刻、archive key/algorithmを`signature`以外のRFC 8785 JCS bytesへ固定し、別管理Ed25519 keyで署名します。Storage digestのalgorithm/key ID/rule versionはcombined receiptへ重複保持せず、署名済みtombstoneの`externalTombstoneHash`で拘束します。receiptの値はtombstone内値、object key segment、immutable metadataとbyte exact一致させます。object、ledger hash、external tombstone hash、Storage digest値、activation/policy tuple、receiptの一項目でも不一致なら削除job完了とD-03 AのDR昇格を拒否します。archive sequenceをdeletion external upper boundとして使用しません。

## 3. 監視

- アプリクラッシュ率
- 端末保存失敗
- outbox未送信件数と最古経過時間
- 認証失敗率
- API 5xx、timeout、RLS拒否
- 問題報告と緊急停止数
- D-03 Aの日次backup成功、restore point age、RPO/RTO、月次drill、live削除24時間SLO、backup退会data30日実効消去
- offline practice packの発行/consume/期限切れ/invalidated/hash不一致、offline outbox最古時刻、強制終了復帰失敗、端末/tab競合率
- `offline_unverified`参考模試のupload失敗とverified経路への混入0件
- owner-only reviewの認証拒否、recent-auth失敗、runtime state/revision/fact hash CAS失敗、same-operation replay、commit応答消失復帰、page/reveal件数、異常bulk取得、cache header違反、500件coverage/未解決issue
- 章進捗/readiness projection lag、source upper bound差、hash再構築不一致、TTL policy別expired件数、preview/offline_unverified混入0件
- runtime capability署名期限、migration/worker/RPC/ACL不一致、feature fail-closed件数
- restore/export/delete job滞留、lease fencing競合、deletion ledger未反映件数
- jobのlease expiry、`next_attempt_at`超過、dead-letter件数と、primary deletion ledgerから別障害領域archiveまでのsequence lag/hash不一致

ログへメール、回答、メモ、トークンを含めません。

## 4. 問題障害

1. 問題ID・版付きで報告を受け付けます。
2. UIのsuspend/retire要求はhuman recent-auth付きauthenticated enqueue receiptを作り、claim済みcontent-control jobへlinkします。internal実行はreauth NULLで、任意URL/client key、未claim job、authenticated direct callを拒否します。suspend global transactionはgraded未invalidated attempt、最新実効exam revision、最新offline result/feedback pair、未invalidated session itemだけを実効ID/hashと`sourceCommittedAt <= frozenAt`でfreezeし、過去/無効/not-graded/後着を除外します。
3. commit直後からdraft/answer/finalizer/feedback/catalog/owned-session/bootstrapがglobal statusを再検証します。全bootstrap sectionはowner/preview acceptance/version lockを取り、suspended/fanout pending/acceptance-revoked版をcontent-null tombstone、feedback 0件にします。clientはtombstoneまたはfact ID/hash付きitem invalidation適用時に同版本文/feedbackをpurgeし、basis ID/順序/lifecycle/hashは保持します。同一generation mergeでもserver terminal/content/tombstone/factを優先し、未ACK `session.created`、pending answer、draft/note/bookmark/issue未ACK mutation、未解決conflict以外をoverlayしません。basisはrow hash exact一致かつserver lifecycle=`unconsumed`だけをrebaseし、それ以外をquarantineします。
4. `suspension-fanout` workerは保存targetだけからfact ID/hash付きsession item invalidation、attempt invalidation、exam result revision、offline result/feedback revisionをappendし、member link/receiptを原子的に確定します。live再scanと後着追加を禁止します。offline revision 0のsource時刻はresult.createdAt、revision 1以上はimmutable revisedAtです。retireは影響current catalog membershipへexact一件のtombstoneをappendするだけで、session/basis/feedback/pinを失効せず、fanout/member/linkを0件にします。
5. operation/memberの対象数・set hash・execution contract hash・pin済みworker name/version/runtime capability、利用者別receiptのexpected/applied count、user member set hash、execution contract一致、4-kind件数/revision/result hash、全member materialization link、retry/dead-letterを監視します。kind別合計＝receipt合計、applied＝expected、全member/link/receipt exact一致の時だけfanoutをcompletedにします。新版を作成・レビューし、影響集計を再計算します。
6. user scopedなversion依存処理の唯一のlock順は`user advisory shared/exclusive → question version UUID byte昇順 shared/exclusive → aggregate/event advisory → session/attempt row → projection/materialized row`です。global suspendだけはversion exclusive lock中にuser lockを取らず、fanoutをcommit後の別transactionへ分離します。restore finalizeも参照する全versionをUUID byte昇順にshared lockし、suspended/revoked版をtombstone/invalidatedへ正規化します。
7. offline referenceは元結果を更新せずresult revisionとfeedback revisionを別々にappendします。result revisionは影響ordinalだけexcluded/nullへ変えてscore/denominatorを再計算し、feedback revisionは影響ordinalだけtombstone、非影響ordinalを直前値のまま保持します。双方とも0始まり全ordinal exactを必須にします。
8. 訂正内容と成績への影響を表示します。

## 5. リリース

- mainへの変更はCI合格を必須にします。
- required `database` checkはfresh、origin/main-shaped upgrade、combined migration order、異常注入時のatomic rollback、synthetic fixture production混入0の5 phaseをすべて実DBで完走させます。skip・部分成功・fixture canary検出時はrelease不可です。
- migrationはstagingで適用・ロールフォワード検証後に本番へ適用します。
- 本人利用問題はowner review・personal preview済みだけを有効化し、一般公開は4者attestation/public gateが別途満たされるまで無効のままにします。
- content releaseはcontrolled private artifact、private/独立canonical一致、`content-allocation-approval-artifact.v1`のauthenticated owner recent-auth記録、one-shot sampling/review、immutable manifestをprivate release storeで完了した後にだけstageします。content-control stage transactionがprivate object version/etag/raw hashを再検証し、DB canonicalを再計算してcontent import、import versions、review/provenance artifacts、manifestを同時appendします。manifest前のDB importとimportからmanifestへの逆FKを禁止します。human review coverageはsampling ID/hashと`reviewCoverageHash`へ一意に統合します。
- controlled artifactはbucket=`controlled-private-release`、content type=`application/json`、positive safe size、固定key/version/etag/raw hashをcreate-only保存します。stage/publish jobはenqueue receiptなし、suspend/retire jobはhuman operation IDと別のinternal operation IDを持つrecent-auth enqueue receiptへdeferred exact一対一結合します。enqueue receiptはrequested-by principal/human request/response hash、job/claimは別のoperation principal/internal request hashを保存し、双方をコピー・同一preimage扱いしません。一対一制約はjob/internal operation ID/kind/target/server mappingに限定します。保存済みinternal receipt replayではACL/operation ID/kind/internal principal/internal request hash一致をlease freshness・claim再消費より先に検証します。human recent-authはpersonal操作とUI suspend/retire enqueueだけで、stage/publish/suspend/retire internal receiptはreauth NULLです。
- 重大度0・1の不具合がある場合はリリースしません。
- リリース後に認証、演習、保存、同期、削除のスモークテストを行います。
- productionはpersonal-onlyです。本人account allowlist=1、self-sign-up=false、第三者invite/public registration=false、一般向けcontent publish=falseをruntime capabilityとAuth設定の両方で固定します。learner originとowner review originを分離し、review originにno-store/noindex/Service Workerなしを検査します。
- 本番featureは署名済み`runtime_capability_snapshots`のexact main SHA、migration/worker version、RPC signature、ACL evidence、old/new client smoke、runtime controlをすべて満たす時だけ有効化します。`content-release-v2`は`content-control` internal worker/専用roleと、DBに明示保存されたcryptographic release requirementの値を必須依存とします。値が明示falseならD-01のP0 recent-auth契約、明示trueなら`cryptographic-release-attestation-v1`完備時だけacceptance/attestation/stage/publishを許可し、欠落・未知値・署名不正をfalseへdefaultせずfeature OFFへ収束させます。publish/retire/suspendはcontent-control internal RPCへ統一しますが、暗号要件の未達だけを理由にglobal suspended statusのDB拒否や既に配備済みの緊急suspend開始RPCを無効化しません。content suspend operationは開始時のworker name=`suspension-fanout`、pin済みworker version、runtime capability snapshot ID/hash、execution contract hashをtarget setへpinします。各操作に必要なworker/RPC/ACLが未配備、pin不一致、期限切れ、署名不正、未知feature、依存不足なら当該操作をOFFのままにします。
- legacy sync bridgeとrestoreを同時に有効化しません。最低version展開、旧client利用0の30日観測、rollback window終了、旧outbox 0、v1 portable restore成功を確認したcutover transactionだけがbridgeをOFF、restoreをONへ切り替えます。
- runtime capabilityのclient向け応答だけはPUBLICをREVOKEした固定safe RPCをanon/authenticatedへgrantし、秘密、内部runtime control、ACL証跡、worker credential、任意table行を返しません。他のjob/status/download/receipt RPCはauthenticated限定です。
- ACL smokeは`service_role`を含む全接続roleによる基礎table直接SELECT/DMLの拒否を検証します。全`SECURITY DEFINER`関数はneutral NOLOGIN function-ownerが所有し、関数実行中のdefiner identityをcaller判定へ使用しません。client RPCはauthenticatedだけへEXECUTEをgrantして`auth.uid()`からownerを導出し、client `userId`を拒否します。internal RPCは用途ごとのexact専用NOLOGIN execution roleだけへgrantし、PUBLIC/anon/authenticated/service_role/他専用roleからREVOKEします。worker LOGIN roleは対応する一execution roleへだけ`SET ROLE`でき、内部RPCはclaim済みjob/member、lease/fencingを検証します。
- 管理者が本人issueのstatus/resolutionを変更する時はcurrent rowを直接履歴として扱わず、v2 transition registryの`open -> investigating/resolved/rejected`または`investigating -> resolved/rejected`だけを許可します。terminalからの再open、self/未知遷移を拒否し、open/investigatingはresolution null、resolved/rejectedはtrim後1～2,000文字を必須にします。`content_issue_update_facts`へfact ID、単調revision、prior fact ID、actor principal、reasonをappendし、同じtransactionで`issue.updated` changeとcurrent projectionを確定します。clientはfact ID/revision chainとcursorを一local transactionで適用します。
- empty-namespace restoreはportable payloadからsourceExportId/sourcePayloadHash、owner/user、actor principal digestとactor export pseudonymの別集合、0件を含むkind別全portable fact registry、content ref、session/event/command/basis集合を正規化子rowへ保存し、count/hash/setsHash/artifactHashを子rowからserver再計算してidentity artifactへ固定します。dry-run reportもsets JSON/hashを保存し、finalizeでpayload→artifact→report→reauth bindingを再計算一致させ、active basisを暗黙discardしません。materialization linkはlink ID/time/hashを持ち、session-item branchはfact ID/hash/session/item、remote-source branchはkind/ID/generation/sequence/revision/received/hashをlossless保存します。legacy v1 branchはsource generation NULL、legacy schema/event ID/sequence/fact hashだけを正本にし、canonical hashを生成しません。restored command archiveはexam.submit/session.abandon/exam.offline-referenceだけで、discard fact/request/receipt/lifecycleはvalidatorで拒否しarchive/linkへ保存しません。

- 通常`draft.saved`が実効attemptより後着した場合はdraftを非更新にし、実効attemptのID/hashを両方含むcanonical `superseded-by-answer` ACKへ収束します。kill/restart smokeで選択直後・回答直後・ACK前を反復し、bootstrap後も確定回答からdraftへ巻き戻らないことを確認します。

- negative evidenceは単なる失敗ログではなく、fixture ID、対象environment/main SHA/migration set/runtime capability、実行RPC/role、期待SQLSTATE・error code、観測行数/hash、DB不変性snapshot、開始/終了時刻、runner versionをstrict署名artifactとして保存します。少なくともhuman response hash自己包含・JSON field不一致、policy environment/schemaVersion、combined receiptのStorage digest欠落またはtombstone/object-key/metadataとの差替え、controlled artifactのbucket/type/size違反、human/internal principal・preimage混同、identity子row欠落/0件registry省略、legacy canonical hash補造、acceptance-revoked本文再配布、同generation terminal復活、basis mismatch overlay、remote-source generation/hash欠落、retireのfanout/link生成、session invalidation session/fact ID/hash差替え、draftのattempt hash欠落を各独立fixtureで拒否し、拒否後の基礎行・cursor・job状態が不変であることを確認します。TS/SQL共通goldenではhuman responseの`operationResponseHash`除外preimage、policy binding、receipt/tombstone/Storage digest/object metadata、identity set/value/link hash、human/internal各preimageをbyte exact照合します。negative testが想定外成功、期待error不一致、証跡欠落なら`database`/release gateを失敗させます。
- RPCのpublic errorは固定code、利用者向け短文、再試行可否・安全な復旧actionだけを返します。SQLSTATE、constraint/table/column、stack、internal principal/job/lease、policy/digest/key、private object tupleは内部監査証跡だけに保存し、画面表示や`aria-live`/読み上げへ出しません。A11y通知は同じ安全な短文で失敗と復旧操作を一度だけ伝え、保存済み回答やterminal状態を成功表示へ戻しません。

## 6. アカウント削除

- アプリ内とWebから削除要求を開始できます。
- 削除前に再認証を要求します。
- 認証、プロフィール、回答、メモ、端末、同期データを削除します。
- 保持が必要な監査データがある場合は匿名化と保持期間を明示します。
- account deletion workerはexclusive user lock下でDB/Auth/Storageを冪等削除し、`deletion_slo_deadline_at=accepted_at+24h`までにlive scopeと外部combined receiptを完了します。backupの`deletion_retention_expires_at=accepted_at+30d`は別worker/rotationが検証し、live jobを30日pendingにしません。subject/Storage digest、ledger/tombstone/receiptの既存exact bindingを維持します。
- Auth削除後のstatus確認は、受付前に発行した24時間TTLのreceipt capabilityだけを使う専用endpointで行います。token hashだけをDBへ保存し、job binding、IP/token rate limit、完了/期限時revokeを適用します。pending/completed/failed、ledger/archive receipt hash以外のPII・object key・内部errorを返しません。
- DR manifestの`deletionExternalArchiveUpperBound`はarchive sequenceでなく、combined receiptでledger/external tombstone両hash一致を確認済みの最大contiguous primary ledger sequenceです。external upper boundがprimary ledger/tombstone upper bound以上で、schema v2、subject digest version/issuer/algorithm/key ID/storage namespace rule、combined object receiptにgap 0でない限りtrafficを開始しません。
- D-03 AのDR復元ではprimary DB喪失を前提に、backup内upper boundとその後のexternal combined object/receiptをtraffic開始前に連続再生し、削除済みaccount・Storage object・署名export downloadを復活させません。削除受付から30日を超える復元可能copyが発見された場合はtraffic切替を拒否し、privacy incidentとして扱います。

## 7. 保存説明・受入・実装順

利用者向けには「この端末に保存」「アカウントへ同期」「運営の障害復旧用backup」「自分でdownloadするportable export」を別々に表示します。端末保存はoffline/強制終了復帰、同期は複数端末継続、DRはサービス障害復旧、portableは本人持出しです。DRを本人のundo機能、同期をbackup、portable CSVをrestore形式として説明しません。

必須受入は次です。

- cached問題の次問表示p95 300ms以内、選択後local永続化p95 200ms以内、通常回線のanswer同期p95 3秒以内。選択直後/確定直後/次問表示直後のkill/restartを反復し、draft、pending answer、current position欠損0。
- 専用issue/consume RPCでoffline practice packを発行・消費し、1 pack=1 basis=1 reserved session、各operation ID/request/response hash/strict response JSON/receipt ID、atomic consume、同operation replayを照合する。100回答を機内modeで保存し、再起動と再接続を跨いで欠損/重複0。packに正答/解説/feedback 0、通常sync ingest迂回、別owner/generation・期限切れ未開始・suspended/revoked版のconsumeを拒否し、2端末/Web複数tab競合で実効attemptを無言上書きしない。
- 厳格模試はDB時計40問/60分/26点、`offline_unverified`は「参考結果（端末時刻・未検証）」固定で正式合否/SRS/readinessへの行数0。
- 7 owner review RPCのACL matrixを実roleで検査し、authenticated ownerだけ成功、PUBLIC/anon/service_role/一般learner/adminは全て非識別拒否にする。transition responseの`transitionReceiptId`/`operationResponseHash`、DB strict bytes、local receipt、same-op replayをexact照合し、応答消失/reloadを復旧する。
- projection/readiness双方のexpiresAt/ttlPolicyVersionとhash preimage、projection exact FKを再計算する。DB時計の期限直前だけ成功、exact境界/直後はexpiredかつstate不変。DataGenerationはDB/local/APIで1..9007199254740991のnumber exactとし、文字列/小数/0/負数/2^53以上を拒否する。
- allocationのDB CHECK、migration contract、RFC 8785 JCS/hash、synthetic fixtureはrounding literal `floor-then-largest-fractional-remainder-chapter-number-ascending-tie-break`だけを許可し、同率を章番号昇順で解決した500問配分をexact照合する。
- 月次restore drillでRPO<=24h、RTO<=8h、最大restore point age<=30日、削除chain gap 0、退会data復活0、30日超復元可能copy 0を署名証跡化する。
- 同じaccount/sessionをスマホとWebで交互に再開し、問題、選択、scroll、確定回答、競合、章projectionが一致する。breakpoint変更はpresentationだけを変えdomain ID/revision/hashを変えない。

PR依存順は、PR-A（D03-A schema/ACL/runtime capability/DR policy）→PR-B（offline pack/local/outbox/offline_unverified）→PR-C（owner review origin/RPC/AI・owner coverage）→PR-D（章/readiness projection/API）→PR-E（スマホ/Web adaptive UIと平易な保存説明）→PR-F（監視、restore drill、受入証跡、personal-only deploy）です。常にDB migration/RPCをclientより先に配備し、各capabilityは対応worker・ACL・negative evidenceが揃うまでOFFにします。
