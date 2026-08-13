# 受入証跡マトリクス v2

## 1. 目的

本書は、各要求を「テストがある」「CIが緑」という間接証拠だけで完了扱いにしないため、合格を証明する権威ある証拠を定義します。

判定は次のいずれかです。

- `PROVEN`: 要求範囲を直接証明する証拠がある。
- `CONTRADICTED`: 現在状態が要求に反する。
- `INCOMPLETE`: 一部だけ実装・試験済み。
- `WEAK`: 静的検索など間接証拠しかない。
- `MISSING`: 証拠がない。

## 2. 要求別証拠

| 要求 | 権威ある証拠 | 補助証拠 | 不合格となる例 |
|---|---|---|---|
| 同一アカウント同期 | 本番同等Supabaseを使うWeb↔実機の再開E2E | unit/API mock | 一端末だけ、mockだけ |
| Pull pagination | snapshot上限を固定した複数pageで欠損・重複0、不正row時cursor/state不変 | parser unit | 直接table SELECT、filter黙殺 |
| 選択直後保存 | storage transaction成功後killし再起動した実体state | repository unit | debounce完了後だけ確認 |
| 1問確定保存 | ACK前kill後にattemptが一件へ収束するDB＋端末E2E | idempotency unit | 10問完了後だけ保存 |
| 複数中断 | 3 sessionを作成・終了・再起動・別端末再開 | state test | 最新1件だけ保持 |
| offline 100回答 | 実ネットワーク遮断→復帰で欠損0・重複0のDB照合 | outbox property test | UI表示だけ |
| 競合復旧 | 2端末/2tabのdraft・note CASと両解決操作 | reducer unit | last-write-winsで無言消失 |
| 回答後draft supersede | 端末Aの回答確定後に端末Bの`draft.saved`をbarrier到着させ、実DBの`superseded-by-answer` canonical ACKに含む`supersededByAttemptId`/`supersededByAttemptHash`がcanonical attemptへexact一致しdraft/attempt不変であることと、端末BのACK/outbox `SUPERSEDED`/pending・conflict除去/同じID/hashのcanonical attempt表示を一local transactionで照合。ID/hash欠落・差替えを拒否し、同event replay、各write間kill/restart、bootstrap後再受信でもattempt一件・再送0 | reducer/property test | draft上書き、attempt ID/hash未検証、conflict残留、ACKだけ保存、kill後再送 |
| 正答非開示 | Web artifact/source map、端末pre-answer DB、RPC列、ACLの全てで漏えい0 | rg | UIが隠しているだけ |
| Personal preview分離 | active acceptance exact 1、data generation/bundle/canonical/manifest/selection revision固定、ownerだけがoverlay取得・回答、preview projection分離、他owner/anonは版ID・件数も取得不可 | UI表示 | channel文字列だけ |
| 通常採点・解説 | DB確定後だけ正答・総合解説・choice理由・takeaway/common trapを含むstrict feedback取得、回答前DTO/cache 0、未回答/別user拒否 | component test | static questionから採点、takeawayを回答前catalogへ同梱 |
| 複数選択 | DBで正答集合完全一致、必要数不足/超過拒否 | domain unit | 部分点、client採点のみ |
| 模試40問60分 | 実DBの40 item、DB時計境界、atomic submit、結果40件 | timer unit | 22問fixture、client時計 |
| 模試finalizer | manual/read/sweeper同時実行でterminal/event/result/session各1件 | unit | client event IDごとに複数terminal |
| 模試提出前非開示 | 未提出sessionのfeedback RPC拒否とartifact漏えい0 | UI test | CSSで非表示 |
| 誤答・克服 | append-only attemptsから2別session正解・再誤答をDB照合 | domain unit | 同session連打で克服 |
| SRS | DB/Domain共通fixtureで10分、1/3/7/14/30/90日 | unit | 表示だけ |
| 分析 | fixture attemptsから期待分子・分母をSQLで直接照合 | snapshot test | sample画面だけ |
| RLS | anon/auth/userA/userB/service roleの実DBpgTAP | policy text | policy存在検索だけ |
| Account deletion | auth失効、DB個人行0、現端末/他端末wipe、receipt | unit | Zustandだけnull |
| Export/Restore | server署名・payload hash付きfact JSONのdry-run、event/correction/terminal復元、同一user、cross-user・端末snapshot入力拒否 | schema unit | raw table overwrite |
| Restore atomicity | staging全chunk検証後の単一finalize、失敗時live state不変 | job unit | live tableへ部分chunk適用 |
| Backup | D-03 Aだけをpositiveとする別環境restore drill、manifest署名、件数/hash、削除再適用、production smoke。B/Cのpolicy/capability/manifest/restore source/API/job/CTA 0と直接入力拒否 | provider設定・署名監査receipt | backup作成だけ、B/C branchが利用可能 |
| D-03 policy UX | Aのpolicy ID/version/hash、通常領域削除deadline 24時間、backup実効消去deadline 30日を別field・別行で受付前文言/receipt/Web/VoiceOver/TalkBackへexact照合。24時間はlive削除、30日は非通常利用backupのpurgeであり相互代替しない。B/C表示・CTA 0 | 運用メモ | 「24時間でbackupも削除」、30日間live access、deadline swap、B/C選択肢 |
| Owner preview 500問 | D-04でowner承認済み`allocationVersion:1`に対するpersonal manifest exact 500、64 LO/K/章/single/multiple quota、G0〜G12全件coverage、独立最低review、owner artifact exact 500。各問のblind初期開示5項目0、runtime `blind -> blind_submitted -> revealed -> hidden -> audit_completed`、各遷移後の通信断resume/CAS、blueprint artifactへの決定的集約、decision全件pass、changes_required issue 0、reviewingのままownerだけが利用しpublished projection全値不変 | sanitized quality report | D-04未決定、初期正答漏えい、AI集計だけ、owner一括pass、応答消失後に再開不能、changes_required残留 |
| 公式配分根拠 | blueprint正本のstrict `OfficialSourceVerificationEvidenceV1`を必須3 source各exact一件作成し、source ID/URL、exact version、`retrievedAt`、取得bytes SHA-256、`verificationResult='verified'`、runner ID/version、artifact hashを独立再計算する。`OfficialSourceRequirementRegistryV1`の3 source/6 claimと`OfficialSourceVerificationCoverageV1`のevidence refsを欠落・余剰・重複0で照合し、basisのversion/hash/time/evidence ID/hashをExam Structure Tables evidenceへexact一致させる。40問章`8/6/4/11/9/2`・K`8/24/8`からrational演算し、floor合計499、最大の小数剰余、小数同率時は章番号昇順で`100/75/50/138/112/25`、K`100/300/100`へ至る独立3実装goldenと、source coverage/basis/allocation/personal・public manifestへのlossless hash結合を証明する | 実取得後に固定したsanitized canonical artifact/JCS/UTF-8 hex/hash | 推測digest、未verified、download bytes不一致、source/URL・evidence swap、claim不足、basis参照不一致、浮動小数round、source coverage hashなし、小数同率を実行ごとに変更 |
| Manifest outer hash | self hash fieldを持たないpersonal/public strict branch各goldenの全fieldをJCS化し、別objectの`ReleaseHashSetV2.manifestHash`へ同じSHA-256を保存する。branchに`officialSourceVerificationCoverageHash`を含め、private runner/DB/API/独立runnerでbytes/hashを一致させる | literal branch JCS/UTF-8 hex/SHA-256 | branch内self hash、personal/public/stage alias、未知fieldを除外して受理、stage違いbranch、source coverage hash欠落 |
| AI G0〜G12全件review | blueprint生成型を唯一正本とし、exact 500 generation artifact、全content ref×13 passのrequired/artifact exact 6,500、allowed N/A以外pass、stale/missing/extra/duplicate/unresolved 0、G12前提hash exact 12、generator/blind/adjudicator run相互分離をprivate→API→DB→API→独立canonicalizerのlossless round-tripで照合 | pass件数summary | 手書きAPI型、500件を一括評価、一問artifact欠落、G12でhard fail免除 |
| AI review修正失効 | 問題意味fieldまたは4対象hash/review policyの一項目変更で当該問題のG0〜G12、owner review、personal acceptanceが全失効し、G0から再実行されるversion差分fixture | updatedAt比較 | 一部pass流用、本文変更後に旧coverageを受理 |
| 隔離review UI | learner originと別のreview origin/audience/service worker/cacheで、ownerが全500を一問ずつblind提出→同一問reveal→hide→auditし`pass\|changes_required`を決定。各遷移commit後の応答消失から正答非開示resumeでstate/revision/直前fact hashを復元する。changes_requiredはcategory/理由から同じtransactionでserver issue/receipt/review factを作り、任意・別問題issueを拒否する。他owner/anonは版ID・件数も取得不可。blind DTO/cache/DOM/a11y treeに正答/総合解説/全choice解説/takeaway/common trap 0、hide/logout後revealed cache 0、bulk reveal/pass 0 | screenshot | blind初期に正答、別問prefetch、共有URLで解説閲覧、未閲覧自動pass、任意issue流用 |
| 模試selection scope | personal-previewはowner active acceptance manifestにpinされたeligible reviewing current versionsだけ、publishedはcurrent published catalogのeligible versionsだけを母集団とする実DBselection。各scope内で章`8/6/4/11/9/2`・K`8/24/8`同時exact、問題stable ID/version重複0、eligibility、acceptance ID/hash、manifest/catalog revision pinを全40 itemで直接照合 | selection property test | 別scope・別acceptance・manifest外・非eligible・reviewing/published交差混入、章/K片方だけ充足 |
| Public release 500問 | 同一contentのparent personal manifest hash、Web/mobile preview、技術・編集各500、4人attestationをpublish transactionで再検証しpublished exact 500 | CI成功 | reviewing/pending、親manifest不一致、テンプレ量産 |
| 著作権V2 | exact 500件のlossless `ContentProvenanceV2`、第三者問題・公式サンプル一致0、tokenizer ID/digest、grapheme span分類・各review artifact、人手copyright artifact、類似検査をmanifest hashへ固定 | keyword scan | テス友等の言い換え、word countだけ、span集約だけ、provenance field欠落 |
| 問題suspend | 新規配信停止、進行中tombstone、`sourceCommittedAt <= frozenAt`（後続resultはimmutable `revised_at`）で有効graded attempt・latest exam result・latest offline result/feedback pairだけを固定したtarget member→materialization link/result hash→user/global receiptのexact被覆、catalog/session/basis/content cache同時purge、audit | status unit | UI非表示だけ、境界後/過去/無効/not_gradedもfanout、linkなしfanout、本文残留 |
| 問題retire | status/revision、対象catalog streamのmembership removalを示す`CatalogTombstoneDto(reason='retired')` exact一件、append-only audit、strict receiptだけの実DB照合。session/basis/feedback失効tombstone、target snapshot、fanout、materialization link 0、既存session/basis pinの本文・回答・feedback維持 | status unit | catalog membership残留、catalog tombstone重複、suspendと同じfanout、既存pin purge、receiptなし |
| Web A11y | 320px/200%/keyboard/screen reader実確認とaxe重大0 | component aria | desktop mouseだけ |
| Mobile A11y | VoiceOver/TalkBack実機checklist | accessibility props | simulator screenshotだけ |
| Adaptive学習UI | 320/375 mobile一列・下部nav・safe area、768以上の回答後任意split、1024以上の同順左nav・本文max720px・補助paneを実機/ブラウザで照合。文字200%・長文・software keyboardでは一列へ戻り、必須操作/error欠落0 | responsive snapshot | viewportごとに別情報設計、補助paneだけに確定/error |
| 学習証拠rail | mobile横strip/Web side railで問題位置→端末保存→同期→採点を同一順・別状態として文字/icon/形/`aria-current`で照合。offline採点待ち、retry、storage failureで後段完了誤表示0 | component story | 端末保存を同期済み、同期を採点済みと表示、色だけ |
| Offline演習・模試分離 | cached通常演習の端末保存/採点待ち/接続後canonical採点とpre-answer正答0、正式模試とオフライン参考模試の全画面label・namespace・履歴・分析差分0をWeb/iOS/Android＋実DBで照合 | reducer unit | offlineでclient採点、参考結果を正式合格/SRSへ算入 |
| Backup平易4分類 | 「この端末への保存/アカウント同期/手動エクスポート/災害復旧用バックアップ」の順、状態、対象、非対象をWeb/VoiceOver/TalkBackで照合し、4番目はD-03 Aのlive 24時間削除とbackup 30日purgeを分離。B/C選択肢0 | provider runbook | 同期=backup、live/backup期限混同、B/C表示 |
| 章別進捗・readiness | 実DB RPC二本から章exact 6、各分子/分母、Wilson式、sample threshold、safeLost、priority、正式模試2回gateを独立再計算。outer/readiness双方のbasis/formula/source upper/hash/calculatedAt/expiresAt/ttlPolicyVersion/snapshot hash完全一致とreadiness hash算入、`dataGeneration` numeric wire/schema digest一致、DB時計の期限直前成功・同時/直後拒否、別owner拒否、threshold未満null、preview/offline参考混入0 | UI snapshot | string世代、client float正本、小標本で得点断定、期限切れ利用、RPC間snapshot混在 |
| 性能p95 4 target | 本番同等buildでWeb Chrome/Web Safari/iOS/Androidを分離し、通常profile・各target/操作最低100試行の全結果を保存する。timeout/error 0かつ成功試行p95で端末保存200ms以内、warm cache次問300ms以内、同期3秒以内を達成したraw artifact。端末保存はcache非層化、cold-start latencyはP1 telemetry objectiveとしてv2性能gate外、offlineは別集計 | 単体benchmark | 平均値だけ、一targetだけ、Web browser合算、debug/mockだけ、coldをwarmへ混入、失敗試行を除外 |
| 機能cold start | Web Chrome/Web Safari/iOS/Androidのfresh install・空cache・有効sessionでowner namespace、local schema、catalogを検証・初期化し、ホームまたは安全な復旧画面へ到達する実機E2E。crash、無限loading、cross-account表示、正答漏えい0 | P1 latency telemetry | warm cacheだけ、latency閾値未定を理由に機能試験を省略 |
| CI ruleset | GitHub API上のactive ruleset、5 context app ID 15368、bypassなし | JSON file | repo内設定だけ |
| DB migration | 同じexact headでliteral `fresh`、`origin-main-upgrade`、`combined-order`、`atomic-failure`、`production-boundary`の5 phase実DB成功、全migration＋全pgTAP、履歴/hash、最終schema/RPC署名一致、rollback・fixture残留0 | SQL静的test | 一phase欠落/別名、別head、pgTAP未実行、fixture canary混入 |
| CD | exact main SHA、5 checks、必要migration/worker capability、RPC signature/ACL、runtime flag、old/new smoke、deploy source | workflow yaml | build成功、DB未適用でclient公開 |

