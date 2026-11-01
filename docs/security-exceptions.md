# セキュリティ例外

脆弱性検査の除外はGitHub Advisory IDごとに限定し、理由、影響範囲、期限、解除条件を記録します。包括的な脆弱性検査無効化は行いません。

## 現在の例外

現在、有効な監査例外はありません。

過去の例外`image-size-2.0.3-release-wait`（`GHSA-w3rx-r6r6-pgpr`、`GHSA-5p2g-fcmc-qvqq`）は、Expo/Metroの推移的依存を修正済みMetro（`metro@0.84.5`以上。`image-size`への依存を持たない）へ更新して解消し、削除しました。将来`image-size`が再び依存に入った場合に脆弱版へ戻らないよう、`pnpm-workspace.yaml`の`overrides`で`image-size@>=2.0.3`を強制しています。同様に、`vitest`経由の`vite`は`launch-editor`の脆弱性（`GHSA-587h-7wmj-h5pm`）修正版へ上げるため`overrides`で`^8.2.4`以上に固定しています。

`.github/security-exceptions.json`は例外ごとにAdvisory ID、理由、影響範囲、確認日、期限、解除方法を保持します。`pnpm check:security-exceptions`はpnpm設定・manifest・本文書のIDを照合し、各例外の期限を個別に比較します。期限を過ぎても例外が残っている場合はCIを失敗させ、根拠の再評価または例外削除を要求します。
