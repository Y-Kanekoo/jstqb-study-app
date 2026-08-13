-- test/upgrade harness専用。trigger異常でtransaction全体がrollbackされることを検証する。
begin;

create table public.db_harness_atomic_trigger_canary (
  id integer primary key,
  marker text not null
);

create function public.db_harness_atomic_trigger_failure_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'DB_HARNESS_EXPECTED_TRIGGER_FAILURE_V1';
end;
$$;

create trigger db_harness_expected_trigger_failure_v1
before insert on public.db_harness_atomic_trigger_canary
for each row execute function public.db_harness_atomic_trigger_failure_v1();

insert into public.db_harness_atomic_trigger_canary (id, marker)
values (1, 'DB-HARNESS-CANARY-ATOMIC-TRIGGER-V1');

commit;