### 2.1 F-01〜F-19トレーサビリティ

| 要件ID | 直接証拠 |
|---|---|
| F-01 認証 | 登録・確認・login・PKCE reset・logout・recent reauth・本人削除のWeb/iOS/Android E2E |
| F-02 同期 | 同一アカウント同期、Pull pagination、generation、競合、offline 100回答の各行 |
| F-03 ホーム | 3中断sessionから最新を1操作で再開し、他sessionも消えないWeb/実機E2E |
| F-04 通常演習 | 10/20/30/40、各selection spec、eligible不足exact、0件UXのDB＋UI E2E |
| F-05 1問保存 | 選択直後保存、1問確定保存、kill/restartの各行 |
| F-06 複数中断 | 複数中断行の3 session・別端末証拠 |
| F-07 誤答演習 | 全filterの固定selection basisと0件/不足件数E2E |
| F-08 採点・解説 | 通常採点、複数選択、正答非開示、feedback tombstoneの各行 |
| F-09 間隔反復 | SRS、masteredAt、breaking再確認のDB/Domain共通fixture |
| F-10 模試 | 40問60分、finalizer、提出前非開示、preview分離、結果改訂の各行 |
| F-11 履歴 | version pin・terminal/result revision・correction/invalidationを含む履歴E2E |
| F-12 分析 | published/preview/offlineを分離したSQL分子・分母直接照合 |
| F-13 ブックマーク | 保存/解除、別端末収束、bookmark-only選定basis E2E |
| F-14 メモ | 1問ごとのautosave、CAS競合、kill/restart、他user拒否E2E |
| F-15 問題報告 | 問題/版/category付きimmutable report、本人参照、管理status遷移、他user拒否 |
| F-16 オフライン | offline 100回答、reference模試、stale generation隔離の各行 |
| F-17 問題管理 | stage/review/acceptance/publish/suspend/retire/hash gateの各行 |
| F-18 A11y | Web A11y、Mobile A11yの各行 |
| F-19 データ管理 | Export/Restore、atomicity、Backup、Account deletionの各行 |

