begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into public.chapters (id, syllabus_version_id, number, title)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sv.id,
  1,
  'テストの基礎'
from public.syllabus_versions sv
join public.certifications c on c.id = sv.certification_id
where c.code = 'JSTQB-FL'
  and sv.version = '2023V4.0.J02';

insert into public.learning_objectives (id, chapter_id, code, title, k_level)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'FL-1.1.1',
  'テストの目的を識別する',
  2
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  created_at,
  updated_at
) values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'reviewer@example.test',
    '',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'learner@example.test',
    '',
    now(),
    now()
  );

update public.profiles
set role = 'reviewer'
where id = '11111111-1111-4111-8111-111111111111';

insert into public.questions (id, certification_id)
select sample.id, c.id
from public.certifications c
cross join (values ('catalog-public'), ('catalog-review')) sample(id)
where c.code = 'JSTQB-FL';

insert into public.question_versions (
  id,
  question_id,
  version_no,
  syllabus_version_id,
  learning_objective_id,
  status,
  selection_type,
  required_choice_count,
  prompt,
  explanation,
  difficulty,
  source_reference,
  content_hash,
  shuffle_choices
)
select
  sample.version_id,
  sample.question_id,
  1,
  sv.id,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sample.status::public.content_status,
  'single',
  1,
  sample.prompt,
  '総合解説',
  2,
  'JSTQB FL 2023V4.0.J02 1.1節 / FL-1.1.1',
  encode(digest(sample.version_id, 'sha256'), 'hex'),
  true
from public.syllabus_versions sv
join public.certifications c on c.id = sv.certification_id
cross join (
  values
    ('catalog-public-v1', 'catalog-public', 'published', 'PUBLIC_PROMPT'),
    ('catalog-review-v1', 'catalog-review', 'reviewing', 'SECRET_REVIEW_PROMPT')
) sample(version_id, question_id, status, prompt)
where c.code = 'JSTQB-FL'
  and sv.version = '2023V4.0.J02';

insert into public.choices (
  id,
  question_version_id,
  label,
  body,
  is_correct,
  explanation,
  sort_order
)
select
  qv.id || '-' || choice.label,
  qv.id,
  choice.label,
  choice.body,
  choice.is_correct,
  choice.explanation,
  choice.sort_order
from public.question_versions qv
cross join (
  values
    ('A', '正答', true, '正答の根拠', 0),
    ('B', '誤答', false, '誤答の根拠', 1)
) choice(label, body, is_correct, explanation, sort_order)
where qv.id in ('catalog-public-v1', 'catalog-review-v1');

insert into public.question_answer_keys (question_version_id, correct_choice_ids)
values
  ('catalog-public-v1', array['catalog-public-v1-A']),
  ('catalog-review-v1', array['catalog-review-v1-A'])
on conflict (question_version_id) do update
set correct_choice_ids = excluded.correct_choice_ids;

update public.questions
set current_version_id = 'catalog-public-v1'
where id = 'catalog-public';

set local role anon;

select is(
  jsonb_array_length(
    public.get_question_catalog_v1(
      'JSTQB-FL',
      '2023V4.0.J02',
      null,
      'public'
    ) -> 'questions'
  ),
  1,
  '匿名publicはcurrentのpublished問題だけを取得する'
);

select unlike(
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    null,
    'public'
  )::text,
  '%SECRET_REVIEW_PROMPT%',
  'public応答へreviewing内容を漏えいしない'
);

select throws_ok(
  $$select public.get_question_catalog_v1('JSTQB-FL', '2023V4.0.J02', null, 'personal_preview')$$,
  '42501',
  'personal_previewを取得する権限がありません。',
  '匿名利用者はpersonal_previewを取得できない'
);

select throws_ok(
  $$select count(*) from public.content_catalog_streams$$,
  '42501',
  null,
  '匿名利用者は内部revision表を直接参照できない'
);

reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;

select throws_ok(
  $$select public.get_question_catalog_v1('JSTQB-FL', '2023V4.0.J02', null, 'personal_preview')$$,
  '42501',
  'personal_previewを取得する権限がありません。',
  'learnerはpersonal_previewを取得できない'
);

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;

select is(
  jsonb_array_length(
    public.get_question_catalog_v1(
      'JSTQB-FL',
      '2023V4.0.J02',
      null,
      'personal_preview'
    ) -> 'questions'
  ),
  2,
  'reviewerはpublishedとreviewingの最新問題版を取得する'
);

