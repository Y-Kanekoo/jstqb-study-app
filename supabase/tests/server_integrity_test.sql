begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'server-test-1@example.invalid',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'server-test-2@example.invalid',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.chapters (id, syllabus_version_id, number, title, exam_weight)
select gen_random_uuid(), syllabus.id, chapter_number, '試験用第' || chapter_number || '章', null
from public.syllabus_versions as syllabus
cross join generate_series(1, 6) as chapter(chapter_number)
where syllabus.version = '2023V4.0.J02'
on conflict (syllabus_version_id, number) do update set title = excluded.title;

insert into public.learning_objectives (id, chapter_id, code, title, k_level, minimum_question_count)
select gen_random_uuid(), chapter.id,
       'TEST-FL-' || chapter.number || '-K' || k_level,
       '試験用学習目標', k_level, 0
from public.chapters as chapter
cross join generate_series(1, 3) as level(k_level)
where chapter.title like '試験用第%章'
on conflict (code) do update set title = excluded.title;

create temporary table test_question_distribution (
  question_id text primary key,
  chapter_number integer not null,
  k_level integer not null,
  sequence_in_cell integer not null
) on commit drop;

insert into test_question_distribution (question_id, chapter_number, k_level, sequence_in_cell)
select 'server-q-' || allocation.chapter_number || '-' || allocation.k_level || '-' || item_number,
       allocation.chapter_number, allocation.k_level, item_number
from (values
  (1, 1, 2), (1, 2, 5), (1, 3, 1),
  (2, 1, 1), (2, 2, 4), (2, 3, 1),
  (3, 1, 1), (3, 2, 2), (3, 3, 1),
  (4, 1, 2), (4, 2, 7), (4, 3, 2),
  (5, 1, 1), (5, 2, 5), (5, 3, 3),
  (6, 1, 1), (6, 2, 1), (6, 3, 0)
) as allocation(chapter_number, k_level, question_count)
cross join lateral generate_series(1, allocation.question_count) as item(item_number);

insert into public.questions (id, certification_id, current_version_id, created_at)
select distribution.question_id, certification.id, null, now()
from test_question_distribution as distribution
cross join public.certifications as certification
where certification.code = 'JSTQB-FL';

insert into public.question_versions (
  id, question_id, version_no, syllabus_version_id, learning_objective_id,
  status, selection_type, required_choice_count, prompt, explanation,
  difficulty, source_reference, content_hash, published_at
)
select distribution.question_id || '-v1', distribution.question_id, 1,
       syllabus.id, objective.id, 'published', 'single', 1,
       'サーバー完全性試験の問題', 'サーバー完全性試験の解説',
       1, '試験用', encode(digest(distribution.question_id, 'sha256'), 'hex'), now()
from test_question_distribution as distribution
join public.chapters as chapter on chapter.number = distribution.chapter_number and chapter.title like '試験用第%章'
join public.learning_objectives as objective
  on objective.chapter_id = chapter.id
 and objective.k_level = distribution.k_level
 and objective.code = 'TEST-FL-' || distribution.chapter_number || '-K' || distribution.k_level
cross join public.syllabus_versions as syllabus
where syllabus.version = '2023V4.0.J02';

insert into public.choices (id, question_version_id, label, body, is_correct, explanation, sort_order)
select version.id || '-A', version.id, 'A', '正答', true, '正答です。', 0
from public.question_versions as version
where version.question_id like 'server-q-%'
union all
select version.id || '-B', version.id, 'B', '誤答', false, '誤答です。', 1
from public.question_versions as version
where version.question_id like 'server-q-%';

insert into public.question_answer_keys (question_version_id, correct_choice_ids)
select version.id, array[version.id || '-A']
from public.question_versions as version
where version.question_id like 'server-q-%'
on conflict (question_version_id) do update set correct_choice_ids = excluded.correct_choice_ids;

update public.questions
set current_version_id = id || '-v1'
where id like 'server-q-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-4000-8000-000000000001',
  'role', 'authenticated',
  'session_id', '20000000-0000-4000-8000-000000000001',
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))
)::text, true);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events(jsonb_build_array(jsonb_build_object(
      'eventId', '30000000-0000-4000-8000-000000000001',
      'kind', 'session.created',
      'entityId', '40000000-0000-4000-8000-000000000001',
      'occurredAt', '2020-01-01T00:00:00Z',
      'payload', jsonb_build_object(
        'sessionId', '40000000-0000-4000-8000-000000000001',
        'mode', 'exam',
        'title', 'DB時計模試',
        'questionIds', (select jsonb_agg(question_id order by chapter_number, k_level, sequence_in_cell) from test_question_distribution)
      )
    )))
  $$,
  '章・K配分を満たす模試を作成できる'
);

