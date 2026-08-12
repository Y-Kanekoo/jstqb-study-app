-- 001相当のスキーマへ適用する、既存利用者データの最小fixture。
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'upgrade-harness@example.invalid',
  crypt('upgrade-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.chapters (id, syllabus_version_id, number, title, exam_weight)
select 'a2000000-0000-4000-8000-000000000001', syllabus.id, 1,
       'upgrade fixture chapter', null
from public.syllabus_versions as syllabus
where syllabus.version = '2023V4.0.J02';

insert into public.learning_objectives (
  id, chapter_id, code, title, k_level, minimum_question_count
)
values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'UPGRADE-HARNESS-K1', 'upgrade fixture objective', 1, 0
);

insert into public.questions (id, certification_id, current_version_id, created_at)
select question_id, certification.id, null, now()
from (values ('upgrade-q-1'), ('upgrade-q-2'), ('upgrade-q-missing')) as fixture(question_id)
cross join public.certifications as certification
where certification.code = 'JSTQB-FL';

insert into public.question_versions (
  id, question_id, version_no, syllabus_version_id, learning_objective_id,
  status, selection_type, required_choice_count, prompt, explanation,
  difficulty, source_reference, content_hash, published_at
)
select fixture.version_id, fixture.question_id, 1, syllabus.id,
       'a3000000-0000-4000-8000-000000000001', 'published', 'single', 1,
       fixture.prompt, fixture.explanation, 1, 'upgrade fixture',
       encode(extensions.digest(fixture.version_id, 'sha256'), 'hex'), now()
from (values
  ('upgrade-q-1-v1', 'upgrade-q-1', 'upgrade prompt 1', 'upgrade explanation 1'),
  ('upgrade-q-2-v1', 'upgrade-q-2', 'upgrade prompt 2', 'upgrade explanation 2')
) as fixture(version_id, question_id, prompt, explanation)
cross join public.syllabus_versions as syllabus
where syllabus.version = '2023V4.0.J02';

insert into public.choices (
  id, question_version_id, label, body, is_correct, explanation, sort_order
)
values
  ('upgrade-q-1-v1-A', 'upgrade-q-1-v1', 'A', 'upgrade choice 1A', true, 'correct', 0),
  ('upgrade-q-1-v1-B', 'upgrade-q-1-v1', 'B', 'upgrade choice 1B', false, 'wrong', 1),
  ('upgrade-q-2-v1-A', 'upgrade-q-2-v1', 'A', 'upgrade choice 2A', true, 'correct', 0),
  ('upgrade-q-2-v1-B', 'upgrade-q-2-v1', 'B', 'upgrade choice 2B', false, 'wrong', 1);

insert into public.question_answer_keys (question_version_id, correct_choice_ids)
values
  ('upgrade-q-1-v1', array['upgrade-q-1-v1-A']),
  ('upgrade-q-2-v1', array['upgrade-q-2-v1-A']);

update public.questions
set current_version_id = id || '-v1'
where id in ('upgrade-q-1', 'upgrade-q-2');

insert into public.learning_sessions (
  id, user_id, mode, title, status, question_ids, current_index,
  answered_question_ids, revision, started_at, updated_at
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'random', 'upgrade normal session', 'active',
  array['upgrade-q-1', 'upgrade-q-2'], 0, '{}', 1,
  '2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'
);

insert into public.answer_attempts (
  id, user_id, session_id, question_id, question_version_id,
  selected_choice_ids, is_correct, answered_at, invalidated_at
) values (
  'a5000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'upgrade-q-1', 'upgrade-q-1-v1',
  array['upgrade-q-1-v1-A'], true, '2026-08-12T00:01:00Z', null
);
