# UI・学習・問題コンテンツ契約 v2

## 1. 適用範囲

本書は、画面状態、遷移、表示文言、アクセシビリティ、誤答・克服・SRS、模試UX、500問作成・レビュー工程を固定します。対象は「個人が毎日JSTQBを学び、1問ごとの保存・根拠・定着を確かめる道具」です。個人利用でも保存、同期、正答非開示、RLS、削除、アクセシビリティは本番品質を維持します。

## 2. 共通画面状態

全データ依存画面は次を扱います。

```text
BOOTSTRAPPING
  -> LOADING
  -> READY
  -> EMPTY
  -> OFFLINE_CACHED
  -> OFFLINE_NO_CACHE
  -> AUTH_REQUIRED
  -> ERROR_RETRYABLE
  -> ERROR_PERMANENT
```

学習画面は次を追加します。

```text
LOCAL_SAVING
LOCAL_SAVED
SYNCING
SYNCED
SYNC_RETRYING
CONFLICT
STORAGE_FAILED
ITEM_SUSPENDED
SESSION_INVALIDATED
WAITING_FOR_GRADING
```

問題画面の固有signatureは、traceabilityを表す「学習証拠rail」です。`問題位置 -> 端末保存 -> 同期 -> 採点`を一つの連続した順序で示しますが、各stepを同一状態へ潰しません。mobileは問題見出し直下のcompact横strip、Webは本文横の静かなside railです。表示例は「3/10」「端末に保存済み」「2件を同期中」「採点待ち」で、`端末保存済み`を`同期済み`、`同期済み`を`採点済み`と表現しません。現在stepは文字、icon、形、`aria-current="step"`で示し、色だけに依存させません。rail以外の装飾的timeline、過度なcard、gradient、常時motionは追加しません。

## 3. 画面と主遷移

| 画面 | 必須状態 | 主操作・遷移 |
|---|---|---|
| 起動・復元 | local復元、remote差分、破損、offline | ホームまたはログイン |
| ログイン | 入力、送信、失敗、未確認、offline | ホーム、確認、再設定 |
| 登録・確認 | 入力、送信済み、期限切れ | ログイン |
| 再設定 | link検証、入力、完了、無効link | ログイン |
| 初期設定 | timezone、表示、syllabus | ホーム |
| ホーム | 最新中断、復習期限、offline、同期警告 | 1操作再開、中断一覧、復習、新規 |
| 中断一覧 | 複数、0件、競合 | 再開、明示終了 |
| 演習条件 | 章、節、LO、未回答、弱点、bookmark、候補不足 | 候補確認後に開始 |
| 復習ホーム | 今日、未克服、0件 | 今日、誤答条件、予定 |
| 誤答条件 | 未克服、直近、7/30/90日、全、克服済み | 固定集合で開始 |
| 模試開始 | 厳格/練習、online、候補不足 | DB開始後に問題画面 |
| 通常問題 | 選択、部分選択、保存、採点待ち、feedback、停止 | 確定、次問 |
| 模試問題 | 未回答、回答済み、見直し、期限切れ | 前後、一覧、提出 |
| 問題一覧 | 未回答、回答済み、見直し、停止 | 問題へ移動 |
| 結果 | 完了、無効化、有効0 | 解説、復習、ホーム |
| 履歴・分析 | データ、0件、母数不足 | session/章/LO/期間 |
| Bookmark | 一覧、0件、retired含む | 演習、解除 |
| 同期 | synced、pending、retry、auth、permanent | 再試行、ログイン、詳細 |
| 競合 | draft、note | local、remote、後で解決 |
| 問題報告 | 入力、offline待ち、完了 | 問題へ戻る |
| 設定 | 表示、学習、同期、データ、account | 各詳細 |
| Export/Restore | 再認証、作成、期限、dry-run、競合 | download、復元 |
| Account削除 | 再認証、challenge、処理、完了 | 全端末logout |
| 問題管理 | preview、review、報告、停止 | owner/admin限定 |
| AI/owner review coverage | G0〜G12、未review、差戻し、stale | owner隔離origin限定、問題単位review |

主要遷移:

```text
ホーム
 ├─ 続きから -> 問題
 ├─ 中断中 -> 中断一覧 -> 問題
 ├─ 演習 -> 条件 -> 候補確認 -> 問題 -> 結果
 ├─ 復習 -> 今日 / 誤答条件 -> 問題 -> 結果
 └─ 模試 -> 開始 -> 模試問題 <-> 問題一覧 -> 提出 -> 結果
```

通常問題:

```text
HYDRATING
 -> ANSWERING
 -> LOCAL_SAVING
 -> ANSWERING_LOCAL_SAVED
 -> ANSWER_QUEUED
    -> FEEDBACK
    -> WAITING_FOR_GRADING
    -> ITEM_SUSPENDED
 -> NEXT_ITEM
```

端末transaction成功前に`NEXT_ITEM`へ遷移しません。

確定後はchoicesをlockし、offline時は次を表示します。

> 回答はこの端末に保存済みです。接続後に採点します。

現在画面の確定操作に対するfeedbackが到着し、利用者が同じ問題にいる場合だけfeedback見出しへfocusします。別問題へ移動済みならfocusを移さず、`polite`で「前の問題の採点が完了しました。」とだけ通知します。履歴から戻った場合は問題見出しへfocusし、feedbackは通常のreading orderで読みます。

通常演習で別端末の回答確定後に古い`draft.saved`が到着した場合、serverは成功ACKの`superseded-by-answer`を返し、canonical draft/attemptを更新しません。ACKの`supersededByAttemptId`と`supersededByAttemptHash`はserver canonical attemptのID/hashへexact一致させます。端末は両値を検証してから、ACK、対象outboxの`SUPERSEDED`化、同itemのpending intent/conflict除去、同じID/hashのcanonical attempt表示への切替を一つのlocal transactionで適用します。欠落、不一致、別attemptへの差替えでは成功表示やoutbox終了を行わず、safe errorへ収束してpull/bootstrapを要求します。「別の端末で回答が確定したため、この下書きは送信しませんでした。」と表示し、解決済み競合CTAや再送CTAを残しません。transaction途中の強制終了後も同じACKを再適用してcanonical attemptへ収束します。

### 3.1 問題issueと管理操作

問題issueの状態遷移は次だけを表示・許可します。

```text
open -> investigating
open -> resolved
open -> rejected
investigating -> resolved
investigating -> rejected
```

`resolved`と`rejected`はterminalです。terminal issueを再検討する場合は新規issueを作り、履歴を巻き戻しません。作成者本人には`open`で「報告を受け付けました」、`investigating`で「内容を確認しています」、`resolved`で「対応が完了しました」、`rejected`で「確認の結果、変更は行いませんでした」を表示し、管理者には旧状態、新状態、必須reason、server時刻、actor表示名をappend-only履歴として表示します。未許可遷移のCTAは出さず、競合時は「状態が更新されました。最新の履歴を確認してください。」と表示して再取得します。非同期遷移成功時は同じissueを表示中なら状態見出しへ一度だけfocusし、別画面なら現在focusを維持して短い`polite`通知だけを行います。

管理UIはinternal RPCを直接呼びません。personal acceptance、activate、revoke、attest、attestation revokeだけは確認画面にoperation IDと入力hash短縮値を表示し、authenticated callerのrecent-authを初回成功時に一回だけconsumeします。通信再送はstrict operation receiptの同じcanonical結果を表示して再認証を要求しません。suspend/retireはrecent-auth済みauthenticated enqueue request/receiptだけを作り、「受付済み」「処理中」「完了」を表示します。端末はenqueue responseの`operationResponseHash`自身だけを除いたstrict responseのRFC 8785 JCS SHA-256を再計算し、response field、保存JSON、hashが一致した場合だけ「受付済み」へ遷移します。hash自己包含、field欠落、1-bit不一致では成功表示せず、「操作の受付結果を確認できません。最新状態からやり直してください。」と表示します。保存済みprincipal snapshotとclaimを取得したworkerだけがinternal operationを行い、internal responseの`resolvedReauthGrantId=null`をUIがgrant成功表示へ転用しません。stage/publishはcontrol plane専用で、管理UIに直接実行CTAを出しません。同じoperation IDへ異なる入力が検出された場合は「操作内容が一致しないため再送できません。最新状態からやり直してください。」と表示します。publish待機中にacceptance/attestationがrevokeされた場合は「公開条件が変更されたため、公開しませんでした。」と表示し、公開済みと誤表示しません。

