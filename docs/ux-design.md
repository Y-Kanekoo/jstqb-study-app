# UI/UX設計

## 1. 利用者

通勤・休憩中に片手で5〜15分ずつ学び、Webとモバイルを使い分ける本人を中心に設計します。ホームの最重要タスクは、中断した学習を1操作で再開することです。

## 2. ナビゲーション

モバイル下部:

1. ホーム
2. 演習
3. 復習
4. 記録
5. 設定

Webでは同じ順序・routeの左サイドナビゲーションを使います。viewportごとに別の情報設計や学習状態を作りません。

## 3. 主要画面

- 認証、初期設定
- ホーム、中断一覧
- 演習条件、問題、解説、問題一覧、結果
- 復習ホーム、誤答条件、今日の復習
- 模試設定、模試、模試結果
- 履歴、分析
- ブックマーク、メモ
- 用語・シラバス
- 同期状態、競合解決
- 問題報告
- 設定、データ出力、アカウント削除
- 所有者用問題管理、報告管理

## 4. ホーム

最新セッションを主CTAとして表示します。

> 続きから  
> 誤答復習・7 / 10問・第3章  
> 8分前・同期済み

残りは「中断中の演習 n件」に表示し、黙って自動削除しません。

## 5. 問題画面

表示順:

1. モード名
2. `3 / 10問`としおり状進捗
3. 保存・同期状態
4. 選択方式と必要選択数
5. 問題文
6. 選択肢
7. ブックマーク・問題報告
8. `回答を確定`
9. 解説表示後の`次の問題`

進捗、端末保存、同期、採点は「学習証拠rail」で一つのtraceabilityとして並べます。mobileは見出し下のcompact横strip、Webは本文横の静かなside railとし、状態の意味と順序は同一です。`端末に保存済み`、`同期済み`、`採点待ち`、`採点済み`を別stepとして文字とiconで表示し、前段完了を後段完了と誤表示しません。

規則:

- 選択肢全体をタップ可能にします。
- radio/checkboxの意味を保ちます。
- 必要選択数に満たない場合は確定できない理由を表示します。
- `回答を確定`と`次の問題`は同時表示しません。
- 通常の離脱では警告を出さず、自動保存します。
- シラバス参照から同じ問題位置へ戻せます。

## 6. 保存表示

| 状態 | 文言 |
|---|---|
| 端末保存中 | 保存中 |
| 未送信 | この端末に保存済み |
| 同期中 | 同期中 |
| 完了 | 同期済み |
| 一時失敗 | 同期できません・再試行中 |
| 認証切れ | 同期を再開するには、もう一度ログインしてください |
| 端末保存失敗 | 保存できません。空き容量を確認してください |
| 競合 | 別の端末にも変更があります |

## 7. ビジュアル

コンセプトは「学習のしおり」です。細い縦線としおりマーカーで問題位置、中断位置、保存状態を表します。大量のカード、不要なグラデーション、過度なゲーム演出は避けます。

| トークン | 値 | 用途 |
|---|---:|---|
| `color.ink` | `#17324D` | deep ink、本文・見出し |
| `color.paper` | `#F6F8FB` | cool gray paper、背景 |
| `color.surface` | `#FFFFFF` | 問題面 |
| `color.brand` | `#215EA8` | blueprint blue、主操作・選択 |
| `color.brandStrong` | `#17497F` | 押下 |
| `color.success` | `#167A5A` | verification green、正答・検証済み |
| `color.warning` | `#7A4E00` | risk amber、復習・注意 |
| `color.danger` | `#B42318` | error red、誤答・失敗 |
| `color.border` | `#CBD5E1` | 境界 |
| `color.focus` | `#0B63CE` | フォーカス |

