# ADR-002: Supabase

- 状態: 採用
- 日付: 2026-08-11

## 決定

認証、PostgreSQL、RLS、migrationを一体で扱うためSupabaseを採用します。

## 理由

同一アカウント同期と個人運用の負担低減を両立でき、SQL・RLSをリポジトリで検証できます。

