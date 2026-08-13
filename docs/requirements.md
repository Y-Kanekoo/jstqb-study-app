# 要件定義

## 1. 目的

JSTQB Foundation Levelを日常的に学習し、Web、iOS、Androidのどこからでも同じ進捗を利用できる個人向け本番アプリを提供します。

## 2. 前提

- 対象シラバス: Version 2023V4.0.J02（2026-08-13にJSTQB公式シラバス一覧で現行Core Foundationとして確認）
- 初期問題数: 独自問題500題
- 初期利用者: 本人1名
- 初期公開範囲: 本人限定personal preview（一般公開しない）
- 対応: iOS / Android / Web / PWA
- 認証: メール＋パスワード
- 非公式・非公認アプリ
- 広告、課金、ランキング、SNSは初期対象外

規範一次情報:

- JSTQB公式シラバス一覧: <https://www.jstqb.jp/syllabus/>
- JSTQB Foundation Level試験案内（40問・60分）: <https://www.jstqb.jp/guidance/>
- ISTQB Exam Structure Tables（CTFL v4.0、40点中26点、60分）: <https://istqb.org/wp-content/uploads/2026/05/ISTQB_Exam-Structure-Tables_v1.18.pdf>

release runnerは上記一次情報をcontrolled downloadし、`content-blueprint-v1.md`だけを正本とするstrict `OfficialSourceVerificationEvidenceV1`へ、各sourceのevidence ID、source ID/URL、exact version、`retrievedAt`、取得bytesのSHA-256、`verificationResult='verified'`、runner ID/version、artifact hashを固定します。具体的なdigestは取得前に推測せず、runnerが取得bytesから記録・再計算します。`OfficialSourceRequirementRegistryV1`は上記3 sourceと、syllabus版、40問、60分、26/40点、章配分、K配分の必須claimを固定し、`OfficialSourceVerificationCoverageV1`がregistryとevidenceを欠落・余剰・重複0で結合します。配分basisのsource version/hash/time/evidence ID/hashはExam Structure Tables evidenceへexact一致させ、同coverage hashをpersonal/public manifest branchとacceptance evidenceへ含めます。証跡の欠落、`verificationResult!='verified'`、取得bytesとのdigest不一致、source ID/URL swap、registry/claim不足、basis参照不一致が一つでもあれば、500題配分の生成・適用、stage、acceptance/public release、および模試の40問・60分・26点基準のactivationをfail closedで拒否します。personal/public manifest branchはself hash fieldを持たず、strict branch全fieldのSHA-256だけを別objectの`ReleaseHashSetV2.manifestHash`へ保存します。

## 3. P0機能

