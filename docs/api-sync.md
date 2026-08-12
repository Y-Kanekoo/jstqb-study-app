# API・同期設計

## 1. API

| 処理 | 入力 | 出力・保証 |
|---|---|---|
| `bootstrap` | シラバス版、同期cursor | プロフィール、公開問題差分、学習差分 |
| `create_learning_session` | mode、条件、問数、event ID | 固定済みセッション |
| `save_answer_draft` | item、選択、expected revision | 新revisionまたは競合 |
| `submit_answer` | event ID、item、選択、回答時刻 | 冪等attempt、採点、誤答・復習状態 |
| `advance_session` | session、index、expected revision | 新位置または競合 |
| `finish_session` | session、event ID | 結果、章別集計 |
| `toggle_bookmark` | question、desired state | 最終状態 |
| `save_note` | question、body、expected revision | 新revisionまたは競合 |
| `report_content_issue` | 問題版、分類、説明 | 報告ID |
| `export_user_data` | format | 有効期限付きデータ |
| `delete_account` | 再認証済み要求 | 個人データ削除 |

## 2. 回答確定の原子処理

1. JWTから利用者を確定します。
2. `event_id`が既存なら既存結果を返します。
3. セッション所有者、問題版、期限、停止状態を検証します。
4. 選択集合を正規化し、DB上の正答と比較します。
5. attemptをappendします。
6. 誤答・克服・復習段階を更新します。
7. 日次活動とセッション進捗を更新します。
8. すべてを1トランザクションでcommitします。

## 3. ローカル保存

| 契機 | 端末 | サーバー |
|---|---|---|
| セッション開始 | 問題版・順番・選択肢順を保存 | セッション作成 |
| 選択変更 | 即時保存 | 500msデバウンス同期 |
| 回答確定 | attemptとoutboxを同一transaction保存 | 即時同期 |
| 次問表示 | 現在位置とscrollを保存 | 位置同期 |
| ブックマーク | 即時保存 | 非同期同期 |
| メモ | 即時保存 | 500msデバウンス同期 |

端末保存に失敗した場合は次問へ進ませません。

## 4. 同期状態

```text
SYNCED
  └─ローカル変更→ DIRTY_LOCAL
                    └─outbox追加→ QUEUED
                                  └─送信→ SYNCING
                                           ├─成功→ SYNCED
                                           ├─通信失敗→ QUEUED
                                           ├─認証切れ→ AUTH_REQUIRED
                                           └─版競合→ CONFLICT
```

## 5. Outbox

- 変更とoutboxイベントを同一端末DBトランザクションで作成します。
- 全イベントへUUIDの`event_id`を付けます。
- サーバーは`event_id`を一意制約とし、再送を成功扱いにします。
- 同一entity内の送信順を維持します。
- 一時失敗は指数バックオフとジッターで再送します。
- 恒久エラーは無限再送せず、原因と復旧操作を表示します。
- 未送信中のログアウトは同期または明示破棄を選択させます。

## 6. 競合

- 確定回答は別attemptとして保持します。
- ブックマークはlast-write-winsです。
- メモとドラフトは`revision`による楽観ロックです。
- 同一問題の未確定回答が衝突した場合だけ利用者へ選択を求めます。
- 端末名、更新日時、選択内容を表示し、採用されなかった内容も監査用に保持します。

## 7. client/server payload同期契約

server integrity migration 002（PR #7）のRPCは、request payloadを検証・正規化したcanonical payloadを返します。
clientはrequestに存在するfieldの値がcanonicalで変更されていないことを確認し、server-owned fieldだけを受け入れます。
旧shapeのeventはDB upgradeでcanonical化されたeventを受信する前提です。旧shapeをclientで補完して適用せず、
`LEGACY_EVENT`として保持・表示します。

| kind | client-owned request field（identity比較） | server-owned canonical field |
|---|---|---|
| `session.created` | `sessionId`, `mode`, `title`, `questionIds` | `questionVersionIds`, `createdAt`, `startedAt`, `durationMinutes`, `expiresAt` |
| `draft.saved` | `sessionId`, `questionId`, `selectedChoiceIds`, `expectedRevision`, `deviceId` | `questionVersionId`, `revision`, `updatedAt` |
| `answer.submitted` | `sessionId`, `questionId`, `questionVersionId`, `selectedChoiceIds` | `isCorrect`, `answeredAt`, `invalidated` |
| `session.advanced` | `sessionId`, `questionId` | `currentIndex` |
| `session.submitted` | `sessionId` | `submittedAt`, `answeredQuestionIds`, `expired` |
| `session.review-marked` | `sessionId`, `questionId`, `marked` | `updatedAt` |
| `bookmark.changed` | `questionId`, `enabled` | `updatedAt` |
| `note.saved` | `questionId`, `questionVersionId`, `body`, `expectedRevision` | `revision`, `updatedAt` |
| `issue.reported` | `issueId`, `questionId`, `questionVersionId`, `category`, `description` | `createdAt` |

`draft.saved`の`questionVersionId`、`session.review-marked`/`bookmark.changed`の`updatedAt`などは、
requestには無くcanonicalでserverが追加します。`questionIds`と`questionVersionIds`は同数・非空・一意、
選択肢IDは一意、`entityId`は各payloadの対象IDと一致しなければなりません。回答の`entityId`はattempt UUIDです。

1件でもparse、identity、semantic検証に失敗したbatchは、cursorを進めず、local applyとoutbox ack削除を行いません。
DB-first統合が完了するまでは、clientはserver migration 002のcanonical responseを前提に契約検証だけを保持します。
bundle answer除去とF-08 feedbackはこの契約同期の範囲外です。
