-- test/upgrade harness専用。constraint異常でtransaction全体がrollbackされることを検証する。
begin;

create table public.db_harness_atomic_constraint_canary (
  id integer primary key,
  positive_value integer not null,
  constraint db_harness_expected_constraint_failure_v1 check (positive_value > 0)
);

insert into public.db_harness_atomic_constraint_canary (id, positive_value)
values (1, 0);

commit;
