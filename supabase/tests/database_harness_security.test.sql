begin;

-- このsuiteは現行M0 schemaに実在するtable/functionだけを検査する。
-- M1で追加するneutral NOLOGIN function owner、worker専用role、client/internal RPCは現時点では不存在であり、
-- 存在するものとして成功扱いにはしない。M1 migrationと同じPRでfunction registryとEXECUTE行列を拡張し、
-- neutral owner、search_path、PUBLIC/anon/authenticated/service_role/workerのallow/denyを実roleで追加検証する。
-- request.jwt.claimsはPostgRESTが署名検証済みJWTからDB sessionへ注入する本番互換claim形状を再現する。

select plan(96);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'db-harness-owner@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '2026-08-14T00:00:00Z'::timestamptz,
    '2026-08-14T00:00:00Z'::timestamptz
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'db-harness-other@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '2026-08-14T00:00:00Z'::timestamptz,
    '2026-08-14T00:00:00Z'::timestamptz
  );

insert into public.certifications (id, code, name, active, created_at)
values
  ('20000000-0000-4000-8000-000000000001', 'DB-SECURITY-ACTIVE', '公開資格', true, '2026-08-14T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', 'DB-SECURITY-INACTIVE', '非公開資格', false, '2026-08-14T00:00:00Z');

insert into public.syllabus_versions (id, certification_id, version, status, source_url, created_at)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'db-security-published',
    'published',
    'https://example.invalid/db-security/published',
    '2026-08-14T00:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'db-security-draft',
    'draft',
    'https://example.invalid/db-security/draft',
    '2026-08-14T00:00:00Z'
  );

insert into public.chapters (id, syllabus_version_id, number, title, exam_weight)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 91, '公開章', 10),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 92, '非公開章', 10);

insert into public.learning_objectives (id, chapter_id, code, title, k_level, minimum_question_count)
values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'DB-SEC-PUBLISHED', '公開LO', 1, 0),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'DB-SEC-DRAFT', '非公開LO', 1, 0);

insert into public.questions (id, certification_id, created_at)
values
  ('db-security-published', '20000000-0000-4000-8000-000000000001', '2026-08-14T00:00:00Z'),
  ('db-security-draft', '20000000-0000-4000-8000-000000000001', '2026-08-14T00:00:00Z');

insert into public.question_versions (
  id,
  question_id,
  version_no,
  syllabus_version_id,
  learning_objective_id,
  status,
  selection_type,
  required_choice_count,
  prompt,
  explanation,
  difficulty,
  source_reference,
  content_hash,
  created_at
)
values
  (
    'db-security-published-v1',
    'db-security-published',
    1,
    '30000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'published',
    'single',
    1,
    '公開設問',
    '公開解説',
    1,
    'DB harness',
    'db-security-published-hash',
    '2026-08-14T00:00:00Z'
  ),
  (
    'db-security-draft-v1',
    'db-security-draft',
    1,
    '30000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    'draft',
    'single',
    1,
    '非公開設問',
    '非公開解説',
    1,
    'DB harness',
    'db-security-draft-hash',
    '2026-08-14T00:00:00Z'
  );

update public.questions
   set current_version_id = case id
     when 'db-security-published' then 'db-security-published-v1'
     else 'db-security-draft-v1'
   end
 where id in ('db-security-published', 'db-security-draft');

insert into public.choices (id, question_version_id, label, body, is_correct, explanation, sort_order)
values
  ('db-security-published-choice', 'db-security-published-v1', 'A', '公開選択肢', true, '公開選択肢解説', 0),
  ('db-security-draft-choice', 'db-security-draft-v1', 'A', '非公開選択肢', true, '非公開選択肢解説', 0);

insert into public.content_reviews (
  id,
  question_version_id,
  reviewer_id,
  review_type,
  result,
  comment,
  created_at
)
values (
  '60000000-0000-4000-8000-000000000001',
  'db-security-published-v1',
  '10000000-0000-4000-8000-000000000001',
  'technical',
  'approved',
  'DB harness review',
  '2026-08-14T00:00:00Z'
);

