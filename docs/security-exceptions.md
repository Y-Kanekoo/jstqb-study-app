# セキュリティ例外

脆弱性検査の除外はGitHub Advisory IDごとに限定し、理由、影響範囲、期限、解除条件を記録します。包括的な脆弱性検査無効化は行いません。

## image-size 2.0.3公開待ち

- 対象: `GHSA-w3rx-r6r6-pgpr`、`GHSA-5p2g-fcmc-qvqq`
- 重大度: high
- 影響: ICNS、JXL、HEIF解析時の無限ループによるDoS
- 経路: ExpoのビルドツールであるMetroからの推移的依存`image-size@1.2.1`
- 判断日: 2026-08-11
- 解除条件: `image-size@2.0.3`以上、または修正済みMetro/Expoへ更新可能になった時
- 次回確認: Dependabotの週次PRごと、遅くとも2026-09-12

2026-08-11時点で監査情報は2.0.3以上を修正版としていますが、npm registryの最新公開版は2.0.2で、修正版へ更新できません。対象はアプリの実行時に利用者の画像を解析する経路ではなく、開発・Web/ネイティブバンドル時のMetro経路です。

`pnpm audit:dependencies`は実行時とビルド時の全依存を対象に、この2 IDだけを除外し、他のhigh以上を引き続き失敗させます。修正版公開後は除外を削除し、lockfile更新、`pnpm check`、E2E、実機ビルドを実行します。

`.github/security-exceptions.json`は例外ごとにAdvisory ID、理由、影響範囲、確認日、期限、解除方法を保持します。`pnpm check:security-exceptions`はpnpm設定・manifest・本文書のIDを照合し、各例外の期限を個別に比較します。期限を過ぎても例外が残っている場合はCIを失敗させ、根拠の再評価または例外削除を要求します。
