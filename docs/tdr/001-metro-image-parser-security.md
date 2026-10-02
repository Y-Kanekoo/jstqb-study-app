# TDR-001: Metro画像パーサーの脆弱依存除去

- 日付: 2026-10-02
- 状態: Draft PRで検証する修正判断（マージ・公開の承認ではない）
- 基点: `00411ef12777fdda151a66833598f6805fdfdf63`
- 関連: [ADR-001](../adr/001-universal-expo.md)、[セキュリティ例外](../security-exceptions.md)

## 問題と決定

`image-size@1.2.1`はMetro 0.84.4から参照され、ExpoとReact Native CLIの両経路に存在しました。ICNSの無限ループ（[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)）とJXL/HEIFの無限ループ（[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)）の対象です。利用者画像の実行時解析ではなくビルド時の経路ですが、監査対象から外しません。

直接依存を変えず、lockfileの`@expo/metro`を56.0.0から56.0.2、Metroの14パッケージと内部依存`ob1`を0.84.4から0.84.5へ更新します。`image-size`と専用依存`queue`のpackage/snapshotを除去し、例外manifestと2件の監査ignoreを削除します。

- Expo 57.0.12、`@expo/cli` 57.0.14、`@expo/metro-config` 57.0.8の要求は`@expo/metro ~56.0.0`。
- [公式56.0.2 manifest](https://registry.npmjs.org/@expo/metro/56.0.2)はMetro全体を0.84.5に固定します。56.0.1にはtransform-worker 0.84.4が残るため採用しません。
- React Native 0.86.2のcommunity CLI/metro-configの要求は`^0.84.3`。残るReact Native系consumerも既存範囲内で同じ0.84.5へ揃え、旧版との二重解決を残しません。
- [Metro 0.84.5のAssets](https://github.com/react/metro/blob/v0.84.5/packages/metro/src/Assets.js)は[同梱パーサー](https://github.com/react/metro/blob/v0.84.5/packages/metro/src/lib/imageSize.js)を使用します。[公式manifest](https://registry.npmjs.org/metro/0.84.5)にimage-size依存はありません。

`pnpm update '@expo/metro' --depth 100 --lockfile-only`で公式パッチとintegrityを解決した後、既存のReact Native側lock解決を同じ互換版へ統合しました。旧Metro/ob1と不要なimage-size/queue記録を除き、frozen installで検証します。無関係な依存更新・package.json変更・overrideはありません。

## 採用しない方法

- image-size 2.xへの強制override: Metro 0.84.4の要求は`^1.0.2`で、CommonJS callable APIなどの互換性を保証できません。
- PR #26の一括採用: 21パッケージの広い更新で、今回の範囲を超えます。
- 期限延長、検査時刻変更、監査ignore継続: 修正の代替にはしません。

## 受入・回帰gate

| 契約・リスク | 層・根拠 | 必要な証跡 |
|---|---|---|
| 両consumerに旧依存が残らない | lock全体と実際のNode解決グラフ | `scripts/metro-security.test.mjs`でimage-size不在、Metro/ob1の一致、両経路の同一解決を検査 |
| 画像寸法取得の互換性 | Metro Assets統合 | 実際のapp-icon.svgをgetAssetDataへ渡し512×512、PNG 1×1、拡張子違いのcontent fallbackを確認 |
| 不正入力が同期処理を停止しない | parser回帰 | zero-length ICNSをPNGとして渡すchild processが3秒以内に拒否、空画像も拒否 |
| 回帰テストが旧lockを検出する | 感度確認 | 同じlock検査が基点のlockfileに対して失敗、修正後に成功 |
| アプリのbundle互換性 | aggregate/Web | frozen install、`pnpm check`、Web export、既存E2E/Pagesを実行し実結果をPRへ記録 |
| 他の脆弱性を隠さない | 全体監査 | ignoreなしauditを実行し、失敗をそのまま報告 |

追加テストは上流パーサーの全format fuzz検証ではありません。JXL/HEIFは当該依存とパーサー自体の除去をグラフ・公式ソースで確認します。既存の機能テスト入力・期待値は変更しません。DB/migration/アプリ機能、PR #14/#15の設計・DBハーネスは変更対象外です。

## 制限環境のWebビルド

この環境の既定`/home/agent/.expo`は書き込み範囲外です。インストール済み`@expo/cli@57.0.14`の`UserSettings.getExpoHomeDirectory()`にある、シェル起動時専用の`__UNSAFE_EXPO_HOME_DIRECTORY`を、空の許可済みディレクトリへ指定します。[Expo公式ソース](https://github.com/expo/expo/blob/main/packages/%40expo/cli/src/api/user/UserSettings.ts)にも同じ扱いがあります。`.env`や認証設定は変更せず、既存credentialsを読んだり複製したりしません。HOME変更、権限拡張、アクセス拒否の迂回はしません。

```sh
CI=1 EXPO_NO_TELEMETRY=1 \
  __UNSAFE_EXPO_HOME_DIRECTORY=/workspace/security-results/expo-home pnpm check
```

## 残存gate

2026-10-02の除外なしauditは25 high / 10 moderate（pnpm報告件数）でexit 1です。対象2件の消失だけを確認し、全体security gateの成功とは扱いません。[Issue #29](https://github.com/Y-Kanekoo/jstqb-study-app/issues/29)で残存問題を追跡します。最終head、各コマンドの結果、独立レビュー、CIはDraft PRに記録します。native実機buildと未実施のDB/E2Eは、実行証拠がない限り未検証です。マージ・デプロイは本作業の対象外です。
