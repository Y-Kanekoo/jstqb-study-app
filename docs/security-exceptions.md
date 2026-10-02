# セキュリティ例外

脆弱性検査の除外はGitHub Advisory IDごとに限定し、理由、影響範囲、期限、解除条件を記録します。包括的な脆弱性検査無効化は行いません。

## 現在の例外

なし。`pnpm audit:dependencies` は実行時とビルド時の全依存を除外なしで検査し、high以上が残れば失敗します。例外がないことは、脆弱性がないことを意味しません。

2026-10-02のMetro修正後も25 high / 10 moderateが残っています。残存advisory、対応条件、既存PRとの重複確認は[Issue #29](https://github.com/Y-Kanekoo/jstqb-study-app/issues/29)で追跡します。

## 解消済み例外

`image-size-2.0.3-release-wait`（期限2026-09-12）は、Expo/React Native CLIの両経路から脆弱な依存を除去したため削除しました。期限の延長はしていません。

- 対象: `GHSA-w3rx-r6r6-pgpr`、`GHSA-5p2g-fcmc-qvqq`
- 修正: `@expo/metro` 56.0.2とMetro 0.84.5へ既存範囲内でlockfileを更新し、`image-size`とその専用依存`queue`を除去
- 判断・公式根拠・検証範囲: [TDR-001](tdr/001-metro-image-parser-security.md)

## 検査規則

`.github/security-exceptions.json`は例外ごとにAdvisory ID、理由、影響範囲、確認日、期限、解除方法を保持します。`pnpm check:security-exceptions`はpnpm設定・manifest・本文書のIDを照合し、各例外の期限を個別に比較します。期限を過ぎても例外が残っている場合はCIを失敗させ、根拠の再評価または例外削除を要求します。
