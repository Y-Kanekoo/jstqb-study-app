# TDR: SDK 57 query decoder の互換 adapter

- 日付: 2026-10-08
- 基点: Draft #38、`fbb51f741b5fc3011ea5a6c50aa029f2215edef0`
- 状態: Draft候補。最終headの独立レビュー・CI結果はPRへ記録する
- 追跡: #29。#35系統との統合、SDK移行、マージ・配備は対象外

## 比較と判断

Expo Router 57.0.24の4ファイルはquery-stringをnamespace importし、parse/stringifyを呼ぶ。公式query-string 9.5.1は修正版decoder ^0.5.0を使うがESM default exportのみで、現在のnamespace.parse/stringifyはundefinedになる。単なるmajor overrideは採用しない。Router 58への移行もSDK全体の判断を要する。

query-string 7.1.3のparser/stringifierは保持し、そのdecoder依存だけ公式0.5.0に限定overrideする。pnpm patchはimportのdefault適応と、旧decoderが担当していたliteral plus→space前処理だけ。独自decoder、脆弱版fallback、vendor copy、抑制は追加しない。公式0.5.0のtarballをnpm registryのSHA-512 integrityで照合した。

`.default`だけでは互換性が崩れることを独立レビューで確認した。`parseUrl('/learn#a+b', {parseFragmentIdentifier:true})`は旧版の`a b`から`a+b`になり、comma形式の`q=%2B%2Cx`は旧版の`[' ', 'x']`から`['+', 'x']`になる。adapterはdecoder境界で旧前処理を保持し、この2ケースもliteral fixtureで固定する。一般のqueryの前処理だけでは代替しない。

このpatchはquery-string 7.1.3のみへ固定し、lockにpatch SHA-256とdecoder 0.5.0のintegrityを持つ。query-stringの宣言^0.2.2から外れる判断を明示し、API・producer/consumerの検証で裏付ける。NodeのCJS→ESM requireは現在のNode24で確認し、ExpoのMetro変換後の実ブラウザを別gateとする。古いNodeをサポートする一般的なquery-string forkではない。native/Hermes実機の確認とは区別する。

## 契約とfixture

`scripts/fixtures/uri-query-contract.json`は新規の合成データで、既存の機能テスト入力・期待値は変えない。既存xcode依存ポリシーの運用テストが列挙するoverride集合には、今回の1 edgeを追加する。exact集合比較・xcode runtime検証は保持し、広いoverrideの混入を引き続き拒否する。

| 境界 | 契約・リスク | 証拠 |
|---|---|---|
| query-string parse/stringify | 不正%、壊れた/正常UTF-8、大小hex、重複順序、配列、plus、null/空値、strict encode、fragment、decode:false | 22 parse + 5 stringify + 3 fragmentのliteral fixture。旧APIと候補双方を照合 |
| Router同梱React Navigation core | 実parse、stringify、生成URLの往復 | 実モジュール・実consumerを呼ぶ。query parseのnullと不正UTF-8保持を検証 |
| Expo fork | 実stringify→実URLSearchParams parser、配列/plus/空値の往復 | 実生成bytesを再解析。NodeではUI barrelへの1 edgeだけ同じ実validatorへ解決 |
| Metro/ブラウザ | ESM defaultのbundle/runtime適応、全4 import経路 | Expo CLIがfixture entryをweb bundle化し、desktop/mobileブラウザで実行。parserをmockしない |
| 脆弱性回帰 | 不正UTF-8列での再帰的処理停滞 | 実query parserに`%FE`×20000。子process timeout 5秒、exit/outputを検査。旧版はtimeout、新版は完了 |
| 依存グラフ | 脆弱版再導入、patch外れ | 全lock decoder解決1件、実consumer版、patch hash、snapshotを検査 |

Expo forkの入力解析は既にURLSearchParamsを使う。query-stringの寛容なdecoderと同じ期待値へ無理に統一しない。例えば`%E0%A4`はquery-string/coreでliteral保持、Expoではreplacement characterとなり、値なしはそれぞれnull/空文字になる。prototype名はquery-stringでnull-prototype objectのdataとして保持する一方、現行Expoのroute.paramsとの衝突判定で除外される。これは本変更前からの境界差を記録するもので、一般的な新仕様を承認するものではない。

アプリの現利用は主に`router.push`のpractice/sessionIdと`useLocalSearchParams`。追加fixtureは将来利用も含む依存APIの回帰検査であり、認証・課金・実サービスへ接続しない。NodeのUI barrel置換だけではMetro互換を証明しないため、ブラウザテストでは置換しない実fork/coreを使用する。Expo forkの生成URLはPages環境で設定済みサブパスを含むため、ブラウザ期待値は既存E2Eと同じE2E_BASE_PATHを使う。core版はその設定を持たずroot pathのままである。

## 検証の限界と再現性

ローカルのpnpm取得はregistry503で停止した。連続retryは中止し、手元のquery-stringソースとintegrity確認済みのdecoder tarballへ同じpatchを適用した一時consumer配置で契約・ビルドを検証する。この配置は正式frozen installの成功とは扱わない。

lock差分は公式decoder manifest/integrityと、実pnpm11.21.0のpatch hash形式（LF正規化したSHA-256）から限定的に構成した。他の解決・metadataを保持し、最終CIのfrozen installがこのlockとpatchをそのまま受け入れることを必須gateとする。supply-chain policy、署名/期限検査を無効化しない。

最終headでaggregate checks、unit/operations、通常/Pagesブラウザ、未抑制auditと独立レビューを確認する。残るnode-forge/bracesのHighは保留し、security gateが成功したとは報告しない。native build・Hermes実機・実サービスは未検証。

## 撤去条件

SDK対応Router/query-stringの上位公式修正が公開されたら、adapterと限定overrideを同時に外し、同じfixture・実bundle・未抑制auditを再実行する。別バージョンへのpatch自動適用やignoreで延命しない。

公式根拠: [decoder 0.5.0](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js)、[decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)、[query-string 9.5.1 export](https://github.com/sindresorhus/query-string/blob/v9.5.1/index.js)、[query-string 7.1.3](https://github.com/sindresorhus/query-string/blob/v7.1.3/index.js)。