insert into public.learning_sessions (
  id,
  user_id,
  mode,
  title,
  status,
  question_ids,
  current_index,
  answered_question_ids,
  revision,
  started_at,
  updated_at
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'random',
    'owner session',
    'active',
    array['db-security-published'],
    0,
    '{}',
    1,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'random',
    'other session',
    'active',
    array['db-security-published'],
    0,
    '{}',
    1,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  );

insert into public.answer_drafts (
  user_id,
  session_id,
  question_id,
  selected_choice_ids,
  revision,
  device_id,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'db-security-published',
    array['db-security-published-choice'],
    1,
    'owner-device',
    '2026-08-14T00:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000002',
    'db-security-published',
    '{}',
    1,
    'other-device',
    '2026-08-14T00:00:00Z'
  );

insert into public.answer_attempts (
  id,
  user_id,
  session_id,
  question_id,
  question_version_id,
  selected_choice_ids,
  is_correct,
  answered_at,
  received_at
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'db-security-published',
    'db-security-published-v1',
    array['db-security-published-choice'],
    true,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000002',
    'db-security-published',
    'db-security-published-v1',
    '{}',
    false,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  );

insert into public.user_question_states (
  user_id,
  question_id,
  wrong_ever,
  latest_outcome,
  consecutive_correct_after_wrong,
  review_stage,
  first_attempt_at,
  last_attempt_at,
  last_attempt_id
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'db-security-published',
    false,
    'correct',
    0,
    0,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z',
    '80000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'db-security-published',
    true,
    'wrong',
    0,
    0,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z',
    '80000000-0000-4000-8000-000000000002'
  );

insert into public.bookmarks (user_id, question_id, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'db-security-published', '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', 'db-security-published', '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z');

insert into public.content_issues (
  id,
  question_version_id,
  reporter_id,
  category,
  description,
  status,
  created_at,
  updated_at
)
values
  (
    '90000000-0000-4000-8000-000000000001',
    'db-security-published-v1',
    '10000000-0000-4000-8000-000000000001',
    'typo',
    'owner issue',
    'open',
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'db-security-published-v1',
    '10000000-0000-4000-8000-000000000002',
    'unclear',
    'other issue',
    'open',
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  );

insert into public.sync_events (event_id, user_id, kind, entity_id, payload, occurred_at, received_at)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'session.created',
    '70000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'session.created',
    '70000000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    '2026-08-14T00:00:00Z',
    '2026-08-14T00:00:00Z'
  );

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
    select array_agg(
             namespace.nspname || '.' || procedure.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
             order by (
               namespace.nspname || '.' || procedure.proname || '(' ||
               pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
             ) collate "C"
           )
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname in ('public', 'private')
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = procedure.oid
            and dependency.deptype = 'e'
       )
  ),
  array[
    'public.create_profile_for_new_user()',
    'public.reject_published_question_version_mutation()',
    'public.validate_sync_answer()'
  ]::text[],
  '現行application functionをexact registryで被覆する'
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

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
      ) privilege
     where namespace.nspname in ('public', 'private')
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = procedure.oid
            and dependency.deptype = 'e'
       )
       and privilege.grantee = 0
       and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  'application functionをPUBLICから直接実行できない'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname in ('public', 'private')
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = procedure.oid
            and dependency.deptype = 'e'
       )
       and pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ),
  0,
  'application functionをanonから直接実行できない'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname in ('public', 'private')
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = procedure.oid
            and dependency.deptype = 'e'
       )
       and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ),
  0,
  '現行trigger functionをauthenticatedから直接実行できない'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname in ('public', 'private')
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = procedure.oid
            and dependency.deptype = 'e'
       )
       and pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
  ),
  0,
  '現行trigger functionをservice_roleから直接実行できない'
);