### 2.2 追加の権威ある安全証拠

| 要求 | 権威ある証拠 | 不合格となる例 |
|---|---|---|
| 正答だけのhash変更 | correctness-only literal fixtureでprivate/DB/独立canonicalizerのbytesと3 hash一致、旧acceptance/attestation拒否 | 本文hashだけ比較 |
| relevant claim・学習metadata hash変更 | choice `relevantClaimKeys`だけの追加/削除/差替え/swap、またはtakeaway/common trapだけの変更でprivate/DB/API/独立canonicalizerのbytesとcontent/canonical/personal・public manifest hashが同じ別値へ変化し、旧acceptance/attestationをstage/activate/publish全経路で拒否する | relevant claimをDBだけに保存、takeawayをraw hashだけに含める、旧acceptance再利用 |
| Restore replay/receipt | 複数revisionの全eventとexam/abandon/offline commandを復元後再送し保存済みcanonical response一致、同ID異内容拒否 | 現状態からresponse推測 |
| Stale generation端末 | restore後の旧outbox/command/basis/cursor全隔離、server state不変 | 自動rebase |
| Stale client/server origin | stale clientが`origin='server'`、server専用kind、origin欠落/差替えをclient ingestへ送るnegative fixtureを実DB拒否し、端末はclient-origin outboxをserver-origin/current schemaへ書換えずread-only quarantineへ隔離する。更新要求文言、server state/cursor/ACK不変をWeb/iOS/Androidで照合 | client自己申告origin採用、古いeventをserver eventへ変換、拒否後ACK |
| Server-change依存 | required sync sequence未適用ではchange/projection/cursor全不変、適用後一transaction収束 | changeだけ先行 |
| Owner preview 500問のphase binding | D-04承認済みallocation、owner acceptance exact 500、最低review gate、通常/模試利用、reviewing維持、published projection全値不変 | D-04未決定、4人公開承認前にpublished扱い |
| Preview/offline分離 | preview模試・offline reference後もpublished初見/誤答/SRS/streak/日次/合格実績全値不変 | timing verifiedだけで正式算入 |
| Post-terminal結果改訂 | offline参考提出後のsuspend/revokeで元terminal fact不変、append-only result/feedback別revision。両revisionは全ordinal exactを保持し、影響itemだけresult excluded/null score・feedback Unavailable tombstone、非影響answered/unanswered保持、effective score/denominator再計算、複数端末atomic可視化。通常result revisionまたは完全offline pairの初回atomic適用時だけ画面/modalにかかわらずfocusを維持し`role=status`/`aria-live=polite`で理由・実効得点/分母・合否をexact一回通知する。片revisionは通知0、別画面/modalはfocus移動0かつ通知一回、rerender・retry・bootstrap replayはfocus移動0かつ再通知0をWeb/VoiceOver/TalkBackで照合。UI正本と同じ全4情報・live-region属性をsnapshotで検査する | terminal値を直接更新、全ordinal tombstone化、resultだけ更新、片revisionで通知、別画面で通知0、再通知、focus強奪、汎用「結果を更新しました」だけ、理由/得点/分母/合否の省略 |
| Conflict全文とaudit分離 | メモ・未確定回答の採用/非採用全文版をowner-scoped conflict tableだけへ保存し、user A/B RLSを実DBで照合する。expiryはconflict単位`expired_purged` audit appendと本文/receipt削除、account deletionは`account_deleted` audit appendと本文/receipt/raw user FK削除をそれぞれ一DB transactionで行い、個人行0件へ収束する。auditはfact ID、conflict ID、pseudonymous owner ref、local/remote hash、run operation、event kind、server時刻だけで、resolvedだけadopted hash non-null、purge二種はNULL。`UNIQUE(runOperationId,conflictId,eventKind)`のkill/retry、receipt 0件、全文・端末表示名・raw owner 0、auditから内容/ownerを復元不能であることを証跡化する | component比較表示 \| full memo/answerをaudit/logへ保存、他user閲覧、本文だけ削除してreceipt残留、auditと個人行削除の別transaction、retention/delete対象外、purge auditのadopted hash non-null、hash不一致の版を採用 |
| Multi-user suspend fanout | exclusive version lockの`frozenAt`で`sourceCommittedAt <= frozenAt`の進行中pin item、有効graded attempt、各模試latest effective result、各offline参考latest effective result/feedback pairだけからimmutable target snapshot/hashを作る。後続resultの`sourceCommittedAt`をimmutable `revised_at`へ一致させ、過去・訂正/無効化済み・`not_graded`・latestでないrevision・片側pair・境界後到着を除外して同じ版をpinしたuser A/Bへ適用する。各target memberと生成fact/revisionをappend-only materialization link ID/hashで一意結合し、target payload/result hash、user/global member set hashがexact一致してからcompletedへ収束する実DB＋Web/実機E2E | active利用者だけ、mutable再scan、過去revisionもfanout、link欠落/重複/差替え、次回起動時だけ反映 |
| Suspendと回答競合 | user A/Bのanswer transactionと同一版suspendをbarrier同期して全lock順で実行し、suspendより前に確定したattemptだけが履歴へ残り、後発・lock待ち回答は無採点invalidated、正答feedback漏えい0となるconcurrency試験 | 最終更新勝ち、片方のownerだけ更新、suspend後にgraded |
| Late draft terminal response | 期限直前accepted draft、期限後draft、manual/read/sweeperを同時実行し、late draftが`exam_input_closed`成功canonical ACKと保存済みterminal responseを同じlocal transactionで適用してoutbox終了へ収束する。ACK/terminal適用間のkill/restartでも採点入力・保存済みpre-deadline draft・terminal/item resultを上書きせず再送loop 0となる実DB＋端末試験 | exceptionでfinalizer rollback、late arrivalで回答変更、terminal再生成、ACKだけで無限再送 |
| SRS再構築 | remediation、stage4/masteredAt、breaking、根拠attempt訂正/無効化のDB再構築一致 | masteredAt残存 |
| M1 write race | migration lock中の別接続legacy writeが待機/abortし、失敗時data/DDL/history/correction/audit 0増加 | rehearsal hashだけ信用 |
| Restore upload境界 | client URL/他owner upload ID/etag・size・hash差替え拒否、fixed bucketだけ取得 | workerが任意URL fetch |
| 互換18問隔離 | public/preview catalog、500 count、exam blueprintへcompatibility ID 0件 | 500へ水増し |
| Acceptance revoke | session invalidation、本文/choices/feedback/cache purge、tombstone forbidden key 0、offline残余リスク表示。revoke後bootstrap/cold resumeのsession/basis/catalogは失効tombstoneだけを返し、同acceptance本文・safe snapshot・catalog question再配布0を実DB＋端末で照合 | selection切替と同一扱い、bootstrapでpreview本文復活 |
| Feedback tombstone | suspended/revoked strict branchの正答・解説fieldがnull/空、余剰key拒否 | UI非表示だけ |
| Quality gate hash | `content-blueprint-v1.md` §3.2.1だけを正本にmodel/digest/threshold/calibration/review artifactをmanifestへ拘束し未処理candidate 0。personal/publicとも8199 pass候補・8200 rejectのliteral境界、例外承認schema/RPC/ACL/UI 0を直接照合 | 閾値後変更、publicだけ例外承認 |
| Selection basis safe snapshot | 発行直後のcatalog改訂・retire・projection前進後も、DB保存済みsafe問題・順序・choice orderをbasis IDで一度だけconsume | clientが問題を再選定・差替え |
| Feedback 3 branch | 回答済み・模試未回答・suspended/revokedのstrict union、generation/session/result revision/ordinal cache分離、改訂時purge | `attemptId=null`だけをcache keyにする |
| Offline reference全ordinal | result revisionとfeedback revisionを別ID/parentでappendし、両方とも保存済み全ordinalを昇順・欠番/重複なしでexact一対一返す。影響itemだけresultを`excluded=true/isCorrect=null/score=null`、feedbackをUnavailable tombstoneにし、非影響resultとanswered/unanswered feedbackを保持してeffective score/denominatorを再計算する。tombstoneのprompt/choices/正答/解説field 0 | 回答済みだけ、停止ordinal除外、nullを不正解/0点化、非影響もtombstone、元fact更新、片revisionだけ可視化 |
| Breaking 10分境界 | DB時計9分59秒/10分/再誤答/新版正解fixtureでremediation優先とstage再開を直接照合 | needs revalidationがremediationを上書き |
| Empty restore/bootstrap | dry-run/finalize空判定、`sourceIdentitySets`のsession/event/command/selection basis別件数・集合hash binding、target active basis empty、finalizeがbasisをapply/consume/discardしないこと、失敗atomicity、v1 archive、全bootstrap page hash、scope別cursorを実DB＋端末で照合 | 既存dataへmerge、basis差替え/暗黙破棄、finalizeでsession開始、旧event再発行 |
| Legacy v1 restore materialization | `sourceDataGeneration=null`、`sourceKind='legacy-sync-event'`、`legacySchema='learning-sync.v1'`、original event ID/source sequence、`sourceLegacyFactHash`をstrict union・専用archive・materialization linkでbyte-for-byte照合する。v2 event/outbox/ACK 0、v2 request/canonical hash新造0を実DB＋restore DTOで証明する | generation補完、ID/sequence再発行、legacy fact hashからcanonical hash捏造、legacy/v2 branch field混在 |
| Bootstrap scope/hash完全性 | owner generation discovery、attempt/exam/lifecycle/offline-reference履歴を含む全section×scope keyについてrow hash、連続ordinal、partition count/hash、snapshot header hash、期限、scope別cursorを独立再計算し、新端末/local破損/restore後に一local transactionで交換 | section合計だけ、scope混同、page欠落・重複を黙殺、global hashだけ |
| Bootstrap selection-bases lossless | `selection-bases`の発行済み/unconsumed・consumed・discarded全lifecycle、source revision/hash、terminal fact、command receipt、発行時pre-answer safe prompt/choicesを全branchでstrict DTOへexact保存する。consume可はunconsumedだけ、他branchはread-only、正答/正答boolean/解説/feedback canary 0。suspended versionはserver原本/hashを不変にしたまま端末projectionを本文・choices・feedbackなしtombstone unionへ射影し、catalog/session/basisとcontent cache・draft・fanout pending payloadを一local transactionでpurgeする。partition取得/commit各点のkill/restart、欠落・重複・未知field時のstate/cursor不変を新端末＋cold resume＋restore後で証明する。portable exportはsession参照済みconsume basisだけをID/version/ordinal/choice order/consumed event IDで持ち、未consume・discard済みbasis、discard fact/audit、prompt/body/choices 0 | lifecycle branch欠落、consumed再consume、receipt欠落、suspended本文/pending残留、三partition部分purge、discard済みbasisまたはsafe snapshotをportable exportへ混入 |
| Session item invalidation identity | 同じimmutable invalidation fact ID/hashを`session.item-invalidated` change、full bootstrap、portable fact、restore materialization link、local current/history、stale-generation quarantineでexact参照する。restoreの物理source/archive/target parent・child rowと全link列、invalidation factのfact ID/kind/prior fact ID/server sequence/server time/content ref/reasonをlosslessに照合し、`sourceIdentitySets`のcount/hashとsummaryを物理child rowから再導出する | restore時ID再発行、経路ごと別ID、local current/quarantine二重identity、child追加/欠落/swap、summary自己申告、fact/link列欠落・差替え |
| Same-generation lifecycle authority | 同じdata generationでserverがcompleted/abandoned/invalidated/acceptance-revoked、localがactive/paused/draft pendingのfixtureをbootstrapし、server lifecycle優先、local不一致のread-only quarantine、terminal復活0、旧outbox再送0へatomic収束する。partition swap各点のkill/restartと同snapshot replayを含む | generation一致を理由にlocal overlay、terminal session/basis/catalog復活、quarantine欠損 |
| Stale-generation quarantine復旧 | generation変更時に旧session/outbox/command receipt/selection basis/cursor/pending/conflict/historyをread-only quarantineへlosslessに退避し、quarantine前後・current swap直前のkill/restart全点で旧write再送0、暗黙ACK 0、current overlay 0、既存quarantine欠損0へ収束するSQLite/IndexedDB両試験 | stale行削除、最新値だけ保存、kill後に旧outboxを再送 |
| Local確定回答復旧 | ACK済みfeedback未取得でkill後offline再起動し、回答lock・canonical attempt ID・履歴・位置・published/preview projectionを復元 | session本文だけ復元 |
| Portable selection非開示 | consume済みbasisのID/version/ordinal/choice orderだけを署名exportし、private preview prompt/body/choices canary 0 | `LearningSelectionBasis`をそのままexport |
| Manifest phase binding | freeze/review後に作るpersonal/public literal manifest bytes/hash、raw/canonical/blueprint/quality/provenance/reviewと4 coverage hashのlossless binding、parent hashを3実装で照合し、manifest作成前stageとstage前accept/publishをDB拒否 | coverage集計だけ、preview artifactでpersonal manifest上書き、review前stage |
| Content blueprint | 64 LO registry、exact 500/章/K/selection配分、認知操作/family/fact/premise/oracle不変条件を独立検算 | 問題側自己申告だけを集計 |
| Content意味対応 | asked claim・premise・fact/artifact・reasoning step・addressed/relevant claim・correct choiceの参照完全性を全500で検査。全choiceの`relevantClaimKeys`はcanonical/hashへlosslessに含め、全fact/artifact kindはLO permitted list、requiredはrequired listへ所属し、K1 required 0でもcontext permittedを許可。takeaway/common trapの正答手掛かり0と回答前DTO/cache混入0を検証 | choice booleanとの二重正本、canonical relevant claim欠落、takeaway事前配信、未許可kind、K1 context全面禁止、文字列reasoningだけ |
| Reasoning正規化 | step番号が正のsafe integerかつexact `1..N`、数値昇順でprivate/DB/独立runnerのbytes/hash一致 | `1,10,2`の文字列byte順、欠番、重複 |
| Provenance lossless | authoredAt、pre-freeze accountability artifact、全model run、structured normative source、terminology、全copyright spanをexact 500件でAPI/DB/manifest round-trip | release attestationへの循環参照、単一runへ縮退、quotation word countへ置換 |
| Accountability/identity target binding | statement literal registry/digestと、identity署名対象の`questionStableId/versionStableKey/subjectHash/statementVersion/statementHash`、literal canonical bytes/hash/Ed25519署名、build-pinned issuer public keyを検証する。nonce/public key/signatureのbase64url no-padding decode長32/32/64 bytes、human/purpose/audience/recent-auth/期限/nonce一回使用、principal一致、exact 500一対一を確認し、A/B swap、内容/statement/principal差替え、artifact再利用を拒否する。service assertionであって自然人の否認防止署名ではない表示もsnapshot検査する | targetを署名しない、bundle自己申告principal、machine/別audience/期限切れ/replay、A/B swap、任意長base64、自然人署名と誤表示 |
| Copyright corpus binding | 許諾・公開範囲内の`ContentCopyrightCorpusRegistryV1`をID/digest/scope/as-of/license artifactでfreezeし、provenance registry hash、corpus別count、detected source FKを独立検算。固定corpus一致0とhuman reviewを別々に証明 | 空corpus、実行後のcorpus差替え、「世界中と一致0」と誇張 |
| Auxiliary hash canonical golden | `content-blueprint-v1.md` §3.2.1だけを正本にallocation/approval/blueprint/quality/corpus/sampling/review/identity/accountability/provenance/oracle/coverageのexact preimage、除外field、実在fieldだけの配列順をliteral JCS bytes/UTF-8 hex/SHA-256で3実装照合する。review artifactは`artifactHash`だけを自己除外し、1 bit、swap、Unicode差、未知field、重複ref、存在しない`reviewArtifactHash`/`artifactId`を拒否 | 実装関数でexpected生成、Markdown bytesをhash、hash自身や不存在fieldをpreimageへ含める |
| One-shot personal review sample | canonical/blueprint/allocation/quality-gateと候補stratumのfreeze後にcontrolled serviceが同じfreezeへ一度だけ発行するCSPRNG 32 bytes seedの署名済みappend-only完全sampling artifactを検証する。`canonicalHash/blueprintHash/allocationHash/qualityGateConfigHash/samplingFreezeHash`と全population/rank/cutoff/mandatory/final集合をlosslessに結合し、再発行・seed選別・content hash導出を拒否する。`UTF8("literal") \|\| 0x00 \|\| JCS(...)`のrankからK1/K2各stratum ceil 20%と全K3/全multiple/全blind disagreement/carry-forwardの集合和を独立再計算 | reviewerが任意選択、quality/freeze hash欠落、artifactを集計へ縮退、content hashをseed化、失敗を理由にseedを引き直す、端数切捨て |
| Numeric oracle | 固定formula registry/digestと独立runner/digestで全数値claimを再計算し、formula/unit variantごとのinput key/kind/unit/integer-sign-zero domain/cross constraint/rounding/result unitをliteral照合する。entryはcontent ref＋claim key unique/sort、全input/intermediate/expected/oracle/bindingをlossless保持し、`relevantClaimKeys`参照choice集合とbinding集合exact一致 | 同じ計算関数だけ、unit/domain不正、hour/day混在、binding不足/余剰、ordered-set縮退、agreement booleanだけ |
| Quality/review strict identity | tokenizer/model/corpus/formula/oracle・review runnerの全digest/hashがlowercase SHA-256、全ID/provider/model/runがtrim後non-emptyであることをprivate/API/DB/独立runnerのnegative fixtureで照合する。API生成型のreview subject/artifact/coverage、manifest coverage hash、numeric oracle non-empty entriesもfield欠落・余剰・空/空白/placeholder/空配列を拒否 | APIだけstring/optionalへwidening、numeric entries空をpass |
| Strict review/coverage V2 | `ContentReviewArtifactV2`全branchへ4対象hash/review policy/evidence hash。machine full report、blind packet/submitted choices/rationale/submittedAt<=answerKeyDisclosedAt/correctSetMatched、human version付きchecklist/resultをliteral goldenで検証し、required/artifact/issue refsをmanifest対象へexact被覆する。V1-only、余剰/欠落/重複/open・investigating issue/branch混在をmanifest/stage/accept/publish全てで拒否 | 件数集計だけ、V1 artifact、正答開示後blind提出、generic human pass、未解決issue上書き |
| Runtime capability署名golden | literal RFC 8785 bytes、Ed25519署名、key ID、environment、revision、main SHA、期限、全feature依存のgoldenを独立検証する。anon/learner/reviewer/admin/serviceのRPC/table/worker ACL matrixを実DB照合し、署名ONでもACL不一致ならOFFへ収束 | 実装自身でexpected生成、署名なしJSON、capabilityだけで権限付与 |
| D-01 runtime control matrix | 実DB＋Web/実機で`literal false + crypto feature OFF => P0 recent-auth可/暗号表示0`、`literal true + OFFまたは依存不足 => accept/attest/stage/publish全拒否`、`missing/null/non-boolean => release feature OFFかつ4操作全拒否`、`literal true + P1完備 => crypto可`の4分岐を照合する。invalid controlをfalseへdefaultしない。全分岐でglobal suspended DB拒否と配備済み緊急suspend開始RPCを維持する | missing/null/non-booleanをfalse扱い、invalid controlで一操作でも許可、true時recent-auth fallback、暗号未達でsuspendまで停止 |
| Deletion ledger/tombstone combined golden | canonical issuer＋opaque subjectのHMAC v2、別domainのStorage digest、key/rule version、連続sequence、exact DB/Auth/Storage scope、operation/main SHAを持つversion付きledger/tombstone literal bytes/署名を独立検証する。共通`DeletionPolicyBinding`をchallenge→receipt→status→ledger→external tombstone→combined receipt→D-03 A DR manifestの全段へbyte-for-byte固定する。external tombstone、combined receipt、object key segment、immutable metadataのdigest四者、receipt/tombstone署名をgolden照合する。DB時刻からlive削除24時間deadlineとbackup実効消去30日deadlineを別fieldで算出し、swap・縮退・期限後残留を拒否する。同sequenceのledger/tombstone hashを一archive receiptへ結合する。B/C policy/capability/manifestは0、入力は拒否 | primary DB行だけ、24h/30d混同、B/C branch、binding/hash/署名欠落、raw UUID/object key保存 |
| DR manifest署名golden | 別々にversion/hash固定したDR policyとaccount deletion policy、deletion activation fact ID/revision、consistency barrier、DB LSN、Auth/Storage/deletion ledger各upper bound、復旧RTO/RPO・traffic再開SLO、content-control artifact/job/claim、migration/inventory/ciphertext hash、KMS key versionを含むliteral manifest bytes/署名を独立検証し、上限/SLO超過object/ledger、policy・activation swap、1 bit改変を拒否する | DB backup成功だけ、policy混同、activation/SLO/upper bound欠落、同じ署名関数でexpected生成 |
| External deletion archive primary-loss | D-03 Aだけでprimary DB/通常backupから独立したarchiveの署名済みledger/tombstone、combined receipt、共通binding、HMAC v2、Storage digest四者、object version/etag/SHA-256をgolden照合し、primary-loss時のDB/Auth/Storage削除再適用完了前traffic 0を証明する。B/C restore source/API/job/capability/manifestは0で入力拒否 | primary行だけを信用、B/C restore、digest/hash/署名片側だけ、再削除前traffic |
| Content operation strict/idempotent/revoke | 全operationの生成strict request/response/receipt DTO、non-empty operation ID、canonical SHA-256入力/response hash、actor/role/server time/result fact、unknown/欠落/余剰field拒否、同ID同入力の保存済みresponse、同ID異内容拒否を実DBで照合する。accept/activate/revoke/attest/attestation-revokeだけがauthenticated recent-authを初回exact一回consumeし再送0。stage/publishはcontrol plane専用、suspend/retireはrecent-auth済みauthenticated enqueue request/receipt専用で、管理UIからinternal RPC実行0。worker internal responseは`resolvedReauthGrantId=null`。publish revoke barrier、suspendのtarget/失効tombstone/fanout/audit/receipt、retireのstatus/revision/`CatalogTombstoneDto(reason='retired')` exact一件/audit/receiptと失効tombstone・target・fanout・link 0を検証 | 再送で再認証consume、UIからinternal RPC、stage/publishをUI実行、retire fanout/失効tombstone、receiptなしsuspend完了、gate確認後revokeを見ずpublished化 |
| Deletion receipt capability | Auth削除後に期限付きreceipt tokenでpending/completed/failedを取得し、job binding、token hash、rate limit、期限/revoke、PII/内部key 0を検証 | 削除済みJWT必須、job ID列挙、tokenをURL/logへ出力 |
| Personal portable actor map | correction/invalidation/acceptance revocation/`issue.updated`が参照するsource principal snapshotとowner/content-admin/system-operation roleをportable actor mapでexact被覆し、公開saltから全pseudonymを再計算する。unused map 0、一principal一pseudonym、export→隔離restore→bootstrapでfact ID/hash/role全値一致、global release actorとlearner PII 0を確認 | global attestationを個人exportへ混入、actorを新IDへ付替え、同principalを複数pseudonym化、unused map、revocation/issue actor欠落、PII復活 |
| Global release actor DR | author/technical/editorial/finalのprincipal snapshot、別自然人関係、attestation/revocation/approval、公開鍵を運用DR backupと独立auditからexact復元し、learner portable actor mapを使わず全hash・role・signatureを再検証 | global release actorを個人exportへ混入、roleを作り直す、公開鍵やrevocationを落とす |
| Server change fact history | 全server changeのimmutable fact ID/kind/prior fact ID/server sequence/time/content refを通常pull・full bootstrap・portable export・restore後bootstrapで全値一致させる | restore時にID再発行、現在状態だけでhistoryを圧縮、prior chain欠落 |
| `issue.updated` change | `open -> investigating`、`open -> resolved`、`open -> rejected`、`investigating -> resolved`、`investigating -> rejected`だけを許可し、terminal巻戻し0。issue ID/fact ID/prior chain/old-new status/non-empty reason/server timeを履歴化し、server-side actorをprincipal snapshotへ結合、portable時だけactor mapへ射影する。4状態文言・競合文言と同一画面初回focus/別画面`polite`通知をWeb/VoiceOver/TalkBackで照合 | issue rowを上書き、terminalを再open、actor自己申告、UIが旧状態を成功表示 |
| Selection basis discard | 未consume basisのdiscard fact・canonical terminal responseを一回だけ保存し、discard後consume/session作成拒否、再送同一responseを検証する。discard済み未consume basisとdiscard auditだけをrestore target空判定のblocking集合から除外し、portable exportにはdiscard basis/fact/audit・本文・choices・正答を0件とする | 行削除だけ、discard後consume可、discard factまたはsafe snapshot本文をportable export、空判定で永久block |
| Content suspend worker | exclusive version lockの`frozenAt`で`sourceCommittedAt <= frozenAt`の進行中pin item、有効graded attempt、latest effective exam result、latest effective offline result/feedback pairだけからimmutable target snapshot/hashを作り、全user/cacheへ冪等fanoutする。後続resultの`sourceCommittedAt=revised_at`、過去/無効/`not_graded`/非latest/片側pair/境界後除外、target member→生成fact/revisionのappend-only materialization link/hash、target payload/result hash、user/global member set hashをexact検証する。部分失敗をcompletedにせずretry/dead-letter再開後に重複0・漏れ0・本文/feedback残留0へ収束。同時回答はlock順でsuspend後無採点 | active userだけ、mutable再scan、過去/無効attemptを対象化、link欠落/差替え、basis差替え、部分成功をcompleted |
| Content-control job/claim replay | authenticated enqueue request/receiptからcontent-control artifact、job、claim、lease/fencing tokenまでを一追跡chainで照合する。human enqueue operation ID/principal snapshot/request hash/response hashとworker internal operation ID/service principal snapshot/logical request hash/response hashを別field・別preimageで固定する。human response hashはstrict `EnqueueQuestionLifecycleOperationResponseV2`から`operationResponseHash`だけを除いたRFC 8785 JCS SHA-256とし、保存`human_response_json`の全field、JSON内hash、`human_response_hash`列、RPC responseをTS/SQL/独立goldenでexact一致させる。selfをpreimageへ含める、1-bit変更、field追加・欠落・swap、同hash別JSONをnegative fixtureで拒否する。両operation ID同値、principal swap、human response hashのinternal流用、request hash混同も拒否する。operation kindはsuspend/retireだけ、target・expected status/revision・reason・actor・request/response hash・recent-auth grantを一jobへexact結合し、同operation同入力だけを同receipt/jobへ収束させる。lease失効、worker kill、receipt保存前後のretryでも各operationの保存済みcanonical responseへ収束し、別actor/target/input、別worker/旧token/claim差替え、audit/fanout二重化を拒否する。anon/learner/管理UIのinternal実行0、internal responseの`resolvedReauthGrantId=null`を照合する | UIがinternal RPC直呼び、response hash自己包含、JSON/列/RPC不一致、human/internal principalまたはhashを共有、claimなし実行、lease失効後に別response、jobとartifact未結合、別actorで同operation再利用 |
| API strict error | code-discriminated `RpcErrorDto` unionの各`code` branchと`retryable`・branch固有fieldのliteral goldenを照合し、未知code、code/retryable不一致、余剰/欠落field、errorへの正答/解説/内部principal・claim混入をnegative fixtureで拒否する。public `detail`はcode別sanitized literalまたはnullだけで、PostgreSQL message/detail/hint/context、SQLSTATE transport detail、worker exception、Storage/Auth provider bodyの転記0をpayload/log/analyticsで証明する。未定義のstatus/retryability/error request・response hashは証跡へ要求しない。clientは未知errorを成功ACKへ変換せずstate/cursor不変のsafe error/quarantineへ収束し、operation hashはContent operation/Golden requestで別検証する | mockだけ、errorをsuccess化、DB/provider transport detail転記、未定義field/hashを契約化、秘密field返却 |
| Golden request/canonical | literal request JSON/JCS bytes、request hash、保存済みcanonical response bytes/hashをTS/SQL/独立fixtureで一致させ、同ID同内容は同response、同ID異内容・field欠落/余剰を拒否 | 実装関数でexpected生成、canonicalだけ比較 |
| Local persisted DTO | local session/item/draft/pending intent/attempt/outbox/ACK/cursor/conflict/cacheの全strict unionを`unknown`から検証し、nested余剰key、owner/generation/scope/hash不一致、未知versionでは現state不変 | TypeScript castだけ、top-levelだけ検査 |
| DR backup manifest | D-03 Aの別DR policy、共通binding、DB/Auth/Storage/deletion ledger upper bounds、RTO/RPO・traffic再開SLO、content-control chain、migration/tombstone/KMS/署名を照合した隔離restore drill。source identity全集合と物理row/linkをexact一致させ、discard portable input 0。B/C manifest/capability/restore経路0、入力拒否 | DBだけ復元、identity summaryだけ、link/SLO/binding欠落、B/C branch |
| M2/M4/M5 ACL段階 | 各migration境界でanswer table直接read 0、old client smoke、publish fail-closed、safe RPCだけauthenticated grant | 後段migration前に正答漏えい |
| Restore cutover | 旧client利用0を30日・rollback window終了・旧outbox 0・v1 portable復元後だけlegacy DML撤回し、空namespace E2E後にrestore flag有効化 | bridge稼働中にrestoreを有効化 |