問題管理画面は署名済みruntime capabilityとserver ACLの両方が許可し、database必須literal 5 phase（`fresh`、`origin-main-upgrade`、`combined-order`、`atomic-failure`、`production-boundary`）が同じexact headで成功した操作だけを表示します。期限切れ、不正署名、RPC/ACL/main SHA/DB証跡不一致では「管理機能の安全確認ができないため、現在は操作できません。」と表示してfail closedにします。

runtime control `cryptographicReleaseAttestationRequired=false`かつ`cryptographic-release-attestation-v1` featureがOFFの場合だけ、P0 recent-auth acceptance/attestationを表示し、「暗号署名」「否認防止」と表現しません。controlがtrueでfeature OFFまたは依存不足の場合はaccept、attest、stage、publishを非表示・拒否し、「暗号学的な公開要件を満たしていないため、問題の受入・公開は現在できません。」と表示します。control欠落/nullはfalseへdefaultせず同じfail-closed表示です。control=trueかつP1 feature・全依存が検証済みの場合だけ暗号経路を表示します。この分岐にかかわらずglobal suspended statusと配備済み緊急suspend開始操作は維持し、事故対応を暗号機能の不足で隠しません。

suspend操作は開始時の`frozenAt`で固定した`sourceCommittedAt <= frozenAt`の対象snapshot/hashと件数を表示し、workerが有効graded attempt、各模試のlatest effective result、各offline参考模試のlatest effective result/feedback pair、進行中pin itemへfanout中は「停止処理中」、receiptがexact完了した時だけ「停止済み」と表示します。後続result revisionの`sourceCommittedAt`はimmutable `revised_at`です。過去・無効・`not_graded`・latestでないrevision・境界後到着は対象件数へ含めません。端末は各停止changeのoperation ID、target member ID、materialization link ID/hash、target/user member set hashを検証して同一local transactionでitem・結果・cacheへ反映し、欠落、重複、別memberへの差替え、hash不一致では本文・回答操作をfail-closedにして「問題の停止情報を確認できません。同期をやり直してください。」を表示します。部分失敗を完了扱いせず、同operationの再開状況を表示します。retireは対象catalog streamへ`CatalogTombstoneDto(reason='retired')`をexact一件配信して新規候補から除外しますが、session/basis/feedback失効tombstone、target snapshot、fanout、materialization linkは0件です。既存pinの本文・回答・feedbackをpurgeせず開始時版のまま閲覧・再開し、「この問題は廃止済みです。新しい演習には出題されません。この演習では開始時に固定した版を表示しています。」と表示します。

## 4. 表示文言

### 4.1 保存・同期

| 条件 | 文言 | 操作 |
|---|---|---|
| 書込み中 | 「保存中…」 | なし |
| 端末保存済み | 「この端末に保存済み。接続すると同期します。」 | 同期状態 |
| 送信中 | 「同期中…」 | なし |
| 完了 | 「同期済み」 | なし |
| 一時失敗 | 「同期できません。接続を確認し、自動で再試行します。」 | 今すぐ再試行 |
| 認証切れ | 「同期を再開するには、もう一度ログインしてください。この端末の内容は残っています。」 | ログイン |
| 恒久エラー | 「この内容は同期できませんでした。アプリを更新して、もう一度お試しください。」 | 詳細 |
| 競合 | 「別の端末にも変更があります。残す内容を選んでください。」 | 競合確認 |
| 保存失敗 | 「保存できません。空き容量を確認してください。保存できるまで次の問題には進めません。」 | もう一度保存 |

通常の同期完了でfocusを移しません。一時失敗は`polite`、保存不能は`assertive`で通知します。

公開`RpcErrorDto.detail`はcodeごとのsanitized literalまたは`null`だけを表示します。PostgreSQL message/detail/hint/context、SQLSTATEに付随する内部文、worker exception、Storage/Auth provider本文を転記せず、未知detailやtransport error本文は端末log、analytics、画面の「詳細」にも保存・表示しません。

### 4.2 空状態・候補不足

| 条件 | 文言 | CTA |
|---|---|---|
| 中断0 | 「中断中の演習はありません。」 | 新しい演習 |
| 未克服0 | 「未克服の問題はありません。次は今日の復習で定着を確認しましょう。」 | 今日、未回答、章別 |
| 今日0 | 「今日が期限の復習はありません。」 | 未回答、弱点 |
| Bookmark 0 | 「ブックマークした問題はありません。問題画面のしおりから追加できます。」 | 演習 |
| 履歴0 | 「回答履歴はまだありません。1問回答すると、ここに記録されます。」 | 最初の演習 |
| 分析0 | 「分析できる回答がまだありません。」 | 10問解く |
| 10問指定・候補7 | 「条件に合う問題は7問です。重複させず、7問で開始します。」 | 7問で開始、変更 |
| 候補0 | 「この条件に合う問題はありません。」 | 条件変更、reset |
| 模試40未満 | 「模試に必要な40問を準備できません。問題の公開状況を確認してください。」 | ホーム |

候補不足時に別範囲の問題を無断追加せず、重複出題しません。

### 4.3 選択数

単一選択:

> 1つ選んでください。

複数選択:

> 2つ選んでください。2つすべてが正しい場合に正解です。

不足:

> 2つ選ぶ必要があります。現在は1つ選択しています。

超過:

> 選べるのは2つまでです。別の選択を解除してください。

確定ボタンはfocus可能とし、実行時に不足理由を通知します。

### 4.4 競合

見出し:

> 別の端末にも未確定の回答があります

本文:

> この端末の選択と、別端末で保存された選択が異なります。正答はまだ確定していません。残す方を選んでください。

表示:

- この端末の選択、端末名、保存日時
- 別端末の選択、端末名、保存日時

操作:

- この端末の回答を使う
- 別端末の回答を使う
- 後で決める

メモは全文比較できるようにし、非採用版もconflict auditへ保持します。確定回答はdraftへ戻さず、canonical attemptを表示します。

### 4.5 停止・改訂

suspended:

> この問題は訂正中のため、採点対象から外しました。回答履歴は保持されます。

retired pin版:

> この問題は廃止済みです。新しい演習には出題されません。この演習では開始時に固定した版を表示しています。

模試無効化:

> 訂正中の問題が含まれるため、この模試の合否は判定しません。参考として26 / 39点を表示します。

session invalidated:

> この演習は利用できなくなりました。保存済みの回答履歴は保持されています。

suspended問題は新規本文・choices・正答・解説・feedbackを取得せず、画面表示中の停止でも確定させません。bootstrap/cold resumeではcatalog、session、selection basisを同じserver snapshotへ結合し、suspended versionを本文・choices・feedback fieldのないstrict tombstone unionとして返します。端末は一つのlocal transactionでcatalog/session/basisの参照をtombstoneへ切り替え、content cache、進行中draft、fanout pendingに残る本文・choices・feedbackを同時purgeします。

### 4.6 強制終了・復元

> 前回の学習を復元しました。この端末に保存された位置から再開できます。

未送信:

> 回答はこの端末に保存済みです。接続後に採点します。

local破損・remoteあり:

> この端末の保存データを読み込めませんでした。同期済みデータから復元します。

offline開始版の検証不能:

> この演習で使用した問題版を確認できないため、まだ同期できません。端末に保存した回答は削除されません。

stale clientがserver-origin専用eventまたは`origin='server'`を送信した場合:

> このアプリのバージョンでは同期できません。更新してから再開してください。端末に保存した内容は保持されています。

