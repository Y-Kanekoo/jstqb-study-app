do $$
begin
  create type public.question_version_compatibility as enum ('cosmetic', 'compatible', 'breaking');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.content_import_status as enum ('staged', 'applied', 'rolled_back');
exception
  when duplicate_object then null;
end;
$$;

alter table public.question_versions
  add column if not exists compatibility public.question_version_compatibility not null default 'compatible',
  add column if not exists shuffle_choices boolean not null default true,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table public.content_reviews
  alter column reviewer_id drop not null,
  add column if not exists reviewer_label text not null default '未設定';

create table if not exists public.content_imports (
  id uuid primary key default gen_random_uuid(),
  bundle_id text not null unique,
  bundle_hash text not null check (bundle_hash ~ '^[a-f0-9]{64}$'),
  certification_code text not null,
  syllabus_version text not null,
  question_count integer not null check (question_count > 0),
  status public.content_import_status not null default 'staged',
  source_filename text not null,
  summary_json jsonb not null default '{}'::jsonb,
  applied_by uuid references auth.users(id),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

alter table public.content_imports enable row level security;

comment on table public.content_imports is
  '非公開問題バンドルの投入・ロールバック追跡。service_roleだけが操作する。';

comment on column public.question_versions.metadata_json is
  '作成記録など、問題の採点内容ではない来歴情報。正答はquestion_answer_keysへ分離する。';
