# 実装状況

本書の「利用可能」はPR #6時点のprototype機能を示し、詳細設計v2の本番受入証拠ではありません。static sample content、回答後feedback境界、同期/DB v2、500問、実機・復旧証拠が未完了のため、PR A以降の全受入が完了するまでproduction unavailableです。

## Prototypeで利用可能

- iOS / Android / Web共通画面
- 1問未満でも残る選択下書き
- 1問確定ごとの回答履歴、誤答状態、再開位置保存
- 複数の中断セッション
- 未克服、直近誤答、7/30/90日、全誤答、克服済みフィルター
- 別セッション2回連続正解で克服、誤答時の再オープン
- 1/3/7/14/30/90日の復習予定
- 章別、未回答、今日の復習、ブックマーク演習
- Supabase Auth、RLS、append-only同期イベント、サーバー再採点
- SQLite / IndexedDB、Outbox、PWA shell
- 学習記録、章別カバレッジ、レスポンシブUI

## 本番開始までに外部設定・承認が必要

- 本番Supabaseプロジェクト、メール送信元、許可URLの設定
- 独立レビュー済み500問の非公開DB投入と本人承認
- 全500 current versionの生成来歴、独立AI blind solve、構造化品質評価、最終adjudication、本人passのcoverage exact 500
- 本人限定review originと、正答を初期response・bundle・cacheへ含めないowner review plane
- Apple / Google開発者アカウントでの実機ビルド、署名、配布
- D-03 Aの暗号化DR backup・復旧worker、最大30日rotation、RPO 24時間、RTO 8時間、削除再適用、監視、アカウント削除workerの設定
- iOS / Android実機、複数端末、低速回線での受入試験
- 通常演習offline pack、模試offline参考結果の分離、スマホ/Web adaptive layoutの受入試験

公開リポジトリのサンプル問題は機能検証用で、本番500問の公開数には算入しません。

初期本番は本人限定personal previewです。一般公開用technical/editorial/mobile reviewと4人attestationは将来の公開gateとして維持しますが、個人利用開始条件にはしません。