clientは`origin`をserverへ自己申告・書換えせず、server-origin eventをoutboxへ生成しません。contract versionが古いrequestは保存済みclient-origin outboxをcurrent/server-originへ自動変換せずread-only quarantineへ隔離し、更新後の明示的な互換処理まで再送しません。

復元元なし:

> 保存データを復元できませんでした。この演習は中断一覧に残し、サポート用の診断情報を作成します。

server portable restoreで学習namespaceが空でない場合:

> このアカウントには学習データがあるため復元できません。現在のデータを上書き・結合することはできません。

P0では空namespaceのdry-runが`canApply=true`になり、target generationのactive selection basis集合がemptyの時だけ「復元を確定」を表示します。空判定ではconsume済みbasisと未consume・未discard basisをnon-emptyとして扱い、discard済み未consume basisとそのdiscard auditだけをblocking集合から除外します。既存データの置換、merge、削除して続行するCTAは表示しません。旧client write bridgeの停止条件が未達、またはproduction capability gateがOFFの場合はrestore upload/確定を非表示にし、「現在はエクスポートのみ利用できます。」と表示します。dry-run画面はstrict count、既知conflict code、source/target generation、report hash短縮値に加え、`sourceIdentitySets`としてsession/event/command/selection-basisの各ID件数と集合hashを示します。finalizeは同じreport hashと`sourceIdentitySets`へ拘束しますが、source/targetのbasisをconsume、discard、sessionへ適用する操作ではありません。targetにactive basisが一件でも現れた場合、暗黙破棄せず確定CTAを消し、利用者が別操作で処理した後に新dry-run・新recent-authを要求します。一IDの追加・欠落・差替え、report hash変更、再認証grantの別対象流用を拒否します。

新端末・local破損・restore後のserver bootstrapは、selection basisの発行済み/unconsumed、consumed、discardedの全lifecycle、source revision/hash、terminal fact、command receiptと、発行時に固定した回答前safe prompt/choices snapshotを全branchでlosslessに端末へ交換します。正答、正答boolean、解説、feedbackはどのbranchにも含めません。consume/session開始を許可するのはunconsumedだけで、consumed/discardedのsafe snapshotは復旧・監査用read-onlyです。portable exportはsessionが参照するconsume済みbasisだけをbasis ID、version、ordinal、choice order、consumed event IDで保持し、未consume basis、discard済みbasis、discard fact/audit、prompt/body/choicesを一切含めません。同じdata generationでもserver lifecycleを正本とし、serverがcompleted、abandoned、invalidated、acceptance-revokedなどterminalなのにlocalがactive/paused/draft pendingを持つ不一致はcurrentへoverlayせずread-only quarantineへ隔離します。「別の端末でこの演習は終了しています。最新の状態を表示しました。」と表示し、terminal session、basis、catalogをlocal optimistic stateから復活させません。generation変更時は旧session/outbox/command receipt/basis/cursor/pending/conflict/historyをread-only quarantineへ一括退避し、交換中の強制終了後も旧writeを再送せず、安全な復旧画面から再試行します。

selection basisのserver原本とsource hashはsuspend後もappend-only監査用に不変ですが、bootstrap/cold resumeの端末projectionでは該当itemをsafe snapshot本文ごと保持しません。suspended branchはversion/ordinal/status/reason/revisionだけのtombstoneに射影し、local content cacheとfanout pending payloadの本文・choices・feedbackを0件へpurgeします。catalog/session/basisのどれか一つでも同じsnapshotでpurgeできない場合は三者とも旧local stateを維持して復旧画面へ移り、部分適用しません。acceptance-revoked branchもsession、basis、catalogを本文・choices・feedbackなしの失効tombstoneとして返し、bootstrapで同acceptanceのsafe snapshotを再配布しません。local cacheは同じatomic swapでpurgeし、owner以外やrevoke済みownerへの再配布を0件にします。

logout時に未送信がある場合:

> 同期していない内容が3件あります。ログアウト後も、このアカウント専用の端末領域に保持し、別のアカウントには表示しません。共有端末上の秘匿は保証しません。

既定操作は「この端末に残してログアウト」で、namespaceを保持したままmemoryからunloadします。「同期してログアウト」「キャンセル」も選べます。明示discardは別の危険操作に分離し、未送信件数、不可逆警告、再確認を表示します。account A→B→A、未送信保持、明示discardをE2Eで検証します。

アカウント削除受付後はsessionを破棄する前にreceipt tokenを端末の削除専用一時領域へ保存し、通常のaccount namespaceと分離します。削除状況画面はAuthなしのreceipt endpointで`pending/completed/failed`だけをpollし、完了時に同sequenceのledger entry hashとexternal tombstone hashを結合したarchive receipt hashの短縮値と保存用receiptを表示します。challengeからexternal tombstone、combined receipt、D-03 AのDR manifestまで、共通`DeletionPolicyBinding`の`environment='production'`、activation fact ID/revision、policy snapshot ID/body/hashを全段exact一致させます。receiptにはこのbindingから安全に射影したpolicy ID/version/hash、server時刻から別々に算出した通常領域削除期限とbackup実効消去期限を表示し、job途中の延長や差替えを許しません。external tombstoneは`storageSubjectDigest`の値・algorithm・key ID/versionを署名対象へ含めます。combined archive receipt自身は同じdigest値と`externalTombstoneHash`だけを署名対象へ持ち、algorithm/key tupleはtombstone hashから検証します。external tombstone、combined receipt、object keyのexact一segment、immutable metadata tupleとのdigest四者一致と署名検証が完了した場合だけ削除完了を表示します。token本文、digest、内部bucket/object key、principal IDは画面・portable export・logへ表示しません。receipt token自体の24時間期限、別端末ではtokenがないと確認できないこと、token紛失時に個人情報を復元できないことを受付前に説明します。完了・期限切れ・利用者の明示破棄で一時tokenを消去します。

D-03 v2の唯一のpositive policyはAです。受付前とreceiptで「通常領域の削除期限: 受付後24時間以内」「災害復旧用バックアップの実効消去期限: 受付後30日以内」を別の行・別のstatus field・別のdeadlineとして表示し、24時間をbackup消去期限、30日を通常領域へのアクセス期間として扱いません。固定文言は「通常領域は受付後24時間以内に削除します。災害復旧用バックアップは通常利用できず、受付後30日以内にローテーションで実効消去します。復元時は削除記録を先に再適用します。」です。raw UUID、owner digest、内部Storage keyを画面・receipt・logへ表示しません。

D-03 B/Cは将来検討用の非規範案であり、本v2にpolicy、runtime capability、manifest branch、設定、同意画面、選択肢、CTAを実装しません。B/Cのpolicy ID、capabilityまたはmanifestをserverから受けた場合はfail closedし、「このデータ保護方針は現在利用できません。」だけを表示します。B/Cをpositive受入や`PROVEN`条件へ含めません。

設定の「データの保存とバックアップ」は実装語を前面に出さず、次の平易な4分類を常に同じ順で表示します。

| 表示名 | 平易な説明 | 誤認防止 |
|---|---|---|
| この端末への保存 | 今選んだ答えと中断位置を、この端末へすぐ保存します | 別端末へはまだ届いていない場合がある |
| アカウント同期 | 接続時に学習履歴をアカウントへ送り、Webとスマホで続けられます | 同期前でも端末保存済みなら消失とは表示しない |
| 手動エクスポート | 自分で保管できる学習データを書き出します | 自動backupでもDB復元でもない |
| 災害復旧用バックアップ | サービス障害から戻すための運営側の保護です | 個別の「元に戻す」操作ではなく、D-03 Aの30日実効消去期限を通常領域24時間削除と分けて表示する |

各行は現在状態、最終成功時刻または「未実行」、対象範囲、できないことを表示します。D-03 Aの詳細は「災害復旧用バックアップ」の補足にだけ表示します。B/Cは選択肢や説明branchとして表示しません。

## 5. Responsive

