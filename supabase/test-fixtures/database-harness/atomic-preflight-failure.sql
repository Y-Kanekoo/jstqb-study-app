-- test/upgrade harness専用。preflight異常でtransaction全体がrollbackされることを検証する。
begin;

create table public.db_harness_atomic_preflight_canary (
  id integer primary key,
  marker text not null
);

insert into public.db_harness_atomic_preflight_canary (id, marker)
values (1, 'DB-HARNESS-CANARY-ATOMIC-PREFLIGHT-V1');

do $$
begin
  raise exception 'DB_HARNESS_EXPECTED_PREFLIGHT_FAILURE_V1';
end;
$$;

commit;
