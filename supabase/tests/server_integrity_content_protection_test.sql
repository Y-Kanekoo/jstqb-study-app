begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  'b1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'content-protection@example.invalid',
  crypt('content-protection-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.chapters (id, syllabus_version_id, number, title, exam_weight)
select 'b2000000-0000-4000-8000-000000000001', syllabus.id, 2,
       'content protection chapter', null
from public.syllabus_versions as syllabus
where syllabus.version = '2023V4.0.J02';

insert into public.learning_objectives (
  id, chapter_id, code, title, k_level, minimum_question_count
)
values (
  'b3000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'CONTENT-PROTECTION-K1', 'content protection objective', 1, 0
);

insert into public.questions (id, certification_id, current_version_id, created_at)
select 'content-protection-q', certification.id, null, now()
from public.certifications as certification
where certification.code = 'JSTQB-FL';

insert into public.question_versions (
  id, question_id, version_no, syllabus_version_id, learning_objective_id,
  status, selection_type, required_choice_count, prompt, explanation,
  difficulty, source_reference, content_hash, published_at
)
select 'content-protection-q-v1', 'content-protection-q', 1, syllabus.id,
       'b3000000-0000-4000-8000-000000000001', 'published', 'single', 1,
       'immutable prompt', 'immutable explanation', 1, 'test fixture',
       encode(extensions.digest('content-protection-q-v1', 'sha256'), 'hex'), now()
from public.syllabus_versions as syllabus
where syllabus.version = '2023V4.0.J02';

insert into public.choices (
  id, question_version_id, label, body, is_correct, explanation, sort_order
)
values
  ('content-protection-q-v1-A', 'content-protection-q-v1', 'A', 'immutable correct', true, 'correct', 0),
  ('content-protection-q-v1-B', 'content-protection-q-v1', 'B', 'immutable wrong', false, 'wrong', 1);

insert into public.question_answer_keys (question_version_id, correct_choice_ids)
values ('content-protection-q-v1', array['content-protection-q-v1-A']);

update public.questions
set current_version_id = 'content-protection-q-v1'
where id = 'content-protection-q';

insert into public.learning_sessions (
  id, user_id, mode, title, status, question_ids, current_index,
  answered_question_ids, revision, started_at, updated_at
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'random', 'content protection running session', 'active',
  array['content-protection-q'], 0, '{}', 1,
  '2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'
);

insert into public.learning_session_items (
  session_id, question_id, question_version_id, ordinal, choice_order
) values (
  'b4000000-0000-4000-8000-000000000001',
  'content-protection-q', 'content-protection-q-v1', 0,
  array['content-protection-q-v1-A', 'content-protection-q-v1-B']
);

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b1000000-0000-4000-8000-000000000001',
  'role', 'service_role'
)::text, true);

select throws_ok(
  $$select public.transition_question_version_status(
    'content-protection-q-v1', 'suspended', 'spoofed authenticated claim'
  )$$,
  '42501',
  'CONTENT_STATUS_TRANSITION_FORBIDDEN',
  'authenticated roleはservice_role claimを偽装しても遷移できない'
);

select throws_ok(
  $$update public.question_versions
    set prompt = 'authenticated mutation'
    where id = 'content-protection-q-v1'$$,
  '42501',
  null,
  'authenticated roleは公開問題版の本文を直接変更できない'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b1000000-0000-4000-8000-000000000001',
  'role', 'authenticated'
)::text, true);

select throws_ok(
  $$select public.transition_question_version_status(
    'content-protection-q-v1', 'suspended', 'normal claim only'
  )$$,
  '42501',
  'CONTENT_STATUS_TRANSITION_FORBIDDEN',
  'service_role database roleはauthenticated claimだけでは遷移できない'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b1000000-0000-4000-8000-000000000001',
  'role', 'service_role'
)::text, true);

select throws_ok(
  $$update public.question_versions
    set prompt = 'service role direct mutation'
    where id = 'content-protection-q-v1'$$,
  '42501',
  null,
  'service_roleでも公開問題版の本文を直接UPDATEできない'
);

select throws_ok(
  $$update public.choices
    set body = 'service role choice mutation'
    where id = 'content-protection-q-v1-A'$$,
  '42501',
  null,
  'service_roleでもchoicesを直接UPDATEできない'
);

select throws_ok(
  $$update public.question_answer_keys
    set correct_choice_ids = array['content-protection-q-v1-B']
    where question_version_id = 'content-protection-q-v1'$$,
  '42501',
  null,
  'service_roleでもquestion_answer_keysを直接UPDATEできない'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b1000000-0000-4000-8000-000000000001',
  'role', 'authenticated'
)::text, true);

select lives_ok(
  $$select * from public.ingest_learning_sync_events('[{
    "eventId":"b5000000-0000-4000-8000-000000000001",
    "kind":"answer.submitted",
    "entityId":"b6000000-0000-4000-8000-000000000001",
    "occurredAt":"2026-08-12T00:01:00Z",
    "payload":{
      "sessionId":"b4000000-0000-4000-8000-000000000001",
      "questionId":"content-protection-q",
      "questionVersionId":"content-protection-q-v1",
      "selectedChoiceIds":["content-protection-q-v1-A"]
    }
  }]'::jsonb)$$,
  '稼働sessionの採点が固定keyでdriftしない'
);