| 環境 | レイアウト |
|---|---|
| 320～767px | 1 column、下部navigation、safe area上のthumb reachへ主操作 |
| 768～1023px | 1 column基本、回答後だけ任意2 pane |
| 1024px以上 | 左navigation、本文max 720px、補助max 320px |
| 文字200% | 1 columnへ戻す |
| 横向きmobile | DOM順維持、縦scroll |
| software keyboard | 入力・確定を隠さず、固定footer解除可 |

- 320pxでページ全体の横scrollなし。
- DOM順と視覚順を一致させる。
- sticky操作が最後のchoice、error、feedbackを覆わない。
- hoverだけで情報を出さない。
- mobileで固定footerを複数置かない。
- mobile下部navigationとWeb左navigationは「ホーム / 演習 / 復習 / 記録 / 設定」の同じ情報設計・順序・routeを使う。
- Web補助paneは進捗、問題一覧、学習証拠rail等の補助情報だけを置き、主操作や必須errorをmain columnから除かない。
- viewport幅だけでなく、touch/keyboard、文字倍率、software keyboard、safe area、content長を優先して1 columnへ戻す。回答前後の意味状態をbreakpointで変えない。
- Webはhoverを補助に限定し、同じ情報と操作をfocusで提供する。mobileのhapticは任意で、音・振動だけを成功証拠にしない。
- `prefers-reduced-motion`またはOSの動きを減らす設定ではrailの移動animationをなくし、状態を即時更新する。

## 6. Keyboard・読み上げ

### 6.1 Web

- route遷移時に`h1`へfocus。
- Tab順はDOM順。
- radioは矢印キー、checkboxはTab/Space。
- 問題一覧はroving tabindex。
- modalはfocus trap、終了後は起点へ戻す。
- 不足選択時はinline errorへfocus。
- `STORAGE_FAILED`と操作継続不能なpermanent errorは、同じerror instanceの初回表示時だけページ内error summary見出しへfocusし、復旧CTAを次のTab stopにする。再render・retry失敗でfocusを奪い直さない。
- `AUTH_REQUIRED`は利用者が現在問題を操作中ならfocusを保持してassertive live regionで通知し、「再ログイン」CTAを直後のTab stopにする。認証modalを利用者が開いた後だけmodal見出しへfocusする。
- retryable network errorは現在focusを保持し、polite live regionで「端末保存済み・再試行中」を一度通知する。自動retryごとに読み上げず、retry永久失敗へ遷移した時だけerror summaryへfocusする。
- field validation errorは当該fieldまたはerror summaryの先頭invalid field linkへfocusする。複数errorはDOM順で一覧化し、色だけで示さない。
- 利用者が回答を確定した同一問題を表示中で、その確定に対応するfeedbackが初めて到着した場合だけfeedback見出しへfocusする。別問題、履歴、modal、別taskを操作中の場合、再取得・再同期の場合はfocusを移さず、短い`polite`通知だけを行う。VoiceOver/TalkBackにも同じ条件を適用する。
- 次問後は新しい問題見出しへfocus。
- focus indicatorは2px相当、3:1以上。

### 6.2 読み上げ例

- 「問題3、全10問中」
- 「A、品質情報を提供する、ラジオボタン、未選択、1/4」
- 「B、欠陥を予防する、チェックボックス、選択済み。2つのうち1つを選択済み」
- 「問題7、回答済み、見直し対象」
- 「不正解。正解と解説を表示しました。」

模試timerを毎秒読み上げず、残り10分、5分、1分、時間切れだけを通知します。

### 6.3 実機完了経路

VoiceOver/TalkBackだけで次を完了します。

1. 最新session再開
2. 単一選択確定とfeedback
3. 複数選択確定
4. 一覧から未回答へ移動
5. Bookmark、報告
6. 誤答filter開始
7. 模試提出
8. Draft競合解決
9. 再ログイン後同期

feedback focusはonline即時採点、offline確定後に同一問題で同期、次問移動後の前問feedback到着、feedback再取得、screen reader操作中の背景同期を別々に試験します。前二者でも同一問題を表示中かつ初回到着だけfocusし、それ以外は現在のfocusを保持します。

## 7. 誤答・克服

```text
NEVER_WRONG
 -> wrong -> UNRESOLVED(streak=0)
 -> 別session correct -> UNRESOLVED(streak=1)
 -> さらに別session correct -> RECOVERED
 -> wrong -> UNRESOLVED(streak=0)
```

有効attempt:

- DB採点済み
- invalidatedでない
- suspendedでない
- 模試は提出済み
- `offline_unverified`は有効attemptではなく、克服、誤答、SRS、正式分析を更新しない

同じsessionの正解でstreakを複数進めません。順序は`answered_at, received_at, attempt_id`で一意化します。

| ID | 条件 | 結果 |
|---|---|---|
| W-01 | 初回誤答 | 未克服、streak 0、10分後 |
| W-02 | 別sessionで正解 | 未克服、streak 1 |
| W-03 | 同sessionで再正解 | 増加なし |
| W-04 | さらに別sessionで正解 | 克服 |
| W-05 | 克服後誤答 | 未克服、streak 0 |
| W-06 | 正解attempt無効化 | 履歴から再構築 |
| W-07 | suspended | 候補・分母外 |
| W-08 | retired | 新規候補外、履歴保持 |
| W-09 | 全期間 | 克服済みも含む |
| W-10 | 候補不足 | 重複なし、実数表示 |
| W-11 | 0件 | 代替CTA |
| W-12 | event再送 | 二重更新なし |

breaking改訂は旧履歴を保持し、`needs_revalidation=true`で新版を復習期限到来として扱います。

## 8. SRS

初回正解の段階は次へ統一します。

| 状態・回答 | 更新 |
|---|---|
| 初回答が正解 | stage 0、`next_review_at=+1日` |
| 誤答 | stage 0、`remediation_due_at=+10分`、`next_review_at=null`、`mastered_at=null` |
| remediation期限前の正解 | 克服streakだけ更新可。remediationとSRS期限は変更しない |
| remediation期限以後の正解 | `remediation_due_at=null`、stage 0、`next_review_at=+1日` |
| stage 0期限後正解 | stage 1、3日後 |
| stage 1期限後正解 | stage 2、7日後 |
| stage 2期限後正解 | stage 3、14日後 |
| stage 3期限後正解 | stage 4、30日後 |
| stage 4期限後正解 | stage 5、90日後 |
| stage 5期限後正解 | stage 5、90日後 |
| 期限前正解 | stage・期限を進めない |
| 任意stageで誤答 | stage 0、10分後、定着解除 |

`effective_due_at = remediation_due_at ?? (needs_revalidation ? DB clock_timestamp() : next_review_at)`です。今日の復習は`effective_due_at <= DB clock_timestamp()`だけを対象にし、同じ問題をrevalidation/remediation/通常SRSへ重複表示しません。breaking直後は即時対象、再確認中の誤答は10分のremediation期限を優先します。定着は`needs_revalidation=false`、stage 4以上、latest valid attempt正解の全条件です。stage 3期限後正解で初めてstage 4へ達したserver時刻を`masteredAt`へ設定し、誤答・breaking・根拠attempt訂正/無効化で条件を失えばnullへ戻します。DB時刻を正本とし、attempt列から同じstateを再構築できることを要求します。

## 9. 模試UX

### 9.1 厳格・練習

| モード | 条件 | 表示 |
|---|---|---|
| 厳格模試 (`verified_only`) | DB時計とserver受信draftを検証 | 正式記録 |
| 練習模試 (`allow_offline_reference`) | offline継続可 | 参考記録、正式分析外 |

一般公開のprimary CTAは厳格模試です。練習模試を許可するかは詳細設計D-02で承認します。

ownerの`personal_preview`では通常演習と模試を許可します。模試開始・制限時間がserver verifiedでも「個人プレビュー・一般公開前」を常時表示し、published正式合格・正式分析・published SRSへ混入させません。acceptance revoke時は結果/回答画面を終了してrevoked tombstoneを表示します。

両policyとも新規開始はonline必須です。`allow_offline_reference`は個人設定で明示的に有効化し、同じlocal bundleの再送を同一参考結果へ収束させます。

