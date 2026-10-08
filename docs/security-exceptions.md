# セキュリティ例外

現在の例外はありません。`pnpm audit:dependencies`は実行時・ビルド時の全依存を除外なしで検査し、high以上が残れば失敗します。

## 解消済みのimage-size例外

`image-size-2.0.3-release-wait`（期限2026-09-12）、`GHSA-w3rx-r6r6-pgpr`と`GHSA-5p2g-fcmc-qvqq`の除外を削除しました。期限延長やchecker変更は行いません。

PR #33のhead `2fab1982c82db4526ce20209d9b224d64063f416`は既にimage-sizeをlock全体・frozen install後の依存グラフに含みません。Expo側はMetro 0.84.5、React Native CLI側はMetro 0.87.1で、両方の同梱parserに対して有効なPNGと不正ICNSの拒否を追加テストで確認します。

この修正は#33の22パッケージ更新を採否判断するものではなく、その系列の解消済み例外だけを除去します。PR #30/#31/#32の別系列を統合せず、既存branchと証跡を保持します。将来の統合時は依存版とテスト前提の再照合が必要です。

2026-10-08の除外なし監査はcritical 1 / high 6 / moderate 5（固有GHSA 11件）で、security gateは失敗のままです。image-sizeの2 advisoryは含まれません。node-forge、URI decoderおよび別の残存依存の修正は[Issue #29](https://github.com/Y-Kanekoo/jstqb-study-app/issues/29)とセキュリティ修正系列で追跡します。

`.github/security-exceptions.json`、pnpm設定、本文書の整合と例外期限は既存`check:security-exceptions`で検査します。例外が空でも、依存に脆弱性がないことを意味しません。署名・認証設定、例外追加、監査重大度、既存機能テストの入力・期待値は変更しません。マージ・デプロイは対象外です。

## SDK整合後の追加修正

#37でSDK57対応のReact/RN等へ整合した後、[公開済み修正の再評価](tdr/sdk57-security-followup.md)を行いました。現在はhigh 2 / moderate 1（固有GHSA 3件）で、forge・braces・URI decoderを検査対象のまま保留します。上のcritical1/high6/moderate5は#34時点の履歴です。例外は引き続き0件です。
