# セキュリティ例外

脆弱性検査の除外はGitHub Advisory IDごとに限定し、理由、影響範囲、期限、解除条件を記録します。包括的な脆弱性検査無効化は行いません。

Expo SDK 58への更新により、以前のimage-sizeの推移的依存と監査例外を取り除きました。現在の例外はありません。`pnpm audit:dependencies`は実行時とビルド時の全依存を除外なしで検査します。

<!-- TODO(autonomous): globとminimatchのmoderate advisoryを依存元の更新で解消する。 -->

`.github/security-exceptions.json`は例外ごとにAdvisory ID、理由、影響範囲、確認日、期限、解除方法を保持します。`pnpm check:security-exceptions`はpnpm設定・manifest・本文書のIDを照合し、各例外の期限を個別に比較します。期限を過ぎても例外が残っている場合はCIを失敗させ、根拠の再評価または例外削除を要求します。