### 9.2 開始

表示:

- 40問、60分、1問1点
- 出題時点の単一/複数選択比率は固定せず、公開中の`examEligibility='eligible'`問題から章・K配分だけをexact充足する
- 有効分母40なら26点以上
- 提出まで正誤・解説なし
- アプリを閉じても時計は停止しない
- 厳格模試は接続が必要

DBから固定問題、版、順、choice順、期限を受け取る前に問題画面へ遷移しません。

### 9.3 提出

1. pending draftを同期する。
2. 未送信時は「回答を同期しています。完了すると提出確認へ進みます。」
3. 「回答済み38問、未回答2問、見直し3問です。提出後は回答を変更できません。」
4. 「提出する」「模試に戻る」
5. terminal成功後だけ結果へ遷移する。

時間切れ:

> 制限時間になりました。保存済みの回答を提出しています。

厳格模試でoffline:

> 接続が切れています。この端末への保存は続けられます。厳格成績では、期限までにサーバーへ届いた回答だけが採点対象です。

練習模試:

> オフライン中の回答を含むため、この結果は参考記録です。

通常のoffline演習は模試と分離し、cached/pin済み問題だけを単一列の問題画面で続行できます。選択と中断位置は一問ごとに端末へ保存し、確定後は「この端末に保存済み・採点待ち」と表示します。正答・解説・takeaway/common trapは保持せず、接続後のcanonical採点まで表示しません。安全なselection basisがない時は新規演習を作らず、「オフラインでは新しい演習を始められません。保存済みの演習は続けられます。」と案内します。正式模試は「正式模試」、offlineを許すmodeとその履歴は全画面で「オフライン参考模試」と表示し、合格badge、正式模試trend、誤答、SRSへ混ぜません。

### 9.4 結果

- 「合格　28 / 40点」
- 「不合格　24 / 40点」
- 「1問を訂正中のため、この模試の合否は判定しません。参考得点は26 / 39点です。」
- 提出後の停止・正答訂正・attempt無効化で`resultRevision`が増えた場合は「問題内容の訂正により結果を更新しました」と旧新得点・理由を表示し、他端末も同じrevisionへ収束する。

有効分母がexact 40の時だけpassing scoreは26です。分母40未満では`passed=null`、`resultStatus='invalidated'`とし、公式合否・verified分析へ算入しません。分母0でも合否を出しません。

期限中にofflineだった端末回答を採用する場合は、専用`submit_offline_exam_reference_v2`でitem別の個人参考結果だけを作り、本人は提出後に専用feedbackを取得できます。初回確定後の停止またはacceptance revokeでも元のterminal fact/resultを更新せず、append-only `resultRevision`と`feedbackRevision`を別々に発行します。result revisionは保存済み全item ordinalをexact一件ずつ昇順で保持し、影響itemだけ`excluded=true`、`isCorrect=null`、`score=null`へ置き、非影響itemの回答済み/未回答値を保持したままeffective score/denominatorを全ordinalから再計算します。feedback revisionも全ordinal exactを保持し、影響ordinalだけを`Unavailable` tombstoneへ置換し、非影響ordinalは従前のanswered/unanswered branchを保持します。全ordinalを一律tombstone化する実装を禁止します（全itemが実際に影響対象の場合を除く）。tombstoneはprompt、choices、正答、総合解説、choice別理由を返しません。result/feedbackのrevision IDとparent revisionを別cache keyで保存し、両方が揃った時だけ「問題状態の変更により参考結果を更新しました。影響のない問題の結果は変わりません。」と表示します。通常の提出、verified attempt、正式terminal、克服、SRS、verified分析へ混入させません。採用可否は詳細設計D-02のowner承認事項です。

通常模試の新しい完全`resultRevision`、またはoffline参考模試の同一parentへ結合された完全`resultRevision`＋`feedbackRevision`を端末が初めてatomic適用した時だけ、表示中の画面・modalにかかわらず現在focusを維持したまま`role="status" aria-live="polite"`で更新理由、実効得点/分母、合否（`passed=null`なら「合否判定なし」）をexact一回通知します。同じ結果画面にいても結果見出しへ自動focusせず、別画面・modal操作中もfocus移動0で短い通知exact一回とします。offline参考は両revisionが揃うまで通知0です。同じrevisionのrerender、retry、bootstrap replay、別端末からの再受信では再通知0です。Web keyboard/screen reader、VoiceOver、TalkBackで同じ一回性を保証します。本段落をA11y通知内容のUI正本とし、詳細設計・実装・翻訳で「結果を更新しました」等の汎用文だけへ縮退したり、理由、実効得点/分母、合否、`role="status"`のいずれかを省略したりしません。

### 9.5 Feedback表示順

1. 回答済みは「正解」または「不正解」、未回答は「未回答（0点）」の見出し
2. 自分の回答
3. 正答
4. 総合解説
5. 各choiceの「あなたの選択」「正答」「誤答」と理由
6. 「今回の要点」としてtakeaway、「よくある誤解」としてcommon trap
7. LO・参照箇所
8. 次問操作

未回答branchでは「自分の回答: 選択なし」と表示し、模試提出後またはoffline参考結果確定後だけ正答・総合解説・choice別理由・takeaway/common trapを続けます。通常演習は回答確定後のfeedback到着時、模試は提出後、offline参考は結果確定後だけtakeaway/common trapを取得し、回答前catalog/selection basis/問題cacheへ保存しません。`isCorrect=null`を「不正解」へ変換しません。suspended/revoked tombstoneでは両fieldを表示・読み上げません。

feedback region全体を`aria-live`にしません。利用者が確定した同一問題を表示中の初回feedback到着だけ見出しへ明示focusし、次問移動後、再取得、背景同期では長い解説を読み上げません。模試提出で現在表示中の未回答問題へ初回feedbackが到着した場合も「未回答（0点）」見出しへfocusし、別問題・結果一覧・別taskへ移動済みならfocusを維持して短い`polite`通知だけを行います。suspended/acceptance-revoked tombstoneでは正答、解説、choice結果を表示・読み上げません。

## 10. 500問契約

### 10.1 配分

- 総数: owner承認後に500 exact
- 章: owner承認後に100 / 75 / 50 / 138 / 112 / 25 exact
- K: owner承認後に100 / 300 / 100 exact
- 単一選択: owner承認後に440 exact
- 複数選択: owner承認後に60 exact
- 複数選択の章配分: owner承認後に12 / 9 / 6 / 17 / 13 / 3 exact
- 複数選択のK配分: owner承認後に6 / 39 / 15 exact
- 64 LO exact countはowner承認後に`allocationVersion:1`のquotaとして固定する

公式根拠は`ISTQB Exam Structure Tables v1.18`のCTFL 40問章別`8 / 6 / 4 / 11 / 9 / 2`、K別`8 / 24 / 8`です。章別は`500 * officialCount / 40`をfloorし、残数を最大の小数剰余へ配り、小数剰余が同率なら章番号昇順で決めます。このため第4章137.5、第5章112.5のうち第4章へ一題を加えます。source版・digest・確認時刻・小数同率規則を`officialExamStructureBasisHash`へ固定し、basisとhashをallocationへ含めます。公式構成が変われば新allocation versionとします。

本節の値はD-04の推奨案です。総数、章、K、64 LO、single/multipleのすべてをownerが`allocationVersion:1`として承認した後だけrelease invariantへ昇格し、問題生成前にmanifestへexact固定します。D-04未決定の間は作問計画であり、personal preview activation、public manifest作成、公開を行いません。生成後の数合わせで変更せず、品質を満たした問題が不足する間は公開を延期し、低品質問題で件数を埋めません。

### 10.2 K別作問

- K1: 用語、目的、役割、成果物、対応関係の認識。
- K2: 具体的状況の分類、比較、事実からの説明、誤概念の訂正。
- K3: 同値分割、境界値、decision table、状態遷移、見積り、リスク等の適用。

同一LOのpattern family最低数:

