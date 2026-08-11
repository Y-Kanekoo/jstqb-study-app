# 問題コンテンツ領域

公開リポジトリには、UIと検証を動かす少数の独自サンプルだけを`src/content/questions.ts`へ収録します。本番問題、正答キー、全件レビュー記録、投入・ロールバックSQLは非公開領域で管理します。

## 500題の受入配分

| 分類 | 必須件数 |
|---|---:|
| 第1章 | 100 |
| 第2章 | 75 |
| 第3章 | 50 |
| 第4章 | 138 |
| 第5章 | 112 |
| 第6章 | 25 |
| K1 / K2 / K3 | 100 / 300 / 100 |
| 単一選択 / 複数選択 | 440 / 60（複数選択は2つ選択） |
| 学習目標 | 64件すべてを1題以上でカバー |

## 状態と公開条件

- `draft`: 作問中。件数へ算入しません。
- `reviewing`: schemaと機械検査を通過し、人手レビュー待ちです。
- `published`: 技術・表記の独立レビューと本人の最終承認を通過しました。
- `suspended`: 正答誤りなどの緊急停止中です。
- `retired`: 新規出題を終了しています。過去履歴は保持します。

機械生成または機械検査済みであるだけの問題を`published`へ変更してはいけません。初期バンドルは全件`reviewing`とし、別ファイルのレビューmanifestで技術、表記、本人承認を追跡します。

## 必須フィールド

- 問題ID、版ID、版番号、状態
- シラバス版、章、学習目標、Kレベル、難易度
- 単一・複数選択、必要選択数、シャッフル可否
- 問題文、選択肢、正答
- 総合解説と全選択肢別解説
- シラバスの章節・LO参照、公式URL
- 独自作問宣言と禁止ソース確認
- 作成記録、機械検査記録、人手レビュー記録
- 作成方式（独立ケース、構造化是正、パラメーター派生）とケース系統
- 複数選択では誤概念`P1`/`P2`と、各正答の`addressedPremiseKeys`
- 問題内容のSHA-256

シラバス本文の長文転載は行いません。`sourceReference`は版、章節、学習目標コードの参照に限定します。テス友、市販教材、第三者の模擬問題・過去問の複製や言い換えは禁止です。

## 品質ゲート

`src/content/quality.ts`は次をエラーとして検出します。

- schema違反、ID・版ID・選択肢IDの重複
- 正答数と必要選択数の不一致
- 総合解説または選択肢別解説の欠落
- 章、学習目標、Kレベル、参照箇所の不一致
- content hash改ざん
- 禁止表現と他アプリ名
- システム名・汎用前置きだけを差し替えた装飾的コンテキスト
- 装飾を除いた問題文の一致・近似
- 選択肢集合の一致
- 同一LO内の問題文類似度と選択肢Jaccardを組み合わせた近似重複
- 500題、章配分、Kレベル配分、64学習目標カバレッジの不一致
- 単一選択440題、複数選択60題（正解集合2件）の不一致
- 複数選択の誤概念と正答が1対1に対応しない、または解説に対応先がない問題

レビューmanifestには作成方式別件数とパラメーター派生問題の件数・率を記録します。派生率は数値や名称だけを変えた水増しの検知指標であり、機械検査の合格や人手レビューの代替ではありません。

本番公開ゲートでは、さらに全件`published`、技術・表記の人手承認、本人の最終承認を要求します。

## コマンド

`PRIVATE_BUNDLE`と`PRIVATE_OUTPUT_DIR`は公開リポジトリ外の絶対パスを指定します。

```bash
pnpm content:validate --file "$PRIVATE_BUNDLE"
pnpm content:validate --file "$PRIVATE_BUNDLE" --release

pnpm content:seed --file "$PRIVATE_BUNDLE" --dry-run
pnpm content:seed --file "$PRIVATE_BUNDLE" --output "$PRIVATE_OUTPUT_DIR/seed.sql"

pnpm content:rollback --file "$PRIVATE_BUNDLE" --dry-run
pnpm content:rollback --file "$PRIVATE_BUNDLE" --output "$PRIVATE_OUTPUT_DIR/rollback.sql"
```

生成SQLは`psql -v ON_ERROR_STOP=1 -f`で実行するトランザクションです。投入順は資格・シラバスの参照、章、学習目標、問題、問題版、選択肢、非公開正答キー、レビュー記録、import記録です。

`reviewing`問題を投入しても`questions.current_version_id`へ設定しないため、学習者へは公開されません。`published`問題を含むSQLの生成には`--release`が必要です。

ロールバックSQLは回答履歴が1件でも存在すると停止します。利用開始後は物理削除せず、`suspended`または`retired`と新版作成で対応します。

## Git境界

`pnpm check:content-boundary`は次を拒否します。

- `private-content`配下の追跡
- `*.questions.json`、`*.review-manifest.json`、`*.seed.sql`、`*.rollback.sql`
- 50件を超える`questions`配列を持つ追跡済みJSON

SQLとJSONには正答が含まれるため、権限を`0600`、格納ディレクトリを`0700`にし、公開PRへ添付しません。
