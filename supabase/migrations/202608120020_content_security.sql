-- 公開コンテンツの採点情報分離、採点前catalog、DB監査済みrelease gate。
-- 既存migrationは変更せず、公開権限を追加migrationで撤回する。

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('learner', 'reviewer', 'admin', 'owner'));

create table if not exists public.content_release_approvals (
  id uuid primary key default gen_random_uuid(),
  bundle_id text not null,
  canonical_hash text not null check (canonical_hash ~ '^[a-f0-9]{64}$'),
  author_id uuid not null references auth.users(id),
  technical_reviewer_id uuid not null references auth.users(id),
  editorial_reviewer_id uuid not null references auth.users(id),
  final_approver_id uuid not null references auth.users(id),
  final_approver_role text not null check (final_approver_role in ('admin', 'owner')),
  approved_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create unique index if not exists content_release_approvals_bundle_hash_idx
  on public.content_release_approvals (bundle_id, canonical_hash);

create table if not exists public.content_release_audit (
  id uuid primary key default gen_random_uuid(),
  bundle_id text not null,
  raw_hash text not null check (raw_hash ~ '^[a-f0-9]{64}$'),
  canonical_hash text not null check (canonical_hash ~ '^[a-f0-9]{64}$'),
  approval_id uuid not null references public.content_release_approvals(id),
  author_id uuid not null references auth.users(id),
  technical_reviewer_id uuid not null references auth.users(id),
  editorial_reviewer_id uuid not null references auth.users(id),
  final_approver_id uuid not null references auth.users(id),
  final_approver_role text not null check (final_approver_role in ('admin', 'owner')),
  approved_at timestamptz not null,
  audited_at timestamptz not null default clock_timestamp(),
  unique (bundle_id, canonical_hash)
);

alter table public.content_release_approvals
  add constraint content_release_approvals_distinct_people
  check (
    author_id <> technical_reviewer_id
    and author_id <> editorial_reviewer_id
    and author_id <> final_approver_id
    and technical_reviewer_id <> editorial_reviewer_id
    and technical_reviewer_id <> final_approver_id
    and editorial_reviewer_id <> final_approver_id
  );

alter table public.content_release_audit
  add constraint content_release_audit_distinct_people
  check (
    author_id <> technical_reviewer_id
    and author_id <> editorial_reviewer_id
    and author_id <> final_approver_id
    and technical_reviewer_id <> editorial_reviewer_id
    and technical_reviewer_id <> final_approver_id
    and editorial_reviewer_id <> final_approver_id
  );

alter table public.content_release_approvals enable row level security;
alter table public.content_release_audit enable row level security;
revoke all on table public.content_release_approvals from public, anon, authenticated;
revoke all on table public.content_release_audit from public, anon, authenticated;

alter table public.content_imports
  add column if not exists raw_hash text check (raw_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists canonical_hash text check (canonical_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists release_approval_id uuid references public.content_release_approvals(id),
  add column if not exists release_audit_id uuid references public.content_release_audit(id);

revoke all on table public.questions from public, anon, authenticated;
revoke all on table public.question_versions from public, anon, authenticated;
revoke all on table public.choices from public, anon, authenticated;
revoke all on table public.question_answer_keys from public, anon, authenticated;
revoke all on table public.answer_attempts from public, anon, authenticated;
revoke all on table public.content_reviews from public, anon, authenticated;
create or replace function public.get_learner_question_catalog()
returns table (
  question_id text,
  question_version_id text,
  version_no integer,
  syllabus_version_id uuid,
  learning_objective_id uuid,
  selection_type text,
  required_choice_count integer,
  prompt text,
  difficulty smallint,
  shuffle_choices boolean,
  choice_id text,
  choice_label text,
  choice_body text,
  sort_order integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '認証が必要です。';
  end if;
  return query
  select
    q.id, qv.id, qv.version_no, qv.syllabus_version_id, qv.learning_objective_id,
    qv.selection_type, qv.required_choice_count, qv.prompt, qv.difficulty,
    qv.shuffle_choices, c.id, c.label, c.body, c.sort_order
  from public.questions q
  join public.question_versions qv on qv.id = q.current_version_id
  join public.choices c on c.question_version_id = qv.id
  where q.retired_at is null
    and qv.status = 'published'::public.content_status
  order by q.id, c.sort_order;
end;
$$;

create or replace function public.record_content_release_approval(
  p_bundle_id text,
  p_canonical_hash text,
  p_author_id uuid,
  p_technical_reviewer_id uuid,
  p_editorial_reviewer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  final_approver_id uuid := auth.uid();
  author_role text;
  technical_reviewer_role text;
  editorial_reviewer_role text;
  final_approver_role text;
  approval_id uuid;
begin
  if final_approver_id is null then
    raise exception '認証が必要です。';
  end if;
  if p_author_id is null or p_technical_reviewer_id is null or p_editorial_reviewer_id is null
    or p_author_id in (p_technical_reviewer_id, p_editorial_reviewer_id, final_approver_id)
    or p_technical_reviewer_id in (p_editorial_reviewer_id, final_approver_id)
    or p_editorial_reviewer_id = final_approver_id then
    raise exception '作者・技術レビュー・表記レビュー・最終承認者は全員別の認証主体が必要です。';
  end if;
  select role into author_role
    from public.profiles
   where id = p_author_id
     and role in ('learner', 'reviewer', 'admin', 'owner');
  select role into technical_reviewer_role
    from public.profiles
   where id = p_technical_reviewer_id
     and role in ('reviewer', 'admin', 'owner');
  select role into editorial_reviewer_role
    from public.profiles
   where id = p_editorial_reviewer_id
     and role in ('reviewer', 'admin', 'owner');
  select role into final_approver_role
    from public.profiles
   where id = final_approver_id
     and role in ('admin', 'owner');
  if author_role is null or technical_reviewer_role is null
    or editorial_reviewer_role is null or final_approver_role is null then
    raise exception 'release承認権限がありません。';
  end if;
  if p_bundle_id is null or p_canonical_hash is null or p_canonical_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'release承認対象が不正です。';
  end if;

  insert into public.content_release_approvals (
    bundle_id, canonical_hash, author_id, technical_reviewer_id,
    editorial_reviewer_id, final_approver_id, final_approver_role
  ) values (
    p_bundle_id, p_canonical_hash, p_author_id, p_technical_reviewer_id,
    p_editorial_reviewer_id, final_approver_id, final_approver_role
  )
  on conflict (bundle_id, canonical_hash) do update
    set author_id = excluded.author_id,
        technical_reviewer_id = excluded.technical_reviewer_id,
        editorial_reviewer_id = excluded.editorial_reviewer_id,
        final_approver_id = excluded.final_approver_id,
        final_approver_role = excluded.final_approver_role,
        approved_at = clock_timestamp()
  returning id into approval_id;
  return approval_id;
end;
$$;

create or replace function public.assert_content_release_gate(
  p_bundle_id text,
  p_raw_hash text,
  p_canonical_hash text,
  p_approval_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval public.content_release_approvals%rowtype;
  existing_audit public.content_release_audit%rowtype;
  current_author_role text;
  current_technical_role text;
  current_editorial_role text;
  current_final_role text;
begin
  if p_raw_hash !~ '^[a-f0-9]{64}$' or p_canonical_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'raw hashまたはcanonical hashが不正です。';
  end if;
  select * into approval
    from public.content_release_approvals
   where id = p_approval_id
     and bundle_id = p_bundle_id
     and canonical_hash = p_canonical_hash
     and approved_at <= clock_timestamp()
     and final_approver_role in ('admin', 'owner');
  if not found then
    raise exception 'DB監査済みrelease承認が見つかりません。';
  end if;

  select role into current_author_role from public.profiles
   where id = approval.author_id and role in ('learner', 'reviewer', 'admin', 'owner');
  select role into current_technical_role from public.profiles
   where id = approval.technical_reviewer_id and role in ('reviewer', 'admin', 'owner');
  select role into current_editorial_role from public.profiles
   where id = approval.editorial_reviewer_id and role in ('reviewer', 'admin', 'owner');
  select role into current_final_role from public.profiles
   where id = approval.final_approver_id and role in ('admin', 'owner');
  if current_author_role is null or current_technical_role is null
    or current_editorial_role is null or current_final_role is null then
    raise exception 'release承認者のDB roleが現在の権限条件を満たしません。';
  end if;

  select * into existing_audit
    from public.content_release_audit
   where bundle_id = p_bundle_id
     and canonical_hash = p_canonical_hash;
  if found and existing_audit.approval_id <> approval.id then
    raise exception '同一canonical hashに異なるrelease承認があります。';
  end if;
  if not found then
    insert into public.content_release_audit (
      bundle_id, raw_hash, canonical_hash, approval_id, author_id,
      technical_reviewer_id, editorial_reviewer_id, final_approver_id,
      final_approver_role, approved_at
    ) values (
      p_bundle_id, p_raw_hash, p_canonical_hash, approval.id, approval.author_id,
      approval.technical_reviewer_id, approval.editorial_reviewer_id,
      approval.final_approver_id, approval.final_approver_role, approval.approved_at
    );
  end if;
end;
$$;

revoke all on function public.get_learner_question_catalog() from public, anon, authenticated;
grant execute on function public.get_learner_question_catalog() to authenticated;
revoke all on function public.record_content_release_approval(text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_content_release_approval(text, text, uuid, uuid, uuid) to authenticated;
revoke all on function public.assert_content_release_gate(text, text, text, uuid) from public, anon, authenticated;
-- assert_content_release_gateは生成seed SQLを実行するservice_role専用。
grant execute on function public.assert_content_release_gate(text, text, text, uuid) to service_role;

-- セッションとdraftは既存同期契約を維持し、採点結果を直接書き込める権限だけを撤回する。
revoke insert, update, delete on table public.answer_attempts from public, anon, authenticated;