- 5問: 5 family
- 6～8問: 4 family
- 9～11問: 5 family
- 12問以上: 6 family
- 1 familyは同一LOの3500 basis points以下

### 10.3 必須metadata

- cognitive operation、assessment pattern、exam eligibility
- scenario facts、asked claims
- choiceごとのrelevant/addressed claim・premise、誤概念、誤り型
- reasoning steps、全choice解説、takeaway、common trap
- 数値問題のformula/unit variant、input key別kind/unit/domain、中間値、丸め、結果単位、relevant claimとexact一致するchoice binding
- source章節・LO、provenance
- similarity、日本語、用語監査
- review stage、strict `ContentReviewArtifactV2` branch、4対象hash、review policy/evidence hash、review/identity/accountability/provenance coverage hash

正答集合はprivate sourceの`correctChoiceStableIds`を正本とし、stable ID昇順でcontent/canonical/manifest hashへ必ず含めます。全choiceの`relevantClaimKeys`、questionのtakeaway/common trapもcanonical/hash対象です。正答、relevant claim、takeaway/common trapのいずれかだけの追加・削除・差替え・配列swapでもcontent/canonical/personal・public manifest hashを更新し、旧acceptance/attestationを失効させます。sanitized reportへ正答集合は出しません。

### 10.4 Quality gate

- schema error 0、exact配分
- 正答数=required count
- 問いと正答claimの直接対応
- 全誤答の妥当な誤概念と否定根拠
- 数値問題の独立計算一致
- 完全重複、semantic signature重複0
- prompt/choice類似候補の人手判定
- 派生問題は2推論軸以上が異なる
- 長さ、断定、否定、文体、正答位置の偏り監査
- JSTQB用語一致
- 第三者問題の複製、翻案、長文転載なし
- open changes requested 0
- blind solve不一致0または修正・再solve済み

`ContentQualityGateConfigV1`は生成開始前に次をversioned manifestへ固定し、件数合わせで緩和しません。

- quality/reviewで使うtokenizer、embedding model、calibration corpus、formula registry、oracle/review runnerの全digest/hashはlowercase SHA-256、全ID、provider、model ID、run IDはtrim後non-empty。空・placeholder・不正digestを拒否する

- normalized semantic signature完全一致と、scenario名・製品名・定型前置き除去後のsignature一致は0件
- embedding model ID/digest、calibration corpus hashを固定し、personal preview/publicともinteger basis pointsで8200以上は無条件に差戻す
- 同一LOの1 pattern familyは3500 basis points以下。multipleの提示family最低数はquota別registryに従う
- multipleのliteral-premise distractorは全distractorの2000 basis points以下
- tokenizer ID/digestを固定し、章/K/selection strata別に正答・誤答の平均grapheme長差率2000 basis points以下、断定token率差1000 basis points以下、否定token率差1000 basis points以下とする
- 正答位置はglobalで一様期待値から5 points以内、20問以上の章/K/selection stratumで10 points以内とする。multipleは各slotの正答含有率を`requiredChoiceCount / choiceCount`期待値と比較する
- K2/K3はscenario facts・数値・成果物の少なくとも一つが推論に不可欠
- 数値問題はcontent ref＋claim key unique/sort、formula ID、scalar/rational/rational-list inputs、中間値、丸めmode/scale、scalar/ordered-set expected/oracle値、unit、全choice bindingを独立runner artifactへlosslessに保持し100%再計算一致
- blind solve不一致・open/investigating review issueは0。personal preview/publicとも8200 basis points以上の類似候補は修正し、例外承認・reviewer override経路を設けない

### 10.5 Batch workflow

```text
LO blueprint
 -> 承認済み実装モデルによるprivate draft（初回候補はLuna）
 -> schema/配分/重複/計算/言語gate
 -> 全500問を一問ずつAI G0〜G12 review
 -> canonical/blueprint/allocation/qualityと候補stratumをfreeze
 -> 作成主体と異なる独立reviewerによるblind solve（今回候補はSol xhigh）
 -> 修正
 -> 修正があれば旧freezeを破棄し新版でschema/gate/freezeから再実施
 -> controlled serviceが一回だけ発行する完全sampling artifact（4対象hash＋freeze hash、全rank/cutoff/mandatory/final集合）
 -> personal preview最低human review
 -> ownerが隔離review UIで全500問をblind提出→同一問reveal→hide→auditしdecision pass
 -> immutable personal preview manifest
 -> reviewing stage・DB canonical/manifest一致
 -> owner acceptance・activate
 -> Mobile/Web preview
 -> 修正時は新版・新bundleで先頭から再実施
 -> public用技術review全500・編集review全500
 -> parent personal hashを持つimmutable public release manifest
 -> public manifest stage
 -> 4人attestation
 -> publish
```

- 25問単位を既定batchとする。
- 作成モデルは旧不合格500や第三者問題を入力にしない。
- Solへblind solve前に正答・解説を渡さない。
- 一問変更でもhashを更新し、旧attestationを無効にする。
- review追加ではpersonal manifestを更新せずpublic manifestをappendし、review参照は`(questionStableId,versionStableKey)`の組を使う。
- Git、Actions、artifact、logへ本文・正答・review packetを置かない。

### 10.6 AI全件reviewと隔離review UI

G0〜G12は順にschema/canonical、設問成立、blind solve、正答根拠、multiple全単射、誤答・曖昧性、手掛かり・日本語、LO/K/難易度、数値oracle、重複・意味類似、著作権・provenance、UI/A11y表示、adjudicationを検査します。各問題にgeneration artifact exact一件、各pass artifact exact一件を要求します。修正された問題は全passをstaleにしてG0から再実行します。G12は前12 artifactを参照するだけでhard failを免除できません。

reviewはlearner appとorigin、service worker、cache namespace、認可audienceを分離した`REVIEW_ORIGIN`だけで提供します。route契約は次です。

- `/bundles/:bundleId/coverage`
- `/bundles/:bundleId/questions/:questionStableId/versions/:versionStableKey`
- `/bundles/:bundleId/issues/:issueId`
- `/preview/:acceptanceId/questions/:questionStableId`

URL/queryへ正答、解説、token、private packet、full hashを含めません。owner/reviewer/admin以外は版ID・件数を含め404相当の非識別応答とし、logout/account切替でreview cacheを消去します。owner問題詳細の初期`blind` DTO/cache/DOM/accessibility treeには正答、総合解説、全choice解説、takeaway、common trapをexact 0とします。runtime状態は`blind -> blind_submitted -> revealed -> hidden -> audit_completed`だけです。ownerが回答と根拠をimmutable提出して`blind_submitted`へ確定した後だけ、同じ一問の正答・全解説・AI根拠を`revealed` modeへ取得できます。「答えを隠して監査へ」でrevealed cacheをpurgeして`hidden`へ戻し、checklistを完了した時だけ`audit_completed`へ進みます。他問題の正答を先読みする一覧・prefetch・一括revealはありません。各遷移後に通信が切れても、正答非開示のresume応答からcurrent state、revision、直前transition fact hashを復元し、同じoperationは保存済み応答、次のoperationは復元したCAS値で再開します。blueprint artifactの`blind -> revealed -> hidden -> audit-completed`は、検証済み`blind_submitted`factを決定的に集約した表記であり、blind提出を省略する経路ではありません。

owner decisionは「この問題を合格にする」=`pass`または「修正を依頼する」=`changes_required`だけです。後者はcategoryとtrim後non-emptyの必須理由を受け、decisionと同じtransactionでserver生成issue、operation receipt、review/audit factを原子的に作ります。任意のissue ID入力や別問題issueの流用は受理しません。`pass` branchではissue入力を禁止します。当該版はissue解決後に再reviewされるまでpersonal acceptance対象にしません。「確認済み」の曖昧な単一CTA、bulk pass、未閲覧自動passを置きません。coverage画面は`reviewed x/500`に加え`pass / changes_required / blind未提出 / audit未完了`、G0〜G12別pass/N/A/stale/差戻し、章/LO/K/selection、未解決issueを表示します。問題画面はpremise/claim/reasoning対応、nearest類似候補、版diff、Web/iOS/Android/320px/200% previewを提供します。review位置、filter、未完了件数を保存し、keyboard、VoiceOver、TalkBackだけで500件reviewを中断・再開できます。

