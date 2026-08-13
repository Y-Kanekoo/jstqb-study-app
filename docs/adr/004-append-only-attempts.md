# ADR-004: append-only回答

- 状態: 採用
- 日付: 2026-08-11

## 決定

確定回答は上書きせず、attemptとして追加します。attempt原行はINSERT後UPDATE/DELETE禁止です。無効化・採点訂正は別のappend-only tableへ追記し、`effective_answer_attempts` viewで実効状態を合成します。

初期legacy schemaに存在する`invalidated_at`、`invalidated_reason`等のbase attempt無効化列は、加算migrationのupgrade preflightで全既存値を検査し、各値をimmutable append-only invalidation factへ一対一移行します。orphan、矛盾、同一attempt複数実効無効化、変換不能値が一件でもあればmigration全体をrollbackします。初期migrationは変更しません。

M1適用後はbase attemptのUPDATE/DELETEをtriggerとACLの双方で拒否し、legacy列を実効判定に読みません。採点・履歴・projection・bootstrap・同期は`effective_answer_attempts` viewだけを正本とし、base attempt＋append-only correction/invalidation factから決定的に合成します。追加migrationのpgTAPはfreshとorigin/main-shaped upgradeの両方で、件数/hash/時刻/reason移行、base UPDATE/DELETE拒否、view同値、異常preflight時のschema/data/migration履歴完全rollbackを検証します。

## 理由

再送、解き直し、問題訂正の監査可能性を保ち、集計の再現性を確保するためです。
