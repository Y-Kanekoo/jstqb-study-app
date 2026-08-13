# テスト計画

## 1. 自動テスト

| レベル | 対象 |
|---|---|
| 静的 | TypeScript、lint、`any`、秘密情報 |
| 単体 | 採点、複数選択、克服、間隔反復、集計 |
| 状態遷移 | セッション、回答、同期、競合 |
| プロパティ | イベント重複、順序変更、再送 |
| DB | 制約、migration、RLS、版不変性 |
| API契約 | 正常、認証切れ、競合、部分失敗 |
| 統合 | 端末DB、outbox、オフライン復帰 |
| Web E2E | 認証、演習、誤答、再開、削除 |
| モバイルE2E | バックグラウンド、強制終了、通信切替 |
| アクセシビリティ | 自動検査、読み上げ、キーボード |
| ビジュアル | 主要画面、文字200%、各幅、障害状態 |
| コンテンツ | schema、正答数、根拠、重複、解説 |

既存テストを要件変更のために書き換えず、実装側で解決します。

DB試験はPRごとに必須check `database`でliteral 5 phaseを同じexact migration headへ実行します。(1)`fresh`、(2)`origin-main-upgrade`、(3)`combined-order`、(4)`atomic-failure`、(5)`production-boundary`です。各phaseで実DBのRLS、default privileges、SECURITY DEFINER owner/search_path、関数EXECUTEを照合し、anon/authenticated owner/一般learner/service_role/worker各roleのpositive/negative matrixを実行します。一phaseでもskip/失敗ならdatabase checkとruntime capabilityを発行しません。harness/capability実装は後続DB/tooling PRで追加し、既存migration/testは本設計PRで変更しません。

M1追加migrationのfresh/upgrade pgTAPはlegacy base attemptの無効化列をappend-only invalidation factへexact移行し、M1後のbase UPDATE/DELETE trigger拒否と`effective_answer_attempts`同値を検証します。orphan/矛盾/重複fixtureではschema/data/migration履歴を完全rollbackし、初期migrationを変更しません。

## 2. 保存・再開の受入

1. 選択直後の強制終了で未確定選択を復元できる。
2. 1問確定直後の終了で履歴へ1回だけ反映される。
3. 10問完了前でも確定回答が保存される。
4. ホームから1操作で再開できる。
5. Webの未確定回答をスマートフォンで再開できる。
6. オフライン100回答の同期で欠損・重複がない。
7. 同じeventを複数回再送しても二重計上しない。
8. 複数端末競合で回答が無言で失われない。
9. 端末保存失敗時は次問へ進まない。
10. DB発行selection basisのsync/change上限を跨ぐ変更があっても、同じbasisの候補membershipは不変である。
11. offline pendingをbasisへ混ぜず、同期後の新basisでのみ候補へ反映する。
12. 40問session作成後に1問題がsuspendされても、そのitemだけsupersedeされ残る正常39回答が欠損なく同期する。
13. basis発行直後にcatalog改訂・retire・projection前進が発生しても、DB保存済みsafe内容・順序・choice orderでsessionを作成でき、client任意問題へ差し替えられない。
14. offline新規通常演習は同session IDへ事前発行・durable保存済みの未consume basisだけを許可し、basisなし/cached catalogだけでは開始できない。
15. M1の`legacy_compatibility`18問は既存session hydrationだけ成功し、新規basis/session、模試、正式SRS・分析、500問countへ0件である。
16. 新端末bootstrapは全section/pageの件数・hash・scope別cursorが一致する時だけlocal stateを一括交換し、一page欠落時は旧local stateを不変にする。
17. restore後の旧generationでexam state、projection、catalog、owned session、feedbackを読むと全件拒否され、現generation cacheへ混入しない。
18. 複数session・aggregateに分けたoffline 100回答を依存順に同期し、欠損・重複・無関係aggregate停止がない。
19. ACK済みだがfeedback未取得の回答で強制終了し、offline再起動しても回答lock、attempt参照、履歴、現在位置、projectionを復元する。
20. generation discoveryからbootstrapを開始し、attempt/exam/lifecycle/offline-reference全履歴とglobal/content scope別partitionのcount/hash/ordinalを検証する。scope欠落、page重複、期限切れではatomic swapしない。
21. server changeのimmutable fact ID、kind、content ref、prior fact ID、server sequence/timeを通常pull、full bootstrap、portable export、restore後bootstrapで全値一致させ、欠落・ID再発行・history圧縮を拒否する。
22. `issue.updated` changeを作成者本人と管理者の許可された`open -> investigating|resolved|rejected`または`investigating -> resolved|rejected`だけで発行し、terminalからの巻戻しを拒否する。issue ID、fact ID、prior chain、old/new status、trim後non-empty reason、server時刻を履歴へ再構築し、操作actorはserver-side principal snapshotへ結合、portable export時だけactor mapへlossless射影する。他user、未知遷移、操作actor欠落を拒否する。各状態の固定UI文言、競合文言、同一画面初回だけの状態見出しfocus、別画面でfocusを奪わない`polite`通知をWeb/VoiceOver/TalkBackで検証する。
23. 未consume selection basisを明示discardするとappend-only discard factとterminal responseが一回だけ作られ、その後のconsume・session作成を拒否する。同じdiscardの再送は同じcanonical responseへ収束し、本文・choices・正答をaudit/exportへ出さない。
24. full bootstrapの`selection-bases` partitionは発行済み/unconsumed、consume済み、discard済みの全lifecycle、source revision/hash、terminal fact、command receipt、発行時の回答前safe prompt/choices snapshotを全branchでstrict DTOへlosslessに返す。consume/session開始できるのはunconsumedだけで、consumed/discarded snapshotはread-onlyとする。正答/正答boolean/解説/feedbackは全branchで0件とする。0件partitionもmanifestへ含め、欠落・重複・未知field時はlocal stateと全cursorを不変にする。portable exportはsession参照済みのconsume済みbasisだけをbasis ID/version/ordinal/choice order/consumed event IDで保持し、未consume・discard済みbasis、discard fact/audit、prompt/body/choicesを0件にする。取得後local transaction commit直前・直後のkill/restartでbasis、receipt、cursorが全件または0件に収束する。
25. data generation変更を検知したbootstrapは旧generationのsession、outbox、command receipt、selection basis、cursor、pending intent、conflict/historyをread-only stale-generation quarantineへlosslessに一括退避する。quarantine直前・直後・current snapshot swap直前の各kill/restartで旧write再送0、暗黙ACK 0、current namespaceへのoverlay 0、既存quarantine欠損0へ収束する。
26. stale clientがclient ingestへ`origin='server'`またはserver専用kindを送るfixture、client-origin eventのorigin欠落・差替え、古いcontractのoutbox再送を実DBで拒否する。originはkind/ingest経路からserverが確定し、client入力から採用しない。端末は拒否済みoutboxをserver-origin/current schemaへ書換えずstale namespaceへ隔離し、更新要求文言を表示したままserver state、cursor、ACKを不変にする。
27. 通常演習の端末Aが回答を確定した後、端末Bの古い`draft.saved`を到着させる。supersession keyはexact `(sessionId,questionId,questionVersionId)`かつ同じsession itemで、DB trigger/RPC/bootstrap/outboxが同じattempt ID/hashへ収束する。sessionだけ、questionだけ、旧version、別itemを一致させたnegative fixtureはsupersedeせずstate不変。同event replay、ACK前、kill/restart、bootstrap後もattempt一件、pending/conflict 0、再送loop 0とする。
28. bootstrap/cold resumeで同一suspended versionをcatalog/session/selection-basesの三partitionとfanout pendingへ配置し、本文・choices・feedbackを持たないtombstone unionだけへ一local transactionで交換する。selection basisのserver原本/source hashは不変のまま、端末content cache、draft、fanout pending payloadから本文・choices・feedbackが0件になることを検証する。各partition取得後、purge途中、cursor swap前後のkill/restart、欠落/hash不一致では三者の部分適用を拒否する。
29. 一つのsession item invalidationについて`session.item-invalidated` change、full bootstrap、portable fact、restore materialization link、local active/history、stale-generation quarantineが同じimmutable fact ID/hashを参照することを照合する。一箇所のID/hash再発行・追加・欠落・差替え、restore先での新fact生成、local currentとquarantineでの二重identityを拒否する。
30. acceptance revoke後のfull bootstrap/cold resumeは対象acceptanceのsession、selection basis、catalogを本文・choices・feedbackなしの失効tombstoneとしてだけ返し、safe snapshotやcatalog questionを0件再配布する。端末は三partitionとcontent cache/draft/fanout pendingを一local transactionでpurgeし、partition欠落・owner差替え・旧cursor replayでも本文復活0とする。
31. 同じdata generation内でserver lifecycleがterminal、localがactive/paused/draft pendingのfixtureを作り、bootstrapではserver lifecycleを優先してlocal不一致をread-only quarantineへ隔離する。completed、abandoned、invalidated、acceptance-revokedの各branch、swap各write間のkill/restart、同snapshot replayでterminal session/basis/catalogの復活、旧outbox再送、current overlayを0件にする。