select is(
  (select extract(epoch from expires_at - started_at)::integer from public.learning_sessions where id = '40000000-0000-4000-8000-000000000001'),
  3600,
  '模試期限はDB時計から60分で固定される'
);

select is(
  (select count(*)::integer from public.learning_session_items where session_id = '40000000-0000-4000-8000-000000000001'),
  40,
  '模試開始時に40件の問題版を固定する'
);

reset role;
update public.learning_sessions
set expires_at = now() - interval '1 second'
where id = '40000000-0000-4000-8000-000000000001';
set local role authenticated;

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000002",
      "kind":"draft.saved",
      "entityId":"40000000-0000-4000-8000-000000000001:server-q-1-1-1",
      "occurredAt":"2020-01-01T00:00:00Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000001",
        "questionId":"server-q-1-1-1",
        "selectedChoiceIds":["server-q-1-1-1-v1-A"],
        "expectedRevision":0,
        "deviceId":"test-device"
      }
    }]'::jsonb)
  $$,
  '22023',
  'SESSION_FROZEN',
  '期限後の模試ドラフトを拒否する'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000003",
      "kind":"bookmark.changed",
      "entityId":"server-q-1-1-1",
      "occurredAt":"2026-08-12T00:00:00Z",
      "payload":{"questionId":"server-q-1-1-1","enabled":true}
    }]'::jsonb)
  $$,
  'ブックマークイベントを取り込める'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000003",
      "kind":"bookmark.changed",
      "entityId":"server-q-1-1-1",
      "occurredAt":"2026-08-12T00:00:00Z",
      "payload":{"questionId":"server-q-1-1-1","enabled":true}
    }]'::jsonb)
  $$,
  '同じevent IDとpayloadの再送は成功する'
);

select is(
  (select count(*)::integer from public.sync_events where event_id = '30000000-0000-4000-8000-000000000003'),
  1,
  '冪等再送でイベントを重複保存しない'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000003",
      "kind":"bookmark.changed",
      "entityId":"server-q-1-1-1",
      "occurredAt":"2026-08-12T00:00:00Z",
      "payload":{"questionId":"server-q-1-1-1","enabled":false}
    }]'::jsonb)
  $$,
  '22023',
  'IDEMPOTENCY_KEY_REUSED',
  '同じevent IDの異なるpayloadを拒否する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000030",
      "kind":"bookmark.changed",
      "entityId":"server-q-1-1-1",
      "occurredAt":"2026-08-12T00:00:01Z",
      "payload":{"questionId":"server-q-1-1-1","enabled":true},
      "unknown":true
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: payloadに未対応のfieldが含まれています。',
  'イベント直下の未知fieldを拒否する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events(jsonb_build_array(jsonb_build_object(
      'eventId', '30000000-0000-4000-8000-000000000031',
      'kind', 'note.saved',
      'entityId', 'server-q-1-1-1',
      'occurredAt', '2026-08-12T00:00:02Z',
      'payload', jsonb_build_object('body', repeat('x', 70000))
    )))
  $$,
  '22023',
  'INVALID_EVENT: event は64KiB以下で指定してください。',
  '64KiBを超えるイベントを拒否する'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000004",
      "kind":"session.created",
      "entityId":"40000000-0000-4000-8000-000000000002",
      "occurredAt":"2026-08-12T00:00:00Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000002",
        "mode":"random",
        "title":"通常演習",
        "questionIds":["server-q-1-1-1"]
      }
    }]'::jsonb)
  $$,
  '通常演習セッションを作成できる'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000005",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000001",
      "occurredAt":"2026-08-12T00:01:00Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000002",
        "questionId":"server-q-1-1-1",
        "questionVersionId":"server-q-1-1-1-v1",
        "selectedChoiceIds":["server-q-1-1-1-v1-B"],
        "isCorrect":true
      }
    }]'::jsonb)
  $$,
  '通常回答をサーバーで確定できる'
);

