insert into public.answer_attempts (
  id, user_id, session_id, question_id, question_version_id,
  selected_choice_ids, is_correct, answered_at, invalidated_at
) values (
  'a5000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'upgrade-q-1', 'upgrade-q-1-v1',
  array['upgrade-q-1-v1-B'], false, '2026-08-12T00:02:00Z', null
);
