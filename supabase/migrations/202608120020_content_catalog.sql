do $$
begin
  create type public.content_catalog_channel as enum ('public', 'personal_preview');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.content_catalog_operation as enum ('upsert', 'remove');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.content_catalog_streams (
  syllabus_version_id uuid not null references public.syllabus_versions(id) on delete cascade,
  channel public.content_catalog_channel not null,
  revision bigint not null default 0 check (revision >= 0),
  etag text not null check (etag ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz not null default now(),
  primary key (syllabus_version_id, channel)
);

create table if not exists public.content_catalog_changes (
  syllabus_version_id uuid not null references public.syllabus_versions(id) on delete cascade,
  channel public.content_catalog_channel not null,
  revision bigint not null check (revision > 0),
  question_id text not null,
  question_version_id text not null,
  operation public.content_catalog_operation not null,
  changed_at timestamptz not null default now(),
  primary key (syllabus_version_id, channel, revision, question_version_id, operation)
);

create index if not exists content_catalog_changes_delta_idx
  on public.content_catalog_changes (syllabus_version_id, channel, revision);

alter table public.content_catalog_streams enable row level security;
alter table public.content_catalog_changes enable row level security;

revoke all on table public.content_catalog_streams from public, anon, authenticated;
revoke all on table public.content_catalog_changes from public, anon, authenticated;

comment on table public.content_catalog_streams is
  '問題カタログの単調増加revision。直接公開せず、get_question_catalog_v1だけから参照する。';
comment on table public.content_catalog_changes is
  '問題版の追加・更新とtombstoneをrevision単位で保持する差分ログ。';

create or replace function public.record_content_catalog_change(
  p_syllabus_version_id uuid,
  p_channel public.content_catalog_channel,
  p_question_id text,
  p_stale_version_id text default null,
  p_changed_version_id text default null,
  p_force_stale boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_version_id text;
  next_revision bigint;
  changed_is_selected boolean;
  should_remove boolean;
begin
  if p_channel = 'public'::public.content_catalog_channel then
    select qv.id
      into selected_version_id
      from public.questions q
      join public.question_versions qv on qv.id = q.current_version_id
     where q.id = p_question_id
       and q.retired_at is null
       and qv.syllabus_version_id = p_syllabus_version_id
       and qv.status = 'published'::public.content_status;
  else
    select qv.id
      into selected_version_id
      from public.questions q
      join public.question_versions qv on qv.question_id = q.id
     where q.id = p_question_id
       and q.retired_at is null
       and qv.syllabus_version_id = p_syllabus_version_id
       and qv.status in (
         'published'::public.content_status,
         'reviewing'::public.content_status
       )
     order by qv.version_no desc, qv.id desc
     limit 1;
  end if;

  changed_is_selected := p_changed_version_id is not null
    and p_changed_version_id = selected_version_id;
  should_remove := p_force_stale
    and p_stale_version_id is not null
    and p_stale_version_id is distinct from selected_version_id;

  if not changed_is_selected and not should_remove then
    return;
  end if;

  insert into public.content_catalog_streams (
    syllabus_version_id,
    channel,
    revision,
    etag,
    generated_at
  ) values (
    p_syllabus_version_id,
    p_channel,
    1,
    encode(digest(p_syllabus_version_id::text || ':' || p_channel::text || ':1', 'sha256'), 'hex'),
    clock_timestamp()
  )
  on conflict (syllabus_version_id, channel) do update
    set revision = public.content_catalog_streams.revision + 1,
        etag = encode(
          digest(
            p_syllabus_version_id::text || ':' || p_channel::text || ':' ||
              (public.content_catalog_streams.revision + 1)::text,
            'sha256'
          ),
          'hex'
        ),
        generated_at = clock_timestamp()
  returning revision into next_revision;

  if should_remove then
    insert into public.content_catalog_changes (
      syllabus_version_id,
      channel,
      revision,
      question_id,
      question_version_id,
      operation
    ) values (
      p_syllabus_version_id,
      p_channel,
      next_revision,
      p_question_id,
      p_stale_version_id,
      'remove'::public.content_catalog_operation
    );
  end if;

  if selected_version_id is not null then
    insert into public.content_catalog_changes (
      syllabus_version_id,
      channel,
      revision,
      question_id,
      question_version_id,
      operation
    ) values (
      p_syllabus_version_id,
      p_channel,
      next_revision,
      p_question_id,
      selected_version_id,
      'upsert'::public.content_catalog_operation
    );
  end if;
end;
$$;

revoke all on function public.record_content_catalog_change(
  uuid,
  public.content_catalog_channel,
  text,
  text,
  text,
  boolean
) from public, anon, authenticated;

create or replace function public.track_question_version_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_public_visible boolean := false;
  new_public_visible boolean := false;
  old_preview_visible boolean := false;
  new_preview_visible boolean := false;
  old_current_version_id text;
  new_current_version_id text;
  old_retired_at timestamptz;
  new_retired_at timestamptz;
  previous_preview_version_id text;
begin
  if tg_op <> 'INSERT' then
    select q.current_version_id, q.retired_at
      into old_current_version_id, old_retired_at
      from public.questions q
     where q.id = old.question_id;
    old_public_visible := old.status = 'published'::public.content_status
      and old.id = old_current_version_id
      and old_retired_at is null;
    old_preview_visible := old.status in (
      'published'::public.content_status,
      'reviewing'::public.content_status
    );
  end if;

  if tg_op <> 'DELETE' then
    select q.current_version_id, q.retired_at
      into new_current_version_id, new_retired_at
      from public.questions q
     where q.id = new.question_id;
    new_public_visible := new.status = 'published'::public.content_status
      and new.id = new_current_version_id
      and new_retired_at is null;
    new_preview_visible := new.status in (
      'published'::public.content_status,
      'reviewing'::public.content_status
    );
  end if;

  if tg_op = 'UPDATE' and old.syllabus_version_id <> new.syllabus_version_id then
    if old_public_visible then
      perform public.record_content_catalog_change(
        old.syllabus_version_id,
        'public',
        old.question_id,
        old.id,
        null,
        true
      );
    end if;
    if old_preview_visible then
      perform public.record_content_catalog_change(
        old.syllabus_version_id,
        'personal_preview',
        old.question_id,
        old.id,
        null,
        true
      );
    end if;
  elsif tg_op <> 'INSERT' then
    if old_public_visible or new_public_visible then
      perform public.record_content_catalog_change(
        old.syllabus_version_id,
        'public',
        old.question_id,
        old.id,
        case when tg_op <> 'DELETE' and new_public_visible then new.id else null end,
        old_public_visible
      );
    end if;
    if old_preview_visible or new_preview_visible then
      perform public.record_content_catalog_change(
        old.syllabus_version_id,
        'personal_preview',
        old.question_id,
        old.id,
        case when tg_op <> 'DELETE' and new_preview_visible then new.id else null end,
        old_preview_visible
      );
    end if;
  end if;

  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or old.syllabus_version_id <> new.syllabus_version_id) then
    if new_public_visible then
      perform public.record_content_catalog_change(
        new.syllabus_version_id,
        'public',
        new.question_id,
        null,
        new.id,
        false
      );
    end if;
    if new_preview_visible then
      if tg_op = 'INSERT' then
        select qv.id
          into previous_preview_version_id
          from public.question_versions qv
         where qv.question_id = new.question_id
           and qv.syllabus_version_id = new.syllabus_version_id
           and qv.id <> new.id
           and qv.status in (
             'published'::public.content_status,
             'reviewing'::public.content_status
           )
         order by qv.version_no desc, qv.id desc
         limit 1;
      end if;
      perform public.record_content_catalog_change(
        new.syllabus_version_id,
        'personal_preview',
        new.question_id,
        previous_preview_version_id,
        new.id,
        previous_preview_version_id is not null
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists track_question_version_catalog_change on public.question_versions;
create trigger track_question_version_catalog_change
after insert or update or delete on public.question_versions
for each row execute function public.track_question_version_catalog_change();

create or replace function public.track_question_catalog_dependency_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version_id text;
  target_question_id text;
  target_syllabus_version_id uuid;
  target_status public.content_status;
begin
  if tg_table_name = 'choices' then
    target_version_id := case when tg_op = 'DELETE' then old.question_version_id else new.question_version_id end;
  else
    target_version_id := case when tg_op = 'DELETE' then old.question_version_id else new.question_version_id end;
  end if;

  select qv.question_id, qv.syllabus_version_id, qv.status
    into target_question_id, target_syllabus_version_id, target_status
    from public.question_versions qv
   where qv.id = target_version_id;

  if target_question_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if target_status = 'published'::public.content_status then
    perform public.record_content_catalog_change(
      target_syllabus_version_id,
      'public',
      target_question_id,
      null,
      target_version_id,
      false
    );
  end if;
  if target_status in (
    'published'::public.content_status,
    'reviewing'::public.content_status
  ) then
    perform public.record_content_catalog_change(
      target_syllabus_version_id,
      'personal_preview',
      target_question_id,
      null,
      target_version_id,
      false
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists track_choice_catalog_change on public.choices;
create trigger track_choice_catalog_change
after insert or update or delete on public.choices
for each row execute function public.track_question_catalog_dependency_change();

drop trigger if exists track_answer_key_catalog_change on public.question_answer_keys;
create trigger track_answer_key_catalog_change
after insert or update or delete on public.question_answer_keys
for each row execute function public.track_question_catalog_dependency_change();

create or replace function public.track_learning_metadata_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_version record;
begin
  for affected_version in
    select qv.id, qv.question_id, qv.syllabus_version_id, qv.status
      from public.question_versions qv
      join public.learning_objectives lo on lo.id = qv.learning_objective_id
     where (
       tg_table_name = 'learning_objectives'
       and lo.id = new.id
     ) or (
       tg_table_name = 'chapters'
       and lo.chapter_id = new.id
     )
  loop
    if affected_version.status = 'published'::public.content_status then
      perform public.record_content_catalog_change(
        affected_version.syllabus_version_id,
        'public',
        affected_version.question_id,
        null,
        affected_version.id,
        false
      );
    end if;
    if affected_version.status in (
      'published'::public.content_status,
      'reviewing'::public.content_status
    ) then
      perform public.record_content_catalog_change(
        affected_version.syllabus_version_id,
        'personal_preview',
        affected_version.question_id,
        null,
        affected_version.id,
        false
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists track_learning_objective_catalog_change on public.learning_objectives;
create trigger track_learning_objective_catalog_change
after update of chapter_id, code, title, k_level on public.learning_objectives
for each row execute function public.track_learning_metadata_catalog_change();

drop trigger if exists track_chapter_catalog_change on public.chapters;
create trigger track_chapter_catalog_change
after update of number, title on public.chapters
for each row execute function public.track_learning_metadata_catalog_change();

create or replace function public.track_question_catalog_selection_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_version public.question_versions%rowtype;
  new_version public.question_versions%rowtype;
  old_preview_version_id text;
begin
  if old.current_version_id is not null then
    select * into old_version
      from public.question_versions qv
     where qv.id = old.current_version_id;
  end if;
  if new.current_version_id is not null then
    select * into new_version
      from public.question_versions qv
     where qv.id = new.current_version_id;
  end if;

  if old.current_version_id is distinct from new.current_version_id
    or old.retired_at is distinct from new.retired_at then
    if old.current_version_id is not null
      and old.retired_at is null
      and old_version.status = 'published'::public.content_status then
      perform public.record_content_catalog_change(
        old_version.syllabus_version_id,
        'public',
        old.id,
        old.current_version_id,
        case
          when new.retired_at is null
            and new_version.status = 'published'::public.content_status
            and new_version.syllabus_version_id = old_version.syllabus_version_id
          then new.current_version_id
          else null
        end,
        true
      );
    end if;
    if new.current_version_id is not null
      and new.retired_at is null
      and new_version.status = 'published'::public.content_status
      and (
        old.current_version_id is null
        or old_version.syllabus_version_id is distinct from new_version.syllabus_version_id
        or old.retired_at is not null
      ) then
      perform public.record_content_catalog_change(
        new_version.syllabus_version_id,
        'public',
        new.id,
        null,
        new.current_version_id,
        false
      );
    end if;

    if old.retired_at is null and new.retired_at is not null then
      select qv.id
        into old_preview_version_id
        from public.question_versions qv
       where qv.question_id = old.id
         and qv.status in (
           'published'::public.content_status,
           'reviewing'::public.content_status
         )
       order by qv.version_no desc, qv.id desc
       limit 1;
      if old_preview_version_id is not null then
        select qv.syllabus_version_id into old_version.syllabus_version_id
          from public.question_versions qv
         where qv.id = old_preview_version_id;
        perform public.record_content_catalog_change(
          old_version.syllabus_version_id,
          'personal_preview',
          old.id,
          old_preview_version_id,
          null,
          true
        );
      end if;
    elsif old.retired_at is not null and new.retired_at is null then
      select qv.id, qv.syllabus_version_id
        into old_preview_version_id, old_version.syllabus_version_id
        from public.question_versions qv
       where qv.question_id = new.id
         and qv.status in (
           'published'::public.content_status,
           'reviewing'::public.content_status
         )
       order by qv.version_no desc, qv.id desc
       limit 1;
      if old_preview_version_id is not null then
        perform public.record_content_catalog_change(
          old_version.syllabus_version_id,
          'personal_preview',
          new.id,
          null,
          old_preview_version_id,
          false
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists track_question_catalog_selection_change on public.questions;
create trigger track_question_catalog_selection_change
after update of current_version_id, retired_at on public.questions
for each row execute function public.track_question_catalog_selection_change();

create or replace function public.get_question_catalog_v1(
  certification_code text,
  syllabus_version text,
  since_revision bigint default null,
  channel text default 'public'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_syllabus_version_id uuid;
  target_channel public.content_catalog_channel;
  current_revision bigint;
  current_etag text;
  current_generated_at timestamptz;
  is_full_snapshot boolean;
  result_questions jsonb;
  result_removed_version_ids jsonb;
  result_payload jsonb;
  selected_question_count integer;
  invalid_question_count integer;
begin
  if certification_code is null
    or length(certification_code) < 1
    or length(certification_code) > 64 then
    raise exception using errcode = '22023', message = '資格コードは1〜64文字で指定してください。';
  end if;
  if syllabus_version is null
    or length(syllabus_version) < 1
    or length(syllabus_version) > 64 then
    raise exception using errcode = '22023', message = 'シラバス版は1〜64文字で指定してください。';
  end if;
  if channel not in ('public', 'personal_preview') then
    raise exception using errcode = '22023', message = '未対応のカタログchannelです。';
  end if;
  if since_revision is not null and since_revision < 0 then
    raise exception using errcode = '22023', message = 'sinceRevisionは0以上で指定してください。';
  end if;

  target_channel := channel::public.content_catalog_channel;
  if target_channel = 'personal_preview'::public.content_catalog_channel
    and not exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.role in ('reviewer', 'admin')
    ) then
    raise exception using errcode = '42501', message = 'personal_previewを取得する権限がありません。';
  end if;

  select sv.id
    into target_syllabus_version_id
    from public.syllabus_versions sv
    join public.certifications c on c.id = sv.certification_id
   where c.code = certification_code
     and sv.version = syllabus_version
     and c.active;

  if target_syllabus_version_id is null then
    raise exception using errcode = '22023', message = '指定した資格・シラバス版は存在しません。';
  end if;

  select s.revision, s.etag, s.generated_at
    into current_revision, current_etag, current_generated_at
    from public.content_catalog_streams s
   where s.syllabus_version_id = target_syllabus_version_id
     and s.channel = target_channel;

  current_revision := coalesce(current_revision, 0);
  current_etag := coalesce(
    current_etag,
    encode(
      digest(target_syllabus_version_id::text || ':' || target_channel::text || ':0', 'sha256'),
      'hex'
    )
  );
  current_generated_at := coalesce(current_generated_at, now());

  if since_revision is not null and since_revision > current_revision then
    raise exception using errcode = '22023', message = 'sinceRevisionが現在のrevisionを超えています。';
  end if;
  is_full_snapshot := since_revision is null;

  with selected_versions as (
    select distinct on (q.id)
      q.id as question_id,
      qv.id as question_version_id,
      qv.version_no,
      qv.status,
      qv.selection_type,
      qv.required_choice_count,
      qv.prompt,
      qv.explanation,
      qv.difficulty,
      qv.source_reference,
      qv.content_hash,
      qv.shuffle_choices,
      sv.version as syllabus_version,
      ch.number as chapter_number,
      ch.title as chapter_title,
      lo.code as objective_code,
      lo.title as objective_title,
      lo.k_level
    from public.questions q
    join public.question_versions qv on qv.question_id = q.id
    join public.syllabus_versions sv on sv.id = qv.syllabus_version_id
    join public.learning_objectives lo on lo.id = qv.learning_objective_id
    join public.chapters ch on ch.id = lo.chapter_id
    where q.retired_at is null
      and qv.syllabus_version_id = target_syllabus_version_id
      and (
        (
          target_channel = 'public'::public.content_catalog_channel
          and q.current_version_id = qv.id
          and qv.status = 'published'::public.content_status
        )
        or (
          target_channel = 'personal_preview'::public.content_catalog_channel
          and qv.status in (
            'published'::public.content_status,
            'reviewing'::public.content_status
          )
        )
      )
    order by q.id, qv.version_no desc, qv.id desc
  ), changed_versions as (
    select sv.*
      from selected_versions sv
     where is_full_snapshot
        or exists (
          select 1
            from public.content_catalog_changes cc
           where cc.syllabus_version_id = target_syllabus_version_id
             and cc.channel = target_channel
             and cc.revision > since_revision
             and cc.revision <= current_revision
             and cc.question_version_id = sv.question_version_id
             and cc.operation = 'upsert'::public.content_catalog_operation
        )
  ), prepared_questions as (
    select
      cv.*,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'label', c.label,
              'body', c.body,
              'explanation', c.explanation,
              'isCorrect', c.is_correct
            ) order by c.sort_order
          )
          from public.choices c
          where c.question_version_id = cv.question_version_id
        ),
        '[]'::jsonb
      ) as choices_json,
      coalesce(to_jsonb(qak.correct_choice_ids), '[]'::jsonb) as correct_choice_ids_json,
      coalesce(cardinality(qak.correct_choice_ids), 0) as answer_key_count,
      coalesce(
        (
          select array_agg(c.id order by c.id)
            from public.choices c
           where c.question_version_id = cv.question_version_id
             and c.is_correct
        ) = (
          select array_agg(answer_choice_id order by answer_choice_id)
            from unnest(qak.correct_choice_ids) answer_choice_id
        ),
        false
      ) as answer_key_matches,
      (
        select count(*)::integer
          from public.choices c
         where c.question_version_id = cv.question_version_id
           and c.is_correct
      ) as correct_choice_count,
      (
        select count(*)::integer
          from public.choices c
         where c.question_version_id = cv.question_version_id
      ) as choice_count
    from changed_versions cv
    left join public.question_answer_keys qak
      on qak.question_version_id = cv.question_version_id
  )
  select
    count(*)::integer,
    count(*) filter (
      where choice_count < 2
         or answer_key_count <> required_choice_count
         or correct_choice_count <> required_choice_count
         or not answer_key_matches
         or (
           selection_type = 'single' and required_choice_count <> 1
         )
         or (
           selection_type = 'multiple' and required_choice_count < 2
         )
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', question_id,
          'versionId', question_version_id,
          'versionNumber', version_no,
          'status', status::text,
          'syllabusVersion', syllabus_version,
          'chapterNumber', chapter_number,
          'chapterTitle', chapter_title,
          'objectiveCode', objective_code,
          'objectiveTitle', objective_title,
          'kLevel', k_level,
          'difficulty', difficulty,
          'selectionType', selection_type,
          'requiredChoiceCount', required_choice_count,
          'shuffleChoices', shuffle_choices,
          'prompt', prompt,
          'explanation', explanation,
          'sourceReference', source_reference,
          'contentHash', content_hash,
          'choices', choices_json,
          'correctChoiceIds', correct_choice_ids_json
        ) order by question_id
      ),
      '[]'::jsonb
    )
  into selected_question_count, invalid_question_count, result_questions
  from prepared_questions;

  if selected_question_count > 2000 then
    raise exception using errcode = '54000', message = 'カタログ上限2000問を超えています。';
  end if;
  if invalid_question_count > 0 then
    raise exception using errcode = '23514', message = '正答集合または選択数が不整合な問題版を検出しました。';
  end if;

  if is_full_snapshot then
    result_removed_version_ids := '[]'::jsonb;
  else
    with current_version_ids as (
      select qv.id
        from public.questions q
        join public.question_versions qv on qv.question_id = q.id
       where q.retired_at is null
         and qv.syllabus_version_id = target_syllabus_version_id
         and (
           (
             target_channel = 'public'::public.content_catalog_channel
             and q.current_version_id = qv.id
             and qv.status = 'published'::public.content_status
           )
           or (
             target_channel = 'personal_preview'::public.content_catalog_channel
             and qv.status in (
               'published'::public.content_status,
               'reviewing'::public.content_status
             )
             and not exists (
               select 1
                 from public.question_versions newer
                where newer.question_id = qv.question_id
                  and newer.syllabus_version_id = qv.syllabus_version_id
                  and newer.status in (
                    'published'::public.content_status,
                    'reviewing'::public.content_status
                  )
                  and (newer.version_no, newer.id) > (qv.version_no, qv.id)
             )
           )
         )
    )
    select coalesce(jsonb_agg(removed.question_version_id order by removed.question_version_id), '[]'::jsonb)
      into result_removed_version_ids
      from (
        select distinct cc.question_version_id
          from public.content_catalog_changes cc
         where cc.syllabus_version_id = target_syllabus_version_id
           and cc.channel = target_channel
           and cc.revision > since_revision
           and cc.revision <= current_revision
           and cc.operation = 'remove'::public.content_catalog_operation
           and not exists (
             select 1
               from current_version_ids current_ids
              where current_ids.id = cc.question_version_id
           )
      ) removed;
  end if;

  result_payload := jsonb_build_object(
    'schema', 'question-catalog.v1',
    'certificationCode', certification_code,
    'syllabusVersion', syllabus_version,
    'channel', target_channel::text,
    'revision', current_revision,
    'etag', current_etag,
    'generatedAt', current_generated_at,
    'fullSnapshot', is_full_snapshot,
    'questions', result_questions,
    'removedVersionIds', result_removed_version_ids
  );

  if octet_length(result_payload::text) > 10485760 then
    raise exception using errcode = '54000', message = 'カタログ応答上限10MiBを超えています。';
  end if;

  return result_payload;