### 10.7 章別進捗と学習優先度

章カードは一つの曖昧なprogressへ潰さず、`回答済みunique / 利用可能published`、初見正答率、克服率、定着率、期限超過件数、公式出題比重を別々に表示します。公式出題比重は順に`8/40、6/40、4/40、11/40、9/40、2/40`です。章別最低点が公式にないため「合格必須度」と呼ばず、「合格への影響」と表示します。

安全側失点は各章のunique初回attemptに対する95% Wilson下限`lower95_c`を用い、`officialChapterQuestionCount_c * (1 - lower95_c)`で算出します。unique初回答数が`max(10, officialChapterQuestionCount_c * 3)`未満なら数値を出さず、「データ不足・あとn問で目安を表示」とします。学習優先度はデータ充足後に`officialChapterQuestionCount * (0.60 * (1 - lower95) + 0.25 * unseenRate + 0.15 * overdueRate)`の降順で「高 / 中 / 低」を相対表示し、公式合格判定ではない旨を添えます。データ不足章は公式比重と未回答数を使って「まず回答を増やす」と表示します。personal previewはacceptance別の参考値に分離し、published正式値へ混ぜません。

client計算を正本にせず、認証済みsecurity-invoker RPC `get_learning_projection_v2()`と`get_chapter_readiness_v2(projectionSnapshotHash)`の二本だけから取得します。前者はDBのrepeatable-read snapshotでattemptのcommit sequence/time上限、catalog revision上限、SRS projection revision上限を先に固定し、その上限以下だけを集計してimmutable projection snapshotを保存します。`calculatedAt`はそのtransactionで一度だけ取得したDB `clock_timestamp()`です。後者は同じownerの`projectionSnapshotHash`で固定済みsnapshotを参照し、再scanや別時刻再計算をせずreadinessを導出します。ownerはJWTから導出し、後者のstrict SHA-256以外のinput、他owner、期限切れsnapshotを拒否します。

```ts
interface ChapterAnalyticsSourceUpperV1 {
  readonly attemptSequenceUpper: number;
  readonly attemptCommittedAtUpper: string;
  readonly catalogRevisionUpper: number;
  readonly srsProjectionRevisionUpper: number;
  readonly sourceUpperHash: string;
}

interface ChapterProgressItemV1 {
  readonly chapterNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly officialQuestionCount: 8 | 6 | 4 | 11 | 9 | 2;
  readonly availablePublishedCount: number;
  readonly uniqueAnsweredCount: number;
  readonly uniqueFirstAttemptCount: number;
  readonly uniqueFirstCorrectCount: number;
  readonly recoveredCount: number;
  readonly everWrongCount: number;
  readonly retainedCount: number;
  readonly srsEligibleCount: number;
  readonly overdueCount: number;
  readonly readinessSampleThreshold: number;
  readonly readinessStatus: 'data-insufficient' | 'estimated';
  readonly lower95BasisPoints: number | null;
  readonly safeLostMilliPoints: number | null;
  readonly priorityMilliUnits: number | null;
}

interface ChapterProgressSnapshotV1 {
  readonly schemaVersion: 'chapter-progress-snapshot.v1';
  readonly scope: 'published' | 'personal-preview';
  readonly acceptanceId: string | null;
  readonly officialExamStructureBasisHash: string;
  readonly formulaHash: string;
  readonly sourceUpper: ChapterAnalyticsSourceUpperV1;
  readonly calculatedAt: string;
  readonly chapters: readonly [
    ChapterProgressItemV1, ChapterProgressItemV1, ChapterProgressItemV1,
    ChapterProgressItemV1, ChapterProgressItemV1, ChapterProgressItemV1
  ];
  readonly snapshotHash: string;
}

interface ExamReadinessSnapshotV1 {
  readonly schemaVersion: 'exam-readiness-snapshot.v1';
  readonly scope: 'published' | 'personal-preview';
  readonly acceptanceId: string | null;
  readonly status: 'data-insufficient' | 'estimated';
  readonly validCompletedExamCount: number;
  readonly requiredCompletedExamCount: 2;
  readonly conservativeScoreMilliPoints: number | null;
  readonly safeLostTotalMilliPoints: number | null;
  readonly officialExamStructureBasisHash: string;
  readonly formulaHash: string;
  readonly sourceUpper: ChapterAnalyticsSourceUpperV1;
  readonly chapterProgressSnapshotHash: string;
  readonly ttlPolicyVersion: 'learning-projection-snapshot-ttl.v1';
  readonly calculatedAt: string;
  readonly expiresAt: string;
  readonly snapshotHash: string;
}

interface UserQuestionProjectionDtoV2 {
  readonly questionId: string;
  readonly stateQuestionVersionId: string;
  readonly wrongEver: boolean;
  readonly latestOutcome: 'correct' | 'incorrect' | null;
  readonly consecutiveCorrectAfterWrong: number;
  readonly recoveredAt: string | null;
  readonly reviewStage: 0 | 1 | 2 | 3 | 4 | 5;
  readonly remediationDueAt: string | null;
  readonly nextReviewAt: string | null;
  readonly masteredAt: string | null;
  readonly needsRevalidation: boolean;
  readonly firstAttemptAt: string;
  readonly lastAttemptAt: string;
  readonly lastAttemptId: string;
  readonly attemptCount: number;
  readonly correctCount: number;
}

interface DailyActivityProjectionDtoV2 {
  readonly localDate: string;
  readonly timezoneAtReceipt: string;
  readonly attemptCount: number;
  readonly correctCount: number;
  readonly studySeconds: number;
}

interface LearningProjectionSnapshotV2 {
  readonly schemaVersion: 'learning-projection-snapshot.v2';
  readonly contractVersion: 2;
  readonly dataGeneration: number;
  readonly scope: 'published' | 'personal-preview';
  readonly acceptanceId: string | null;
  readonly projectionRevision: number;
  readonly officialExamStructureBasisHash: string;
  readonly formulaHash: string;
  readonly sourceUpper: ChapterAnalyticsSourceUpperV1;
  readonly questionProjections: readonly UserQuestionProjectionDtoV2[];
  readonly dailyProjections: readonly DailyActivityProjectionDtoV2[];
  readonly chapterProgress: ChapterProgressSnapshotV1;
  readonly validCompletedExamCount: number;
  readonly requiredCompletedExamCount: 2;
  readonly status: 'data-insufficient' | 'estimated';
  readonly ttlPolicyVersion: 'learning-projection-snapshot-ttl.v1';
  readonly calculatedAt: string;
  readonly expiresAt: string;
  readonly snapshotHash: string;
}
```

上記`number`はDB safe integerとして検証し、`dataGeneration`だけは正の`1..9007199254740991`（0、小数、負数、文字列、2^53を拒否）、他の件数・率は各field契約に従います。率は0〜10000 basis points、点はmilli-pointsです。binary floatをhash入力へ使いません。outer `LearningProjectionSnapshotV2.snapshotHash`が`get_chapter_readiness_v2`の唯一の入力で、responseの`chapterProgressSnapshotHash`はouterの`chapterProgress.snapshotHash`とexact一致します。readinessの`ttlPolicyVersion/expiresAt`はouterとexact一致し、自身の`snapshotHash` preimageへ含めます。formula正本`ChapterReadinessFormulaV1`は、Wilson 95%の`z=1.959963984540`、decimal scale 12・round-half-even、中間値scale 12、`lower95BasisPoints=floor(lower95*10000)`、`safeLostMilliPoints=ceil(e_c*(10000-lower95BasisPoints)*1000/10000)`、priority係数`6000/2500/1500` basis points、sample threshold `max(10,e_c*3)`、有効正式模試最低2回をliteral固定し、RFC 8785 JCSのSHA-256を`formulaHash`とします。`sourceUpperHash`は上限4 field、snapshot hashは自身を除く全fieldから計算します。readinessは全6章がestimatedかつ有効正式模試2回以上の時だけ数値を返し、それ以外はnullです。readinessの`chapterProgressSnapshotHash`、basis/formula/source upper/calculatedAt/expiresAtがprojectionと一致しないpairをclientは表示せず再取得します。

