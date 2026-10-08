# TDR: SDK 57の対応依存へ揃える

- 日付: 2026-10-08
- 状態: Draft検証。マージ・配備承認ではない
- 基点: PR #34、`8ecb45712e18c6b4c8c4ea19698600c294033d78`
- 追跡: Issue #36（SDK互換性）、Issue #29（残存監査）

## 問題と判断

#33はExpo 57.0.26を保ったままReact/RN/Reanimated等を次の系列へ進め、型検査のStyleProp/TextStyle不整合とWeb buildの`react-native/rn-get-polyfills`非公開exportエラーを起こしていました。#34は解消済みimage-size例外だけを削除したため、この互換性問題は残っていました。

Expo本体を上位SDKへ移すのではなく、インストール対象Expo 57.0.26の公式`bundledNativeModules.json`へ依存を揃えます。[公式npm manifest](https://registry.npmjs.org/expo/57.0.26)のtarballをintegrity照合し、その対応表とinstalled対応表の内容一致を確認しました。

| 直接依存 | #34 | 採用指定 |
|---|---|---|
| react / react-dom | 19.3.0 | 19.2.3 |
| react-native | 0.87.1 | 0.86.3 |
| react-native-reanimated | 4.7.0 | 4.5.1 |
| react-native-safe-area-context | ~5.10.1 | ~5.7.0 |
| react-native-screens | ~4.28.0 | ~4.26.0 |
| react-native-worklets | 0.13.0 | 0.10.1 |
| eslint-config-expo | ^57.0.1（lock57.0.1） | ~57.0.2 |

8個の直接依存指定だけを変更します。react-native-web 0.21.3は既にSDKの~0.21.0範囲内なので保持。Expo/Router、Supabase、Zod、Zustandなど他の#33更新は保持します。lockの大きな行差分にはpeerの組合せ変更とRN0.87/Metro0.87系列の削除が含まれ、無関係な本体更新を追加しません。

アプリのAPI・画面・認証・署名設定、tsconfig、既存test入力/期待値、checker/例外/監査基準は変更しません。any、型assertionやskip追加、非公開APIへの迂回では解決しません。Expoの既存tsconfigに含まれる設定は今回変更していません。

## 検証する契約

- 全直接依存のうちSDK対応表に載るものは、宣言範囲とinstalled版が対応範囲内。React/DOM版一致とRNのReact peerを確認。
- Expo CLIから通常の`react-native/rn-get-polyfills`を取得し、実polyfillファイルの存在と内容を確認。修正前のWeb build失敗点へ到達する境界を検査。
- 旧manifestを使う新規guardの感度試験は失敗、修正後の2テストは成功。
- `expo install --check`はoffline実行で成功。ただしCLIがoffline validationの制限を警告するため、それ単独を根拠とせず公式tarball対応表と全体検査で補完。
- 最終headでfrozen install、lint・型・14 unit・operations・Web build、CI通常Web/Pages E2Eを確認。実Web bundleを通した既存E2EでUI/runtimeの回帰を確認し、native compile・リンク・実機・署名を検証済みとはしない。

## 系列・残存問題

#34/#33のheadを変更せず、#34上の別Draftに保存します。#35のセキュリティ系列を機械的に取り込みません。このSDK修正だけの監査はcritical 1 / high 6 / moderate 5（固有GHSA 11）のままで、greenとは扱いません。公開済み修正の適用は、この系列の実グラフと親範囲を改めて確認した別の小修正で扱います。

別系列#35のhigh 2 / moderate 1は、node-forge GHSA-86w9-cpqp-85rv、braces GHSA-vfj7-8cjw-p6xm、decode-uri-component GHSA-vcc3-ghjq-m6frです。2026-10-08の公式registry最新はforge1.4.0/braces3.0.3で修正版未公開。decoder修正版0.5.0は存在するがRouter57のCommonJS query-stringからのAPI移行が必要です。独自暗号修正、suppression、期限延長は行いません。
