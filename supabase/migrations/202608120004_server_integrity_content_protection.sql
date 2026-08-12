-- 公開後の問題コンテンツを、状態遷移以外の経路から変更できないようにする。
create table if not exists private.question_version_status_transition_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  question_version_id text not null references public.question_versions(id),
  target_status public.content_status not null,
  primary key (backend_pid, transaction_id, question_version_id)
);

create table if not exists private.question_version_status_audit (
  id bigint generated always as identity primary key,
  question_version_id text not null references public.question_versions(id),
  reason text not null,
  caller text not null,
  caller_role text not null,
  database_role text not null,
  occurred_at timestamptz not null,
  old_status public.content_status not null,
  new_status public.content_status not null
);

revoke all on schema private from public, anon, authenticated, service_role;
revoke all on table private.question_version_status_transition_context,
  private.question_version_status_audit
from public, anon, authenticated, service_role;

create or replace function private.reject_question_version_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'CONTENT_STATUS_AUDIT_APPEND_ONLY';
end;
$$;

drop trigger if exists question_version_status_audit_append_only
on private.question_version_status_audit;
create trigger question_version_status_audit_append_only
before update or delete on private.question_version_status_audit
for each row execute function private.reject_question_version_audit_mutation();

create or replace function public.reject_published_question_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in (
      'published'::public.content_status,
      'suspended'::public.content_status,
      'retired'::public.content_status
    ) then
      raise exception using
        errcode = '42501',
        message = '公開済み問題版は新版を作成せずに削除できません。';
    end if;
    return old;
  end if;

  if old.status in (
    'published'::public.content_status,
    'suspended'::public.content_status,
    'retired'::public.content_status
  ) then
    if not exists (
      select 1
      from private.question_version_status_transition_context as context
      where context.backend_pid = pg_backend_pid()
        and context.transaction_id = txid_current()
        and context.question_version_id = old.id
        and context.target_status = new.status
    ) then
      raise exception using
        errcode = '42501',
        message = '公開済み問題版は正式な状態遷移RPCからのみstatusを変更できます。';
    end if;

    if new.question_id is distinct from old.question_id
      or new.version_no is distinct from old.version_no
      or new.syllabus_version_id is distinct from old.syllabus_version_id
      or new.learning_objective_id is distinct from old.learning_objective_id
      or new.selection_type is distinct from old.selection_type
      or new.required_choice_count is distinct from old.required_choice_count
      or new.prompt is distinct from old.prompt
      or new.explanation is distinct from old.explanation
      or new.difficulty is distinct from old.difficulty
      or new.source_reference is distinct from old.source_reference
      or new.content_hash is distinct from old.content_hash
      or new.created_by is distinct from old.created_by
      or new.reviewed_by is distinct from old.reviewed_by
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '42501',
        message = '公開済み問題版の本文・属性は新版作成以外では変更できません。';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.reject_immutable_choice_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_status public.content_status;
  new_status public.content_status;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  select status into old_status
  from public.question_versions
  where id = old.question_version_id;
  select status into new_status
  from public.question_versions
  where id = new.question_version_id;

  if old_status in (
    'published'::public.content_status,
    'suspended'::public.content_status,
    'retired'::public.content_status
  ) or new_status in (
    'published'::public.content_status,
    'suspended'::public.content_status,
    'retired'::public.content_status
  ) then
    raise exception using
      errcode = '42501',
      message = '公開済み問題版の選択肢は新版作成以外では変更できません。';
  end if;

  return new;
end;
$$;

create or replace function private.reject_immutable_choice_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (
      select inserted.question_version_id, count(*) as inserted_count
      from inserted_choices as inserted
      group by inserted.question_version_id
    ) as inserted
    join public.question_versions as version
      on version.id = inserted.question_version_id
    where version.status in (
      'published'::public.content_status,
      'suspended'::public.content_status,
      'retired'::public.content_status
    )
    and (
      select count(*)
      from public.choices as choice
      where choice.question_version_id = inserted.question_version_id
    ) > inserted.inserted_count
  ) then
    raise exception using
      errcode = '42501',
      message = '公開済み問題版への選択肢追加は新版作成以外ではできません。';
  end if;
  return null;
end;
$$;

drop trigger if exists protect_immutable_question_version_choices
on public.choices;
create trigger protect_immutable_question_version_choices
before update or delete on public.choices
for each row execute function private.reject_immutable_choice_mutation();

drop trigger if exists protect_immutable_question_version_choice_insert
on public.choices;
create trigger protect_immutable_question_version_choice_insert
after insert on public.choices
referencing new table as inserted_choices
for each statement execute function private.reject_immutable_choice_insert();