## 11. 個人利用と一般公開

| 項目 | 個人利用 | 一般公開 |
|---|---|---|
| channel | owner限定`personal_preview`可 | `published`のみ |
| 表示 | 個人preview・未公開を明示 | 公開問題 |
| 機械検査 | 全500必須 | 全500必須 |
| Sol blind solve | 全500必須 | 全500必須 |
| 人手review | 独立reviewは全K3、全multiple、全不一致、K1/K2層化20%以上。加えてownerが全500でblind提出→reveal→hide→auditしdecision=`pass` | owner全500のpass coverageを親に、技術・編集とも全500 |
| Attestation | owner全件review後の受入でpreview可 | 4人の自然人によるdistinct role |
| 成績 | previewを明示 | publishedのみ正式分析 |
| 品質表示 | 未公開・自己利用 | review方式と非公式を明示 |

初期運用はpersonal-onlyです。4人を用意できない個人利用時に、同一人物・bot・AIを複数actorとして偽装しません。一般公開へ移る時に、固定hashへ不足するhuman reviewとattestationを追加します。recent-authだけを使う場合は暗号署名と呼びません。

`personal_preview`の全画面には「個人プレビュー・一般公開前」を常時表示します。ownerは資格・syllabusごとに一つのacceptanceをactive選択し、画面へbundle/manifestの短縮hashとselection revisionを表示します。通常演習と模試の双方でactive acceptanceを利用できますが、preview模試もpublished正式合格・SRS・分析から分離します。切替後も既存sessionは開始時acceptanceをpinし、新規sessionだけ新selectionを使います。selection切替だけでは旧sessionを継続できますが、acceptance revoke時はsessionをinvalidatedへ収束し、「この個人プレビューの承認が取り消されたため、演習を終了しました。確定済み履歴は保持されています。」と表示して本文・choices・feedback cacheをpurgeします。次回bootstrapはrevoked acceptanceに属するsession/basis/catalogを失効tombstoneとしてのみ返し、問題本文・choices・feedbackを再配布しません。preview session/attemptはacceptance別projectionへ保存し、published正式分析へ混ぜず、後日publishedになっても自動昇格させません。previewの誤答・復習は同じacceptanceのprojectionだけを使います。owner以外のアカウントへ版ID・件数・本文を表示しません。logout/account切替時はpreview cacheを即時unloadします。offline端末では次回同期まで既配布内容を回収できないことを残余リスクとして扱います。

## 12. 文書受入条件

- 全画面にloading、empty、offline、error、conflict、停止状態がある。
- 表示文言をUI contract testから参照できる。
- route、modal、回答後、errorのfocus遷移が定義されている。
- 320px、200%、keyboard、VoiceOver、TalkBackの完了経路がある。
- 克服・SRSがattempt列から再構築可能。
- 初回正解と10分復習の段階矛盾がない。
- 厳格/練習模試を混同しない。
- 64 LO、500問、作成主体→独立blind solve→human→owner工程が固定されている。
- generation 500＋G0〜G12 6,500とowner artifact 500がblueprint生成型からAPI/DBへlosslessである。
- owner reviewのblind初期開示5項目0、reveal/hide/audit、decision全passがpersonal acceptance条件である。
- 章進捗/readinessの二RPCが同じbasis/formula/source upper/calculatedAtを返し、sample不足をnull表示する。
- D-03 Aだけがpositiveで、live削除24時間とbackup実効消去30日を分離し、B/C UI branchは0である。
- personal previewとpublishedを混同しない。
- actor偽装を許可しない。
- 旧不合格500を再利用しない。
- 既存testを変更せず、新規contract testで証明する。

### 12.1 性能p95

本番同等release build、次の`PerformanceProfileV1`でWeb Chrome、Web Safari、iOS、Androidを四つの独立targetとして計測します。profileのRFC 8785 JCS hashをraw証跡とrelease evidenceへ結合し、端末・OS/browser・build・回線・データ量のいずれかが違う証跡を合格判定へ流用しません。各targetでウォームアップを除く最低100試行を行い、同一計測区間・端末/OS/browser/app build・cache条件・回線profile・全試行の開始/終了/結果をraw証跡へ保存します。

```ts
interface PerformanceProfileV1 {
  readonly schemaVersion: 'performance-profile.v1';
  readonly webChrome: {
    readonly device: 'MacBook Air M1 8GB';
    readonly os: 'macOS 15.x';
    readonly browser: 'Chrome stable release pinned in evidence';
  };
  readonly webSafari: {
    readonly device: 'MacBook Air M1 8GB';
    readonly os: 'macOS 15.x';
    readonly browser: 'Safari stable release pinned in evidence';
  };
  readonly ios: {
    readonly device: 'iPhone SE 3rd generation 4GB';
    readonly os: 'minimum supported iOS release pinned in app config';
  };
  readonly android: {
    readonly device: 'Pixel 6a 6GB';
    readonly os: 'minimum supported Android API pinned in app config';
  };
  readonly buildProfile: 'production-release';
  readonly network: {
    readonly roundTripLatencyMs: 80;
    readonly downstreamKbps: 10000;
    readonly upstreamKbps: 3000;
    readonly packetLossBasisPoints: 50;
  };
  readonly fixture: {
    readonly catalogQuestionCount: 500;
    readonly activeSessionCount: 5;
    readonly sessionQuestionCount: 40;
    readonly pendingOutboxCount: 100;
    readonly attemptHistoryCount: 5000;
  };
  readonly nextQuestionCacheCondition: 'warm-cache';
  readonly measuredTrialsPerOperationPerTarget: 100;
}
```

OS/browserのpatch版、app commit SHA、native build number、profile JSON/hashを証跡で固定します。上記最低端末より高性能な環境だけでの計測、dev/simulatorだけの計測、回線shapingなしは不合格です。

| 操作 | Web Chrome p95 | Web Safari p95 | iOS p95 | Android p95 | 計測区間 |
|---|---:|---:|---:|---:|---|
| 選択操作から端末永続化commit完了 | 200ms以内 | 200ms以内 | 200ms以内 | 200ms以内 | user input受理からIndexedDB/SQLite transaction commitまで |
| warm cache済み次問表示 | 300ms以内 | 300ms以内 | 300ms以内 | 300ms以内 | 次問操作受理から問題見出し・全choice描画完了まで |
| 通常回線の同期完了 | 3秒以内 | 3秒以内 | 3秒以内 | 3秒以内 | outbox送信開始からACKのlocal transaction適用まで |

端末永続化はcache warm/coldへ層化せず、実storage transactionの同一閾値だけを判定します。次問表示はwarm cacheだけをv2 release性能対象とします。cold application/catalog startのlatencyはP1 telemetry objectiveとして別集計し、本v2 release性能gateへ含めずwarm試行にも混入させません。ただし機能受入として、fresh install・空cache・有効sessionの各cold startが認証状態とowner namespaceを検証し、catalog/local schemaを初期化または再取得してホームまたは安全な復旧画面を表示し、無限loading・crash・cross-account表示・正答漏えいなく再試行可能であることは必須です。通常profileの全試行を成功・timeout・storage error・network error・schema errorへ分類します。timeoutまたはerrorが1件でもあれば、成功試行のp95が閾値内でも当該target/操作は不合格です。成功試行のp95は失敗率とは別に全成功試行から算出し、失敗試行を成功latencyへ置換したり、除外して合格扱いしません。四targetの一つでも閾値超過、全試行未記録、debug buildだけの計測、mock storage/networkだけの計測なら未達です。意図的なoffline profileは通常profileへ混ぜず、復旧時間・欠損0・重複0を別のoffline受入として記録します。