select is(
  (
    with function_context as (
      select distinct procedure.proowner as owner_oid, procedure.pronamespace as namespace_oid
       from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname in ('public', 'private')
         and not exists (
           select 1
             from pg_catalog.pg_depend dependency
            where dependency.classid = 'pg_catalog.pg_proc'::regclass
              and dependency.objid = procedure.oid
              and dependency.deptype = 'e'
         )
    )
    select count(*)::integer
      from function_context context
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          (
            select default_acl.defaclacl
              from pg_catalog.pg_default_acl default_acl
             where default_acl.defaclrole = context.owner_oid
               and default_acl.defaclnamespace = context.namespace_oid
               and default_acl.defaclobjtype = 'f'
          ),
          pg_catalog.acldefault('f', context.owner_oid)
        )
      ) privilege
     where privilege.grantee = 0
       and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  'application schemaの将来functionもPUBLIC EXECUTEをdefault拒否する'
);

select is(
  (
    with function_context as (
      select distinct procedure.proowner as owner_oid, procedure.pronamespace as namespace_oid
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname in ('public', 'private')
         and not exists (
           select 1
             from pg_catalog.pg_depend dependency
            where dependency.classid = 'pg_catalog.pg_proc'::regclass
              and dependency.objid = procedure.oid
              and dependency.deptype = 'e'
         )
    )
    select count(*)::integer
      from pg_catalog.pg_default_acl default_acl
      join function_context context
        on context.owner_oid = default_acl.defaclrole
       and context.namespace_oid = default_acl.defaclnamespace
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) privilege
     where default_acl.defaclobjtype = 'f'
       and privilege.grantee = 'anon'::regrole
       and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  '将来functionをanonへdefault grantしない'
);

select is(
  (
    with function_context as (
      select distinct procedure.proowner as owner_oid, procedure.pronamespace as namespace_oid
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname in ('public', 'private')
         and not exists (
           select 1
             from pg_catalog.pg_depend dependency
            where dependency.classid = 'pg_catalog.pg_proc'::regclass
              and dependency.objid = procedure.oid
              and dependency.deptype = 'e'
         )
    )
    select count(*)::integer
      from pg_catalog.pg_default_acl default_acl
      join function_context context
        on context.owner_oid = default_acl.defaclrole
       and context.namespace_oid = default_acl.defaclnamespace
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) privilege
     where default_acl.defaclobjtype = 'f'
       and privilege.grantee = 'authenticated'::regrole
       and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  '将来functionをauthenticatedへdefault grantしない'
);

select is(
  (
    with function_context as (
      select distinct procedure.proowner as owner_oid, procedure.pronamespace as namespace_oid
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname in ('public', 'private')
         and not exists (
           select 1
             from pg_catalog.pg_depend dependency
            where dependency.classid = 'pg_catalog.pg_proc'::regclass
              and dependency.objid = procedure.oid
              and dependency.deptype = 'e'
         )
    )
    select count(*)::integer
      from pg_catalog.pg_default_acl default_acl
      join function_context context
        on context.owner_oid = default_acl.defaclrole
       and context.namespace_oid = default_acl.defaclnamespace
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) privilege
     where default_acl.defaclobjtype = 'f'
       and privilege.grantee = 'service_role'::regrole
       and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  '将来functionをservice_roleへdefault grantしない'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = 'service_role'
       and rolbypassrls
  ),
  'service_roleはserver処理用にRLS bypassを持つ'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_roles
     where rolname in ('anon', 'authenticated')
       and rolbypassrls
  ),
  0,
  'anonとauthenticatedはRLSをbypassしない'
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

-- M0の恒久ACLはbase tableへのruntime role直接アクセスを許可しない。
-- 以下の6件でその境界を先に検査し、その後のGRANTはRLS policy自体を実roleで検査するための
-- transaction内fixtureに限定する。末尾ROLLBACKにより恒久ACLへは反映されない。
select is(
  (
    select count(*)::integer
      from unnest(array[
        'public.certifications', 'public.syllabus_versions', 'public.chapters',
        'public.learning_objectives', 'public.questions', 'public.question_versions',
        'public.choices', 'public.content_reviews', 'public.profiles',
        'public.learning_sessions', 'public.answer_drafts', 'public.answer_attempts',
        'public.user_question_states', 'public.bookmarks', 'public.content_issues',
        'public.sync_events', 'public.question_answer_keys'
      ]) table_name
     where pg_catalog.has_table_privilege('anon', table_name, 'SELECT')
  ),
  0,
  'anonへbase table SELECTを恒久grantしない'
);

