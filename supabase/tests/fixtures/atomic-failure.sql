-- test/upgrade harness専用。明示transaction全体がrollbackされることを検証する。
begin;

create table public.db_harness_atomic_failure_canary (
  id integer primary key,
  marker text not null
);

insert into public.db_harness_atomic_failure_canary (id, marker)
values (1, 'DB-HARNESS-CANARY-ATOMIC-FAILURE-V1');

do $$
begin
  raise exception 'DB_HARNESS_EXPECTED_ATOMIC_FAILURE_V1';
end;
$$;

commit;