select like(
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    null,
    'personal_preview'
  )::text,
  '%SECRET_REVIEW_PROMPT%',
  'reviewerのpersonal_previewにreviewing内容を含める'
);

select unlike(
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    null,
    'personal_preview'
  )::text,
  '%reviewer@example.test%',
  'カタログへ作成者・reviewer識別情報を含めない'
);

select throws_ok(
  $$select count(*) from public.content_catalog_changes$$,
  '42501',
  null,
  '認証済み利用者も内部差分表を直接参照できない'
);

reset role;

create temporary table catalog_test_revision (revision bigint not null);
insert into catalog_test_revision
select (
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    null,
    'personal_preview'
  ) ->> 'revision'
)::bigint;

update public.question_versions
set status = 'suspended'
where id = 'catalog-review-v1';

select ok(
  (
    public.get_question_catalog_v1(
      'JSTQB-FL',
      '2023V4.0.J02',
      null,
      'personal_preview'
    ) ->> 'revision'
  )::bigint > (select revision from catalog_test_revision),
  '問題停止でrevisionが単調増加する'
);

select is(
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    (select revision from catalog_test_revision),
    'personal_preview'
  ) -> 'removedVersionIds',
  '["catalog-review-v1"]'::jsonb,
  '停止した問題版をtombstone差分で返す'
);

select is(
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    (
      public.get_question_catalog_v1(
        'JSTQB-FL',
        '2023V4.0.J02',
        null,
        'personal_preview'
      ) ->> 'revision'
    )::bigint,
    'personal_preview'
  ) -> 'questions',
  '[]'::jsonb,
  '最新revisionからの差分は空になる'
);

select throws_ok(
  $$select public.get_question_catalog_v1(repeat('X', 65), '2023V4.0.J02', null, 'public')$$,
  '22023',
  '資格コードは1〜64文字で指定してください。',
  '入力サイズ上限を検証する'
);

select throws_ok(
  $$select public.get_question_catalog_v1('JSTQB-FL', '2023V4.0.J02', 9223372036854775807, 'public')$$,
  '22023',
  'sinceRevisionが現在のrevisionを超えています。',
  '未来revisionを拒否する'
);

select is(
  public.get_question_catalog_v1(
    'JSTQB-FL',
    '2023V4.0.J02',
    null,
    'public'
  ) ->> 'schema',
  'question-catalog.v1',
  'RPCのschema識別子を固定する'
);

insert into public.questions (id, certification_id)
select 'catalog-size-' || series.number, c.id
from public.certifications c
cross join generate_series(1, 2001) series(number)
where c.code = 'JSTQB-FL';

insert into public.question_versions (
  id,
  question_id,
  version_no,
  syllabus_version_id,
  learning_objective_id,
  status,
  selection_type,
  required_choice_count,
  prompt,
  explanation,
  difficulty,
  source_reference,
  content_hash,
  shuffle_choices
)
select
  q.id || '-v1',
  q.id,
  1,
  sv.id,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'reviewing',
  'single',
  1,
  '出力上限試験',
  '総合解説',
  1,
  'JSTQB FL 2023V4.0.J02 1.1節 / FL-1.1.1',
  encode(digest(q.id, 'sha256'), 'hex'),
  true
from public.questions q
cross join public.syllabus_versions sv
join public.certifications c on c.id = sv.certification_id
where q.id like 'catalog-size-%'
  and c.code = 'JSTQB-FL'
  and sv.version = '2023V4.0.J02';

insert into public.choices (
  id,
  question_version_id,
  label,
  body,
  is_correct,
  explanation,
  sort_order
)
select
  qv.id || '-' || choice.label,
  qv.id,
  choice.label,
  choice.body,
  choice.is_correct,
  choice.explanation,
  choice.sort_order
from public.question_versions qv
cross join (
  values
    ('A', '正答', true, '正答の根拠', 0),
    ('B', '誤答', false, '誤答の根拠', 1)
) choice(label, body, is_correct, explanation, sort_order)
where qv.id like 'catalog-size-%';

insert into public.question_answer_keys (question_version_id, correct_choice_ids)
select qv.id, array[qv.id || '-A']
from public.question_versions qv
where qv.id like 'catalog-size-%';

select throws_ok(
  $$select public.get_question_catalog_v1('JSTQB-FL', '2023V4.0.J02', null, 'personal_preview')$$,
  '54000',
  'カタログ上限2000問を超えています。',
  'カタログ問題数の出力上限を強制する'
);

select * from finish();
rollback;
