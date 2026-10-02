# TDR-002: 残存依存監査の互換修正

- 日付: 2026-10-02
- 状態: Draft PRで検証する修正判断（マージ・公開承認ではない）
- 基点: PR #30、`c53fc59fd54a9f155a28b8f23a8ab072b3f10d8b`
- 追跡: [Issue #29](https://github.com/Y-Kanekoo/jstqb-study-app/issues/29)

## 判断と変更範囲

親依存の既存要求を満たす公開修正版だけをlockfileへ反映します。package.json、Expo/React Native本体、アプリ機能、既存テストの入力/期待値、CI、例外manifest、pnpm設定は変更しません。overrideと新規監査除外はありません。

| 親依存・経路 | 既存要求 | lockfileの修正 |
|---|---|---|
| Expo → config-plugins → @expo/plist 0.8.1 | @xmldom/xmldom `^0.8.8` | 0.8.13 → 0.8.15 |
| Expo → config-plugins → xcode → simple-plist → plist 3.1.1 | @xmldom/xmldom `^0.9.10` | 0.9.10 → 0.9.12 |
| ESLint → @eslint/eslintrc 3.3.6 / Expo CLI → @expo/xcpretty 4.4.4 | js-yaml `^4.3.0` / `^4.1.0` | 4.3.1 → 4.3.2 |
| ESLint → minimatch 3.1.5 | brace-expansion `^1.1.7` | 1.1.18 → 1.1.21 |
| Expo CLI/config-plugins → glob → minimatch 10.2.6 | brace-expansion `^5.0.8` | 5.0.9 → 5.0.12 |
| root devDependencies | vitest / coverage-v8 `^4.1.10` | Vitestと同版固定の8個の@vitest/*を4.1.11へ |

全14個のpackage resolutionだけを更新します。特にbrace-expansionは4→5の強制変更ではなく、元から解決されている5.xと1.xそれぞれの保守パッチです。Vitestのpeer/内部依存は同版へ揃えます。

公式npm registryの[XML](https://registry.npmjs.org/@xmldom/xmldom)、[YAML](https://registry.npmjs.org/js-yaml)、[brace-expansion](https://registry.npmjs.org/brace-expansion)、[Vitest](https://registry.npmjs.org/vitest)、[coverage-v8](https://registry.npmjs.org/@vitest/coverage-v8)と実際の親manifestを照合しました。`pnpm update '@xmldom/xmldom' js-yaml brace-expansion --depth 100 --lockfile-only`、`pnpm update vitest@4.1.11 @vitest/coverage-v8@4.1.11 --no-save --lockfile-only`でintegrityを解決し、更新時に混入するVitestの無関係な推移的最新版は既存解決へ戻しました。全Vitest内部依存の実バージョンが新manifestの要求範囲内であることを追加テストで確認します。

## PR #26との重複

PR #26のhead `2628ca6dedad122c7298a844398d45c98107f543`のmanifest/lockfileを確認しました。XML 0.8.15/0.9.12、brace-expansion 5.0.12、js-yaml 4.3.2の一部は重複します。しかし同PRにはbrace-expansion 1.1.18、js-yaml 4.3.1、Vitest 4.1.10、下記3件も残っています。21個の本体更新を採用せず、本PRは#30のbranchをbaseとする別Draftにします。#30が進む場合はbase/headの整合と最終CIを再確認します。

## 残す問題と理由

以下は検査対象のまま残します。範囲外override、例外追加、期限延長で解消扱いにはしません。

| Advisory | 実際の経路・用途 | 保留理由・次の条件 |
|---|---|---|
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) high | Expo → CLI / code-signing-certificates → node-forge 1.4.0。certificate/publicKeyのverify呼出しが存在 | 監査指定修正版1.4.1は[registry](https://registry.npmjs.org/node-forge)に未公開、最新1.4.0。公開済み公式修正か親側の除去・置換が必要。署名検証の独自パッチは本変更では行わない |
| [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) moderate | Expo Router → query-string 7.1.3 → decode-uri-component 0.2.2。getStateFromPath等でquery parseへ到達 | 親の要求`^0.2.2`に修正版なし。[query-string](https://registry.npmjs.org/query-string)最新7.xは7.1.3、9.5.1は修正済みdecode 0.5.xを要求するがメジャー/API/ESM移行。Router公式対応とURL互換性検証を伴う別判断が必要 |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) moderate | Expo → config-plugins → xcode 3.0.1 → uuid 7.0.3。確認したpbxProjectの呼出しはv4のみ | [xcode](https://registry.npmjs.org/xcode)最新安定版3.0.1は`^7.0.3`、修正版uuid 11.1.1は範囲外。advisoryはv3/v5/v6のbuffer処理で、観測したv4経路とは異なるが監査を除外しない。親の公式対応か明示的な移行判断が必要 |

API到達経路の静的確認は悪用不可能の証明ではありません。秘密情報、実署名、実サービス、非公開問題データは検証に使いません。

## Gateと実行証拠

| 契約・リスク | 検証 |
|---|---|
| 古い脆弱解決の再導入 | 追加Node testで全lockfileの対象14 resolutionを検査。#30のlockへ戻す感度試験は失敗、修正後成功 |
| 親依存の互換性 | 実consumerのXML/YAML/brace版と要求範囲、Vitest全内部依存の範囲・peer一致を検査 |
| XML入出力の互換性 | @expo/plistとxcode配下plistの両APIでUnicode、escaping、array、boolean、数値をbuild→parse |
| YAMLのCPU予算 | 両consumerで通常mergeを保存、空merge sourceの予算2超過を拒否・予算3を許可。旧4.3.1は拒否期待が失敗することを確認 |
| glob互換性 | 旧/新minimatch consumerで範囲brace・拡張子braceのpositive/negativeを照合 |
| テストrunner/plugin互換性 | 既存14 unitの期待値を変えず実行し、追加でcoverage-v8も実行 |
| アプリ・運用 | frozen install、pnpm check、Web build、CI E2E/Pages/database、最終headの独立レビュー |

追加テストは全advisoryのexploit suiteではありません。各修正版の選択・監査と、変更境界の代表的互換性を検証します。検査基準を変更しません。

監査は基点が**35件（25 high / 10 moderate）、固有GHSA 22件**、修正後が**3件（1 high / 2 moderate）、固有GHSA 3件**です。件数は`metadata.vulnerabilities`、固有数は`advisories[*].github_advisory_id`の重複除去で数えます。同じGHSAの複数バージョンやvitest/mockerを別advisoryとは数えません。highが残るため全体security gateは失敗のままです。最終headと独立レビュー・CI実結果はDraft PRへ記録します。native実機buildは未実施で、マージ・デプロイは対象外です。
