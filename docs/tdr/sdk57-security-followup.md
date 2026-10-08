# TDR: SDK 57整合後の公開済みセキュリティ修正

- 日付: 2026-10-08
- 状態: Draft検証。マージ・配備承認ではない
- 基点: PR #37、`6df3119e59aed2f07fbd83480c0b0beb8b8ea221`
- 追跡: Issue #29、SDK互換性はIssue #36

## 最小変更の判断

#33/#34/#37系列は#35と依存版が異なるため、#35をmerge/cherry-pickしません。この系列のlock・installed consumer・親manifestを独立に照合し、公開済み修正だけを選びます。#37のSDK対応版、package.json、アプリ、tsconfig、既存test入力/期待値、監査基準・例外は保持します。

| 対象 | 旧解決 → 修正 | 判断 |
|---|---|---|
| Vitestと内部8パッケージ | 4.1.10 → 4.1.11 | rootの^4.1.10内。内部同版固定を揃える |
| js-yaml | 4.3.1 → 既存4.3.2へ統一 | ESLint/Expo xcprettyの要求範囲内 |
| brace-expansion | 1.1.18 → 1.1.21 | minimatch3の要求範囲内。既存5.0.12は保持 |
| shell-quote | 1.10.0 → 1.11.0 | react-devtools-coreの^1.6.1内 |
| source-map-js | 1.2.1 → 既存1.2.2へ統一 | PostCSS/magicastの要求範囲内 |
| uuid | 7.0.3 → 11.1.1 | 下記の限定override判断 |

旧14 package resolutionを除去し、新規12 resolutionを追加します（YAMLとsource-mapは既存修正版へ統一）。他のpackage metadataは不変。Vitest更新時に不要な推移的最新版を採らず、既存解決を保持し、全Vitest依存の要求範囲をテストで確認します。compression1.8.2とXML修正版はこの系列で既に修正済みなので更新しません。

## uuidの宣言範囲外採用

`xcode@3.0.1>uuid: 11.1.1`だけに限定します。親の^7.0.3範囲外であることを明示し、全uuidへのoverrideはしません。実xcode3.0.1の呼出しは引数なしCommonJS `v4()`のみで、11.1.1はCJS exportを提供します。Expoの新しいconfig-plugins経路で再解決して同一consumerを確認します。

実v4とxcodeを通した24桁ID生成、同じ24桁へ切り詰められる別UUID・別セクションの既存IDへの衝突再試行、合成pbxprojのtarget/configuration/product/group/source参照の生成→同期/非同期parseを検証します。乱数境界だけをmockし、既存objectを保存します。親が修正版を公式に要求する版へ進んだ際はoverrideを外した同じ検証を行い、撤去します。別xcode版へ黙って適用範囲を広げません。

## 再利用する契約と証拠

#35でレビューした依存境界テスト3ファイルと合成fixtureだけを再利用し、この系列では新規13テストとして実行します。過去のgreen結果は流用しません。実際の親manifest範囲、固定版、XML/YAML/glob、shell quote、source map、gzip正常応答/切断時解放、xcode ID/実bytesのparseを現在の依存で再検証します。未変更のXML/compressionもconsumer互換性の回帰対象として含めます。新guardを旧#37 lockへ戻した感度試験は失敗します。

最終headでfrozen install、lint・型・unit・operations・Web build、coverage-v8、除外なしaudit、通常Web/Pages E2E、独立レビューを確認し、結果とCI merge-treeをPRへ記録します。実署名、実Supabase、外部通知、非公開データは使いません。native compile/実機/署名は未検証です。

## 除外しない残存項目

監査は基点critical1/high6/moderate5（固有GHSA11）からhigh2/moderate1（固有GHSA3）です。security gateの失敗を維持します。

- **GHSA-86w9-cpqp-85rv / node-forge / high**: Expo→CLI→node-forge、およびCLI→code-signing-certificates→node-forge1.4.0。公式npm最新1.4.0、GitHub Advisory patched None。CLI最新版57.0.28/next58.1.5にも依存が残る。audit>=1.4.1は公開済み修正版ではない。
- **GHSA-vfj7-8cjw-p6xm / braces / high**: Expo→CLI→Metro file-map→micromatch→braces3.0.3等。公式npm最新3.0.3、Advisory patched None。micromatch最新版4.0.8も^3.0.3を要求。audit>=3.0.4は未公開。
- **GHSA-vcc3-ghjq-m6fr / decode-uri-component / moderate**: Expo Router→query-string7.1.3→decoder0.2.2。公式修正版0.5.0は実在するがESM defaultで、現在のCommonJS callable requireと非互換。Router latest57.0.25は旧経路を保持。next58.0.16は依存を除去するがExpo58の複数peerが必要で、このSDK57修正に混ぜない。

署名・認証・セキュリティ設定を緩めず、独自暗号修正・手動vendoring・未公開版採用・suppression・期限延長は行いません。

公式根拠: [forge](https://registry.npmjs.org/node-forge)、[braces](https://registry.npmjs.org/braces)、[decoder](https://registry.npmjs.org/decode-uri-component/0.5.0)、[Vitest](https://registry.npmjs.org/vitest/4.1.11)、[YAML](https://registry.npmjs.org/js-yaml/4.3.2)、[brace-expansion](https://registry.npmjs.org/brace-expansion/1.1.21)、[uuid](https://registry.npmjs.org/uuid/11.1.1)、[shell-quote](https://registry.npmjs.org/shell-quote/1.11.0)、[source-map-js](https://registry.npmjs.org/source-map-js/1.2.2)。監査本文と公開版・実manifestを区別します。
