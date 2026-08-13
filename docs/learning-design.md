# 学習機能設計

## 1. 通常演習

### 設定

- 問題数: 10 / 20 / 30 / 40
- 範囲: 全範囲 / 章 / 節 / 学習目標
- 出題: ランダム / 未回答優先 / 弱点優先。複合おすすめはP1
- 難易度
- ブックマークのみ
- P0は回答確定後の採点に固定。一括採点切替はP1
- 通常演習の任意タイマーはP1

### P1 おすすめ出題順

1. 復習期限を過ぎた問題
2. 未克服の誤答問題
3. 弱い学習目標の未回答問題
4. その他の未回答問題
5. 最終回答日時が古い問題

同一セッションで同じ問題を重複させません。問題版、問題順、選択肢順は開始時に固定します。

## 2. 採点

- 単一選択は正解IDとの一致で判定します。
- 複数選択は正解ID集合との完全一致で判定し、部分点は設けません。
- 未確定、スキップ、停止問題は誤答に数えません。
- 確定済み回答は変更せず、解き直しは別sessionでだけ新attemptとして追加します。
- 通常演習は回答確定後、模試は提出後に正誤を表示します。

## 3. 誤答のみ演習

### フィルター

| 条件 | 定義 |
|---|---|
| 未克服 | 誤答後、必要な連続正解回数を満たしていない。既定値 |
| 直近回答が誤答 | 最新の有効回答が誤答 |
| 期間内に誤答 | 過去7 / 30 / 90日に1回以上誤答 |
| 過去に一度でも誤答 | 全期間で誤答履歴がある |
| 克服済み | 誤答後に克服条件を満たした |

章、難易度、ブックマークを追加条件として指定できます。

### 克服状態

```text
NEVER_WRONG
  └─誤答→ UNRESOLVED(streak=0)
             ├─別セッションで正解→ UNRESOLVED(streak=1)
             ├─再誤答→ UNRESOLVED(streak=0)
             └─別セッションで2回目の正解→ RECOVERED
                                                └─再誤答→ UNRESOLVED
```

同一セッションで同じ問題を再出題しないため、克服用の正解は必ず別セッションになります。v2の必要連続正解数はexact 2回です。変更は新しいcontract versionとADRで扱い、runtime設定だけで意味を変えません。

誤答演習開始時に出題集合を固定し、途中の克服や新規誤答で総数・順番を変えません。指定数より候補が少ない場合は重複させず、開始前に実数を表示します。

対象0件時:

> 未克服の問題はありません。次は今日の復習で定着を確認しましょう。

CTAは「今日の復習」「未回答を解く」「章別に解く」です。

## 4. 間隔反復

| 段階 | 次回復習 |
|---:|---:|
| 0 | 1日後 |
| 1 | 3日後 |
| 2 | 7日後 |
| 3 | 14日後 |
| 4 | 30日後 |
| 5 | 90日後 |

- 初回正解は段階0、1日後の定着確認へ進みます。
- 復習期限後の正解で1段階進みます。
- 期限前の正解は履歴と克服へ反映しますが段階は進めません。
- 誤答時は段階0へ戻し、`remediation_due_at`を10分後、`next_review_at=null`にします。
- remediation期限前の正解は克服streakだけ更新でき、remediation/SRS期限を変更しません。
- remediation期限以後の正解は段階0、`remediation_due_at=null`、`next_review_at`を1日後にします。
- breaking改訂では旧履歴を保持して`needs_revalidation=true`とし、新版を即時復習対象にします。新版正解でrevalidationを解除し、段階0・1日後へ進みます。compatible/cosmetic改訂では状態をリセットしません。
- 今日の復習は`effective_due_at = remediation_due_at ?? (needs_revalidation ? DB clock_timestamp() : next_review_at)`がDB時刻以前の問題だけを一度表示します。breaking直後は即時対象ですが、再確認中に誤答した場合は`needs_revalidation=true`を保持したまま10分のremediation期限を優先します。
- `needs_revalidation=false`、段階4以上、かつ最新回答が正解なら定着とします。

## 5. 模擬試験

- 40問、60分、1問1点。有効分母exact 40だけ26点以上を合格判定し、停止問題で分母未満なら合否null
- 章構成: 8 / 6 / 4 / 11 / 9 / 2
- Kレベル: 8 / 24 / 8
- 1問ごとにドラフト保存
- 提出まで正誤と解説を非表示
- 回答済み、未回答、見直しを一覧表示
- 終了確認で未回答数を表示
- アプリを閉じても厳格モードの時計は停止しない
- 時間切れ後は回答を凍結して自動提出
- offline中の回答を許可した模試は、再接続後に個人参考結果として別保存し、正式attempt・誤答・SRS・分析へ混ぜない

通常のoffline演習、正式模試、オフライン参考模試は別modeです。通常のoffline演習はcached/pin済み問題だけを使い、一問ごとの選択・中断位置を端末保存できますが、正答を端末へ配布しないため接続まで`採点待ち`です。正式模試はserver時刻・受信draftを検証し、offline回答を正式得点へ後付けしません。offline継続を許す模試は全画面・履歴で「オフライン参考模試」と表示し、正式合格、誤答、克服、SRS、正式分析へ算入しません。

## 6. 分析指標

