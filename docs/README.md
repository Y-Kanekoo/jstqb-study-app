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
15. [詳細設計 v2](detailed-design-v2.md)
16. [脅威モデル v2](threat-model-v2.md)
17. [受入証跡マトリクス v2](acceptance-evidence-v2.md)
18. [API・DTO契約 v2](api-contract-v2.md)
19. [UI・学習・問題コンテンツ契約 v2](ui-learning-content-contract-v2.md)
20. [JSTQB FL 500問 コンテンツblueprint v1](content-blueprint-v1.md)

## 設計原則

- 端末保存をサーバー応答より先に完了する。
- 確定回答は上書きせず、append-onlyのattemptとして記録する。
- 問題公開後の内容は上書きせず、新しい版を作る。
- 公開GitHubと本番問題データ・秘密情報を分離する。
- 個人利用でも試作品扱いにせず、本番データの復旧性を確保する。
- 初期運用は本人限定personal previewとし、一般公開の責務分離gateを満たすまで問題を一般利用者へ公開しない。
- 問題数より品質を優先し、exact 500問のcurrent version全件についてAI多段reviewと本人passを要求する。
- スマホとWebは同一情報設計を共有し、端末特性に応じてnavigationとpane構成を適応させる。

## 規範文書

| 文書 | 狭い正本範囲 |
|---|---|
| [詳細設計 v2](detailed-design-v2.md) | workflow、状態機械、受入条件、migration/PR依存順 |
| [API・DTO契約 v2](api-contract-v2.md) | wire DTO、RPC signature、error、canonical/hash preimage |
| [コンテンツblueprint v1](content-blueprint-v1.md) | 問題・review・manifestのcontent schema、配分、content hash |

文書間で矛盾した場合は、対象field/境界に対して最も狭いauthorityを持つ文書を優先します。API契約はworkflowやPR順を上書きせず、詳細設計はwire field/hashを再定義せず、blueprint生成schema/hashは手書きAPI説明より優先します。どの範囲か判定不能ならfail closedで設計レビューへ戻します。独立レビューでBlocking/High 0になるまでは本番実装・問題公開を開始しません。