## 3. 誤答復習の受入

1. 誤答後に未克服へ入る。
2. 異なるセッションで2回連続正解すると克服する。
3. 克服後の再誤答で未克服へ戻る。
4. 全誤答条件では克服済みも取得できる。
5. 対象不足時に実数を開始前表示する。
6. 0件時に代替学習を提示する。
7. 停止・廃止問題を出題しない。
8. breaking改訂で旧履歴を保持したままneeds revalidationとなり、新版正解でstage 0へ再開する。
9. previewの誤答・復習・日次活動が同じacceptanceだけへ反映され、正式指標は全値不変である。
10. breaking再確認で9分59秒の誤答は`needs_revalidation=true`のままremediationを10分後へ延長し、10分到達後の新版正解だけがstage 0/+1日へ進める。

## 4. 模試・採点の受入

1. 複数選択は正解集合完全一致のみ正解。
2. 即時採点は確定前に正答を表示しない。
3. 模試は提出前に正答・解説を表示しない。
4. アプリを閉じても60分タイマーが止まらない。
5. 有効分母exact 40で26/40以上なら合格判定になる。
6. 停止問題は得点分母から除外され、分母40未満では合否`null`・結果`invalidated`になる。
7. row lock待ち中に期限を跨ぐdraftは`clock_timestamp()`で期限後扱いとなる。
8. manual submit、read、sweeperの同時実行がterminal/item result/attempt/session完了を各1件へ収束させる。
9. offline参考模試は保存済みpolicyが許可する本人だけ提出でき、item別feedbackを返すが正式attempt/SRS/分析を変えない。
10. 提出済み模試の未回答40問を`answered=false/isCorrect=null`かつ`exam-session` sourceで返し、session/result revision/ordinal別cache keyが別模試と衝突しない。
11. answer済み、未回答、suspended/revokedのfeedback 3 branchは余剰fieldを拒否し、結果改訂時に旧revision cacheを同local transactionでpurgeする。
12. active sessionの一問suspendでitem invalidation、依存outbox supersede、本文/feedback purge、answerable count、session status、change cursorが一local transactionで収束する。
13. correction/invalidation changeはID、prior chain、old/new outcome、reason、server時刻を欠落なくbootstrap/local履歴へ再構築する。
14. offline reference確定後の停止/revokeでは元terminal fact/resultを不変にし、別々のappend-only result revisionとfeedback revisionを作る。result revisionは全ordinal exactを保持し、影響itemだけ`excluded=true/isCorrect=null/score=null`、非影響itemをbit-for-bit保持してeffective score/denominatorを再計算する。feedback revisionも全ordinal exactを保持し、影響ordinalだけ`Unavailable` tombstone、非影響ordinalは既存answered/unanswered branchを保持する。影響一件だけのfixtureで全ordinal tombstone化、ordinal欠落、元fact update、revision parent違い、resultだけ/feedbackだけの部分可視化を拒否する。tombstoneには本文・choices・正答・解説を含めない。
15. 期限後draftは`exam_input_closed`のcanonical ACKと保存済みterminal responseを同じlocal transactionで適用し、outboxを終了させる。ACK適用直後、terminal response適用直後のkill/restartでも再送loopやpre-deadline draft/採点入力の上書きがない。
16. 通常模試の完全`resultRevision`、offline参考模試の同一parentへ結合された完全result/feedback revision pairを初回atomic適用した時だけ、表示中の画面/modalにかかわらず現在focusを維持して`role=status`/`aria-live=polite`で理由・実効得点/分母・合否をexact一回通知する。別画面/modalはfocus移動0かつ通知exact一回、offlineの片方だけは通知0、rerender、retry、bootstrap replay、同revision再受信は再通知0となることをWeb/VoiceOver/TalkBackで検証する。汎用文言「結果を更新しました」だけへの縮退、理由・実効得点/分母・合否・live-region属性のいずれかの省略をnegative fixtureで拒否する。

