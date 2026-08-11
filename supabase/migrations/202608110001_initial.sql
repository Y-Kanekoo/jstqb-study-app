create extension if not exists pgcrypto;

create type public.content_status as enum ('draft', 'reviewing', 'published', 'suspended', 'retired');
create type public.session_status as enum ('active', 'completed', 'expired');
create type public.latest_outcome as enum ('correct', 'wrong');

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.syllabus_versions (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references public.certifications(id),
  version text not null,
  status public.content_status not null default 'draft',
  source_url text not null,
  created_at timestamptz not null default now(),
  unique (certification_id, version)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references public.syllabus_versions(id),
  number integer not null check (number > 0),
  title text not null,
  exam_weight numeric(5, 2) check (exam_weight between 0 and 100),
  unique (syllabus_version_id, number)
);

create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id),
  code text not null unique,
  title text not null,
  k_level smallint not null check (k_level between 1 and 3),
  minimum_question_count integer not null default 0 check (minimum_question_count >= 0)
);

create table public.questions (
  id text primary key,
  certification_id uuid not null references public.certifications(id),
  current_version_id text,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table public.question_versions (
  id text primary key,
  question_id text not null references public.questions(id),
  version_no integer not null check (version_no > 0),
  syllabus_version_id uuid not null references public.syllabus_versions(id),
  learning_objective_id uuid not null references public.learning_objectives(id),
  status public.content_status not null default 'draft',
  selection_type text not null default 'single' check (selection_type in ('single', 'multiple')),
  required_choice_count integer not null default 1 check (required_choice_count > 0),
  prompt text not null,
  explanation text not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  source_reference text not null,
  content_hash text not null,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (question_id, version_no)
);

alter table public.questions
  add constraint questions_current_version_fk
  foreign key (current_version_id) references public.question_versions(id)
  deferrable initially deferred;

create table public.choices (
  id text primary key,
  question_version_id text not null references public.question_versions(id) on delete cascade,
  label text not null,
  body text not null,
  is_correct boolean not null default false,
  explanation text not null,
  sort_order integer not null check (sort_order >= 0),
  unique (question_version_id, label),
  unique (question_version_id, sort_order)
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  question_version_id text not null references public.question_versions(id),
  reviewer_id uuid not null references auth.users(id),
  review_type text not null check (review_type in ('technical', 'editorial', 'similarity')),
  result text not null check (result in ('approved', 'changes_requested', 'rejected')),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Tokyo',
  role text not null default 'learner' check (role in ('learner', 'reviewer', 'admin')),
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('chapter', 'random', 'wrong', 'review', 'exam')),
  title text not null,
  status public.session_status not null default 'active',
  question_ids text[] not null,
  current_index integer not null default 0 check (current_index >= 0),
  answered_question_ids text[] not null default '{}',
  revision bigint not null default 1,
  started_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create table public.answer_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  question_id text not null,
  selected_choice_ids text[] not null default '{}',
  revision bigint not null default 1,
  device_id text not null,
  updated_at timestamptz not null,
  primary key (user_id, session_id, question_id)
);

create table public.answer_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  question_id text not null,
  question_version_id text not null,
  selected_choice_ids text[] not null,
  is_correct boolean not null,
  answered_at timestamptz not null,
  received_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text
);

create table public.user_question_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  wrong_ever boolean not null default false,
  latest_outcome public.latest_outcome,
  consecutive_correct_after_wrong smallint not null default 0 check (consecutive_correct_after_wrong between 0 and 2),
  recovered_at timestamptz,
  review_stage smallint not null default 0 check (review_stage between 0 and 5),
  next_review_at timestamptz,
  first_attempt_at timestamptz not null,
  last_attempt_at timestamptz not null,
  last_attempt_id uuid not null,
  primary key (user_id, question_id)
);

create table public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table public.content_issues (
  id uuid primary key default gen_random_uuid(),
  question_version_id text not null references public.question_versions(id),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('incorrect_answer', 'unclear', 'outdated', 'typo', 'other')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'rejected')),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_events (
  sequence bigint generated always as identity primary key,
  event_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('session.created', 'draft.saved', 'answer.submitted', 'session.advanced', 'bookmark.changed')),
  entity_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create table public.question_answer_keys (
  question_version_id text primary key,
  correct_choice_ids text[] not null,
  updated_at timestamptz not null default now()
);

create index sync_events_user_sequence_idx on public.sync_events (user_id, sequence);
create index answer_attempts_user_answered_idx on public.answer_attempts (user_id, answered_at desc);
create index user_question_states_review_idx on public.user_question_states (user_id, next_review_at);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger create_profile_after_signup
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.reject_published_question_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception '公開済み問題版は更新・削除できません。新版を作成してください。';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_published_question_versions
before update or delete on public.question_versions
for each row execute function public.reject_published_question_version_mutation();

create function public.validate_sync_answer()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  expected_ids text[];
  submitted_ids text[];
  computed_correct boolean;
