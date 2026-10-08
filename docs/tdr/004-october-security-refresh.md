# TDR-004: 10月追加advisoryの互換更新と系列分離

- 日付: 2026-10-08
- 状態: Draft PRで検証する判断。マージ・配備承認ではない
- 基点: PR #32、`8b2a6031cb475307bd231762c7fbc93bcc4b6f82`
- 追跡: [Issue #29](https://github.com/Y-Kanekoo/jstqb-study-app/issues/29)

## 判断

10月2日の監査結果は現在の安全性の証拠として流用しません。除外なし再監査ではcritical 1 / high 4 / moderate 1（固有GHSA 6件）を確認しました。公開済みの公式修正版から、既存親範囲内の3解決だけを更新します。新規override、例外、監査重大度変更、署名・認証設定変更はありません。

| Advisory | 実consumerと要求範囲 | 更新 |
|---|---|---|
| [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) critical | React Native → react-devtools-core、shell-quote `^1.6.1` | 1.10.0 → 1.11.0。最新1.12.0ではなく最初の修正版 |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) high | Vitest → Vite → PostCSS、coverage-v8 → magicast、source-map-js | 1.2.1 → 1.2.2。両consumerを更新 |
| [GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95) high | Expo CLI、compression `^1.7.4` | 1.8.1 → 1.8.2。既存destroy 1.2.0への新edgeは公式修正の一部 |

[shell-quote](https://registry.npmjs.org/shell-quote/1.11.0)、[source-map-js](https://registry.npmjs.org/source-map-js/1.2.2)、[compression](https://registry.npmjs.org/compression/1.8.2)の公式manifest・integrityとlock/installed consumerを照合します。package.json・他のpackage resolution・既存テストの入力/期待値は変更しません。

## 契約・検証

新規`scripts/october-dependency-security.test.mjs`で以下を検査します。

1. 全lock resolutionと実consumer版・親の許容範囲。基点lockへ戻すとguardが失敗。
2. DevToolsの実shell-quoteで空文字・空白・日本語・引用符等のquote→parse往復。comment後の4種の改行を拒否。生成文字列をshell実行しません。
3. PostCSSとmagicastが使う実source-map-jsでgeneratorのbytes→consumerの元位置/内容を往復。有効indexed offsetを許可し、負数・小数・無限・巨大offsetを拒否。巨大source mapの展開は行いません。
4. Expo CLIが使う実compressionで、loopback HTTP応答をgzip→gunzip。途中でclientを切断し、実zlib streamのclose/destroyを確認。観測用factory wrapper以外は実処理で、実サービスへ接続しません。

旧3ライブラリを別processの解決先だけに指定した感度試験では、shell/source-mapの拒否assertionが失敗、compressionはstream解放待ちが10秒deadlineで失敗しました。installed sourceは変更せず、終了時にstream/serverをcleanupします。通常の4テストはすべて成功します。これは各advisoryの全攻撃面の証明ではなく、修正対象境界と代表的互換性の検査です。

最終headでfrozen install、lint・型・unit・operations・Web build、除外なしaudit、既存CI E2E/Pages/DBを確認し、独立レビューとexact head/treeをPRへ記録します。

## 保留と統合判断

更新後もhigh 2 / moderate 1（固有GHSA 3件）が残り、security gateは失敗のままです。

- node-forge GHSA-86w9-cpqp-85rv: 公式registry最新1.4.0、GitHub Advisory patched None。auditの`>=1.4.1`を公開済み修正と誤認しません。Expo CLI最新57.0.28とcode-signing-certificates0.0.7も依存を保持。独自暗号パッチ・未公開版採用はしません。
- braces GHSA-vfj7-8cjw-p6xm: 公式registry最新3.0.3、GitHub Advisory patched None。auditの`>=3.0.4`は未公開。Metro file-map/transformやlintのmicromatch経路を保留します。
- decode-uri-component GHSA-vcc3-ghjq-m6fr: 公式修正版は0.5.0（auditの`>=0.4.3`表記とは区別）。Router最新57.0.25もquery-string `^7.1.3`を要求し、decoder 0.2.2が残存。0.5.0はESM default、現在のquery-stringはCommonJSの関数requireなので単純overrideを採用しません。Router公式移行か明示的なAPI移行設計・検証が必要です。

PR #33はmain `00411ef`基点の22パッケージ更新で、#30/#31/#32とは別系列です。#33からimage-sizeが消えていることを確認し、古い例外削除だけを別Draft #34に保存します。#33を本修正へ取り込まず、本修正を#33へ機械的に混ぜません。

#33の例外検査通過後には型エラーと`react-native/rn-get-polyfills`非公開exportによるWeb build失敗が表面化しました。Expo57.0.26の公式同梱manifestはReact19.2.3/RN0.86.3/Reanimated4.5.1/Worklets0.10.1を指定する一方、#33は19.3.0/0.87.1/4.7.0/0.13.0です。SDK整合性の判断は22更新の採否に関わるため、この小修正で型検査を緩めたり更新意図を変更したりしません。別系列の最小修正が通ることと、#33全体が採用可能なことを分けて報告します。