## 5. Preview・Export/Restoreの受入

1. 複数acceptanceのうちactive selection exact 1件だけがcatalog overlayへ出る。
2. preview切替競合、旧cache、別owner、revokeを拒否し、既存sessionは開始時pinで安全に再開する。
3. server portable exportの署名、payload hash、owner、fact間FK、event同値性を検証する。
4. 端末pre-answer snapshotをrestore入力として拒否する。
5. suspended版の本文をexportから再導入せず、owned-session tombstoneへ再hydrateする。
6. correction/invalidation/exam terminal/timezone/local dateを含む復元後projectionがexport元と一致する。
7. v1 read-only canonical factは`sourceDataGeneration=null`かつ`sourceKind='legacy-sync-event'`のstrict unionだけで専用archiveへ復元する。`legacySchema='learning-sync.v1'`、original event ID/source sequence、`sourceLegacyFactHash`をbyte-for-byte保持し、v2 event/outbox/ACKへ変換しない。legacy branchへnon-null generationを補う、original ID/sequenceを再発行する、legacy fact hashからv2 request/canonical hashを捏造する、またはv2 branch fieldを混在させるfixtureを拒否する。
8. 空でない学習namespaceへのrestoreをdry-runとfinalizeの両方で拒否し、失敗時にlive row・generation・job applied状態を変えない。consume済みbasisと未consume・未discard basisはnon-empty、discard済み未consume basisとそのdiscard auditだけはtarget空判定のblocking集合から除外する。dry-run responseは`sourceIdentitySets`としてsession/event/command/selection basisの全source ID集合を種別ごとの件数・集合hashで拘束し、target generationのactive basis集合がemptyの時だけfinalizeを許可する。finalizeはreport hashと同じ`sourceIdentitySets`を検証するだけで、source/target basisをconsume、discard、session適用しない。dry-run後にactive basisが一件でも現れる競合、一IDの追加・欠落・差替え、report hash変更、再認証grantの別対象流用を拒否する。
9. portable JSON復元後のfull bootstrapがcurrent generationのscope別cursorから開始し、旧source sequenceをcurrent streamへ再発行しない。
10. CSVはUTF-8/RFC 4180、固定file/header、formula injection・CR/LF・quoteをbyte単位で検査し、restore入力として拒否する。
11. reauth grantはpurpose/target hashへ結合し、別format・upload・job・report・challenge・content hashへの差替えと二回使用を拒否する。
12. portable selection basisのitemへprompt/body/choicesを混入するとstrict schemaで拒否し、private-preview canaryがexport bytesへ0件である。
13. restore targetが空でない時はUIに確定操作を出さず、legacy cutover・production capability未達時はrestore機能を有効化しない。
14. restoreはsource event/commandをsource generationのarchiveへ、current domain rowをtarget generationへ保存する。全`restore_materialization_links`についてrestore job ID、user、source kind/ID/hash/data generation、target data generation/kind/ID/hash、branch metadataをlosslessにround-tripし、物理source row・archive row・target parent/child rowへexact結合する。`sourceIdentitySets`のcount/hashとsummaryは物理child rowから導出して自己申告値を信用せず、session invalidation factのfact ID/kind/prior fact ID/server sequence/server time/content ref/reasonとlink列を全値照合する。物理childの追加・欠落・swap、summaryだけの差替え、metadata欠落・重複、source/target差替え、current stream再発行を拒否する。
15. account deletionのsubject lookupは`HMAC-SHA-256(K, UTF8("jstqb-account-deletion-subject-v2") || 0x00 || UTF8(canonicalIssuer) || 0x00 || UTF8(subject))`だけを許可する。全段で共有する`DeletionPolicyBinding`は`environment='production'`、D-03 Aのdeletion activation fact ID/revision、policy snapshot ID/body/hashを持ち、challenge、receipt、status、version付きledger entry、external tombstone、combined archive receipt、D-03 A DR manifestへbyte-for-byte同一でなければならない。Storage owner digestは`HMAC-SHA-256(K, UTF8("jstqb-storage-owner-subject-v2") || 0x00 || UTF8(canonicalIssuer) || 0x00 || UTF8(subject))`へ分離する。external tombstoneは署名対象の`storageSubjectDigest`値・algorithm・key ID/versionを持ち、combined archive receipt自身は同じ`storageSubjectDigest`値と`externalTombstoneHash`だけを持つ。algorithm/key tupleはreceiptへ複製せず、署名済みexternal tombstoneのhashで拘束する。同じdigest値をexternal tombstone、combined receipt、object keyのexact一segment、immutable metadata tupleの四者でbyte-for-byte一致させ、各署名preimageと独立goldenから再計算する。受付時にpinしたD-03 A policy ID/version/hash、deletion activation fact ID/revision、DB snapshot ID/body/hashを全段exact一致させ、DB時刻からlive DB/Auth/Storage削除deadline 24時間とbackup実効消去deadline 30日を別fieldで一回だけ算出する。両deadlineのswap、同一fieldへの縮退、24時間をbackup期限とする表示、30日間live accessを残す実装、job途中の延長、policy差替え、期限後のlive object残留を拒否する。D-03 B/Cのpolicy/capability/manifest/CTAは0件とし、B/C ID入力はunsupported policyで拒否する。issuer別名、domain byte欠落、key ID/rule version差替え、raw subject/user UUID、emailまたはそのprefixをledger/tombstone/archive DTO・Storage key/metadata・logへ保存する実装、digestの部分一致、combined receiptのdigest/`externalTombstoneHash`欠落・1-bit差、四者の一つだけ差替えを拒否する。署名済みledger entryと同sequenceのexternal tombstoneの両hashを一つのarchive receiptが結合しない、sequence gap、ledger `schemaVersion`欠落、object version/etag/SHA-256・署名不一致、未完了scopeを含むDR backupはtraffic切替を拒否する。
16. portable actor mapは公開saltから全pseudonymを再計算し、全correction/invalidation/acceptance revocation/`issue.updated`参照のexact coverage、unused map 0、pseudonymous principal snapshot/materialization link一意性を検証する。global content release actorが混入した場合は拒否する。
17. account削除後は期限付きreceipt tokenだけでsanitized statusを取得でき、別job差替え、期限切れ、revoked token、rate limit超過、PII/内部object key返却を拒否する。
18. D-03 Aでprimary DBのdeletion ledger/tombstone行をともに失った隔離restore fixtureを使い、旧backupのcanonical issuer＋auth subject候補からHMAC v2を再計算し、独立external archiveの署名済みledger/tombstone objectと両hash combined receipt、連続sequence、ledger `schemaVersion`、共通`DeletionPolicyBinding`、external tombstoneの`storageSubjectDigest`値・algorithm・key ID/version、combined receiptの同digest値・`externalTombstoneHash`、object key segment、immutable metadata、object version/etag/SHA-256、署名をgoldenへ一致させて全削除をDB/Auth/Storageへtraffic前に再適用する。combined receiptへalgorithm/key tupleを要求せず、digest値をtombstone、object key segment、metadataと再照合し、tupleは`externalTombstoneHash`から検証する。receipt/tombstone各署名preimageも独立goldenへ一致させる。object keyだけまたはmetadataだけの一致、combined digest/hash欠落・1-bit差、digest algorithm/key差替え、binding差替え、署名対象外field、再削除前のtraffic切替を拒否する。B/C restore source/API/job/capability/manifestは0件でなければならない。
19. 運用DRはglobal content releaseのauthor/technical/editorial/final、attestation/revocation/approval、公開鍵、別自然人関係を`principal_snapshots`とrelease auditからexact復元する。learner portable exportへglobal release actorを混入させず、個人actor mapとは別のDR境界で欠落・役割差替え・鍵差替えを拒否する。
20. D-03 Aのpolicy ID/versionを受付・receipt・provider/DR evidenceへ結合し、通常領域削除24時間とbackup実効消去30日を別行・別status・別deadlineでWeb/VoiceOver/TalkBackへ表示する。24時間でbackupも消去済みとする表示、30日間live利用可能とする表示、deadline欠落・swapを拒否する。B/Cのpolicy/capability/manifest/設定選択肢/CTAは0件、直接入力はfail closedであることを検査し、B/Cをpositive受入へ含めない。

