begin;

select plan(6);

select has_table(
  'public',
  'profiles',
  '初期migrationでprofiles表を作成する'
);

select has_table(
  'public',
  'question_versions',
  '初期migrationでquestion_versions表を作成する'
);

select has_function(
  'public',
  'validate_sync_answer',
  array[]::text[],
  '回答再採点関数を作成する'
);

select ok(
  (
    select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'profiles'
  ),
  'profiles表でRLSを有効にする'
);

select ok(
  (
    select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'sync_events'
  ),
  'sync_events表でRLSを有効にする'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'profiles'
  ),
  2,
  'profiles表へ本人用RLS policyを2件作成する'
);

select * from finish();
rollback;
