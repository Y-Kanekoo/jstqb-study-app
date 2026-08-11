alter table public.learning_sessions
  add column if not exists review_question_ids text[] not null default '{}',
  add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  add column if not exists expires_at timestamptz,
  add column if not exists submitted_at timestamptz;

create table if not exists public.question_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  question_version_id text not null,
  body text not null default '',
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  primary key (user_id, question_id)
);

alter table public.question_notes enable row level security;

create policy own_question_notes_all
on public.question_notes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.sync_events
  drop constraint if exists sync_events_kind_check;

alter table public.sync_events
  add constraint sync_events_kind_check
  check (kind in (
    'session.created',
    'draft.saved',
    'answer.submitted',
    'session.advanced',
    'session.submitted',
    'session.review-marked',
    'bookmark.changed',
    'note.saved',
    'issue.reported'
  ));

create or replace function public.materialize_learning_sync_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'note.saved' then
    insert into public.question_notes (
      user_id,
      question_id,
      question_version_id,
      body,
      revision,
      updated_at
    ) values (
      new.user_id,
      new.payload ->> 'questionId',
      new.payload ->> 'questionVersionId',
      coalesce(new.payload ->> 'body', ''),
      (new.payload ->> 'revision')::bigint,
      (new.payload ->> 'updatedAt')::timestamptz
    )
    on conflict (user_id, question_id) do update
    set question_version_id = excluded.question_version_id,
        body = excluded.body,
        revision = excluded.revision,
        updated_at = excluded.updated_at
    where public.question_notes.updated_at <= excluded.updated_at;
  elsif new.kind = 'issue.reported' and exists (
    select 1
    from public.question_versions
    where id = new.payload ->> 'questionVersionId'
  ) then
    insert into public.content_issues (
      id,
      question_version_id,
      reporter_id,
      category,
      description,
      created_at,
      updated_at
    ) values (
      (new.payload ->> 'issueId')::uuid,
      new.payload ->> 'questionVersionId',
      new.user_id,
      new.payload ->> 'category',
      new.payload ->> 'description',
      (new.payload ->> 'createdAt')::timestamptz,
      (new.payload ->> 'createdAt')::timestamptz
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists materialize_learning_event_after_insert on public.sync_events;

create trigger materialize_learning_event_after_insert
after insert on public.sync_events
for each row execute function public.materialize_learning_sync_event();

revoke all on function public.materialize_learning_sync_event() from public;

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
  if current_user_id is null then
    raise exception '認証が必要です。';
  end if;

  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;
