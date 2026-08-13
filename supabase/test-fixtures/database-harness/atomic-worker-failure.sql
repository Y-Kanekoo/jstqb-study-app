-- test/upgrade harness専用。worker契約異常でoperation receiptを含むtransaction全体がrollbackされることを検証する。
begin;

create table public.db_harness_atomic_worker_operation_canary (
  operation_id uuid primary key,
  receipt_hash text not null
);

insert into public.db_harness_atomic_worker_operation_canary (operation_id, receipt_hash)
values (
  'db000000-0000-4000-8000-000000000004',
  'DB-HARNESS-CANARY-ATOMIC-WORKER-RECEIPT-V1'
);

do $$
begin
  raise exception 'DB_HARNESS_EXPECTED_WORKER_FAILURE_V1';
end;
$$;

commit;
