-- 001_learning_p0以前の既存データを、制約追加・バックフィルより先に検証する。
-- このDOは002 migration内に置き、特殊なtimestampの並び順に依存しない。
do $$
declare
  duplicate_attempt record;
  duplicate_question record;
  missing_item record;
begin
  select user_id, session_id, question_id, count(*) as attempt_count
  into duplicate_attempt
  from public.answer_attempts
  where invalidated_at is null
  group by user_id, session_id, question_id
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        'SERVER_INTEGRITY_PREFLIGHT_FAILED: 有効なanswer_attemptsが重複しています（user_id=%s, session_id=%s, question_id=%s, count=%s）。',
        duplicate_attempt.user_id,
        duplicate_attempt.session_id,
        duplicate_attempt.question_id,
        duplicate_attempt.attempt_count
      );
  end if;

  select learning_session.id as session_id,
         requested.question_id,
         count(*) as question_count
  into duplicate_question
  from public.learning_sessions as learning_session
  cross join lateral unnest(learning_session.question_ids) as requested(question_id)
  group by learning_session.id, requested.question_id
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      message = format(
        'SERVER_INTEGRITY_PREFLIGHT_FAILED: learning_sessions.question_idsが重複しています（session_id=%s, question_id=%s, count=%s）。',
        duplicate_question.session_id,
        duplicate_question.question_id,
        duplicate_question.question_count
      );
  end if;

  select learning_session.id as session_id, requested.question_id
  into missing_item
  from public.learning_sessions as learning_session
  cross join lateral unnest(learning_session.question_ids) as requested(question_id)
  where not exists (
    select 1
    from public.questions as question
    join public.question_versions as version
      on version.id = coalesce(
        (
          select attempt.question_version_id
          from public.answer_attempts as attempt
          where attempt.user_id = learning_session.user_id
            and attempt.session_id = learning_session.id
            and attempt.question_id = requested.question_id
          order by attempt.answered_at desc, attempt.received_at desc
          limit 1
        ),
        question.current_version_id
      )
     and version.question_id = question.id
    where question.id = requested.question_id
  )
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      message = format(
        'SERVER_INTEGRITY_PREFLIGHT_FAILED: learning_session_itemsのバックフィル対象を解決できません（session_id=%s, question_id=%s）。',
        missing_item.session_id,
        missing_item.question_id
      );
  end if;
end;
$$;

create schema if not exists private;

revoke all on schema private from public;

alter table public.sync_events
  add column if not exists request_hash text;

update public.sync_events
set request_hash = encode(
  extensions.digest(
    jsonb_build_object(
      'kind', kind,
      'entityId', entity_id,
      'occurredAt', occurred_at,
      'payload', payload
    )::text,
    'sha256'
  ),
  'hex'
)
where request_hash is null;

alter table public.sync_events
  alter column request_hash set not null;

create table if not exists public.learning_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  question_id text not null references public.questions(id),
  question_version_id text not null references public.question_versions(id),
  ordinal integer not null check (ordinal >= 0),
  choice_order text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (session_id, ordinal),
  unique (session_id, question_id)
);

insert into public.learning_session_items (
  session_id, question_id, question_version_id, ordinal, choice_order, created_at
)
select learning_session.id,
       requested.question_id,
       version.id,
       requested.ordinality - 1,
       coalesce((
         select array_agg(choice.id order by choice.sort_order)
         from public.choices as choice
         where choice.question_version_id = version.id
       ), '{}'),
       learning_session.started_at
from public.learning_sessions as learning_session
cross join lateral unnest(learning_session.question_ids)
  with ordinality as requested(question_id, ordinality)
join public.questions as question on question.id = requested.question_id
join public.question_versions as version
  on version.id = coalesce(
    (
      select attempt.question_version_id
      from public.answer_attempts as attempt
      where attempt.user_id = learning_session.user_id
        and attempt.session_id = learning_session.id
        and attempt.question_id = requested.question_id
      order by attempt.answered_at desc, attempt.received_at desc
      limit 1
    ),
    question.current_version_id
  )
 and version.question_id = question.id
on conflict (session_id, question_id) do nothing;

create index if not exists learning_session_items_version_idx
  on public.learning_session_items (question_version_id);

create unique index if not exists answer_attempts_one_valid_per_session_question_idx
  on public.answer_attempts (user_id, session_id, question_id)
  where invalidated_at is null;

alter table public.learning_session_items enable row level security;

drop policy if exists own_learning_session_items_read on public.learning_session_items;
create policy own_learning_session_items_read
on public.learning_session_items
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_sessions
    where learning_sessions.id = learning_session_items.session_id
      and learning_sessions.user_id = (select auth.uid())
  )
);

drop policy if exists pinned_session_question_versions_read on public.question_versions;
create policy pinned_session_question_versions_read
on public.question_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_session_items as session_item
    join public.learning_sessions as learning_session
      on learning_session.id = session_item.session_id
    where session_item.question_version_id = question_versions.id
      and learning_session.user_id = (select auth.uid())
  )
);

drop policy if exists pinned_session_choices_read on public.choices;
create policy pinned_session_choices_read
on public.choices
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_session_items as session_item
    join public.learning_sessions as learning_session
      on learning_session.id = session_item.session_id
    where session_item.question_version_id = choices.question_version_id
      and learning_session.user_id = (select auth.uid())
  )
);