end;
$$;

revoke all on function public.get_question_catalog_v1(text, text, bigint, text) from public;
grant execute on function public.get_question_catalog_v1(text, text, bigint, text) to anon, authenticated;

comment on function public.get_question_catalog_v1(text, text, bigint, text) is
  '公開済み問題または権限付き個人プレビューを、revision差分とtombstone付きで返す。';

insert into public.content_catalog_streams (
  syllabus_version_id,
  channel,
  revision,
  etag,
  generated_at
)
select
  sv.id,
  catalog_channel.channel,
  case when exists (
    select 1
      from public.questions q
      join public.question_versions qv on qv.question_id = q.id
     where qv.syllabus_version_id = sv.id
       and q.retired_at is null
       and (
         (
           catalog_channel.channel = 'public'::public.content_catalog_channel
           and q.current_version_id = qv.id
           and qv.status = 'published'::public.content_status
         )
         or (
           catalog_channel.channel = 'personal_preview'::public.content_catalog_channel
           and qv.status in (
             'published'::public.content_status,
             'reviewing'::public.content_status
           )
         )
       )
  ) then 1 else 0 end,
  encode(
    digest(
      sv.id::text || ':' || catalog_channel.channel::text || ':' ||
      case when exists (
        select 1
          from public.questions q
          join public.question_versions qv on qv.question_id = q.id
         where qv.syllabus_version_id = sv.id
           and q.retired_at is null
           and (
             (
               catalog_channel.channel = 'public'::public.content_catalog_channel
               and q.current_version_id = qv.id
               and qv.status = 'published'::public.content_status
             )
             or (
               catalog_channel.channel = 'personal_preview'::public.content_catalog_channel
               and qv.status in (
                 'published'::public.content_status,
                 'reviewing'::public.content_status
               )
             )
           )
      ) then '1' else '0' end,
      'sha256'
    ),
    'hex'
  ),
  now()