## 3. PR共通受入

各PRで次を記録します。

1. base SHAとhead SHA
2. 変更目的と非対象
3. 既存test変更0の証拠
4. `git diff --check`
5. `pnpm check`
6. 対象固有testと件数
7. 実DB・E2E・実機が必要な場合の実結果
8. GitHub 5 required checksのapp IDと成功
9. unresolved review thread 0
10. 今回はSol xhigh、将来は実装者と別主体の独立reviewでBlocking/High 0
11. merge後main SHAの再検査
12. deployを伴う場合のsource SHAとsmoke

## 4. DB PR追加証拠

- `fresh`: 全migration＋全pgTAP履歴（phase 1）
- `origin-main-upgrade`: `origin/main`-shaped通常upgrade履歴（phase 2）
- `combined-order`: fresh/upgrade両経路のmigration ID/hash/順序・最終schema・RPC署名一致（phase 3）
- `atomic-failure`: 失敗注入時のDDL/data/history/audit残留0（phase 4）
- `production-boundary`: synthetic fixture stable ID/canary/本文/hashのproduction migration/seed/bundle/artifact混入0（phase 5）
- 正常fixtureのbackfill完全性
- 異常fixtureごとの部分適用0
- pgTAP test件数と全成功
- RLS role matrix
- trigger数、関数署名、grant
- 同時replay結果
- sync pull/server change feedのsnapshot pagination
- exam manual/read/sweeper同時finalize一件収束
- container label残留0
- secretを含まない診断log