select is(
  (select is_correct from public.answer_attempts where id = '50000000-0000-4000-8000-000000000001'),
  false,
  'クライアント値を信用せず誤答へ再採点する'
);

select is(
  (select (payload ->> 'isCorrect')::boolean from public.sync_events where event_id = '30000000-0000-4000-8000-000000000005'),
  false,
  'canonicalイベントにもサーバー再採点結果を保存する'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000020",
      "kind":"session.created",
      "entityId":"40000000-0000-4000-8000-000000000003",
      "occurredAt":"2026-08-12T00:01:30Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "mode":"random",
        "title":"回答完全性試験",
        "questionIds":["server-q-1-1-1","server-q-1-1-2"]
      }
    }]'::jsonb)
  $$,
  '回答完全性試験用の2問セッションを作成できる'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000021",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000020",
      "occurredAt":"2026-08-12T00:01:31Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "questionId":"server-q-1-1-1",
        "questionVersionId":"server-q-1-1-1-v1",
        "selectedChoiceIds":["server-q-1-1-1-v1-A"]
      }
    }]'::jsonb)
  $$,
  '2問セッションの1問目を確定できる'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000025",
      "kind":"session.advanced",
      "entityId":"40000000-0000-4000-8000-000000000003",
      "occurredAt":"2026-08-12T00:01:31Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "questionId":"server-q-1-1-1"
      }
    }]'::jsonb)
  $$,
  '移動先の問題を指定して進捗位置を更新できる'
);

select is(
  (select current_index from public.learning_sessions where id = '40000000-0000-4000-8000-000000000003'),
  0,
  'session.advancedは移動先問題のordinalを保存する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000022",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000021",
      "occurredAt":"2026-08-12T00:01:32Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "questionId":"server-q-1-1-1",
        "questionVersionId":"server-q-1-1-1-v1",
        "selectedChoiceIds":["server-q-1-1-1-v1-B"]
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: このセッションの問題は確定済みです。',
  '異なるattempt IDによる同一問題の二重確定を拒否する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000023",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000022",
      "occurredAt":"2026-08-12T00:01:33Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "questionId":"server-q-1-1-2",
        "questionVersionId":"server-q-1-1-1-v1",
        "selectedChoiceIds":["server-q-1-1-1-v1-A"]
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: セッション開始時の問題版と一致しません。',
  'セッションに固定した版と異なる問題版を拒否する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000024",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000023",
      "occurredAt":"2026-08-12T00:01:34Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "questionId":"server-q-1-1-2",
        "questionVersionId":"server-q-1-1-2-v1",
        "selectedChoiceIds":["server-q-1-1-1-v1-A"]
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: 問題版に属さない選択肢が含まれています。',
  '別問題版の選択肢を回答に使用できない'
);

reset role;
alter table public.question_versions disable trigger protect_published_question_versions;
update public.question_versions
set status = 'retired'
where id = 'server-q-1-1-2-v1';
alter table public.question_versions enable trigger protect_published_question_versions;
set local role authenticated;

select is(
  (select count(*)::integer from public.question_versions where id = 'server-q-1-1-2-v1'),
  1,
  '固定後にretiredになった問題版をセッション所有者は読める'
);

select is(
  (select count(*)::integer from public.choices where question_version_id = 'server-q-1-1-2-v1'),
  2,
  '固定後にretiredになった問題版の選択肢をセッション所有者は読める'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000026",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000024",
      "occurredAt":"2026-08-12T00:01:35Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000003",
        "questionId":"server-q-1-1-2",
        "questionVersionId":"server-q-1-1-2-v1",
        "selectedChoiceIds":["server-q-1-1-2-v1-A"]
      }
    }]'::jsonb)
  $$,
  '固定後にretiredになった問題版へ回答できる'
);

select lives_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000032",
      "kind":"session.created",
      "entityId":"40000000-0000-4000-8000-000000000004",
      "occurredAt":"2026-08-12T00:01:36Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000004",
        "mode":"random",
        "title":"緊急停止試験",
        "questionIds":["server-q-1-2-1"]
      }
    }]'::jsonb)
  $$,
  '緊急停止試験用セッションを作成できる'
);