from public.syllabus_versions sv
cross join (
  values
    ('public'::public.content_catalog_channel),
    ('personal_preview'::public.content_catalog_channel)
) as catalog_channel(channel)
on conflict (syllabus_version_id, channel) do nothing;

insert into public.content_catalog_changes (
  syllabus_version_id,
  channel,
  revision,
  question_id,
  question_version_id,
  operation
)
select
  qv.syllabus_version_id,
  'public'::public.content_catalog_channel,
  1,
  q.id,
  qv.id,
  'upsert'::public.content_catalog_operation
from public.questions q
join public.question_versions qv on qv.id = q.current_version_id
where q.retired_at is null
  and qv.status = 'published'::public.content_status
on conflict do nothing;

insert into public.content_catalog_changes (
  syllabus_version_id,
  channel,
  revision,
  question_id,
  question_version_id,
  operation
)
select distinct on (q.id, qv.syllabus_version_id)
  qv.syllabus_version_id,
  'personal_preview'::public.content_catalog_channel,
  1,
  q.id,
  qv.id,
  'upsert'::public.content_catalog_operation
from public.questions q
join public.question_versions qv on qv.question_id = q.id
where q.retired_at is null
  and qv.status in (
    'published'::public.content_status,
    'reviewing'::public.content_status
  )
order by q.id, qv.syllabus_version_id, qv.version_no desc, qv.id desc
on conflict do nothing;