begin
  if new.kind <> 'answer.submitted' then
    return new;
  end if;

  select correct_choice_ids into expected_ids
  from public.question_answer_keys
  where question_version_id = new.payload ->> 'questionVersionId';

  if expected_ids is null then
    raise exception '採点対象の問題版が登録されていません。';
  end if;

  select coalesce(array_agg(choice_id order by choice_id), '{}') into submitted_ids
  from jsonb_array_elements_text(new.payload -> 'selectedChoiceIds') as choice_id;
  select array_agg(choice_id order by choice_id) into expected_ids
  from unnest(expected_ids) as choice_id;
  computed_correct := submitted_ids = expected_ids;
  new.payload := jsonb_set(new.payload, '{isCorrect}', to_jsonb(computed_correct), true);
  return new;
end;
$$;

create trigger validate_answer_before_sync_insert
before insert on public.sync_events
for each row execute function public.validate_sync_answer();

revoke all on function public.validate_sync_answer() from public;

alter table public.certifications enable row level security;
alter table public.syllabus_versions enable row level security;
alter table public.chapters enable row level security;
alter table public.learning_objectives enable row level security;
alter table public.questions enable row level security;
alter table public.question_versions enable row level security;
alter table public.choices enable row level security;
alter table public.content_reviews enable row level security;
alter table public.profiles enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.answer_drafts enable row level security;
alter table public.answer_attempts enable row level security;
alter table public.user_question_states enable row level security;
alter table public.bookmarks enable row level security;
alter table public.content_issues enable row level security;
alter table public.sync_events enable row level security;
alter table public.question_answer_keys enable row level security;

create policy certifications_read on public.certifications for select using (active);
create policy published_syllabus_read on public.syllabus_versions for select using (status = 'published');
create policy published_chapters_read on public.chapters for select using (
  exists (select 1 from public.syllabus_versions where syllabus_versions.id = chapters.syllabus_version_id and syllabus_versions.status = 'published')
);
create policy published_objectives_read on public.learning_objectives for select using (
  exists (
    select 1 from public.chapters
    join public.syllabus_versions on syllabus_versions.id = chapters.syllabus_version_id
    where chapters.id = learning_objectives.chapter_id and syllabus_versions.status = 'published'
  )
);
create policy published_questions_read on public.questions for select using (
  exists (select 1 from public.question_versions where question_versions.id = questions.current_version_id and question_versions.status = 'published')
);
create policy published_question_versions_read on public.question_versions for select using (status = 'published');
create policy published_choices_read on public.choices for select using (
  exists (select 1 from public.question_versions where question_versions.id = choices.question_version_id and question_versions.status = 'published')
);

create policy own_profile_read on public.profiles for select using (auth.uid() = id);
create policy own_profile_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = 'learner');

create policy own_sessions_all on public.learning_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_drafts_all on public.answer_drafts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_attempts_read on public.answer_attempts for select using (auth.uid() = user_id);
create policy own_attempts_insert on public.answer_attempts for insert with check (auth.uid() = user_id);
create policy own_states_read on public.user_question_states for select using (auth.uid() = user_id);
create policy own_states_insert on public.user_question_states for insert with check (auth.uid() = user_id);
create policy own_states_update on public.user_question_states for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_bookmarks_all on public.bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_issues_read on public.content_issues for select using (auth.uid() = reporter_id);
create policy own_issues_insert on public.content_issues for insert with check (auth.uid() = reporter_id);
create policy own_sync_events_read on public.sync_events for select using (auth.uid() = user_id);
create policy own_sync_events_insert on public.sync_events for insert with check (auth.uid() = user_id);

insert into public.certifications (code, name) values ('JSTQB-FL', 'JSTQB Foundation Level');
insert into public.syllabus_versions (certification_id, version, status, source_url)
select id, '2023V4.0.J02', 'published', 'https://www.jstqb.jp/syllabus/'
from public.certifications where code = 'JSTQB-FL';

insert into public.question_answer_keys (question_version_id, correct_choice_ids) values
  ('fl-001-v1', array['fl-001-D']),
  ('fl-002-v1', array['fl-002-C']),
  ('fl-003-v1', array['fl-003-B']),
  ('fl-004-v1', array['fl-004-A']),
  ('fl-005-v1', array['fl-005-D']),
  ('fl-006-v1', array['fl-006-C']),
  ('fl-007-v1', array['fl-007-B']),
  ('fl-008-v1', array['fl-008-A']),
  ('fl-009-v1', array['fl-009-D']),
  ('fl-010-v1', array['fl-010-C']),
  ('fl-011-v1', array['fl-011-B']),
  ('fl-012-v1', array['fl-012-A']),
  ('fl-013-v1', array['fl-013-D']),
  ('fl-014-v1', array['fl-014-C']),
  ('fl-015-v1', array['fl-015-B']),
  ('fl-016-v1', array['fl-016-A']),
  ('fl-017-v1', array['fl-017-D']),
  ('fl-018-v1', array['fl-018-C']);