## 5. Client PR追加証拠

- SQLite/IndexedDB両adapter
- account namespace切替
- kill pointごとの復元
- outbox retry、ACK、conflict、cursor
- Web bundle/source map leak scan
- desktop/mobile viewport E2E
- keyboard、focus、screen reader確認
- 全local persisted DTOのstrict schema fixture、未知version・nested余剰・cross-account/scope差替え拒否
- Web Chrome/Web Safari/iOS/Android別のwarm-cache次問・端末保存・同期raw trial、各target timeout/error 0、成功p95、offline別集計。端末保存はcache非層化、cold-start latencyはP1 telemetry objectiveとしてv2性能gate外
- 四targetのfresh install・空cache・有効session機能cold-start成功、crash/無限loading/cross-account/正答漏えい0の実機証跡

## 6. Content release追加証拠

- raw/canonical/manifest hash
- D-04のowner承認factと、承認済み`allocationVersion:1`に対する総数500、章、K、64 LO、single 440、multiple 60の全exact count。blueprint正本の`OfficialSourceRequirementRegistryV1`、必須3 source各exact一件の`OfficialSourceVerificationEvidenceV1`、`OfficialSourceVerificationCoverageV1` canonical bytes/hashを保存し、source ID/URL、exact version、`retrievedAt`、取得bytesのSHA-256、`verified`、runner、artifact hash、registryの6 claimを独立再計算する。basisのversion/hash/time/evidence ID/hash、coverage hash、personal/public manifest branchの`officialSourceVerificationCoverageHash`をexact一致させる。未verified、bytes不一致、source/claim不足、swap、不一致では500配分の生成/適用、stage/acceptance/public release、40問・60分・26点基準のactivationを拒否する。公式basis、40問章/K比率、500倍rational、最大の小数剰余・小数同率時章番号昇順の再計算を含む。D-04未決定ならrelease証跡を作らず未達とする
- self hash fieldなしのpersonal/public strict branch全fieldJCS goldenと、別objectの`ReleaseHashSetV2.manifestHash`。branch内self hash、stage別alias、未知fieldをstrict parseで拒否し、除外して元digestへ戻さないnegative evidence
- schema/意味/類似/著作権report
- personal previewはreviewing exact 500、blueprint生成型によるgeneration exact 500、G0〜G12 exact 6,500とAPI/DB lossless round-trip、AI coverage欠落等0、独立human coverage、owner blind/reveal/hide/audit artifact exact 500・decision全pass、owner acceptance、published projection不変
- freeze/review→immutable personal manifest→personal stage→accept/activate、および追加review→immutable public manifest→public stage→attestation→publishの順序fact
- public releaseはparent personal manifest hash、preview/technical/editorial coverage、4人attestation、publish後published exact 500
- author、technical、editorial、finalの承認状態
- revokeされていないこと
- stage DB canonical/manifest一致。V1 reviewのみのstage/accept/publish拒否
- blueprint §3.2.1を唯一の正本とするauxiliary hash全golden、identity target swap拒否、one-shot personal review完全sampling artifact hash
- numeric oracle formula/unit/domain/binding lossless artifact、review V2全branch/hash/golden、quality/review ID/digest negative fixture、release RPC strict/idempotency/pre-publish revoke barrier結果
- publish operation ID、source commit、run ID
- publish後の500件count/hash/catalog smoke
- private dataがGit、Actions、artifact、logにないこと
- suspendのstrict enqueue/internal receipt・有効target fanoutと、retireの`CatalogTombstoneDto(reason='retired')` exact一件・session/basis/feedback失効tombstone/target/fanout/link 0のstrict receipt、database 5 phase、runbook演習結果
- multi-user suspend fanoutとconcurrent answer、`sourceCommittedAt <= frozenAt`/後続`revised_at`境界、lease失効後response replayのbarrier同期結果
- accountability artifact exact 500と再利用0のsanitized coverage hash
- revisionごとのAI artifact全失効・再実行履歴、generator/blind/adjudicator独立、G12前提12hash、owner隔離review origin/cache、blind/reveal/hide/audit、全500 decision passのsanitized coverage
- server change fact history、`issue.updated`、basis discard、offline全ordinal feedback/A11y一回通知、legacy v1 strict restore union、物理child row由来identity summary、human/internalを分離したcontent-control artifact/job/claim、content suspend workerの受入artifact

初期運用のgoal証拠はpersonal-only acceptanceまでを対象にできますが、一般公開を完了扱いにはしません。public technical/editorial/mobile全500と4人attestationの行は将来gateとして`INCOMPLETE`のまま維持し、削除・免除しません。

## 7. Goal完了監査

Goalを完了扱いにする前に、要求一覧の全行を`PROVEN`へ更新します。`INCOMPLETE`、`WEAK`、`MISSING`が一件でも残る場合は完了にしません。CI成功、意図、部分実装、過去のコメントだけを完了証拠にしません。

この全件条件は本v2の規範scopeだけへ適用します。D-03 Aはpositive evidenceが`PROVEN`必須です。将来検討用の非規範D-03 B/Cは要求行・positive evidence・Goal分母へ含めず、policy/capability/manifest/CTAが0かつ入力拒否であるnegative evidenceだけをD-03 A行の一部として`PROVEN`にします。