## 6. コンテンツ・運用の受入

1. `content-blueprint-v1.md`の64 LO、500問、章/K、single/multiple、multiple章/K/必要選択数をliteral registryでexact検証する。
2. `ContentPrivateQuestionV3`のunknown/空/重複/未登録enum、LO permitted list外のfact/artifact kind、required list外の`answerRelevance='required'`、K2/K3 required不足、premise対応不成立、generic true-but-unrelated choiceを拒否する。K1はrequired exact 0でもpermitted list内context fact/artifactを受理し、required件数とpermitted kindsを混同しない。
3. D-04未決定中はpersonal/public manifest、stage、preview activation、content-control job、対応runtime capabilityが全て0件である。owner本人がpurpose-bound recent-authで`ContentAllocationApprovalArtifactV1`をappend-only確定し、allocation version/hashへexact結合した後だけ初期personal経路を開始する。approval欠落・別owner・期限切れgrant・hash差替えでは全経路0件を維持する。public manifest/job/capabilityはその後も0件で、将来のpublic review、4者attestation、parent personal hash等の全public gate後だけpublic immutable bytes/hashを作り、旧personal acceptanceを更新しない。
4. DB/private/独立canonicalizerがraw/canonical/manifest stageを照合し、source-only変更・正答swap・順序変更・stable key衝突を検出する。
5. D-03 Aでは別々にversion/hash固定したDR policyとaccount deletion policy、deletion activation fact ID/revision、DB/Auth/Storage/deletion ledgerの各consistency upper bound、復旧RTO/RPO・traffic再開SLO、content-control artifact/job/claim、migration/inventory/ciphertext/KMS/署名を持つbackup manifestを使い隔離環境restore drillを行う。restoreの`sourceIdentitySets`はsession/event/command/selection-basisの全集合count/hashと物理source/archive/target row・全materialization linkへ一致させ、discard済みbasis/fact/auditがportable inputに0件であること、復旧後のcross-user拒否・正答非開示・同期smokeを確認する。D-03 B/Cのpolicy/capability/manifest/restore経路/CTAは存在せず、入力を拒否するnegative fixtureだけを持つ。
6. `content-blueprint-v1.md` §3.2.1をquality/review補助hashの唯一の正本としてinteger basis-points quality gate、quota別pattern family、choice位置、類似度の境界値をliteral fixtureで検証する。personal/publicとも8199をthreshold未満、8200以上をrejectとし、例外承認・override RPC/field/tableが存在しないことをschema/ACL/UIで確認する。
7. 全数値問題を固定formula registryと独立oracle runnerで再計算し、artifact entryの`(questionStableId,versionStableKey,claimKey)`をunique/sortする。formula ID/unit variant、input keyごとのexact kind/unit/integer-sign-zero domain、cross constraint、scalar/rational/rational-list inputs、中間値、rounding mode/scale、scalar/ordered-set expected/oracle値、result unit、全choice bindingを`ClaimCalculationV1`とlosslessに照合する。`PrivateChoiceV3.relevantClaimKeys`がclaimを含むchoice集合とbinding集合をexact一致させ、未知/余剰key、scalar-countへの非整数/負値、positiveへの0、hour/day混在、covered>total、step<=0、lower>upper、impossible>=product、O>M/P、binding不足・余剰の各negative fixtureでmanifest生成を拒否する。
8. client deployは必要migration/worker capability、RPC signature、ACL、runtime flag、old/new smokeを満たさない限り機能を公開しない。runtime capabilityごとにanon/learner/reviewer/admin/serviceのRPC・table・worker enqueue権限matrixを実DBで照合し、署名済みcapabilityがONでもACL未達なら全操作をfail closedにする。
9. private source→DB基礎行→canonical DTOを全field round-tripし、section、choice意味field、reasoning explanation、provenance V2の欠落・余剰を拒否する。
10. reasoning step 1～12を数値昇順で同一bytes/hashへ正規化し、欠番・重複・文字列順を拒否する。
11. 正答booleanのauthoring/direct writeを拒否し、legacy mirrorとanswer keyの矛盾状態をtransaction終端で生成不能にする。
12. runtime capabilityの期限切れ、署名不正、main SHA/RPC/ACL/smoke不一致、未知feature、legacy bridge＋restore同時trueを拒否する。
13. 64 LO registryから生成したtype/runtime schema digestをprivate/API/DB/独立runnerで一致させ、未登録LO literalを全経路で拒否する。
14. identity assertionの署名、issuer trust key、human actor、purpose/audience、recent-auth時刻、期限、nonce一回使用、principal一致を検証し、machine/別audience/期限切れ/replayを拒否する。
15. copyright corpus registryをID/digest/scope/as-of/license review artifactでfreezeし、corpus別count exact一対一、detected source FK、registry差替えを検査する。
16. identity assertionの署名対象へcontent ref、subject hash、statement version/hashを含め、statement registry digest、base64url no-paddingのnonce/public key/signature decode長32/32/64 bytes、A/B swap拒否をliteral fixtureで検証する。service assertionを自然人の否認防止署名とするmetadata/UI表示を拒否する。
17. allocation/approval/blueprint/quality/corpus/sampling/review/identity/accountability/provenance/oracle/coverageの全補助hashを`content-blueprint-v1.md` §3.2.1のexact preimage、除外field、規定配列順だけで再計算し、literal JCS bytes/UTF-8 hex/SHA-256 goldenへ一致させる。review artifactは`artifactHash`だけを自己除外し、存在しない`reviewArtifactHash`/`artifactId`、配列swap、1 bit変更、Unicode暗黙正規化、未知field、重複refを拒否する。
18. personal human review集合を、canonical/blueprint/allocation/quality-gateと候補stratumのfreeze後にservice CSPRNGで一度だけ発行・署名した完全sampling artifactから再計算する。artifactの`canonicalHash/blueprintHash/allocationHash/qualityGateConfigHash/samplingFreezeHash`、seed、全population/rank/cutoff/mandatory/final集合をlosslessに照合し、同じfreezeへの再発行、content hash由来seed、seed候補選別、署名差替えを拒否する。domain separatorは`UTF8("literal") || 0x00 || JCS(...)`としてK1/K2各chapter/K/selection stratumのceil 20%、全K3、全multiple、全blind disagreement、carry-forward、重複除去を満たす。
19. content suspend workerはexclusive version lock下の`frozenAt`で、`sourceCommittedAt <= frozenAt`の進行中pin item、有効かつ`graded`のattempt、各模試のlatest effective result revision、各offline参考模試のlatest effective result/feedback pairだけからimmutable target snapshot/hashを作り、全user/cacheへ冪等fanoutする。後続result revisionの`sourceCommittedAt`をimmutable `revised_at`へexact一致させ、過去・訂正/無効化済み・`not_graded`・latestでないrevision・片側だけのoffline pairを除外するfixtureと、`revised_at`が`frozenAt`の直前/同値/直後となるfixtureでmembershipをexact照合する。各materializationはoperation ID・target member ID・生成fact/revision IDを一意に結合するappend-only linkとtarget payload/result hashを持ち、user/global member set hashへexact被覆する。link欠落・重複・差替え・retry後の二重revision、未link memberを残したcompletedを拒否し、dead-letter再開後も本文/feedback残留0へ収束する。retireはstatus/revision、`CatalogTombstoneDto(reason='retired')` exact一件、audit、receiptだけをatomicに作り、session/basis/feedback失効tombstone、target snapshot、fanout、materialization linkを0件とし、既存pinの本文・回答・feedbackを維持する。
20. quality/review/provenanceの全digest/hashをlowercase SHA-256、全ID/provider/model/runをtrim後non-emptyとしてstrict decodeし、空・空白・placeholder・uppercase/non-hex/非64文字digestをprivate/API/DB/独立runnerの各経路で拒否する。生成API型のreview subject/artifact/coverage、manifestのreview/identity/accountability/provenance coverage hash、numeric oracle non-empty entriesも同じstrict decodeを使い、field欠落・余剰・空配列・branch混在を拒否する。
21. freeze/review完了後にpersonal/public manifestを作り、そのmanifestをstageしてからpersonal acceptance/activateまたはattestation/publishへ進む順序をDB状態機械で強制する。全operationの生成strict request/response/receipt DTOは未知・欠落・余剰field、空/空白operation ID、非canonical/不正長hash、同ID異内容を拒否し、同ID同入力だけを初回canonical responseへ収束させる。管理UIからinternal RPCを呼べないACLを実DBで確認する。personal acceptance/activate/revoke/attest/attestation revokeだけはauthenticated recent-authを初回成功でexact一回consumeし、stage/publishはcontrol planeだけ、suspend/retireはrecent-auth済みauthenticated enqueue request/receiptだけを許可する。claim取得済みworkerがlease/fencing token/principal snapshotを検証してinternal operationを実行し、internal responseの`resolvedReauthGrantId=null`を確認する。lease失効後の同request replayは保存済みresponse/receiptへ収束し、別worker・旧fencing token・claim差替えを拒否する。publish lock待ち中のrevokeではpublished/current/audit/catalogを0件増加のまま拒否する。
22. personal/public manifestの対象content refとreview policyから`requiredRefs`を生成し、`ContentReviewArtifactV2` strict union、review `artifactHash`、review/identity/accountability/provenance coverageをexact再計算する。全branchのcanonical/blueprint/allocation/quality gate/review policy/evidence hash一致を要求する。machineはfull report、blindはanswer keyを含まないpacket、提出choice/rationale、`submittedAt <= answerKeyDisclosedAt`、`correctSetMatched=true`、human系はversion付きchecklist/resultを検査する。V1-only、空/空白subject ID、numeric artifact entries空、artifact余剰・欠落・重複、open/investigating issue、branch混在、提出choice重複/未sort/件数不一致、存在しない`reviewArtifactHash`/`artifactId`の入力でmanifest/stage/accept/publishを拒否する。
23. canonical choiceの`relevantClaimKeys`だけを追加・削除・別claimへ差替え・配列swapしたliteral fixtureで、private/DB/API/独立canonicalizerのcanonical bytesとquestion `contentHash`が全て同じ別値へ変わり、bundle `canonicalHash`、personal/public `manifestHash`も変化することを検証する。takeaway/common trapだけの変更も同じ失効規則とし、旧acceptance/attestationによるstage/activate/publishを拒否する。
24. takeaway/common trapはnon-emptyでDB/API canonicalと回答確定後feedback/cacheへlosslessに存在し、回答前catalog、selection basis、draft、問題表示DTO、模試提出前response、suspended/revoked tombstoneでは0件であることを検証する。単独または組合せが正答choice、正答数、正答位置、計算結果を直接示すpositive canaryをquality gateで拒否し、回答確定後、模試提出後、offline参考確定後だけWeb/VoiceOver/TalkBackへ表示する。
25. runtime controlと暗号featureを実DB＋Web/実機E2Eの4分岐で照合する。(a)control=false＋crypto feature OFFはP0 recent-auth acceptance/attestationを許可し暗号署名表示0、(b)control=true＋feature OFFまたは一依存不足はaccept/attest/stage/publish全拒否、(c)control missing/nullはfalseへdefaultせず同じ全拒否、(d)control=true＋P1全依存完備は暗号経路を許可する。全branchでglobal suspended statusと配備済み緊急suspend開始RPCを維持し、暗号未達だけを理由に事故対応を拒否しない。
26. quality gate生成型は型名`ContentQualityGateConfigV1`、schema literal`content-quality-gate.v1`だけを受理し、別名、optional field、手書きwideningをprivate/API/DB/独立runnerで拒否する。
27. content-control enqueue artifact、job、claim、lease、fencing tokenを一つの追跡chainで検証する。human enqueue operation ID/principal snapshot/request hash/response hashと、worker internal operation ID/service principal snapshot/logical request hash/response hashを別field・別preimageで保存する。human response hashはstrict `EnqueueQuestionLifecycleOperationResponseV2`から`operationResponseHash`だけを除いたRFC 8785 JCS bytesのSHA-256へ固定し、保存`human_response_json`の全field、JSON内`operationResponseHash`、`human_response_hash`列、RPC responseをexact一致させる。hash自身をpreimageへ含めるfixture、JSON/列/responseの一field追加・欠落・差替え、1-bit変更、同hash別JSONを実DBで拒否する。両operation ID同値、principal swap、human response hashのinternal response hashへの流用、human request hashとinternal logical request hashの混同も拒否する。authenticated enqueueはoperation kindをsuspend/retireだけに限定し、target、expected status/revision、reason、principal snapshot、request/response hash、recent-auth grantをexact一回のartifact/jobへ結合する。同operation同入力は同enqueue receipt/jobへ収束し、別入力・別actor・別targetは拒否する。enqueue受付、claim直後、internal commit前後、receipt保存前後へkill/lease失効を注入し、同operationのresponse replay、audit/fanout重複0、別operationへのclaim流用0へ収束する。anon/learner/管理UIによるinternal operation、claimなし・期限切れlease・旧fencing tokenの実行を拒否し、internal responseの`resolvedReauthGrantId`を`null`へ固定する。
28. APIのcode-discriminated `RpcErrorDto` unionについて各`code` branchの`retryable`とbranch固有fieldをliteral goldenで検証し、未知code、codeとretryable/branch fieldの不一致、余剰・欠落field、error responseへの正答・解説・内部principal/claim混入を拒否する。public `detail`はcode別のsanitized literalまたは`null`だけとし、PostgreSQL message/detail/hint/context、SQLSTATE transport detail、worker exception、Storage/Auth provider bodyの転記0を検証する。未定義の`status`、`retryability`、error request/response hashをfixtureや期待値に含めない。clientは未知errorを成功ACKへ変換せずsafe error/quarantineへ収束し、local state/cursorを不変にする。operation request/response hashはcontent operationとGolden requestの別証跡で検証する。
29. allocationのofficial basisをliteral fixtureで検証する。40問章別`8/6/4/11/9/2`、K別`8/24/8`、`500 * count / 40`のraw rational、floor合計499、最大の小数剰余、小数剰余同率時は章番号昇順で第4章へ配る結果`100/75/50/138/112/25`、K`100/300/100`を独立再計算する。`ContentOfficialExamStructureBasisV1`のsource document title/version/SHA-256/reviewedAt、scaling/rounding ruleから`officialExamStructureBasisHash`を独立再計算し、basis/hashを含むallocation hashへ一致させる。浮動小数丸め、basis/hash欠落・差替え、同率時の非決定選択を拒否する。
30. `OfficialSourceRequirementRegistryV1`のsource/claimがexact 3/6、`OfficialSourceVerificationCoverageV1.evidenceRefs`がsource順exact 3であることを検証する。各`OfficialSourceVerificationEvidenceV1.artifactHash`は自身だけを除外したstrict artifactのRFC 8785 JCS SHA-256へ一致し、basisのsource version/document hash/reviewedAt/evidence ID/hash、manifestの`officialSourceVerificationCoverageHash`までbyte exactに結合する。欠落・余剰・重複、unverified、取得失敗、URL/version/bytes/hashの1-bit差、推測digest、source不足はallocation生成、stage、40問/60分/26点policy activationを全件rollbackする。
31. 利用者Aの`learning_sync_conflicts`をAだけが取得・解決でき、利用者B/PUBLIC/anon/service_roleは存在推測を含め拒否される。draft/note/answer各kindでlocal/remote bodyとversion hashを1-bit差替えたresolve、expired resolve、別generation、別kind body、別owner conflict IDを拒否し、domain/conflict/receipt/auditを不変にする。正常resolveは`eventKind='resolved'`かつadopted hash non-nullのaudit exact一件をdomain/conflict/receiptと同transactionで確定し、same-operation replayは保存responseをbyte-for-byte返す。audit/log/trace/analyticsに本文、選択値、メモ、端末表示名が0件である。
32. DB時計が`expiresAt`へ達したconflictは、期限sweeperが同一DB transactionでconflict単位`expired_purged` auditをappendし、本文とoperation receiptを削除する。account deletionもuser exclusive lock下の同一DB transactionで対象ごとに`account_deleted` auditをappendした後、本文、receipt、raw user FK行をcascade/deleteする。両経路で本文/receipt/user FK行0件、auditはconflict ID、pseudonymous owner ref、local/remote version hash、run operation、event kind、DB時刻だけ、adopted hash NULLとする。`UNIQUE(runOperationId,conflictId,eventKind)`により期限直前/境界/直後、audit後・delete前のfailure injection、sweeper/delete job kill/retryが二重auditなしの全存続またはaudit一件＋個人行0件へ原子的に収束し、auditからraw ownerを逆引きできない。
33. `content-blueprint-v1.md`の生成型だけを正本として、exact 500の各content refに`ContentGenerationArtifactV1`一件、G0〜G12のrequired/artifact exact 13件、合計6,500件を作り、`ContentAiReviewCoverageV1`を独立再計算する。private canonical bytes→API DTO→DB列/JSON→API DTO→独立canonicalizerを全field losslessにround-tripし、各artifact/coverage hashを一致させる。API/DBのoptional化、enum widening、件数縮退、未知・余剰fieldを拒否する。G4はsingleだけ`not-multiple-selection`、G8は数値claimなしだけ`no-numeric-claim`を許可し、他N/A、missing/extra/duplicate/stale、未解決issue、G12前提12hashの順序・差替え、generator/blind/adjudicator run同一を拒否する。
34. 問題本文、choice、正答、reasoning、metadata、canonical/blueprint/allocation/quality/review policyの各一項目だけを変更するfixtureで旧G0〜G12 artifact全件をstaleとし、部分carry-forward、旧AI coverage、旧owner review、旧personal acceptanceを拒否する。
35. owner隔離review originでexact 500件を一問ずつ開く。初期blind DTO/cache/DOM/accessibility treeの正答集合、総合解説、全choice解説、takeaway、common trapを各0件とし、回答・根拠をimmutable提出するまでreveal RPCを拒否する。同じ一問だけをrevealし、runtimeの`blind -> blind_submitted -> revealed -> hidden -> audit_completed`を通って`pass | changes_required`を保存する。blueprintの4段階artifactへ決定的に集約されること、各遷移commit直後の応答消失・reloadで正答非開示resumeからstate/revision/直前fact hashを復元し、同operation replayまたは次CASへ収束することを全境界で検証する。`changes_required`はcategory/理由を必須とし、decision transactionでserver生成issue、receipt、review/audit factを原子的に作る。任意issue ID、別問題issue、owner/content ref差替えを拒否し、`pass`でissue入力を拒否する。changes_requiredはpersonal acceptanceを拒否し、current artifact exact 500が全件passになるまでacceptanceを拒否する。別問prefetch、一括reveal、bulk pass API/CTA、未閲覧自動pass、AI actorによるowner review、別owner/anonの版ID・件数取得を拒否する。URL/query、Web artifact、service worker、blind cacheへtoken・正答・解説・private packetが出ないことと、hide/logout/account切替後のrevealed cache 0を確認する。
36. G0〜G12の各rubricを全500件へ適用し、設問成立、single正答一意、multiple完全一致/全単射、根拠直接対応、各誤答の誤概念と否定根拠、曖昧性反証、長さ/断定/否定/文体手掛かり、重複、難易度、K/LO、著作権/provenance、UI/A11yの各criterion resultが欠落0であることを確認する。集計reportだけで問題単位artifactがないbundleを拒否する。
37. 後続tooling PRでtrusted `independent-review` checkをRuleset requiredにし、正規GitHub App、allowlist reviewer、固定head SHA、review artifact hash、Blocking/High 0を検証する。別issuer、作者自己申告、別head、head更新後stale、B/H残存でcheck/auto-mergeを拒否し、Ruleset実適用を証跡化する。本設計PRではRulesetを変更しない。
38. managed content runnerは`CONTENT_PRIVATE_EXPORT_PATH`未設定/空/相対/placeholder/allowlist外/symlink escape/位置引数fallbackを拒否し、controlled directory配下の絶対regular-file pathだけを引用符付き引数で受理する。pathやprivate本文をlog/artifactへ出さない。
39. DB commit前後、Auth Admin、Storage object、外部archive receipt各境界へ失敗を注入する。DB transaction rollbackと外部side effectを分離し、同operationのidempotent retryまたは規定compensationで重複0へ収束する。DB stateと全外部scopeのmatching receipt/hash/upper boundが揃う前はjob completed、capability、traffic cutoverを拒否する。