select is(
  (
    (
      select count(*)::integer
        from unnest(array[
          'public.certifications', 'public.syllabus_versions', 'public.chapters',
          'public.learning_objectives', 'public.questions', 'public.question_versions',
          'public.choices', 'public.content_reviews', 'public.profiles',
          'public.learning_sessions', 'public.answer_drafts', 'public.answer_attempts',
          'public.user_question_states', 'public.bookmarks', 'public.content_issues',
          'public.sync_events', 'public.question_answer_keys'
        ]) table_name
       where pg_catalog.has_table_privilege('anon', table_name, 'INSERT')
          or pg_catalog.has_table_privilege('anon', table_name, 'UPDATE')
          or pg_catalog.has_table_privilege('anon', table_name, 'DELETE')
          or pg_catalog.has_table_privilege('anon', table_name, 'TRUNCATE')
          or pg_catalog.has_table_privilege('anon', table_name, 'REFERENCES')
          or pg_catalog.has_table_privilege('anon', table_name, 'TRIGGER')
    ) + (
      select count(*)::integer
        from pg_catalog.pg_class sequence
        join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
       where namespace.nspname = 'public'
         and sequence.relkind = 'S'
         and (
           pg_catalog.has_sequence_privilege('anon', sequence.oid, 'USAGE')
           or pg_catalog.has_sequence_privilege('anon', sequence.oid, 'SELECT')
           or pg_catalog.has_sequence_privilege('anon', sequence.oid, 'UPDATE')
         )
    )
  ),
  0,
  'anonへbase table writeを恒久grantしない'
);

select is(
  (
    select count(*)::integer
      from unnest(array[
        'public.certifications', 'public.syllabus_versions', 'public.chapters',
        'public.learning_objectives', 'public.questions', 'public.question_versions',
        'public.choices', 'public.content_reviews', 'public.profiles',
        'public.learning_sessions', 'public.answer_drafts', 'public.answer_attempts',
        'public.user_question_states', 'public.bookmarks', 'public.content_issues',
        'public.sync_events', 'public.question_answer_keys'
      ]) table_name
     where pg_catalog.has_table_privilege('authenticated', table_name, 'SELECT')
  ),
  0,
  'authenticatedへbase table SELECTを恒久grantしない'
);

select is(
  (
    (
      select count(*)::integer
        from unnest(array[
          'public.certifications', 'public.syllabus_versions', 'public.chapters',
          'public.learning_objectives', 'public.questions', 'public.question_versions',
          'public.choices', 'public.content_reviews', 'public.profiles',
          'public.learning_sessions', 'public.answer_drafts', 'public.answer_attempts',
          'public.user_question_states', 'public.bookmarks', 'public.content_issues',
          'public.sync_events', 'public.question_answer_keys'
        ]) table_name
       where pg_catalog.has_table_privilege('authenticated', table_name, 'INSERT')
          or pg_catalog.has_table_privilege('authenticated', table_name, 'UPDATE')
          or pg_catalog.has_table_privilege('authenticated', table_name, 'DELETE')
          or pg_catalog.has_table_privilege('authenticated', table_name, 'TRUNCATE')
          or pg_catalog.has_table_privilege('authenticated', table_name, 'REFERENCES')
          or pg_catalog.has_table_privilege('authenticated', table_name, 'TRIGGER')
    ) + (
      select count(*)::integer
        from pg_catalog.pg_class sequence
        join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
       where namespace.nspname = 'public'
         and sequence.relkind = 'S'
         and (
           pg_catalog.has_sequence_privilege('authenticated', sequence.oid, 'USAGE')
           or pg_catalog.has_sequence_privilege('authenticated', sequence.oid, 'SELECT')
           or pg_catalog.has_sequence_privilege('authenticated', sequence.oid, 'UPDATE')
         )
    )
  ),
  0,
  'authenticatedへbase table writeを恒久grantしない'
);