reset role;
alter table public.question_versions disable trigger protect_published_question_versions;
update public.question_versions
set status = 'suspended'
where id = 'server-q-1-2-1-v1';
alter table public.question_versions enable trigger protect_published_question_versions;
set local role authenticated;

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000033",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000025",
      "occurredAt":"2026-08-12T00:01:37Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000004",
        "questionId":"server-q-1-2-1",
        "questionVersionId":"server-q-1-2-1-v1",
        "selectedChoiceIds":["server-q-1-2-1-v1-A"]
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: 停止中または未公開の問題版には回答できません。',
  '固定後にsuspendedになった問題版への回答を拒否する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000006",
      "kind":"answer.submitted",
      "entityId":"50000000-0000-4000-8000-000000000002",
      "occurredAt":"2026-08-12T00:02:00Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000002",
        "questionId":"server-q-1-1-1",
        "questionVersionId":"server-q-1-1-1-v999",
        "selectedChoiceIds":["server-q-1-1-1-v1-A"]
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: セッションは回答受付を終了しています。',
  '完了済みセッションへの追加回答を拒否する'
);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000007",
      "kind":"issue.reported",
      "entityId":"60000000-0000-4000-8000-000000000001",
      "occurredAt":"2026-08-12T00:03:00Z",
      "payload":{
        "issueId":"60000000-0000-4000-8000-000000000001",
        "questionId":"server-q-1-1-1",
        "questionVersionId":"missing-version",
        "category":"typo",
        "description":"存在しない版の報告"
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: 報告対象の問題版が存在しません。',
  '存在しない問題版の報告を成功扱いにしない'
);

select throws_ok(
  $$
    insert into public.answer_attempts (
      id, user_id, session_id, question_id, question_version_id,
      selected_choice_ids, is_correct, answered_at
    ) values (
      '50000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'server-q-1-1-1', 'server-q-1-1-1-v1',
      array['server-q-1-1-1-v1-A'], true, now()
    )
  $$,
  '42501',
  'permission denied for table answer_attempts',
  '認証クライアントのattempt直接INSERTを拒否する'
);

select throws_ok(
  $$
    insert into public.user_question_states (
      user_id, question_id, first_attempt_at, last_attempt_at, last_attempt_id
    ) values (
      '10000000-0000-4000-8000-000000000001', 'server-q-1-1-2', now(), now(),
      '50000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'permission denied for table user_question_states',
  '認証クライアントの学習状態直接INSERTを拒否する'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-4000-8000-000000000002',
  'role', 'authenticated',
  'session_id', '20000000-0000-4000-8000-000000000002',
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))
)::text, true);

select throws_ok(
  $$
    select * from public.ingest_learning_sync_events('[{
      "eventId":"30000000-0000-4000-8000-000000000008",
      "kind":"session.advanced",
      "entityId":"40000000-0000-4000-8000-000000000002",
      "occurredAt":"2026-08-12T00:04:00Z",
      "payload":{
        "sessionId":"40000000-0000-4000-8000-000000000002",
        "questionId":"server-q-1-1-1"
      }
    }]'::jsonb)
  $$,
  '22023',
  'INVALID_EVENT: 自分のセッションが存在しません。',
  '別利用者のセッションを更新できない'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-4000-8000-000000000002',
  'role', 'authenticated',
  'session_id', '20000000-0000-4000-8000-000000000002',
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now() - interval '10 minutes')::bigint))
)::text, true);

select throws_ok(
  $$select public.delete_current_user()$$,
  '42501',
  'RECENT_REAUTHENTICATION_REQUIRED',
  '古いパスワード認証ではアカウントを削除できない'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-4000-8000-000000000002',
  'role', 'authenticated',
  'session_id', '20000000-0000-4000-8000-000000000003',
  'amr', jsonb_build_array(
    jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint),
    jsonb_build_object('method', 'token_refresh', 'timestamp', extract(epoch from now())::bigint)
  )
)::text, true);

select lives_ok(
  $$select public.delete_current_user()$$,
  '直近パスワード認証後はアカウントを削除できる'
);

select is(
  (select count(*)::integer from auth.users where id = '10000000-0000-4000-8000-000000000002'),
  0,
  '削除RPCが対象本人だけを削除する'
);

select throws_ok(
  $$select * from public.ingest_learning_sync_events('{}'::jsonb)$$,
  '42501',
  'AUTH_REQUIRED',
  '削除後のJWTでは認証済み書き込みを継続できない'
);

select * from finish();
rollback;
