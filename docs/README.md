# 設計書一覧

本ディレクトリの設計書を実装基準とします。

1. [要件定義](requirements.md)
2. [学習機能設計](learning-design.md)
3. [アーキテクチャ](architecture.md)
4. [データモデル](data-model.md)
5. [API・同期](api-sync.md)
6. [UI/UX](ux-design.md)
7. [問題コンテンツ方針](content-policy.md)
8. [テスト計画](test-plan.md)
9. [運用設計](operations.md)
10. [実装状況](implementation-status.md)
11. [リリース手順](release-runbook.md)
12. [実機受入チェックリスト](device-acceptance-checklist.md)
13. [セキュリティ例外](security-exceptions.md)
14. [ADR](adr/README.md)

## 設計原則

- 端末保存をサーバー応答より先に完了する。
- 確定回答は上書きせず、append-onlyのattemptとして記録する。
- 問題公開後の内容は上書きせず、新しい版を作る。
- 公開GitHubと本番問題データ・秘密情報を分離する。
- 個人利用でも試作品扱いにせず、本番データの復旧性を確保する。
