# データモデル

すべての日時はPostgreSQLで`TIMESTAMPTZ`、端末でISO 8601 UTCとして保持します。IDは原則UUIDです。

## 1. コンテンツ

| テーブル | 主なカラム・制約 |
|---|---|
| `certifications` | `id`, `code UNIQUE`, `name`, `active` |
| `syllabus_versions` | `id`, `certification_id`, `version`, `status`, `source_url`, UNIQUE(certification_id, version) |
| `chapters` | `id`, `syllabus_version_id`, `number`, `title`, `exam_weight`, UNIQUE(syllabus_version_id, number) |
| `learning_objectives` | `id`, `chapter_id`, `code`, `title`, `k_level`, `minimum_question_count` |
| `questions` | `id`, `certification_id`, `current_version_id`, `created_at`, `retired_at` |
| `question_versions` | `id`, `question_id`, `version_no`, `syllabus_version_id`, `learning_objective_id`, `status`, `selection_type`, `required_choice_count`, `prompt`, `explanation`, `difficulty`, `source_reference`, `content_hash`, `created_by`, `reviewed_by`, `published_at` |
| `choices` | `id`, `question_version_id`, `label`, `body`, `is_correct`, `explanation`, `sort_order` |
| `content_reviews` | `id`, `question_version_id`, `reviewer_id`, `review_type`, `result`, `comment` |
| `content_issues` | `id`, `question_version_id`, `reporter_id`, `category`, `description`, `status`, `resolution` |
| `content_audit_logs` | `id`, `actor_id`, `entity_type`, `entity_id`, `action`, `before_json`, `after_json` |

公開後の問題版と選択肢は更新禁止です。訂正は新しい問題版として作成します。

## 2. 学習データ

| テーブル | 主なカラム・制約 |
|---|---|
| `profiles` | `id PK/FK auth.users`, `timezone`, `role`, `settings_json` |
| `devices` | `id`, `user_id`, `name`, `platform`, `last_seen_at` |
| `learning_sessions` | `id`, `user_id`, `mode`, `status`, `config_json`, `current_index`, `revision`, `started_at`, `expires_at`, `completed_at` |
| `session_items` | `id`, `session_id`, `ordinal`, `question_version_id`, `choice_order`, `status`, `invalidated_reason`, UNIQUE(session_id, ordinal), UNIQUE(session_id, question_version_id) |
| `answer_drafts` | `id`, `user_id`, `session_item_id`, `selected_choice_ids`, `scroll_offset`, `revision`, `device_id`, UNIQUE(user_id, session_item_id) |
| `answer_attempts` | `id/event_id`, `user_id`, `session_id`, `session_item_id`, `question_id`, `question_version_id`, `selected_choice_ids`, `is_correct`, `response_ms`, `answered_at`, `received_at`, `invalidated_at`, `invalidation_reason` |
| `user_question_states` | `user_id`, `question_id`, `wrong_ever`, `latest_outcome`, `consecutive_correct_after_wrong`, `recovered_at`, `review_stage`, `next_review_at`, `first_attempt_at`, `last_attempt_at`, `last_attempt_id`, PRIMARY KEY(user_id, question_id) |
| `bookmarks` | `user_id`, `question_id`, `created_at`, `updated_at`, PRIMARY KEY(user_id, question_id) |
| `question_notes` | `user_id`, `question_id`, `question_version_id`, `body`, `revision`, PRIMARY KEY(user_id, question_id) |
| `daily_activities` | `user_id`, `local_date`, `attempt_count`, `study_seconds`, PRIMARY KEY(user_id, local_date) |
| `sync_conflicts` | `id`, `user_id`, `entity_type`, `entity_id`, `local_json`, `remote_json`, `resolved_json`, `status` |
| `data_export_requests` | `id`, `user_id`, `status`, `expires_at` |

`answer_attempts`はappend-onlyです。削除・更新の代わりに`invalidated_at`と理由で採点対象外にします。

## 3. 端末専用

| テーブル | 用途 |
|---|---|
| `local_sessions` | 再開用セッション |
| `local_session_items` | 問題版・順番・選択肢順 |
| `local_drafts` | 未確定回答 |
| `local_attempts` | 確定回答 |
| `local_question_states` | 誤答・復習状態 |
| `content_cache` | 問題版・解説キャッシュ |
| `outbox_events` | 未送信イベント |
| `sync_cursors` | 差分取得位置 |
| `local_conflicts` | 未解決競合 |

## 4. RLS

| データ | 利用者 | 管理者 |
|---|---|---|
| 公開問題 | `published`を参照 | 全状態を管理 |
| セッション・回答 | 自分のみ参照・作成 | 原則参照しない |
| ブックマーク・メモ | 自分のみ | 参照不可 |
| 問題報告 | 自分の報告を参照・作成 | 処理可能 |
| 監査ログ | 不可 | 参照可能 |

公開schemaの全テーブルでRLSを有効にし、migrationテストで越権拒否を検証します。