reset role;
select is(
  (select is_correct from public.answer_attempts where id = 'b6000000-0000-4000-8000-000000000001'),
  true,
  '稼働sessionは公開版の正答keyで採点される'
);

select is(
  (select prompt from public.question_versions where id = 'content-protection-q-v1'),
  'immutable prompt',
  '採点前も問題文が不変である'
);

select is(
  (select body from public.choices where id = 'content-protection-q-v1-A'),
  'immutable correct',
  '採点前もchoice本文が不変である'
);

select is(
  (select correct_choice_ids from public.question_answer_keys where question_version_id = 'content-protection-q-v1'),
  array['content-protection-q-v1-A'],
  '採点前も正答keyが不変である'
);

set local role service_role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b1000000-0000-4000-8000-000000000001',
  'role', 'service_role'
)::text, true);

select is(
  public.transition_question_version_status(
    'content-protection-q-v1', 'suspended', '緊急停止の監査試験'
  ),
  'suspended'::public.content_status,
  '正規service_role claimの遷移RPCだけがsuspendedへ変更できる'
);

select throws_ok(
  $$update public.question_versions
    set prompt = 'suspended mutation'
    where id = 'content-protection-q-v1'$$,
  '42501',
  null,
  'suspended版の本文も直接UPDATEできない'
);

select throws_ok(
  $$delete from public.choices where id = 'content-protection-q-v1-A'$$,
  '42501',
  null,
  'suspended版のchoicesも直接DELETEできない'
);

select throws_ok(
  $$delete from public.question_answer_keys
    where question_version_id = 'content-protection-q-v1'$$,
  '42501',
  null,
  'suspended版のanswer keyも直接DELETEできない'
);

reset role;
select throws_ok(
  $$insert into public.choices (
    id, question_version_id, label, body, is_correct, explanation, sort_order
  ) values (
    'content-protection-q-v1-C', 'content-protection-q-v1', 'C',
    'late choice', false, 'late', 2
  )$$,
  '42501',
  '公開済み問題版への選択肢追加は新版作成以外ではできません。',
  'suspended版へchoiceを追加できない'
);

select throws_ok(
  $$insert into public.question_answer_keys (question_version_id, correct_choice_ids)
    values ('content-protection-q-v1', array['content-protection-q-v1-B'])$$,
  '42501',
  '公開済み問題版の正答キーは新版作成以外では追加できません。',
  'suspended版へanswer keyを追加できない'
);

select is(
  (select prompt from public.question_versions where id = 'content-protection-q-v1'),
  'immutable prompt',
  '遷移後も問題文が不変である'
);

select is(
  (select body from public.choices where id = 'content-protection-q-v1-A'),
  'immutable correct',
  '遷移後もchoice本文が不変である'
);

select is(
  (select correct_choice_ids from public.question_answer_keys where question_version_id = 'content-protection-q-v1'),
  array['content-protection-q-v1-A'],
  '遷移後も正答keyが不変である'
);

set local role service_role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'b1000000-0000-4000-8000-000000000001',
  'role', 'service_role'
)::text, true);

select is(
  public.transition_question_version_status(
    'content-protection-q-v1', 'retired', '退役の監査試験'
  ),
  'retired'::public.content_status,
  '正規RPCでsuspended版をretiredへ変更できる'
);

select throws_ok(
  $$update public.question_versions
    set explanation = 'retired mutation'
    where id = 'content-protection-q-v1'$$,
  '42501',
  null,
  'retired版の解説も直接UPDATEできない'
);

reset role;
select is(
  (select count(*)::integer from private.question_version_status_audit
   where question_version_id = 'content-protection-q-v1'),
  2,
  '状態遷移ごとに監査行をappendする'
);

select is(
  (select old_status::text from private.question_version_status_audit
   where question_version_id = 'content-protection-q-v1' order by id limit 1),
  'published',
  '監査にold statusを保存する'
);

select is(
  (select new_status::text from private.question_version_status_audit
   where question_version_id = 'content-protection-q-v1' order by id limit 1),
  'suspended',
  '監査にnew statusを保存する'
);

select is(
  (select reason from private.question_version_status_audit
   where question_version_id = 'content-protection-q-v1' order by id limit 1),
  '緊急停止の監査試験',
  '監査にreasonを保存する'
);

select is(
  (select caller from private.question_version_status_audit
   where question_version_id = 'content-protection-q-v1' order by id limit 1),
  'b1000000-0000-4000-8000-000000000001',
  '監査にcallerを保存する'
);

select ok(
  (select occurred_at is not null from private.question_version_status_audit
   where question_version_id = 'content-protection-q-v1' order by id limit 1),
  '監査にtimeを保存する'
);

set local role authenticated;
select throws_ok(
  $$select * from private.question_version_status_audit$$,
  '42501',
  null,
  'learnerから監査表を読めない'
);

reset role;
select throws_ok(
  $$update private.question_version_status_audit
    set reason = 'tampered'
    where question_version_id = 'content-protection-q-v1'$$,
  '42501',
  'CONTENT_STATUS_AUDIT_APPEND_ONLY',
  '監査表はownerによるUPDATEでもappend-onlyである'
);

select throws_ok(
  $$delete from private.question_version_status_audit
    where question_version_id = 'content-protection-q-v1'$$,
  '42501',
  'CONTENT_STATUS_AUDIT_APPEND_ONLY',
  '監査表はownerによるDELETEでもappend-onlyである'
);

select * from finish();
rollback;
