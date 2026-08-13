-- application trigger関数はtable trigger経由だけで実行し、runtime roleからの直接実行を許可しない。
revoke execute on function public.create_profile_for_new_user()
  from public, anon, authenticated, service_role;
revoke execute on function public.reject_published_question_version_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_sync_answer()
  from public, anon, authenticated, service_role;

-- Supabase基盤の既定ACLにはruntime role向けのTRUNCATE・REFERENCES・TRIGGERと
-- sequence権限が含まれる。base tableへはRPC/function owner経由だけで到達させるため、
-- 現在のapplication objectと将来postgres ownerが作るobjectの両方から撤回する。
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated, service_role;
revoke usage, select, update on all sequences in schema public
  from anon, authenticated, service_role;

-- 後続migrationが作る関数も、明示grantするRPC以外は既定で非公開にする。
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;