create or replace function private.reject_immutable_answer_key_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_status public.content_status;
  new_version_status public.content_status;
begin
  if tg_op = 'INSERT' then
    select status into version_status
    from public.question_versions
    where id = new.question_version_id;
    if version_status in (
      'published'::public.content_status,
      'suspended'::public.content_status,
      'retired'::public.content_status
    ) and exists (
      select 1
      from public.question_answer_keys as answer_key
      where answer_key.question_version_id = new.question_version_id
    ) then
      raise exception using
        errcode = '42501',
        message = '公開済み問題版の正答キーは新版作成以外では追加できません。';
    end if;
    return new;
  end if;

  select status into version_status
  from public.question_versions
  where id = old.question_version_id;
  if tg_op = 'UPDATE' then
    select status into new_version_status
    from public.question_versions
    where id = new.question_version_id;
  end if;
  if version_status in (
    'published'::public.content_status,
    'suspended'::public.content_status,
    'retired'::public.content_status
  ) or new_version_status in (
    'published'::public.content_status,
    'suspended'::public.content_status,
    'retired'::public.content_status
  ) then
    raise exception using
      errcode = '42501',
      message = '公開済み問題版の正答キーは新版作成以外では変更できません。';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_immutable_question_answer_keys
on public.question_answer_keys;
create trigger protect_immutable_question_answer_keys
before insert or update or delete on public.question_answer_keys
for each row execute function private.reject_immutable_answer_key_mutation();

-- 直接DMLはmigration実行者以外に与えず、状態変更だけを専用RPCに限定する。
revoke insert, update, delete on public.question_versions,
  public.choices,
  public.question_answer_keys
from public, anon, authenticated, service_role;

create or replace function public.transition_question_version_status(
  p_question_version_id text,
  p_status public.content_status,
  p_reason text
)
returns public.content_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoker_role text;
  previous_status public.content_status;
  occurred_time timestamptz;
  caller_name text;
  caller_claim_role text;
begin
  -- SECURITY DEFINER内のcurrent_userは関数所有者になるため、SET ROLEの値をrole GUCで検証する。
  invoker_role := current_setting('role', true);
  caller_claim_role := coalesce(auth.jwt() ->> 'role', '');
  if invoker_role not in ('service_role', 'postgres', 'none') or caller_claim_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'CONTENT_STATUS_TRANSITION_FORBIDDEN';
  end if;
  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'CONTENT_STATUS_TRANSITION_REASON_INVALID';
  end if;
  if p_status not in (
    'suspended'::public.content_status,
    'retired'::public.content_status
  ) then
    raise exception using
      errcode = '22023',
      message = 'CONTENT_STATUS_TRANSITION_TARGET_INVALID';
  end if;

  select status into previous_status
  from public.question_versions
  where id = p_question_version_id
  for update;
  if not found then
    raise exception using
      errcode = '22023',
      message = 'CONTENT_STATUS_VERSION_NOT_FOUND';
  end if;
  if previous_status not in (
    'published'::public.content_status,
    'suspended'::public.content_status
  ) or previous_status = p_status then
    raise exception using
      errcode = '22023',
      message = 'CONTENT_STATUS_TRANSITION_INVALID';
  end if;

  insert into private.question_version_status_transition_context (
    backend_pid, transaction_id, question_version_id, target_status
  ) values (
    pg_backend_pid(), txid_current(), p_question_version_id, p_status
  );

  update public.question_versions
  set status = p_status
  where id = p_question_version_id;

  occurred_time := clock_timestamp();
  caller_name := coalesce(nullif(auth.jwt() ->> 'sub', ''), invoker_role);
  insert into private.question_version_status_audit (
    question_version_id, reason, caller, caller_role, database_role,
    occurred_at, old_status, new_status
  ) values (
    p_question_version_id, p_reason, caller_name, caller_claim_role,
    invoker_role, occurred_time, previous_status, p_status
  );

  delete from private.question_version_status_transition_context
  where backend_pid = pg_backend_pid()
    and transaction_id = txid_current()
    and question_version_id = p_question_version_id;

  return p_status;
end;
$$;

revoke all on function public.transition_question_version_status(text, public.content_status, text)
from public, anon, authenticated;
grant execute on function public.transition_question_version_status(text, public.content_status, text)
to authenticated;
grant execute on function public.transition_question_version_status(text, public.content_status, text)
to service_role;

revoke all on function private.reject_question_version_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function private.reject_immutable_choice_mutation() from public, anon, authenticated, service_role;
revoke all on function private.reject_immutable_choice_insert() from public, anon, authenticated, service_role;
revoke all on function private.reject_immutable_answer_key_mutation() from public, anon, authenticated, service_role;