select is(
  (
    select count(*)::integer
      from unnest(array[
        'public.certifications', 'public.syllabus_versions', 'public.chapters',
        'public.learning_objectives', 'public.questions', 'public.question_versions',
        'public.choices', 'public.content_reviews', 'public.profiles',
        'public.learning_sessions', 'public.answer_drafts', 'public.answer_attempts',
        'public.user_question_states', 'public.bookmarks', 'public.content_issues',
        'public.sync_events', 'public.question_answer_keys'
      ]) table_name
     where pg_catalog.has_table_privilege('service_role', table_name, 'SELECT')
  ),
  0,
  'service_roleへbase table SELECTを恒久grantしない'
);

select is(
  (
    (
      select count(*)::integer
        from unnest(array[
          'public.certifications', 'public.syllabus_versions', 'public.chapters',
          'public.learning_objectives', 'public.questions', 'public.question_versions',
          'public.choices', 'public.content_reviews', 'public.profiles',
          'public.learning_sessions', 'public.answer_drafts', 'public.answer_attempts',
          'public.user_question_states', 'public.bookmarks', 'public.content_issues',
          'public.sync_events', 'public.question_answer_keys'
        ]) table_name
       where pg_catalog.has_table_privilege('service_role', table_name, 'INSERT')
          or pg_catalog.has_table_privilege('service_role', table_name, 'UPDATE')
          or pg_catalog.has_table_privilege('service_role', table_name, 'DELETE')
          or pg_catalog.has_table_privilege('service_role', table_name, 'TRUNCATE')
          or pg_catalog.has_table_privilege('service_role', table_name, 'REFERENCES')
          or pg_catalog.has_table_privilege('service_role', table_name, 'TRIGGER')
    ) + (
      select count(*)::integer
        from pg_catalog.pg_class sequence
        join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
       where namespace.nspname = 'public'
         and sequence.relkind = 'S'
         and (
           pg_catalog.has_sequence_privilege('service_role', sequence.oid, 'USAGE')
           or pg_catalog.has_sequence_privilege('service_role', sequence.oid, 'SELECT')
           or pg_catalog.has_sequence_privilege('service_role', sequence.oid, 'UPDATE')
         )
    )
  ),
  0,
  'service_roleへbase table writeを恒久grantしない'
);

grant select on
  public.certifications,
  public.syllabus_versions,
  public.chapters,
  public.learning_objectives,
  public.questions,
  public.question_versions,
  public.choices,
  public.content_reviews,
  public.profiles,
  public.learning_sessions,
  public.answer_drafts,
  public.answer_attempts,
  public.user_question_states,
  public.bookmarks,
  public.content_issues,
  public.sync_events,
  public.question_answer_keys
to anon, authenticated, service_role;
grant insert on public.learning_sessions to anon;
grant insert, update on
  public.profiles,
  public.learning_sessions,
  public.answer_drafts,
  public.answer_attempts,
  public.user_question_states,
  public.bookmarks,
  public.content_issues,
  public.sync_events
to authenticated;
grant insert on public.learning_sessions to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon","aud":"authenticated"}', true);
set local role anon;

