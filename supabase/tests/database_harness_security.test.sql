begin;

select plan(9);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname in ('public', 'private')
       and relation.relkind in ('r', 'p')
       and not relation.relrowsecurity
  ),
  0,
  'application tableはすべてRLSを有効にする'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname in ('public', 'private')
       and procedure.prosecdef
       and not coalesce(procedure.proconfig, '{}'::text[]) @> array['search_path=""']::text[]
  ),
  0,
  'SECURITY DEFINERは空search_pathを明示する'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      join pg_catalog.pg_roles owner_role on owner_role.oid = procedure.proowner
     where namespace.nspname in ('public', 'private')
       and procedure.prosecdef
       and owner_role.rolname in ('anon', 'authenticated', 'service_role')
  ),
  0,
  'SECURITY DEFINERをruntime roleが所有しない'
);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_proc procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
      ) privilege
     where procedure.oid = 'public.validate_sync_answer()'::regprocedure
       and privilege.grantee = 0
       and privilege.privilege_type = 'EXECUTE'
  ),
  '採点trigger関数をPUBLICから直接実行できない'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_default_acl default_acl
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) privilege
      join pg_catalog.pg_roles grantee_role on grantee_role.oid = privilege.grantee
     where grantee_role.rolname in ('anon', 'authenticated', 'service_role')
       and privilege.is_grantable
  ),
  0,
  'runtime roleへgrant option付きdefault privilegeを与えない'
);

select ok(
  pg_catalog.has_schema_privilege('anon', 'public', 'USAGE'),
  'anonはRLS配下の公開schemaを利用できる'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'question_answer_keys'
  ),
  0,
  '正答key tableへlearner向けpolicyを作成しない'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = 'service_role'
       and rolbypassrls
  ),
  'service_roleだけはserver処理用にRLS bypassを持つ'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_roles
     where rolname in ('anon', 'authenticated')
       and rolbypassrls
  ),
  0,
  'learner runtime roleはRLSをbypassしない'
);

select * from finish();
rollback;