### 6.1 学習分析・adaptive UI追加受入

1. `get_learning_projection_v2()`を実DBで呼び、章exact 6、`e_c=8/6/4/11/9/2`、回答消化、初見、克服、定着、期限超過、公式比重を別分子・分母でfixtureから照合する。invalid/suspended、personal preview、offline参考をpublished正式値へ混ぜない。JWT以外のuser入力、未知input、章欠落・余剰・順序差を拒否する。
2. unique初回答から`ChapterReadinessFormulaV1`のWilson `z=1.959963984540`、decimal scale 12/round-half-even、basis-points floor、`safeLostMilliPoints` ceilを独立実装で照合する。標本数`max(10,e_c*3)`未満は数値nullとし「データ不足・あとn問」を表示する。binary float hash、章別最低点や公式合格必須度を拒否する。
3. priority係数`6000/2500/1500` basis pointsと`e_c*(0.60*(1-lower95)+0.25*unseenRate+0.15*overdueRate)`を境界fixtureで照合し、高/中/低の相対順、同値tie-break、データ不足branchを決定的にする。公式合格判定ではない表示を必須にする。
4. `get_chapter_readiness_v2(projectionSnapshotHash)`を実DBで呼び、同じownerのimmutable projectionだけから、全6章sample充足かつ有効正式模試2回以上の場合だけ`estimated`と安全側得点を返し、それ以外は`data-insufficient`/数値nullとする。projection RPCと同じ`officialExamStructureBasisHash`、`formulaHash`、attempt commit sequence/time・catalog revision・SRS revisionの`sourceUpper`/`sourceUpperHash`、DB時刻`calculatedAt`、`expiresAt`、`ttlPolicyVersion`をreadiness response/DB/localへlosslessに引き継ぎ、readiness snapshot hashを自身以外の全fieldから再計算する。DB時計を固定し`expiresAt`直前は成功、同時刻と直後はexpired、同operation再送は同結果、再取得projectionは新hashとなることを検証する。別owner、未知/不正hash、期限切れsnapshot、readiness側再scanを拒否し、二RPCのprojection hash/upper/hash/time/expiry不一致pairをclientが表示しないことを確認する。
5. online、完全offline、復帰を切り替え、cached通常演習は一問ごとに端末保存して採点待ち、正答/解説/takeaway/common trap 0、接続後だけcanonical採点へ収束する。安全なbasisなしのoffline新規開始を拒否し、保存済み演習再開は許可する。
6. 正式模試とオフライン参考模試を開始、問題、提出、結果、履歴、分析で別label/namespaceにし、参考結果が正式合格、誤答、克服、SRS、正式trendへ与える差分0をDB＋Web/実機で照合する。
7. 設定の4分類「この端末への保存 / アカウント同期 / 手動エクスポート / 災害復旧用バックアップ」をWeb/VoiceOver/TalkBackで同じ順・説明・状態として照合し、端末保存を同期済み、同期をbackup済みと表示するnegative fixtureを失敗させる。4番目はD-03 Aの通常領域24時間削除とbackup30日実効消去を分離表示し、B/C選択肢・CTAは0件とする。