select is((select count(*)::integer from public.certifications where id = '20000000-0000-4000-8000-000000000001'), 1, 'anonはactive certificationを読める');
select is((select count(*)::integer from public.certifications where id = '20000000-0000-4000-8000-000000000002'), 0, 'anonはinactive certificationを読めない');
select is((select count(*)::integer from public.syllabus_versions where id = '30000000-0000-4000-8000-000000000001'), 1, 'anonはpublished syllabusを読める');
select is((select count(*)::integer from public.syllabus_versions where id = '30000000-0000-4000-8000-000000000002'), 0, 'anonはdraft syllabusを読めない');
select is((select count(*)::integer from public.chapters where id = '40000000-0000-4000-8000-000000000001'), 1, 'anonはpublished chapterを読める');
select is((select count(*)::integer from public.chapters where id = '40000000-0000-4000-8000-000000000002'), 0, 'anonはdraft chapterを読めない');
select is((select count(*)::integer from public.learning_objectives where id = '50000000-0000-4000-8000-000000000001'), 1, 'anonはpublished learning objectiveを読める');
select is((select count(*)::integer from public.learning_objectives where id = '50000000-0000-4000-8000-000000000002'), 0, 'anonはdraft learning objectiveを読めない');
select is((select count(*)::integer from public.questions where id = 'db-security-published'), 1, 'anonはpublished questionを読める');
select is((select count(*)::integer from public.questions where id = 'db-security-draft'), 0, 'anonはdraft questionを読めない');
select is((select count(*)::integer from public.question_versions where id = 'db-security-published-v1'), 1, 'anonはpublished question versionを読める');
select is((select count(*)::integer from public.question_versions where id = 'db-security-draft-v1'), 0, 'anonはdraft question versionを読めない');
select is((select count(*)::integer from public.choices where id = 'db-security-published-choice'), 1, 'anonはpublished choiceを読める');
select is((select count(*)::integer from public.choices where id = 'db-security-draft-choice'), 0, 'anonはdraft choiceを読めない');
select is((select count(*)::integer from public.profiles), 0, 'anonはprofileを読めない');
select is((select count(*)::integer from public.learning_sessions), 0, 'anonはsessionを読めない');
select is((select count(*)::integer from public.answer_drafts), 0, 'anonはdraft answerを読めない');
select is((select count(*)::integer from public.answer_attempts), 0, 'anonはanswer attemptを読めない');
select is((select count(*)::integer from public.user_question_states), 0, 'anonはquestion stateを読めない');
select is((select count(*)::integer from public.bookmarks), 0, 'anonはbookmarkを読めない');
select is((select count(*)::integer from public.content_issues), 0, 'anonはcontent issueを読めない');
select is((select count(*)::integer from public.sync_events), 0, 'anonはsync eventを読めない');
select is((select count(*)::integer from public.question_answer_keys), 0, 'anonは正答keyを読めない');
select is((select count(*)::integer from public.content_reviews), 0, 'anonはreview内部情報を読めない');

select throws_ok(
  $$
    insert into public.learning_sessions (
      id, user_id, mode, title, status, question_ids, current_index,
      answered_question_ids, revision, started_at, updated_at
    ) values (
      '70000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000001',
      'random', 'anon forbidden', 'active', '{}', 0, '{}', 1,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "learning_sessions"',
  'anonはsessionを作成できない'
);

reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aud":"authenticated","exp":2000000000}',
  true
);
set local role authenticated;

