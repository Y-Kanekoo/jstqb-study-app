# リリース手順

## 1. PRの最小単位

1つのPRは1つの目的に限定します。

- `feat`: 利用者向け機能1件
- `fix`: 不具合1件
- `test`: テスト・検査基盤1件
- `ops`: CI、CD、監視、配布設定1件
- `docs`: 設計・運用文書1件
- `chore`: 依存更新など動作を変えない保守1件

機能、DB migration、大量の問題追加を同じPRへ混在させません。migrationが必要な機能は、後方互換migration、アプリ実装、不要列の削除を別リリースへ分けます。

## 2. 必須検査

mainへ入る前に次のGitHub Checksを必須にします。

| Check | 内容 |
|---|---|
| `quality` | 禁止型、秘密情報、lint、型、単体、契約、コンテンツ、Webビルド |
| `e2e` | Chromiumデスクトップ・モバイル、保存、誤答、オフライン、アクセシビリティ |
| `pages` | 本番サブパス成果物、ルーティング、Service WorkerのWeb E2E |
| `security` | 追跡ファイルの秘密検査、本番依存のhigh以上の脆弱性 |

`scripts/apply-main-ruleset.sh`は、上記4検査、会話解決、squash mergeをGitHub Rulesetへ設定します。実行にはGitHub CLIのAdministration write権限が必要です。

```bash
./scripts/apply-main-ruleset.sh
```

初期はGitHubアカウント1つで運用するため、承認数を0、最新push以外の人による承認をOFFにします。自己承認を作るbotや偽装レビューは設定せず、独立AIレビューの結果をPR本文またはコメントへ記録します。自動マージでも`quality`、`e2e`、`pages`、`security`、会話解決、最新mainでの検査は迂回できません。

別の人間レビュアーを追加した時点で`.github/rulesets/main.json`を次のように変更し、スクリプトを再実行します。

```json
{
  "required_approving_review_count": 1,
  "require_last_push_approval": true
}
```

## 3. GitHub Pages

`品質検査`がmainで成功すると`Web本番デプロイ`が開始します。手動実行は現在のmainからだけ可能で、同じcommitに対する`quality`、`e2e`、`pages`、`security`の成功をGitHub APIで再検証します。

初回だけGitHubのSettings、Pages、Build and deploymentでSourceを`GitHub Actions`にします。Pagesデプロイには外部シークレットは不要です。

任意のRepository Variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

両方がある場合だけアカウント同期を有効化します。未設定時もデプロイは成功し、端末内保存のみの個人学習モードになります。Service role keyは登録しません。

Pages用ビルドではリポジトリ名をExpo Routerの`baseUrl`へ設定し、SPA用`404.html`、`.nojekyll`、サブパス対応manifestとService Workerを生成します。

## 4. 問題コンテンツ

公開リポジトリのサンプルは`pnpm test:content`で検査します。本番500題は公開リポジトリへ置かず、公開候補のJSONエクスポートに対して次を実行します。

```bash
CONTENT_MINIMUM_COUNT=500 pnpm content:verify /安全な場所/questions.json
```

エクスポートはコミットせず、検査後もCI artifactへ保存しません。500題未満、未レビュー、非公開状態、重複、根拠不足、正答数不整合が1件でもある場合は公開しません。

## 5. Webリリース確認

1. `quality`、`e2e`、`pages`、`security`が成功している。
2. `pages-build`と`pages-deploy`が成功している。
3. 公開URLのホーム、問題、再読み込み、オフライン復帰を確認する。
4. Supabase変数を設定した場合は別端末同期を確認する。
5. 問題500題検査の結果をリリース記録へ添付する。

問題がある場合はGitHub Pagesの直前の成功デプロイを再実行するか、修正PRを作成します。DB変更はロールバックSQLに依存せず、後方互換の修正migrationでロールフォワードします。

## 6. iOS・Android

`eas.json`は秘密情報を含まないビルドテンプレートです。EASへ接続するまでは自動ストア配布を行いません。

- `development`: Development Client、内部配布
- `preview`: 本人向け内部配布
- `production`: ストア提出用、ビルド番号を自動更新

GitHub Actionsへモバイル配布を追加する場合は、GitHub Environment `mobile-production`を作り、承認者を設定してから`EAS_TOKEN`をEnvironment Secretに保存します。Secretがない場合に代替値や個人トークンをコードへ入れてはいけません。

## 7. Dependabot

npmとGitHub Actionsを毎週月曜に確認します。minor・patchは本番依存と開発依存に分けてグループ化します。自動マージする場合も通常PRと同じ4検査を必須にし、人間レビュアー追加後は承認1件も必須にします。
