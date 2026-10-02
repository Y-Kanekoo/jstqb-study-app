# TDR-003: xcode経路に限定したuuid修正版の採用

- 日付: 2026-10-02
- 状態: Draft PRで検証する判断。マージ・公開承認ではない
- 基点: PR #31、`e3839c89d369e06b4d78c6d9c22920320ed61a7a`
- 追跡: [Issue #29](https://github.com/Y-Kanekoo/jstqb-study-app/issues/29)

## 判断・公式根拠

`expo → @expo/config-plugins → xcode 3.0.1 → uuid 7.0.3`だけを、pnpmの`xcode@3.0.1>uuid: 11.1.1`で置換します。これは親の宣言`^7.0.3`の範囲外を意図的に採用する判断です。TDR-002の範囲内更新とは別PRで扱い、全uuidに適用するoverrideは使いません。

[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)はv3/v5/v6の出力buffer境界検査に関する問題です。[公式11.1.1リリース](https://github.com/uuidjs/uuid/releases/tag/v11.1.1)と[registry manifest](https://registry.npmjs.org/uuid/11.1.1)の修正版・integrityを照合します。11.1.1は`node.require → ./dist/cjs/index.js`を提供します。最新メジャーへの更新は不要です。[xcode最新安定版3.0.1](https://registry.npmjs.org/xcode/3.0.1)は依然`^7.0.3`を要求するため、親の通常更新では解消しません。

実際にインストールしたxcodeのJSを確認したところ、uuid直接呼出しは`lib/pbxProject.js`の`generateUuid()`からの引数なし`uuid.v4()`だけでした。この呼出しはCommonJSで解決でき、返されたUUIDからハイフンを除去し先頭24桁を大文字化、`allUuids()`に既存IDがあれば再試行します。11.1.1の変更された他のAPIへ互換性があるとは主張しません。観測したv4経路がadvisoryのv3/v5/v6と異なっても、監査除外にはしません。

## 境界とリスク

- 対象はiOSプロジェクト生成・prebuildのNode toolingであり、アプリ実行時のURL解析や暗号署名の修正ではありません。
- lockfileのpackage resolution変更はuuid 7.0.3→11.1.1の一件のみ。xcode、Expo、他consumer、package.json、CI、既存テスト、例外manifestは変更しません。
- 7→11は一般にはメジャー移行です。今回の根拠は固定されたxcode 3.0.1の実consumerと利用APIに限定されます。親更新で新たなuuid APIや別xcode版が入る場合は再評価が必要です。
- 256件のID生成は衝突確率の証明ではありません。別途、異なる完全UUIDが同じ24桁になる衝突を決定的に発生させ、再試行と既存オブジェクト不変性を確認します。恒常的に衝突する乱数源に対するxcodeの再帰上限は今回変更しません。
- fixtureは新規の合成・未署名プロジェクトです。実署名、実ソース、実データ、外部サービスを使いません。parse/write成功はXcodeでのnative compile・リンク・署名成功の証明ではありません。

## 契約と検証

新規`scripts/xcode-uuid-security.test.mjs`を既存`test:ops`が自動実行します。既存テストの入力・期待値・基準は変えません。

| 契約・リスク | 検証・根拠 |
|---|---|
| 経路限定・修正版への解決 | workspace/lock overrideの完全一致、xcode snapshot、uuid全resolution、実consumer manifestを照合。旧lockだけへ戻した感度試験は失敗 |
| CommonJS・v4互換 | Expo→config-plugins→xcodeの実requireでCJS exportを解決し、実v4のvalidate/versionを確認 |
| ID形式と既存ID保存 | 実generateUuidを256回呼び、24桁大文字16進、重複なし、実PBXGroupへ登録した後の個数を確認 |
| 衝突後の再試行 | uuidのnative乱数境界だけをmock。本物v4・xcodeを通し、同じ24桁になる別UUID2個と別セクションのIDを連続供給。4回目採用と既存hash不変を確認。再試行条件をプロセス内だけで無効化した感度試験は失敗 |
| producer→consumerの参照維持 | 実xcode APIでapplication target、Debug/Release構成、product、source phase、group、Swift file参照を追加。writeした実bytesを同期・非同期parserに渡し、各参照・既存構成を検証。再write→parseでhashとbytesの安定性も確認 |
| 全体回帰 | frozen install、除外なしaudit、pnpm check（静的検査・unit・operations・Web export）、最終headの独立レビューと既存CI |

感度試験は通常のpassing gateと分け、期待通りの失敗を記録します。最終head、実行コマンド・結果、独立レビューの範囲、CI runとmerge-refの対応はDraft PRと検証証跡へ記録します。

## 残存問題・撤去条件

除外なし監査は基点の1 high / 2 moderate（固有GHSA 3件）から、1 high / 1 moderate（固有GHSA 2件）になります。node-forgeとdecode-uri-componentは変更せず保留し、highが残るsecurity CIの失敗を保持します。例外追加、期限延長、suppressions、監査基準変更はありません。

xcodeまたはExpoが修正版uuidを公式に要求する版へ移行した時点で、このoverrideと固定版の判断を再評価します。overrideなしの解決・同じ互換性検証・監査が通ることを確認して撤去します。別版xcodeへ古い依存が戻った場合、追加した全resolution検査が失敗するため、黙って適用範囲を広げません。

PR #30/#31のbranch・commit・既存証跡は保持し、本PRは#31のbranchをbaseとする別Draftです。親PRのbase/head変更後は統合tree・CIを再確認します。マージ・デプロイは対象外です。