select is((select count(*)::integer from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のprofileを読める');
select is((select count(*)::integer from public.profiles where id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのprofileを読めない');
select is((select count(*)::integer from public.learning_sessions where id = '70000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のsessionを読める');
select is((select count(*)::integer from public.learning_sessions where id = '70000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのsessionを読めない');
select is((select count(*)::integer from public.answer_drafts where user_id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のdraftを読める');
select is((select count(*)::integer from public.answer_drafts where user_id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのdraftを読めない');
select is((select count(*)::integer from public.answer_attempts where user_id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のattemptを読める');
select is((select count(*)::integer from public.answer_attempts where user_id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのattemptを読めない');
select is((select count(*)::integer from public.user_question_states where user_id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のstateを読める');
select is((select count(*)::integer from public.user_question_states where user_id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのstateを読めない');
select is((select count(*)::integer from public.bookmarks where user_id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のbookmarkを読める');
select is((select count(*)::integer from public.bookmarks where user_id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのbookmarkを読めない');
select is((select count(*)::integer from public.content_issues where reporter_id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のissueを読める');
select is((select count(*)::integer from public.content_issues where reporter_id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのissueを読めない');
select is((select count(*)::integer from public.sync_events where user_id = '10000000-0000-4000-8000-000000000001'), 1, 'owner JWTは自分のsync eventを読める');
select is((select count(*)::integer from public.sync_events where user_id = '10000000-0000-4000-8000-000000000002'), 0, 'owner JWTは別userのsync eventを読めない');
select is((select count(*)::integer from public.question_answer_keys), 0, 'owner JWTは正答keyを読めない');
select is((select count(*)::integer from public.content_reviews), 0, 'owner JWTはreview内部情報を読めない');
select is((select count(*)::integer from public.question_versions where id = 'db-security-published-v1'), 1, 'authenticatedはpublished question versionを読める');
select is((select count(*)::integer from public.question_versions where id = 'db-security-draft-v1'), 0, 'authenticatedはdraft question versionを読めない');

select lives_ok(
  $$update public.profiles set timezone = 'Asia/Tokyo' where id = '10000000-0000-4000-8000-000000000001'$$,
  'owner JWTは自分のprofileを更新できる'
);

select is(
  (select timezone from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'Asia/Tokyo',
  'owner JWTによる自分のprofile更新を実値で確認する'
);

select lives_ok(
  $$update public.profiles set timezone = 'Asia/Tokyo' where id = '10000000-0000-4000-8000-000000000002'$$,
  'owner JWTは別userのprofileを更新できない'
);

select is(
  (select timezone from public.profiles where id = '10000000-0000-4000-8000-000000000002'),
  null,
  '別userのprofileは更新されていない'
);

select throws_ok(
  $$update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  'new row violates row-level security policy for table "profiles"',
  'owner JWTでもroleを昇格できない'
);

select lives_ok(
  $$
    insert into public.learning_sessions (
      id, user_id, mode, title, status, question_ids, current_index,
      answered_question_ids, revision, started_at, updated_at
    ) values (
      '70000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000001',
      'random', 'owner inserted', 'active', '{}', 0, '{}', 1,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  'owner JWTは自分のsessionを作成できる'
);

select throws_ok(
  $$
    insert into public.learning_sessions (
      id, user_id, mode, title, status, question_ids, current_index,
      answered_question_ids, revision, started_at, updated_at
    ) values (
      '70000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000002',
      'random', 'other forbidden', 'active', '{}', 0, '{}', 1,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "learning_sessions"',
  'owner JWTは別userのsessionを作成できない'
);

select lives_ok(
  $$
    insert into public.answer_drafts (
      user_id, session_id, question_id, selected_choice_ids, revision, device_id, updated_at
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      'db-security-owner-new-draft', '{}', 1, 'owner-device', '2026-08-14T00:00:00Z'
    )
  $$,
  'owner JWTは自分のdraftを作成できる'
);

select throws_ok(
  $$
    insert into public.answer_drafts (
      user_id, session_id, question_id, selected_choice_ids, revision, device_id, updated_at
    ) values (
      '10000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000002',
      'db-security-other-forbidden-draft', '{}', 1, 'owner-device', '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "answer_drafts"',
  'owner JWTは別userのdraftを作成できない'
);

select lives_ok(
  $$
    insert into public.answer_attempts (
      id, user_id, session_id, question_id, question_version_id,
      selected_choice_ids, is_correct, answered_at, received_at
    ) values (
      '80000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      'db-security-published', 'db-security-published-v1', '{}', false,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  'owner JWTは自分のattemptを作成できる'
);

select throws_ok(
  $$
    insert into public.answer_attempts (
      id, user_id, session_id, question_id, question_version_id,
      selected_choice_ids, is_correct, answered_at, received_at
    ) values (
      '80000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000002',
      'db-security-published', 'db-security-published-v1', '{}', false,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "answer_attempts"',
  'owner JWTは別userのattemptを作成できない'
);

select lives_ok(
  $$
    insert into public.user_question_states (
      user_id, question_id, wrong_ever, latest_outcome, consecutive_correct_after_wrong,
      review_stage, first_attempt_at, last_attempt_at, last_attempt_id
    ) values (
      '10000000-0000-4000-8000-000000000001', 'db-security-owner-new-state', false,
      'correct', 0, 0, '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z',
      '80000000-0000-4000-8000-000000000011'
    )
  $$,
  'owner JWTは自分のstateを作成できる'
);

select throws_ok(
  $$
    insert into public.user_question_states (
      user_id, question_id, wrong_ever, latest_outcome, consecutive_correct_after_wrong,
      review_stage, first_attempt_at, last_attempt_at, last_attempt_id
    ) values (
      '10000000-0000-4000-8000-000000000002', 'db-security-other-forbidden-state', false,
      'correct', 0, 0, '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z',
      '80000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "user_question_states"',
  'owner JWTは別userのstateを作成できない'
);

select lives_ok(
  $$
    insert into public.bookmarks (user_id, question_id, created_at, updated_at)
    values (
      '10000000-0000-4000-8000-000000000001',
      'db-security-owner-new-bookmark',
      '2026-08-14T00:00:00Z',
      '2026-08-14T00:00:00Z'
    )
  $$,
  'owner JWTは自分のbookmarkを作成できる'
);

select throws_ok(
  $$
    insert into public.bookmarks (user_id, question_id, created_at, updated_at)
    values (
      '10000000-0000-4000-8000-000000000002',
      'db-security-other-forbidden-bookmark',
      '2026-08-14T00:00:00Z',
      '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "bookmarks"',
  'owner JWTは別userのbookmarkを作成できない'
);

select lives_ok(
  $$
    insert into public.content_issues (
      id, question_version_id, reporter_id, category, description, status, created_at, updated_at
    ) values (
      '90000000-0000-4000-8000-000000000011', 'db-security-published-v1',
      '10000000-0000-4000-8000-000000000001', 'other', 'owner inserted issue', 'open',
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  'owner JWTは自分のissueを作成できる'
);

select throws_ok(
  $$
    insert into public.content_issues (
      id, question_version_id, reporter_id, category, description, status, created_at, updated_at
    ) values (
      '90000000-0000-4000-8000-000000000012', 'db-security-published-v1',
      '10000000-0000-4000-8000-000000000002', 'other', 'other forbidden issue', 'open',
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "content_issues"',
  'owner JWTは別userのissueを作成できない'
);

select lives_ok(
  $$
    insert into public.sync_events (event_id, user_id, kind, entity_id, payload, occurred_at, received_at)
    values (
      'a0000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000001',
      'session.created', 'owner-event', '{}'::jsonb,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  'owner JWTは自分のsync eventを作成できる'
);

select throws_ok(
  $$
    insert into public.sync_events (event_id, user_id, kind, entity_id, payload, occurred_at, received_at)
    values (
      'a0000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000002',
      'session.created', 'other-forbidden-event', '{}'::jsonb,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "sync_events"',
  'owner JWTは別userのsync eventを作成できない'
);

reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aud":"authenticated","exp":2000000000}',
  true
);
set local role authenticated;

select is((select count(*)::integer from public.profiles where id = '10000000-0000-4000-8000-000000000002'), 1, '別user JWTは自分のprofileを読める');
select is((select count(*)::integer from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 0, '別user JWTはownerのprofileを読めない');
select is((select count(*)::integer from public.learning_sessions where id = '70000000-0000-4000-8000-000000000002'), 1, '別user JWTは自分のsessionを読める');
select is((select count(*)::integer from public.learning_sessions where id = '70000000-0000-4000-8000-000000000001'), 0, '別user JWTはownerのsessionを読めない');

reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role","aud":"authenticated","exp":2000000000}', true);
set local role service_role;

select is((select count(*)::integer from public.profiles where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 2, 'service_roleは両userのprofileを読める');
select is((select count(*)::integer from public.learning_sessions where id in ('70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002')), 2, 'service_roleは両userのsessionを読める');
select is((select count(*)::integer from public.question_answer_keys where question_version_id = 'fl-001-v1'), 1, 'service_roleはserver用正答keyを読める');
select is((select count(*)::integer from public.content_reviews where id = '60000000-0000-4000-8000-000000000001'), 1, 'service_roleはreview内部情報を読める');
select is((select count(*)::integer from public.certifications where id = '20000000-0000-4000-8000-000000000002'), 1, 'service_roleはinactive certificationを読める');
select is((select count(*)::integer from public.question_versions where id = 'db-security-draft-v1'), 1, 'service_roleはdraft question versionを読める');
select lives_ok(
  $$
    insert into public.learning_sessions (
      id, user_id, mode, title, status, question_ids, current_index,
      answered_question_ids, revision, started_at, updated_at
    ) values (
      '70000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000001',
      'random', 'service inserted', 'active', '{}', 0, '{}', 1,
      '2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z'
    )
  $$,
  'service_roleはserver処理としてsessionを作成できる'
);

reset role;

select * from finish();
rollback;
