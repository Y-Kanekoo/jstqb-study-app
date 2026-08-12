do $$
declare
  expected_migrations text[] := array[
    '202608110001',
    '20260812000100',
    '20260812000150',
    '202608120002',
    '202608120003',
    '202608120004'
  ];
  actual_migrations text[];
  item_count integer;
  complete_item_count integer;
  ordinal_count integer;
begin
  select array_agg(version order by version)
  into actual_migrations
  from supabase_migrations.schema_migrations
  where version = any(expected_migrations);
  if actual_migrations is distinct from expected_migrations then
    raise exception using
      errcode = '23514',
      message = 'UPGRADE_HARNESS_FAILED: schema_migrationsの適用順または件数が不正です。';
  end if;

  select count(*)::integer,
         count(*) filter (where question_version_id is not null)::integer,
         count(distinct ordinal)::integer
  into item_count, complete_item_count, ordinal_count
  from public.learning_session_items
  where session_id = 'a4000000-0000-4000-8000-000000000001';

  if item_count <> 2 or complete_item_count <> 2 or ordinal_count <> 2 then
    raise exception using
      errcode = '23514',
      message = 'UPGRADE_HARNESS_FAILED: 正常sessionの全件・ordinal・versionをbackfillできません。';
  end if;

  if exists (
    select 1
    from public.learning_session_items as item
    left join public.question_versions as version
      on version.id = item.question_version_id
     and version.question_id = item.question_id
    where item.session_id = 'a4000000-0000-4000-8000-000000000001'
      and version.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'UPGRADE_HARNESS_FAILED: session itemのquestion/version対応が不正です。';
  end if;
end;
$$;
