# ADR-004: append-only回答

- 状態: 採用
- 日付: 2026-08-11

## 決定

確定回答は上書きせず、attemptとして追加します。attempt原行はINSERT後UPDATE/DELETE禁止です。無効化・採点訂正は別のappend-only tableへ追記し、`effective_answer_attempts` viewで実効状態を合成します。

## 理由

再送、解き直し、問題訂正の監査可能性を保ち、集計の再現性を確保するためです。
