# JSTQB Study App

JSTQB Foundation LevelをiOS、Android、Webで学習するための個人向けアプリです。

## 方針

- 初回から本人が本番利用できる品質を目指す
- 選択操作ごと、1問確定ごとに自動保存する
- 同一アカウントで端末をまたいで再開できる
- 未克服、直近誤答、期間内誤答、全誤答、克服済みから復習できる
- 公開済み・独立・レビュー済みの独自問題500題を用意する
- JSTQB、ISTQB、既存学習アプリの非公式・非公認アプリとして開発する

## 実装済み

- Expo RouterによるiOS / Android / Web共通UI
- ネイティブSQLite、Web IndexedDBへの選択・回答・再開位置の即時保存
- 複数の中断セッション保持と1問単位の回答確定
- 未克服、直近、7/30/90日、全履歴、克服済みの誤答演習
- 別セッション2回連続正解による克服判定と間隔反復日計算
- メール認証、SecureStore、RLS、冪等Outboxによる端末間同期基盤
- 学習記録、章別進捗、ブックマーク、レスポンシブUI
- Supabase migrationとサーバー側再採点

公開リポジトリには開発用の独自サンプル18問を含めます。本番500問は人による技術・表記レビューと本人承認を経て、非公開の問題DBへ投入します。

## ローカル起動

```bash
pnpm install
pnpm web
```

同期を使う場合は`.env.example`を参考に、SupabaseのProject URLとPublishable keyをローカル`.env`へ設定します。Service role keyはクライアントへ設定しません。

```bash
pnpm check
```

詳細は[設計書一覧](docs/README.md)と[Supabaseセットアップ](supabase/README.md)を参照してください。

## ライセンス

ソースコードはMIT Licenseです。本番問題データは公開リポジトリへ含めず、別の利用条件で管理します。