- 見出し・進捗: BIZ UDPGothic
- 本文・問題文: Noto Sans JP
- 問題ID、短縮hash、計測値だけ: OS標準等幅font。長文本文や見出しには使わない
- 本文16px、問題文18px、行高1.7
- 余白: 4 / 8 / 12 / 16 / 24 / 32 / 48
- 角丸: 8 / 12
- 通常モーション: 120〜180ms
- 学習証拠rail以外の装飾的timeline、gradient、過剰なcard、常時animationは使わない

## 8. アクセシビリティ

- WCAG 2.2 AA相当
- 通常文字4.5:1以上、非文字UI 3:1以上
- タップ領域44×44pt以上
- 文字200%でも機能損失なし
- 正誤・保存・同期を色だけで表現しない
- キーボードだけで主要操作を完了可能
- 利用者が確定した同一問題を表示中の初回解説到着時だけ解説見出しへフォーカス移動。次問移動後・再取得・背景同期は現在のフォーカスを保持
- VoiceOver、TalkBack、Webスクリーンリーダーで確認
- 動きを減らす設定を尊重
- 学習証拠railは`aria-current="step"`、状態名、補助文を持ち、色だけで完了・待機・失敗を表さない
- Webのhover情報はkeyboard focusでも同じ内容を提供する。mobileのhapticは任意で、成功の唯一の通知にしない

## 9. レスポンシブ

- 320px〜767px: 横スクロールなしの単一カラム、下部nav、safe area上のthumb reachへ主CTA
- スマートフォン: 下部ナビ、主操作を親指領域へ配置
- 768px以上のタブレット: 回答後のみ問題・解説の2ペイン可
- 1024px以上のWeb: 左nav、本文幅max 720px、補助pane max 320px
- 文字200%、長い日本語、software keyboard、touch主体ではbreakpointより内容・入力方式を優先して単一カラムへ戻す
- Web補助paneにしか存在する操作・errorを作らず、DOM順とkeyboard順をmobileの主要情報順へ合わせる

## 10. データ保護の平易な表示

設定では「この端末への保存」「アカウント同期」「手動エクスポート」「災害復旧用バックアップ」の4分類で、現在状態、対象範囲、できること、できないことを説明します。D-03 Aだけを4番目の実装policyとし、通常領域削除24時間とbackup実効消去30日を別行・別期限で示します。B/Cは将来の非規範案であり、選択肢、CTA、manifest状態を表示しません。「端末保存済み」を「同期済み」、「同期済み」を「バックアップ済み」と言い換えません。

## 11. 個人利用とreview UI

初期運用は本人だけのpersonal previewです。owner reviewはlearner appとorigin/cache/audienceを隔離し、全500問を一問ずつ確認します。各問は正答・全解説・takeaway/common trap 0の`blind`から始まり、回答と根拠のimmutable提出で`blind_submitted`、同じ一問だけ`revealed`、hide後`hidden`、監査完了後`audit_completed`へ進み、`pass | changes_required`を決めます。通信断後も正答非開示resumeからstate/revision/直前fact hashを復元します。`changes_required`ではcategoryと理由から同じtransactionでserver issueを作り、任意issue IDを選ばせません。coverage、章/LO/K/selection filter、G0〜G12、AI finding、版diff、類似候補、320px/200%・Web/iOS/Android previewを提供し、bulk passは設けません。一般公開のtechnical/editorial/mobile reviewと4人attestationは将来gateとして残します。

## 12. 章分析の鮮度表示

章進捗と試験readinessはserver RPC二本の同一snapshotだけを表示し、「集計時刻」「有効期限」、公式配分sourceの短縮hash、formula/TTL policy versionを詳細で確認できるようにします。sample不足は「データ不足・あとn問」とし、安全側失点や優先度を0として見せません。二RPCのsource upper/hash/calculatedAt/expiresAtが一致しない時、またはDB時計がexpiresAt以後の時は古い値を混在表示せず、「最新の分析を取得しています」としてprojectionを再取得します。500問配分の小数剰余が同率の場合は章番号昇順という規則を説明画面へ明記します。