## 7. アクセシビリティの受入

1. 320px幅・文字200%で横スクロールなしに回答できる。
2. キーボードのみで主要フローを完了できる。
3. VoiceOver・TalkBackで問題から解説まで完了できる。
4. 重大な自動アクセシビリティ違反0件。
5. 正誤・保存・同期を色なしでも理解できる。
6. feedbackのfocusは同一問題の初回到着だけ移動し、次問移動後・再取得・背景同期では奪わない。
7. 通常模試の完全`resultRevision`またはoffline参考の完全result/feedback pairを初めてatomic適用した時だけ、表示中の画面/modalにかかわらずfocusを維持し`role=status`/`aria-live=polite`で理由・実効得点/分母・合否をexact一回通知する。offlineはpairが揃う前の通知0、別画面/modalではfocus移動0かつ通知exact一回、rerender/retry/bootstrap replayではfocus移動0かつ再通知0をWeb/VoiceOver/TalkBackで検証する。UI正本と同じ全4情報・live-region属性を要求し、汎用更新文言だけへの縮退、1項目でも省略する実装を失敗とする。
8. mobile 320/375pxは単一列・下部nav・safe area上の主CTA、768px以上は回答後だけ任意split、1024px以上は同じroute順の左nav・main max720px・補助paneを検証する。文字200%、長文、software keyboard、touch入力では内容優先で一列へ戻り、必須操作/errorが補助paneだけに存在しないことを確認する。
9. 学習証拠railをmobile横strip/Web side railで同じ状態機械・順序へ照合し、問題位置、端末保存、同期、採点を別step、`aria-current=step`、文字/icon/形で示す。offline採点待ち、同期retry、storage failureの各fixtureで誤った後段完了を表示しない。keyboard focus、VoiceOver、TalkBack、reduced motionでも同じ情報を取得できる。
10. owner review UIを320px/200%、keyboard、VoiceOver、TalkBackで操作し、coverage filter、問題移動、正答等5項目0のblind提出、同一問reveal、hide、audit、`pass|changes_required`、中断再開を完了できる。reveal前の正答読み上げ0、hide後のrevealed node/cache 0、bulk reveal/pass 0、500件のcurrent decision全passを照合する。