| ID | 機能 | 受入要点 |
|---|---|---|
| F-01 | 認証 | 登録、確認、ログイン、再設定、ログアウト、削除ができる |
| F-02 | 同期 | Webとモバイルで未確定回答を含めて再開できる |
| F-03 | ホーム | 最新セッションを1操作で再開できる |
| F-04 | 通常演習 | 10/20/30/40問、全範囲/章/節/LO、ランダム、未回答、弱点、ブックマーク、復習期限を選べる |
| F-05 | 1問単位保存 | 10問終了前でも1問ごとに履歴へ残る |
| F-06 | 複数中断 | 新規演習で既存の途中状態が消えない |
| F-07 | 誤答演習 | 未克服、直近、期間内、全誤答、克服済みから選べる |
| F-08 | 採点・解説 | 単一・複数選択を採点し、選択肢別解説を表示する |
| F-09 | 間隔反復 | 今日の復習と次回復習日を算出する |
| F-10 | 模試 | 40問60分、提出後採点。personal-previewはownerのactive acceptance manifestに含まれるeligible reviewing版、publishedはpublished catalogのeligible版だけを母集団とし、scope内で章・Kをexact充足、重複0、eligibilityとacceptance pinを検証する。有効分母exact 40だけ26点以上を判定し、停止問題で分母未満なら合否null |
| F-11 | 履歴 | 問題版を含む回答・セッション履歴を保持する |
| F-12 | 分析 | 初見正答率、消化率、未克服、克服率、定着率を表示する |
| F-13 | ブックマーク | 問題を保存し、保存問題だけで演習できる |
| F-14 | メモ | 問題別の非公開メモを自動保存する |
| F-15 | 問題報告 | 問題ID・版付きで誤りを報告できる |
| F-16 | オフライン | キャッシュ済み問題を回答し、復帰後に同期できる |
| F-17 | 問題管理 | 下書き、レビュー、公開、停止、廃止、改訂ができる |
| F-18 | アクセシビリティ | WCAG 2.2 AA相当で主要操作を完了できる |
| F-19 | データ管理 | server署名portable JSON/閲覧用CSV出力、空namespaceへのJSON復元、削除ができる。D-03 Aの暗号化DR backup復元と削除後30日以内の実効消去を満たす |
| F-20 | 全問品質レビュー | exact 500問を問題単位で生成来歴、独立AI blind solve、意味・正答・誤答・曖昧性・類似・著作権・表示品質まで検査し、本人限定review UIでcurrent version全件をpassするまで利用開始しない |
| F-21 | 適応UI | スマホとWebで情報設計、状態、語彙、デザイントークンを共有し、スマホは片手操作の1列＋下部navigation、Webは左navigation＋条件付き補助paneへ動的に適応する |
| F-22 | 章別readiness | 公式出題比重、学習範囲、初見・直近正答率、未克服、定着、期限超過、安全側の予測失点、学習優先度を根拠と更新時刻付きで表示する |

## 4. 非機能要件

### 可用性・保存

- 選択操作から端末永続化までp95 200ms以内。
- キャッシュ済み次問表示はp95 300ms以内。
- 通常回線の同期完了はp95 3秒以内。
- オフライン100回答の同期で欠損・重複0件。
- 端末保存失敗時は次問へ進ませない。
- 通常演習はserver発行済みoffline practice packで回答でき、正答・解説はserver確定前の端末へ保存しない。
- 模試の完全offline回答は`offline_unverified`の本人用参考結果とし、正式合否、誤答、SRS、分析へ混入させない。
- 暗号化DR backupは最大30日前までの復旧点を保持し、事故検知後すぐ復旧を開始する。RPOは24時間、RTOは8時間、本人データ削除後のbackup実効消去は30日以内とする。

### セキュリティ

- 全ユーザーデータへRLSを適用する。
- `service_role`、DBパスワード、秘密鍵をクライアントとGitHubへ置かない。
- 確定回答はサーバーで再採点する。
- 監査ログへトークン、メモ、回答内容を記録しない。競合解決に必要なメモ・未確定回答の全文版はRLS、retention、本人削除の対象となるuser-scoped conflict dataだけへ保存し、監査にはhashと操作metadataだけを残す。

### 品質

- TypeScriptで`any`を使用しない。
- lint、型検査、単体、統合、E2EをCIで実行する。
- 重大度0・1の既知不具合0件で本番利用を開始する。
- initial personal previewのexact 500題すべてを独立AI多段レビュー済みかつ本人pass済みにする。
- 章配分100 / 75 / 50 / 138 / 112 / 25、K1 / K2 / K3 = 100 / 300 / 100、64 LO exact quotaをowner承認済みallocationへ固定する。

## 5. リリース条件

- 設計書、migration、RLS、問題schemaがレビュー済み。
- 保存・再開・冪等再送の受入試験に合格。
- D-03 Aとして、暗号化DR backupの隔離復元、RPO 24時間、RTO 8時間、最大30日rotation、削除tombstone再適用試験に合格。
- iOS、Android、Webで主要フローを確認。
- 320px、スマホ縦横、tablet、desktop、200%文字拡大、keyboard、VoiceOver、TalkBackでadaptive layoutと主要フローを確認。
- プライバシー、削除、問い合わせ導線を確認。