- 問題消化率: 回答済み有効問題数 ÷ 有効公開問題数
- 初見正答率: 各問題の初回正解数 ÷ 初回答済み問題数
- 直近正答率: 過去30日の正解attempt数 ÷ 有効attempt数
- 未克服数
- 克服率: 克服済み問題数 ÷ 過去に誤答した問題数
- 定着率: 段階4以上かつlatest effective attemptが正解の問題数 ÷ SRS対象問題数
- 連続学習日: 現地日付で1問以上確定回答した連続日数

ドラフト、無効、緊急停止、personal preview、offline参考模試の回答は正式集計から除外します。previewはacceptance別の参考projectionだけへ反映します。

### 6.1 章別進捗と合格への影響

公式試験構成の章別問数`e_c`は`8 / 6 / 4 / 11 / 9 / 2`、全体は40です。章別に次を別々に算出し、一つの進捗率へ混ぜません。

500問配分では`500 * e_c / 40`をfloorし、最大の小数剰余へ残数を配ります。小数剰余が同率なら章番号昇順とするため、第4章・第5章の0.5同率は第4章を先に選びます。source版/hash/確認時刻/式/同率規則を`officialExamStructureBasisHash`へ固定し、同basisをallocation hashへ含めます。

- 範囲消化率: `distinct answered published questions / available published questions`
- 初見正答率: `first correct / unique first attempts`
- 克服率: `recovered / ever wrong`
- 定着率: `SRS stage >= 4 and latest effective correct / SRS eligible`
- 期限超過率: `overdue / SRS eligible`
- 公式出題比重: `e_c / 40`

少数回答による過信を避けるため、unique初回答の正答率には95% Wilson下限`lower95_c`を使用し、安全側失点を`e_c * (1 - lower95_c)`とします。章のunique初回答数が`max(10, e_c * 3)`未満なら安全側失点と予測得点を表示せず「データ不足」とします。学習優先度はデータ充足後に次のproduct scoreの降順で高・中・低へ相対分類します。

```text
priority_c = e_c * (0.60 * (1 - lower95_c) + 0.25 * unseenRate_c + 0.15 * overdueRate_c)
```

このscoreは公式合格判定ではありません。章別最低点がないため「合格必須度」と呼ばず、「合格への影響」と表示します。データ不足章は数値riskを作らず、公式比重と未回答数から「まず回答を増やす」と案内します。personal previewはacceptance別参考projectionだけで同式を計算し、published値と合算しません。

計算正本は`ChapterReadinessFormulaV1`です。Wilsonの`z=1.959963984540`、decimal scale 12・round-half-even、出力basis pointsはfloor、安全側失点milli-pointsはceil、priority係数は`6000/2500/1500` basis points、章sample thresholdは`max(10,e_c*3)`、全体readinessに必要な有効正式模試は2回へ固定し、formula JCS SHA-256を返します。clientのbinary float計算を保存・表示正本にしません。

`get_learning_projection_v2()`は章exact 6件のimmutable snapshotを作り、`get_chapter_readiness_v2(projectionSnapshotHash)`は同じowner・同snapshotから全体readinessを導出します。前者はDB repeatable-read snapshotのattempt commit sequence/time上限、catalog revision上限、SRS projection revision上限を`sourceUpper`へ固定し、transactionで一度だけ取得したDB時刻`calculatedAt`、version付きTTL policyから求めた`expiresAt`/`ttlPolicyVersion`、`officialExamStructureBasisHash`、`formulaHash`、`sourceUpperHash`、自身を除いた全fieldの`snapshotHash`を返します。後者は再scanせず同値を引き継ぎます。DB時計が`expiresAt`未満の時だけ参照でき、同時刻以後はexpiredとして最新projection再取得を要求します。全6章がsample充足し有効正式模試2回以上の時だけ全体の安全側得点を返し、それ以外は`data-insufficient`です。publishedとpersonal previewはscope/acceptanceを分離します。

## 7. P0 / P1範囲

P0は個人が本番運用できる最小完結範囲です。

- 同一accountのWeb/mobile同期、問題ごとの端末保存、複数中断、1操作再開
- 通常10/20/30/40問、未回答、章/節/LO、bookmark、誤答のみ、今日の復習
- exact 2回の別session正解による克服、再誤答reset、SRS 1/3/7/14/30/90日
- 正式模試40問60分26点、offline参考模試の完全分離
- 章/LO/K、消化、初見、克服、定着、公式比重、安全側失点の分析
- cached通常演習のoffline端末保存・採点待ち、同期復旧
- 問題報告、履歴、データexport/delete、keyboard/VoiceOver/TalkBack
- owner限定personal preview exact 500と全件review UI

P1はP0の意味を変更せず追加します。

- 公式比重、弱点、期限超過を組み合わせた週間学習計画とおすすめ出題
- 64 LO coverage map、誤概念別ノート、回答時間・見直し変更分析
- reminderと無理のないdaily goal
- cold-start latency telemetryとadaptive prefetch
- 一括採点・任意timer等、P0契約とは別versionが必要な選択機能

初期運用はpersonal-onlyです。一般公開時のtechnical/editorial/mobile全500 reviewとdistinct role attestationは将来gateとして維持し、個人利用を理由にpublishedへ短絡しません。