drop trigger if exists validate_answer_before_sync_insert on public.sync_events;
drop trigger if exists materialize_learning_event_after_insert on public.sync_events;

create or replace function private.raise_invalid_event(detail text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '22023',
    message = 'INVALID_EVENT: ' || detail;
end;
$$;

create or replace function private.require_text(payload jsonb, field_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_value jsonb;
  result text;
begin
  field_value := payload -> field_name;
  if field_value is null or jsonb_typeof(field_value) <> 'string' then
    perform private.raise_invalid_event(field_name || ' は文字列で指定してください。');
  end if;
  result := payload ->> field_name;
  if result is null or btrim(result) = '' then
    perform private.raise_invalid_event(field_name || ' は空にできません。');
  end if;
  return result;
end;
$$;

create or replace function private.require_uuid(payload jsonb, field_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw_value text;
begin
  raw_value := private.require_text(payload, field_name);
  if raw_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    perform private.raise_invalid_event(field_name || ' はUUIDで指定してください。');
  end if;
  return raw_value::uuid;
end;
$$;

create or replace function private.require_nonnegative_integer(payload jsonb, field_name text)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw_value text;
begin
  if payload -> field_name is null or jsonb_typeof(payload -> field_name) <> 'number' then
    perform private.raise_invalid_event(field_name || ' は0以上の整数で指定してください。');
  end if;
  raw_value := payload ->> field_name;
  if raw_value !~ '^[0-9]+$' then
    perform private.raise_invalid_event(field_name || ' は0以上の整数で指定してください。');
  end if;
  return raw_value::bigint;
end;
$$;

create or replace function private.require_text_array(payload jsonb, field_name text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_value jsonb;
  result text[];
begin
  field_value := payload -> field_name;
  if field_value is null or jsonb_typeof(field_value) <> 'array' then
    perform private.raise_invalid_event(field_name || ' は文字列配列で指定してください。');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(field_value) as item(value)
    where jsonb_typeof(item.value) <> 'string'
      or btrim(item.value #>> '{}') = ''
  ) then
    perform private.raise_invalid_event(field_name || ' は空でない文字列配列で指定してください。');
  end if;
  select coalesce(array_agg(item.value #>> '{}' order by item.ordinality), '{}')
  into result
  from jsonb_array_elements(field_value) with ordinality as item(value, ordinality);
  return result;
end;
$$;

create or replace function private.reject_unknown_fields(payload jsonb, allowed_fields text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_object_keys(payload) as field(name)
    where not (field.name = any(allowed_fields))
  ) then
    perform private.raise_invalid_event('payloadに未対応のfieldが含まれています。');
  end if;
end;
$$;

create or replace function private.validate_selected_choices(
  target_question_version_id text,
  selected_choice_ids text[],
  require_complete boolean
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  required_count integer;
  selection_kind text;
  valid_count integer;
begin
  select required_choice_count, selection_type
  into required_count, selection_kind
  from public.question_versions
  where id = target_question_version_id;

  if required_count is null then
    perform private.raise_invalid_event('問題版が存在しません。');
  end if;
  if cardinality(selected_choice_ids) <> (
    select count(distinct choice_id)
    from unnest(selected_choice_ids) as choice(choice_id)
  ) then
    perform private.raise_invalid_event('選択肢IDを重複して指定できません。');
  end if;
  if cardinality(selected_choice_ids) > required_count
    or (selection_kind = 'single' and cardinality(selected_choice_ids) > 1)
    or (require_complete and cardinality(selected_choice_ids) <> required_count) then
    perform private.raise_invalid_event('選択肢数が問題版の指定と一致しません。');
  end if;

  select count(*)
  into valid_count
  from public.choices
  where question_version_id = target_question_version_id
    and id = any(selected_choice_ids);
  if valid_count <> cardinality(selected_choice_ids) then
    perform private.raise_invalid_event('問題版に属さない選択肢が含まれています。');
  end if;
end;
$$;

create or replace function private.apply_question_state(
  target_user_id uuid,
  target_attempt_id uuid,
  target_session_id uuid,
  target_question_id text,
  outcome_correct boolean,
  answered_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_state public.user_question_states%rowtype;
  previous_session_id uuid;
  calculated_streak integer;
  calculated_stage integer;
  calculated_recovered_at timestamptz;
  calculated_review_at timestamptz;
begin
  select * into previous_state
  from public.user_question_states
  where user_id = target_user_id and question_id = target_question_id
  for update;

  if not found then
    calculated_stage := case when outcome_correct then 1 else 0 end;
    calculated_review_at := case when outcome_correct then answered_time + interval '3 days' else answered_time + interval '10 minutes' end;
    insert into public.user_question_states (
      user_id, question_id, wrong_ever, latest_outcome,
      consecutive_correct_after_wrong, recovered_at, review_stage,
      next_review_at, first_attempt_at, last_attempt_at, last_attempt_id
    ) values (
      target_user_id, target_question_id, not outcome_correct,
      case when outcome_correct then 'correct'::public.latest_outcome else 'wrong'::public.latest_outcome end,
      0, null, calculated_stage, calculated_review_at, answered_time, answered_time, target_attempt_id
    );
    return;
  end if;

  select session_id into previous_session_id
  from public.answer_attempts
  where id = previous_state.last_attempt_id;

  if not outcome_correct then
    calculated_streak := 0;
    calculated_recovered_at := null;
    calculated_stage := 0;
    calculated_review_at := answered_time + interval '10 minutes';
  else
    calculated_streak := previous_state.consecutive_correct_after_wrong;
    if previous_state.wrong_ever and previous_session_id is distinct from target_session_id then
      calculated_streak := least(calculated_streak + 1, 2);
    end if;
    calculated_recovered_at := case
      when previous_state.wrong_ever and calculated_streak >= 2 then answered_time
      else previous_state.recovered_at
    end;
    calculated_stage := least(previous_state.review_stage + 1, 5);
    calculated_review_at := answered_time + case calculated_stage
      when 0 then interval '1 day'
      when 1 then interval '3 days'
      when 2 then interval '7 days'
      when 3 then interval '14 days'
      when 4 then interval '30 days'
      else interval '90 days'
    end;
  end if;

  update public.user_question_states
  set wrong_ever = previous_state.wrong_ever or not outcome_correct,
      latest_outcome = case when outcome_correct then 'correct'::public.latest_outcome else 'wrong'::public.latest_outcome end,
      consecutive_correct_after_wrong = calculated_streak,
      recovered_at = calculated_recovered_at,
      review_stage = calculated_stage,
      next_review_at = calculated_review_at,
      last_attempt_at = answered_time,
      last_attempt_id = target_attempt_id
  where user_id = target_user_id and question_id = target_question_id;
end;
$$;

create or replace function private.materialize_answer(
  target_user_id uuid,
  target_attempt_id uuid,
  target_session_id uuid,
  target_question_id text,
  target_question_version_id text,
  selected_choice_ids text[],
  answered_time timestamptz,
  invalid_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_choice_ids text[];
  normalized_selected_ids text[];
  computed_correct boolean;
begin
  perform private.validate_selected_choices(target_question_version_id, selected_choice_ids, true);
  select coalesce(array_agg(choice_id order by choice_id), '{}')
  into expected_choice_ids
  from public.question_answer_keys,
       unnest(correct_choice_ids) as answer_key(choice_id)
  where question_version_id = target_question_version_id;
  if cardinality(expected_choice_ids) = 0 then
    perform private.raise_invalid_event('採点対象の正答が登録されていません。');
  end if;
  perform private.validate_selected_choices(
    target_question_version_id,
    expected_choice_ids,
    true
  );
  select coalesce(array_agg(choice_id order by choice_id), '{}')
  into normalized_selected_ids
  from unnest(selected_choice_ids) as selected(choice_id);
  computed_correct := normalized_selected_ids = expected_choice_ids and invalid_reason is null;

  insert into public.answer_attempts (
    id, user_id, session_id, question_id, question_version_id,
    selected_choice_ids, is_correct, answered_at, received_at,
    invalidated_at, invalidation_reason
  ) values (
    target_attempt_id, target_user_id, target_session_id, target_question_id,
    target_question_version_id, selected_choice_ids, computed_correct,
    answered_time, clock_timestamp(),
    case when invalid_reason is null then null else answered_time end,
    invalid_reason
  );

  if invalid_reason is null then
    perform private.apply_question_state(
      target_user_id, target_attempt_id, target_session_id,
      target_question_id, computed_correct, answered_time
    );
  end if;
  return computed_correct;
end;
$$;

create or replace function private.process_learning_sync_event(
  target_user_id uuid,
  target_event_id uuid,
  event_kind text,
  target_entity_id text,
  event_payload jsonb,
  server_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_id uuid;
  target_attempt_id uuid;
  target_question_id text;
  target_question_version_id text;
  target_issue_id uuid;
  target_session public.learning_sessions%rowtype;
  target_item public.learning_session_items%rowtype;
  requested_question_ids text[];
  question_version_ids text[];
  requested_choice_ids text[];
  calculated_answered_ids text[];
  expected_revision bigint;
  current_revision bigint;
  device_identifier text;
  note_body text;
  issue_category text;
  issue_description text;
  desired_state boolean;
  review_marked boolean;
  computed_correct boolean;
  inserted_count integer;
  expected_count integer;
  session_title text;
  session_mode text;
  item_record record;
  internal_payload jsonb;
  internal_event_id uuid;
  internal_hash text;
  invalid_reason text;
begin
  if event_payload is null or jsonb_typeof(event_payload) <> 'object' then
    perform private.raise_invalid_event('payload はJSON objectで指定してください。');
  end if;

  if event_kind = 'session.created' then
    perform private.reject_unknown_fields(event_payload, array[
      'sessionId', 'mode', 'title', 'questionIds', 'createdAt',
      'startedAt', 'durationMinutes', 'expiresAt', 'questionVersionIds'
    ]);
    target_session_id := private.require_uuid(event_payload, 'sessionId');
    if target_entity_id <> target_session_id::text then
      perform private.raise_invalid_event('entityId と sessionId が一致しません。');
    end if;
    session_mode := private.require_text(event_payload, 'mode');
    if session_mode not in ('chapter', 'random', 'wrong', 'review', 'exam') then
      perform private.raise_invalid_event('mode が不正です。');
    end if;
    session_title := private.require_text(event_payload, 'title');
    if length(session_title) > 200 then
      perform private.raise_invalid_event('title は200文字以内で指定してください。');
    end if;
    requested_question_ids := private.require_text_array(event_payload, 'questionIds');
    if cardinality(requested_question_ids) = 0 or cardinality(requested_question_ids) > 40 then
      perform private.raise_invalid_event('問題数は1問以上40問以下で指定してください。');
    end if;
    if cardinality(requested_question_ids) <> (select count(distinct id) from unnest(requested_question_ids) as question(id)) then
      perform private.raise_invalid_event('同じ問題を重複して指定できません。');
    end if;
    if session_mode = 'exam' and cardinality(requested_question_ids) <> 40 then
      perform private.raise_invalid_event('模試は40問で作成してください。');
    end if;

    insert into public.learning_sessions (
      id, user_id, mode, title, status, question_ids, current_index,
      answered_question_ids, revision, started_at, updated_at,
      duration_minutes, expires_at, submitted_at
    ) values (
      target_session_id, target_user_id, session_mode, session_title, 'active',
      requested_question_ids, 0, '{}', 1, server_time, server_time,
      case when session_mode = 'exam' then 60 else null end,
      case when session_mode = 'exam' then server_time + interval '60 minutes' else null end,
      null
    );

    insert into public.learning_session_items (
      session_id, question_id, question_version_id, ordinal, choice_order, created_at
    )
    select target_session_id, question.id, version.id, requested.ordinality - 1,
           coalesce((
             select array_agg(choice.id order by choice.sort_order)
             from public.choices as choice
             where choice.question_version_id = version.id
           ), '{}'), server_time
    from unnest(requested_question_ids) with ordinality as requested(question_id, ordinality)
    join public.questions as question on question.id = requested.question_id
    join public.question_versions as version
      on version.id = question.current_version_id
     and version.question_id = question.id
     and version.status = 'published';
    get diagnostics inserted_count = row_count;
    if inserted_count <> cardinality(requested_question_ids) then
      perform private.raise_invalid_event('公開中の問題版が存在しない問題を含められません。');
    end if;

    if session_mode = 'exam' then
      for item_record in
        select chapter.number as chapter_number, count(*)::integer as actual_count
        from public.learning_session_items as session_item
        join public.question_versions as version on version.id = session_item.question_version_id
        join public.learning_objectives as objective on objective.id = version.learning_objective_id
        join public.chapters as chapter on chapter.id = objective.chapter_id
        where session_item.session_id = target_session_id
        group by chapter.number
      loop
        expected_count := case item_record.chapter_number
          when 1 then 8 when 2 then 6 when 3 then 4
          when 4 then 11 when 5 then 9 when 6 then 2 else 0
        end;
        if item_record.actual_count <> expected_count then
          perform private.raise_invalid_event('模試の章別問題数が仕様と一致しません。');
        end if;
      end loop;
      if (select count(distinct chapter.number)
          from public.learning_session_items as session_item
          join public.question_versions as version on version.id = session_item.question_version_id
          join public.learning_objectives as objective on objective.id = version.learning_objective_id
          join public.chapters as chapter on chapter.id = objective.chapter_id
          where session_item.session_id = target_session_id) <> 6 then
        perform private.raise_invalid_event('模試は第1章から第6章を含めてください。');
      end if;
      if (select count(*)
          from public.learning_session_items as session_item
          join public.question_versions as version on version.id = session_item.question_version_id
          join public.learning_objectives as objective on objective.id = version.learning_objective_id
          where session_item.session_id = target_session_id and objective.k_level = 1) <> 8
        or (select count(*)
            from public.learning_session_items as session_item
            join public.question_versions as version on version.id = session_item.question_version_id
            join public.learning_objectives as objective on objective.id = version.learning_objective_id
            where session_item.session_id = target_session_id and objective.k_level = 2) <> 24
        or (select count(*)
            from public.learning_session_items as session_item
            join public.question_versions as version on version.id = session_item.question_version_id
            join public.learning_objectives as objective on objective.id = version.learning_objective_id
            where session_item.session_id = target_session_id and objective.k_level = 3) <> 8 then
        perform private.raise_invalid_event('模試のKレベル別問題数が仕様と一致しません。');
      end if;
    end if;

    select array_agg(question_version_id order by ordinal)
    into question_version_ids
    from public.learning_session_items
    where session_id = target_session_id;
    return event_payload || jsonb_build_object(
      'createdAt', server_time,
      'startedAt', server_time,
      'durationMinutes', case when session_mode = 'exam' then 60 else null end,
      'expiresAt', case when session_mode = 'exam' then server_time + interval '60 minutes' else null end,
      'questionVersionIds', question_version_ids
    );

  elsif event_kind = 'draft.saved' then
    perform private.reject_unknown_fields(event_payload, array[
      'sessionId', 'questionId', 'selectedChoiceIds', 'expectedRevision',
      'deviceId', 'questionVersionId', 'revision', 'updatedAt'
    ]);
    target_session_id := private.require_uuid(event_payload, 'sessionId');
    target_question_id := private.require_text(event_payload, 'questionId');
    if target_entity_id <> target_session_id::text || ':' || target_question_id then
      perform private.raise_invalid_event('entityId とドラフト対象が一致しません。');
    end if;
    requested_choice_ids := private.require_text_array(event_payload, 'selectedChoiceIds');
    expected_revision := private.require_nonnegative_integer(event_payload, 'expectedRevision');
    device_identifier := private.require_text(event_payload, 'deviceId');
    if length(device_identifier) > 200 then
      perform private.raise_invalid_event('deviceId は200文字以内で指定してください。');
    end if;
    select * into target_session from public.learning_sessions
    where id = target_session_id and user_id = target_user_id for update;
    if not found then perform private.raise_invalid_event('自分のセッションが存在しません。'); end if;
    if target_session.status <> 'active' then perform private.raise_invalid_event('セッションは回答受付を終了しています。'); end if;
    if target_session.mode = 'exam' and server_time >= target_session.expires_at then
      raise exception using errcode = '22023', message = 'SESSION_FROZEN';
    end if;
    select * into target_item from public.learning_session_items
    where session_id = target_session_id and question_id = target_question_id;
    if not found then perform private.raise_invalid_event('問題はセッションに含まれていません。'); end if;
    if exists (
      select 1 from public.answer_attempts
      where user_id = target_user_id and session_id = target_session_id and question_id = target_question_id
        and invalidated_at is null
    ) then
      perform private.raise_invalid_event('確定済み回答のドラフトは変更できません。');
    end if;
    perform private.validate_selected_choices(target_item.question_version_id, requested_choice_ids, false);
    select revision into current_revision from public.answer_drafts
    where user_id = target_user_id and session_id = target_session_id and question_id = target_question_id
    for update;
    if not found then
      if expected_revision <> 0 then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
      current_revision := 1;
      insert into public.answer_drafts (
        user_id, session_id, question_id, selected_choice_ids, revision, device_id, updated_at
      ) values (
        target_user_id, target_session_id, target_question_id, requested_choice_ids,
        current_revision, device_identifier, server_time
      );
    else
      if current_revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
      current_revision := current_revision + 1;
      update public.answer_drafts
      set selected_choice_ids = requested_choice_ids,
          revision = current_revision,
          device_id = device_identifier,
          updated_at = server_time
      where user_id = target_user_id and session_id = target_session_id and question_id = target_question_id;
    end if;
    return event_payload || jsonb_build_object(
      'questionVersionId', target_item.question_version_id,
      'revision', current_revision,
      'updatedAt', server_time
    );

  elsif event_kind = 'answer.submitted' then
    perform private.reject_unknown_fields(event_payload, array[
      'sessionId', 'questionId', 'questionVersionId', 'selectedChoiceIds',
      'isCorrect', 'answeredAt'
    ]);
    target_session_id := private.require_uuid(event_payload, 'sessionId');
    target_question_id := private.require_text(event_payload, 'questionId');
    target_question_version_id := private.require_text(event_payload, 'questionVersionId');
    requested_choice_ids := private.require_text_array(event_payload, 'selectedChoiceIds');
    if target_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      perform private.raise_invalid_event('回答entityIdはUUIDで指定してください。');
    end if;
    target_attempt_id := target_entity_id::uuid;
    if exists (select 1 from public.answer_attempts where id = target_attempt_id) then
      perform private.raise_invalid_event('回答entityIdは使用済みです。');
    end if;
    select * into target_session from public.learning_sessions
    where id = target_session_id and user_id = target_user_id for update;
    if not found then perform private.raise_invalid_event('自分のセッションが存在しません。'); end if;
    if target_session.mode = 'exam' then perform private.raise_invalid_event('模試回答はsession.submittedで一括確定してください。'); end if;
    if target_session.status <> 'active' then perform private.raise_invalid_event('セッションは回答受付を終了しています。'); end if;
    select * into target_item from public.learning_session_items
    where session_id = target_session_id and question_id = target_question_id;
    if not found or target_item.question_version_id <> target_question_version_id then
      perform private.raise_invalid_event('セッション開始時の問題版と一致しません。');
    end if;
    if exists (
      select 1 from public.answer_attempts
      where user_id = target_user_id
        and session_id = target_session_id
        and question_id = target_question_id
        and invalidated_at is null
    ) then
      perform private.raise_invalid_event('このセッションの問題は確定済みです。');
    end if;
    if not exists (
      select 1 from public.question_versions
      where id = target_question_version_id
        and question_id = target_question_id
        and status in ('published', 'retired')
    ) then perform private.raise_invalid_event('停止中または未公開の問題版には回答できません。'); end if;
    computed_correct := private.materialize_answer(
      target_user_id, target_attempt_id, target_session_id, target_question_id,
      target_question_version_id, requested_choice_ids, server_time
    );
    calculated_answered_ids := case
      when target_question_id = any(target_session.answered_question_ids) then target_session.answered_question_ids
      else array_append(target_session.answered_question_ids, target_question_id)
    end;
    update public.learning_sessions
    set answered_question_ids = calculated_answered_ids,
        current_index = least(greatest(current_index, target_item.ordinal + 1), cardinality(target_session.question_ids) - 1),
        status = case when cardinality(calculated_answered_ids) >= cardinality(target_session.question_ids) then 'completed'::public.session_status else status end,
        completed_at = case when cardinality(calculated_answered_ids) >= cardinality(target_session.question_ids) then server_time else completed_at end,
        updated_at = server_time,
        revision = revision + 1
    where id = target_session_id;
    return event_payload || jsonb_build_object('isCorrect', computed_correct, 'answeredAt', server_time);

  elsif event_kind = 'session.advanced' then
    perform private.reject_unknown_fields(event_payload, array['sessionId', 'questionId', 'currentIndex']);
    target_session_id := private.require_uuid(event_payload, 'sessionId');
    target_question_id := private.require_text(event_payload, 'questionId');
    if target_entity_id <> target_session_id::text then perform private.raise_invalid_event('entityId と sessionId が一致しません。'); end if;
    select * into target_session from public.learning_sessions
    where id = target_session_id and user_id = target_user_id for update;
    if not found then perform private.raise_invalid_event('自分のセッションが存在しません。'); end if;
    select * into target_item from public.learning_session_items
    where session_id = target_session_id and question_id = target_question_id;
    if not found then perform private.raise_invalid_event('問題はセッションに含まれていません。'); end if;
    update public.learning_sessions
    set current_index = target_item.ordinal,
        updated_at = server_time,
        revision = revision + 1
    where id = target_session_id;
    return event_payload || jsonb_build_object('currentIndex', target_item.ordinal);

  elsif event_kind = 'session.submitted' then
    perform private.reject_unknown_fields(event_payload, array[
      'sessionId', 'submittedAt', 'answeredQuestionIds', 'expired'
    ]);
    target_session_id := private.require_uuid(event_payload, 'sessionId');
    if target_entity_id <> target_session_id::text then perform private.raise_invalid_event('entityId と sessionId が一致しません。'); end if;
    select * into target_session from public.learning_sessions
    where id = target_session_id and user_id = target_user_id for update;
    if not found then perform private.raise_invalid_event('自分のセッションが存在しません。'); end if;
    if target_session.mode <> 'exam' then perform private.raise_invalid_event('模試だけを一括提出できます。'); end if;
    if target_session.status <> 'active' then perform private.raise_invalid_event('模試はすでに提出済みです。'); end if;

    calculated_answered_ids := '{}';
    for item_record in
      select session_item.*, draft.selected_choice_ids, version.status as version_status,
             version.required_choice_count
      from public.learning_session_items as session_item
      join public.question_versions as version on version.id = session_item.question_version_id
      left join public.answer_drafts as draft
        on draft.user_id = target_user_id
       and draft.session_id = target_session_id
       and draft.question_id = session_item.question_id
       and draft.updated_at <= target_session.expires_at
      where session_item.session_id = target_session_id
      order by session_item.ordinal
    loop
      if item_record.selected_choice_ids is null
        or cardinality(item_record.selected_choice_ids) <> item_record.required_choice_count then
        continue;
      end if;
      internal_event_id := gen_random_uuid();
      invalid_reason := case
        when item_record.version_status in ('published', 'retired') then null
        else '問題版が緊急停止または未公開になりました。'
      end;
      computed_correct := private.materialize_answer(
        target_user_id, internal_event_id, target_session_id, item_record.question_id,
        item_record.question_version_id, item_record.selected_choice_ids, server_time, invalid_reason
      );
      calculated_answered_ids := array_append(calculated_answered_ids, item_record.question_id);
      internal_payload := jsonb_build_object(
        'sessionId', target_session_id,
        'questionId', item_record.question_id,
        'questionVersionId', item_record.question_version_id,
        'selectedChoiceIds', item_record.selected_choice_ids,
        'isCorrect', computed_correct,
        'answeredAt', server_time,
        'invalidated', invalid_reason is not null
      );
      internal_hash := encode(extensions.digest(jsonb_build_object(
        'kind', 'answer.submitted', 'entityId', internal_event_id::text,
        'occurredAt', server_time, 'payload', internal_payload
      )::text, 'sha256'), 'hex');
      insert into public.sync_events (
        event_id, user_id, kind, entity_id, payload, occurred_at, request_hash
      ) values (
        internal_event_id, target_user_id, 'answer.submitted', internal_event_id::text,
        internal_payload, server_time, internal_hash
      );
    end loop;

    update public.learning_sessions
    set status = 'completed',
        answered_question_ids = calculated_answered_ids,
        submitted_at = server_time,
        completed_at = server_time,
        updated_at = server_time,
        revision = revision + 1
    where id = target_session_id;
    return event_payload || jsonb_build_object(
      'submittedAt', server_time,
      'answeredQuestionIds', calculated_answered_ids,
      'expired', server_time >= target_session.expires_at
    );

  elsif event_kind = 'session.review-marked' then
    perform private.reject_unknown_fields(event_payload, array['sessionId', 'questionId', 'marked', 'updatedAt']);
    target_session_id := private.require_uuid(event_payload, 'sessionId');
    target_question_id := private.require_text(event_payload, 'questionId');
    if target_entity_id <> target_session_id::text || ':' || target_question_id then
      perform private.raise_invalid_event('entityId と復習マーク対象が一致しません。');
    end if;
    if jsonb_typeof(event_payload -> 'marked') <> 'boolean' then perform private.raise_invalid_event('marked はbooleanで指定してください。'); end if;
    review_marked := (event_payload ->> 'marked')::boolean;
    select * into target_session from public.learning_sessions
    where id = target_session_id and user_id = target_user_id for update;
    if not found then perform private.raise_invalid_event('自分のセッションが存在しません。'); end if;
    if not exists (select 1 from public.learning_session_items where session_id = target_session_id and question_id = target_question_id) then
      perform private.raise_invalid_event('問題はセッションに含まれていません。');
    end if;
    update public.learning_sessions
    set review_question_ids = case
      when review_marked then array(select distinct value from unnest(array_append(review_question_ids, target_question_id)) as item(value))
      else array_remove(review_question_ids, target_question_id)
    end,
    updated_at = server_time,
    revision = revision + 1
    where id = target_session_id;
    return event_payload || jsonb_build_object('updatedAt', server_time);

  elsif event_kind = 'bookmark.changed' then
    perform private.reject_unknown_fields(event_payload, array['questionId', 'enabled', 'updatedAt']);
    target_question_id := private.require_text(event_payload, 'questionId');
    if target_entity_id <> target_question_id then perform private.raise_invalid_event('entityId と questionId が一致しません。'); end if;
    if jsonb_typeof(event_payload -> 'enabled') <> 'boolean' then perform private.raise_invalid_event('enabled はbooleanで指定してください。'); end if;
    desired_state := (event_payload ->> 'enabled')::boolean;
    if not exists (select 1 from public.questions where id = target_question_id) then perform private.raise_invalid_event('問題が存在しません。'); end if;
    if desired_state then
      insert into public.bookmarks (user_id, question_id, created_at, updated_at)
      values (target_user_id, target_question_id, server_time, server_time)
      on conflict (user_id, question_id) do update set updated_at = excluded.updated_at;
    else
      delete from public.bookmarks where user_id = target_user_id and question_id = target_question_id;
    end if;
    return event_payload || jsonb_build_object('updatedAt', server_time);

  elsif event_kind = 'note.saved' then
    perform private.reject_unknown_fields(event_payload, array[
      'questionId', 'questionVersionId', 'body', 'expectedRevision',
      'revision', 'updatedAt'
    ]);
    target_question_id := private.require_text(event_payload, 'questionId');
    target_question_version_id := private.require_text(event_payload, 'questionVersionId');
    if target_entity_id <> target_question_id then
      perform private.raise_invalid_event('entityId とメモ対象が一致しません。');
    end if;
    note_body := coalesce(event_payload ->> 'body', '');
    if jsonb_typeof(event_payload -> 'body') <> 'string' or length(note_body) > 10000 then
      perform private.raise_invalid_event('body は10000文字以内の文字列で指定してください。');
    end if;
    expected_revision := private.require_nonnegative_integer(event_payload, 'expectedRevision');
    if not exists (
      select 1 from public.question_versions
      where id = target_question_version_id and question_id = target_question_id
    ) then perform private.raise_invalid_event('問題と問題版の組み合わせが存在しません。'); end if;
    select revision into current_revision from public.question_notes
    where user_id = target_user_id and question_id = target_question_id for update;
    if not found then
      if expected_revision <> 0 then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
      current_revision := 1;
      insert into public.question_notes (user_id, question_id, question_version_id, body, revision, updated_at)
      values (target_user_id, target_question_id, target_question_version_id, note_body, current_revision, server_time);
    else
      if current_revision <> expected_revision then raise exception using errcode = '40001', message = 'REVISION_CONFLICT'; end if;
      current_revision := current_revision + 1;
      update public.question_notes
      set question_version_id = target_question_version_id,
          body = note_body,
          revision = current_revision,
          updated_at = server_time
      where user_id = target_user_id and question_id = target_question_id;
    end if;
    return event_payload || jsonb_build_object('revision', current_revision, 'updatedAt', server_time);

  elsif event_kind = 'issue.reported' then
    perform private.reject_unknown_fields(event_payload, array[
      'issueId', 'questionId', 'questionVersionId', 'category',
      'description', 'createdAt'
    ]);
    target_issue_id := private.require_uuid(event_payload, 'issueId');
    if target_entity_id <> target_issue_id::text then perform private.raise_invalid_event('entityId と issueId が一致しません。'); end if;
    target_question_id := private.require_text(event_payload, 'questionId');
    target_question_version_id := private.require_text(event_payload, 'questionVersionId');
    issue_category := private.require_text(event_payload, 'category');
    issue_description := private.require_text(event_payload, 'description');
    if issue_category not in ('incorrect_answer', 'unclear', 'outdated', 'typo', 'other') then perform private.raise_invalid_event('category が不正です。'); end if;
    if length(issue_description) < 5 or length(issue_description) > 4000 then perform private.raise_invalid_event('description は5文字以上4000文字以内で指定してください。'); end if;
    if not exists (
      select 1 from public.question_versions
      where id = target_question_version_id and question_id = target_question_id
    ) then perform private.raise_invalid_event('報告対象の問題版が存在しません。'); end if;
    insert into public.content_issues (
      id, question_version_id, reporter_id, category, description, created_at, updated_at
    ) values (
      target_issue_id, target_question_version_id, target_user_id,
      issue_category, issue_description, server_time, server_time
    );
    return event_payload || jsonb_build_object('createdAt', server_time);
  else
    perform private.raise_invalid_event('対応していないkindです。');
  end if;
  return event_payload;
end;
$$;

create or replace function public.ingest_learning_sync_events(p_events jsonb)
returns table (
  sequence bigint,
  event_id uuid,
  kind text,
  entity_id text,
  occurred_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  event_value jsonb;
  incoming_event_id uuid;
  incoming_kind text;
  incoming_entity_id text;
  incoming_occurred_at timestamptz;
  incoming_payload jsonb;
  incoming_hash text;
  canonical_payload jsonb;
  canonical_time timestamptz;
  stored_event public.sync_events%rowtype;
begin
  caller_id := auth.uid();
  if caller_id is null or not exists (
    select 1 from auth.users where id = caller_id
  ) then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    perform private.raise_invalid_event('events は配列で指定してください。');
  end if;
  if pg_column_size(p_events) > 1048576 then
    perform private.raise_invalid_event('events は1MiB以下で指定してください。');
  end if;
  if jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 100 then
    perform private.raise_invalid_event('events は1件以上100件以下で指定してください。');
  end if;

  for event_value in select value from jsonb_array_elements(p_events) as event(value)
  loop
    if jsonb_typeof(event_value) <> 'object' then perform private.raise_invalid_event('event はobjectで指定してください。'); end if;
    if pg_column_size(event_value) > 65536 then
      perform private.raise_invalid_event('event は64KiB以下で指定してください。');
    end if;
    perform private.reject_unknown_fields(
      event_value,
      array['eventId', 'kind', 'entityId', 'occurredAt', 'payload']
    );
    incoming_event_id := private.require_uuid(event_value, 'eventId');
    incoming_kind := private.require_text(event_value, 'kind');
    incoming_entity_id := private.require_text(event_value, 'entityId');
    incoming_payload := event_value -> 'payload';
    if jsonb_typeof(incoming_payload) <> 'object' then perform private.raise_invalid_event('payload はobjectで指定してください。'); end if;
    begin
      incoming_occurred_at := private.require_text(event_value, 'occurredAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      perform private.raise_invalid_event('occurredAt はISO 8601日時で指定してください。');
    end;
    incoming_hash := encode(extensions.digest(jsonb_build_object(
      'kind', incoming_kind,
      'entityId', incoming_entity_id,
      'occurredAt', incoming_occurred_at,
      'payload', incoming_payload
    )::text, 'sha256'), 'hex');

    select * into stored_event from public.sync_events where sync_events.event_id = incoming_event_id;
    if found then
      if stored_event.user_id <> caller_id or stored_event.request_hash <> incoming_hash then
        raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
      end if;
      sequence := stored_event.sequence;
      event_id := stored_event.event_id;
      kind := stored_event.kind;
      entity_id := stored_event.entity_id;
      occurred_at := stored_event.occurred_at;
      payload := stored_event.payload;
      return next;
      continue;
    end if;

    canonical_time := clock_timestamp();
    canonical_payload := private.process_learning_sync_event(
      caller_id, incoming_event_id, incoming_kind,
      incoming_entity_id, incoming_payload, canonical_time
    );
    insert into public.sync_events (
      event_id, user_id, kind, entity_id, payload, occurred_at, request_hash
    ) values (
      incoming_event_id, caller_id, incoming_kind, incoming_entity_id,
      canonical_payload, canonical_time, incoming_hash
    ) returning * into stored_event;

    sequence := stored_event.sequence;
    event_id := stored_event.event_id;
    kind := stored_event.kind;
    entity_id := stored_event.entity_id;
    occurred_at := stored_event.occurred_at;
    payload := stored_event.payload;
    return next;
  end loop;
end;
$$;

create or replace function private.has_recent_password_authentication(max_age interval)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(
    entry ->> 'method' = 'password'
    and (entry ->> 'timestamp') ~ '^[0-9]+$'
    and to_timestamp((entry ->> 'timestamp')::double precision) >= statement_timestamp() - max_age
  ), false)
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as method(entry);
$$;

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null or not exists (
    select 1 from auth.users where id = current_user_id
  ) then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not private.has_recent_password_authentication(interval '5 minutes') then
    raise exception using errcode = '42501', message = 'RECENT_REAUTHENTICATION_REQUIRED';
  end if;
  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.ingest_learning_sync_events(jsonb) from public;
grant execute on function public.ingest_learning_sync_events(jsonb) to authenticated;
revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;

revoke insert, update, delete on public.sync_events from anon, authenticated;
revoke insert, update, delete on public.learning_sessions from anon, authenticated;
revoke insert, update, delete on public.learning_session_items from anon, authenticated;
revoke insert, update, delete on public.answer_drafts from anon, authenticated;
revoke insert, update, delete on public.answer_attempts from anon, authenticated;
revoke insert, update, delete on public.user_question_states from anon, authenticated;
revoke insert, update, delete on public.bookmarks from anon, authenticated;
revoke insert, update, delete on public.question_notes from anon, authenticated;
revoke insert, update, delete on public.content_issues from anon, authenticated;

grant select on public.learning_session_items to authenticated;

revoke all on function private.raise_invalid_event(text) from public;
revoke all on function private.require_text(jsonb, text) from public;
revoke all on function private.require_uuid(jsonb, text) from public;
revoke all on function private.require_nonnegative_integer(jsonb, text) from public;
revoke all on function private.require_text_array(jsonb, text) from public;
revoke all on function private.reject_unknown_fields(jsonb, text[]) from public;
revoke all on function private.validate_selected_choices(text, text[], boolean) from public;
revoke all on function private.apply_question_state(uuid, uuid, uuid, text, boolean, timestamptz) from public;
revoke all on function private.materialize_answer(uuid, uuid, uuid, text, text, text[], timestamptz, text) from public;
revoke all on function private.process_learning_sync_event(uuid, uuid, text, text, jsonb, timestamptz) from public;
revoke all on function private.has_recent_password_authentication(interval) from public;
