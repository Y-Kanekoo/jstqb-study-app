-- クライアントは同期イベントを再生して学習状態を再構築する。
-- 問題文・解説・正答を含む基底テーブルと、内部materialize用の表は直接公開しない。
revoke select on public.questions,
  public.question_versions,
  public.choices,
  public.question_answer_keys,
  public.learning_sessions,
  public.learning_session_items,
  public.answer_attempts
from public, anon, authenticated;

-- 受信契約で必要な本人イベントだけをRLS付きで公開する。
grant select on public.sync_events to authenticated;

create or replace function public.reject_published_question_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    if tg_op <> 'UPDATE' then
      raise exception '公開済み問題版は正式な状態遷移RPCからのみ更新・削除できます。';
    end if;
    if current_setting('jstqb.allow_published_status_transition', true) <> 'on' then
      raise exception '公開済み問題版は正式な状態遷移RPCからのみ更新・削除できます。';
    end if;
    if new.status not in ('suspended'::public.content_status, 'retired'::public.content_status) then
      raise exception '公開済み問題版は正式な状態遷移RPCからのみ更新・削除できます。';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.validate_learning_session_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
  valid_count integer;
  certification_count integer;
  syllabus_count integer;
begin
  requested_count := cardinality(new.question_ids);
  if requested_count is null or requested_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_EVENT: セッションには問題を1問以上指定してください。';
  end if;

  select count(*), count(distinct question.certification_id), count(distinct version.syllabus_version_id)
  into valid_count, certification_count, syllabus_count
  from unnest(new.question_ids) as requested(question_id)
  join public.questions as question on question.id = requested.question_id
  join public.question_versions as version
    on version.id = question.current_version_id
   and version.question_id = question.id
  join public.syllabus_versions as syllabus on syllabus.id = version.syllabus_version_id
  where question.retired_at is null
    and version.status = 'published'
    and syllabus.certification_id = question.certification_id;

  if valid_count <> requested_count
    or certification_count <> 1
    or syllabus_count <> 1 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_EVENT: セッションの問題は同一certification・syllabusの未retiredなpublished版で指定してください。';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_learning_session_creation on public.learning_sessions;
create trigger validate_learning_session_creation
before insert on public.learning_sessions
for each row execute function private.validate_learning_session_creation();

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
  previous_status public.content_status;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'CONTENT_STATUS_TRANSITION_FORBIDDEN';
  end if;
  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 1000 then
    raise exception using errcode = '22023', message = 'CONTENT_STATUS_TRANSITION_REASON_INVALID';
  end if;
  if p_status not in ('suspended'::public.content_status, 'retired'::public.content_status) then
    raise exception using errcode = '22023', message = 'CONTENT_STATUS_TRANSITION_TARGET_INVALID';
  end if;

  select status into previous_status
  from public.question_versions
  where id = p_question_version_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'CONTENT_STATUS_VERSION_NOT_FOUND';
  end if;
  if previous_status not in ('published'::public.content_status, 'suspended'::public.content_status)
    or previous_status = p_status then
    raise exception using errcode = '22023', message = 'CONTENT_STATUS_TRANSITION_INVALID';
  end if;

  perform set_config('jstqb.allow_published_status_transition', 'on', true);
  update public.question_versions
  set status = p_status
  where id = p_question_version_id;
  return p_status;
end;
$$;

revoke all on function public.transition_question_version_status(text, public.content_status, text) from public, anon, authenticated;
grant execute on function public.transition_question_version_status(text, public.content_status, text) to service_role;

-- 002のバックフィル後にも欠落を明示検出する。検出時はmigration全体をrollbackさせる。
do $$
declare
  missing_item record;
begin
  select learning_session.id as session_id, requested.question_id
  into missing_item
  from public.learning_sessions as learning_session
  cross join lateral unnest(learning_session.question_ids) as requested(question_id)
  left join public.learning_session_items as session_item
    on session_item.session_id = learning_session.id
   and session_item.question_id = requested.question_id
  where session_item.id is null
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      message = format(
        'SERVER_INTEGRITY_PREFLIGHT_FAILED: learning_session_itemsのバックフィルが欠落しています（session_id=%s, question_id=%s）。',
        missing_item.session_id,
        missing_item.question_id
      );
  end if;
end;
$$;

revoke all on function private.validate_learning_session_creation() from public;
