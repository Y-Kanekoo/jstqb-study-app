-- test/upgrade harness専用。production migrationへコピーしてはならない。
insert into public.certifications (id, code, name, active, created_at)
values (
  'db000000-0000-4000-8000-000000000001',
  'DB-HARNESS-CANARY-ORIGIN-MAIN-V1',
  'DB harness synthetic origin/main fixture',
  true,
  '2026-08-14T00:00:00.000Z'::timestamptz
);

do $$
begin
  if not exists (
    select 1
      from public.certifications
     where id = 'db000000-0000-4000-8000-000000000001'
       and code = 'DB-HARNESS-CANARY-ORIGIN-MAIN-V1'
  ) then
    raise exception 'DB_HARNESS_ORIGIN_MAIN_FIXTURE_MISSING';
  end if;
end;
$$;