## 8. 対象環境

- iOS: 最低対応、最新版、1つ前
- Android: 最低対応、最新版、主要メーカー端末
- Web: Chrome、Safari、Firefox、Edge
- 幅: 320、375、768、1280、1440px
- 通信: オフライン、低速、不安定、切替
- 保存: 容量不足、書込み失敗、migration失敗
- 時刻: 日付変更、タイムゾーン変更、端末時計ずれ
- 操作: 複数タブ、複数端末、連打、戻る、強制終了

## 9. 性能p95の受入

- Web Chrome、Web Safari、iOS、Androidを別々に計測し、各target・各指標100試行以上を本番同等release buildで取得する。全試行をaccountし、通常回線profileのtimeout/errorが1件でもあればgate失敗とする。成功latencyのp95とfailure countは別々に集計し、offlineは別の復旧受入で扱う。
- 端末保存は選択操作event受理からSQLite/IndexedDB transaction commit完了までを測り、cacheのwarm/coldへ分けず各target p95 200ms以内とする。
- cache済み次問はwarm cacheだけを対象に、「次へ」操作event受理からpromptと全choiceが操作可能になった描画commitまでを測り、各target p95 300ms以内とする。cold application/catalog startのlatencyはP1 telemetry objectiveとして別集計し、本v2 release性能gate外でwarm試行へ混入させない。ただしfresh install・空cache・有効sessionの機能cold-start E2Eは必須で、ホームまたは安全な復旧画面へ到達し、crash・無限loading・cross-account表示・正答漏えい0を確認する。
- 同期はoutbox送信開始からcanonical ACK、local materialize、cursor/outbox transaction commit完了までを測り、production同等regional endpointへの通常回線条件でp95 3秒以内とする。認証refreshを含む試行は別層化し、除外しない。
- Web Chrome/Safariは別target、iOS/Androidは最低対応OSの基準実機をrelease gateにする。CI benchmarkは退行検知、実機raw artifactは本番承認の権威ある証拠とする。
- artifactはcommit SHA、build ID、target、端末/OS/browser、回線profile、次問の`warm-cache`条件、全raw duration、sample数、nearest-rank p95算出結果を保存する。端末保存へcache conditionを付けず、offline結果は別artifactにする。
