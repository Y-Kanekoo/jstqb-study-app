# サーバー同期完全性契約

## 1. 書き込み境界

学習データのサーバー書き込みは`ingest_learning_sync_events(p_events jsonb)`だけを使用します。`sync_events`、`learning_sessions`、`learning_session_items`、`answer_drafts`、`answer_attempts`、`user_question_states`、`bookmarks`、`question_notes`、`content_issues`へのクライアント直接DMLは禁止します。

追加migration適用前から存在するセッションは、既存attemptの問題版を優先し、未回答問題は適用時点の`current_version_id`を使って`learning_session_items`へバックフィルします。

RPCは認証済みJWTを必須とし、最大100イベントを1トランザクションで処理します。1イベントでも不正なら全件をロールバックします。要求全体は1MiB以下、各イベントは64KiB以下です。イベント直下およびkind別payloadに未定義のキーがある場合は拒否します。

## 2. 共通入力・出力

入力:

```json
[
  {
    "eventId": "UUID",
    "kind": "session.created",
    "entityId": "集約ID",
    "occurredAt": "ISO 8601 UTC",
    "payload": {}
  }
]
```

出力:

```text
sequence, event_id, kind, entity_id, occurred_at, payload
```

出力の`occurred_at`と、`payload`内の採点・版・サーバー日時・revisionを正としてローカルへ反映します。

`entityId`は、セッション系ではsession UUID、回答ではattempt UUID、ブックマーク・メモではquestion ID、ドラフト・復習マークでは`sessionId:questionId`とし、payloadの対象IDとの一致を検証します。

## 3. 冪等性

サーバーは`kind`、`entityId`、`occurredAt`、`payload`の正規化JSONからSHA-256を計算します。

- 同じ利用者・同じ`eventId`・同じhash: 既存のcanonical結果を返す
- 同じ`eventId`・異なるhash: `IDEMPOTENCY_KEY_REUSED`
- 別利用者が使用済みの`eventId`: 情報を開示せず`IDEMPOTENCY_KEY_REUSED`

クライアントは恒久エラー時にOutboxを削除せず、利用者へ復旧操作を提示します。

## 4. イベント契約

### `session.created`

必須payload:

```json
{
  "sessionId": "UUID",
  "mode": "chapter | random | wrong | review | exam",
  "title": "1〜200文字",
  "questionIds": ["question-id"]
}
```

- 問題は重複不可、1〜40問
- 現在の`published`問題版を`learning_session_items`へ固定
- canonical payloadへ`questionVersionIds`、`startedAt`、`createdAt`を追加
- 模試は40問、章配分`8/6/4/11/9/2`、Kレベル配分`8/24/8`をDBで検証
- 模試の`startedAt`はDB時計、`expiresAt = startedAt + 60分`

### `draft.saved`

必須payload:

```json
{
  "sessionId": "UUID",
  "questionId": "question-id",
  "selectedChoiceIds": ["choice-id"],
  "expectedRevision": 0,
  "deviceId": "端末識別子"
}
```

- 初回は`expectedRevision=0`
- 更新は直前にサーバーから受け取ったrevisionを指定
- 不一致は`REVISION_CONFLICT`
- 模試期限後は`SESSION_FROZEN`
- canonical payloadへ`questionVersionId`、新revision、`updatedAt`を追加

### `answer.submitted`

通常演習専用です。模試は`session.submitted`を使用します。

必須payload:

```json
{
  "sessionId": "UUID",
  "questionId": "question-id",
  "questionVersionId": "question-version-id",
  "selectedChoiceIds": ["choice-id"]
}
```

- `entityId`はattempt UUID
- セッション所有者、固定問題版、問題版状態、選択肢所属、必要選択数を検証
- セッション開始後に固定版が`retired`になっても所有者は問題文・選択肢を読めて回答可能、`suspended`、`draft`、`reviewing`は回答不可
- 同じ利用者・セッション・問題に対する有効な確定回答は1件だけ。別attempt IDによる再確定は拒否
- DBの正答キーで完全一致採点
- attempt、誤答・復習状態、セッション進捗を同一トランザクションで更新
- canonical payloadの`isCorrect`と`answeredAt`をローカル値より優先

### `session.submitted`

模試専用です。期限前にDBへ保存済みのdraftだけを採点します。期限後に呼び出した場合も、期限後のdraft変更は受理されないため、終了時点の回答が確定します。

```json
{ "sessionId": "UUID" }
```

サーバーは各回答のcanonical `answer.submitted`イベントを生成してから、`session.submitted`を記録します。固定版が`retired`になった回答は採点対象、`suspended`、`draft`、`reviewing`になった回答は緊急停止扱いでattemptを無効化し、学習状態の更新対象外にします。

### `session.advanced`

```json
{ "sessionId": "UUID", "questionId": "question-id" }
```

`questionId`は「移動先」の問題です。セッション内の問題だけを指定でき、その問題の0始まりordinalを`current_index`とcanonical payloadの`currentIndex`へ保存します。

### `session.review-marked`

```json
{ "sessionId": "UUID", "questionId": "question-id", "marked": true }
```

### `bookmark.changed`

```json
{ "questionId": "question-id", "enabled": true }
```

### `note.saved`

```json
{
  "questionId": "question-id",
  "questionVersionId": "question-version-id",
  "body": "10000文字以内",
  "expectedRevision": 0
}
```

問題と問題版の組み合わせを検証し、revision不一致は`REVISION_CONFLICT`にします。

### `issue.reported`

```json
{
  "issueId": "UUID",
  "questionId": "question-id",
  "questionVersionId": "question-version-id",
  "category": "incorrect_answer | unclear | outdated | typo | other",
  "description": "5〜4000文字"
}
```

存在しない問題版、問題に属さない版は成功扱いにせず拒否します。

## 5. 模試の時間状態

```text
ACTIVE / DB now < expires_at
  ├─ draft.saved: 許可
  └─ session.submitted: 保存済みdraftを採点してCOMPLETED

ACTIVE / DB now >= expires_at
  ├─ draft.saved: SESSION_FROZEN
  └─ session.submitted: 期限までの保存済みdraftを採点してCOMPLETED

COMPLETED
  └─ draft/submit: 拒否
```

端末時計、`occurredAt`、クライアント指定の`expiresAt`は判定に使用しません。

## 6. アカウント削除の再認証

`delete_current_user()`はJWTの`amr`から直近5分以内の`password`認証をDB側で検証します。単なるaccess token refreshは`password`認証時刻を更新しません。

クライアントは削除直前に現在のパスワードで`signInWithPassword`を成功させ、新しいセッションJWTでRPCを呼びます。条件を満たさない場合は`RECENT_REAUTHENTICATION_REQUIRED`です。

## 7. エラー処理

| エラー | 意味 | クライアント動作 |
|---|---|---|
| `AUTH_REQUIRED` | JWTなし | 再ログイン |
| `INVALID_EVENT: ...` | 型、所有者、版、選択肢等が不正 | 恒久失敗として保持・表示 |
| `IDEMPOTENCY_KEY_REUSED` | event IDを異なる内容で再利用 | 新IDへ自動置換せず監査対象 |
| `REVISION_CONFLICT` | draftまたはnote競合 | remoteを取得して競合解決 |
| `SESSION_FROZEN` | 模試期限切れ | 選択を凍結し提出へ進む |
| `RECENT_REAUTHENTICATION_REQUIRED` | 削除前再認証が古い | パスワード再入力 |
