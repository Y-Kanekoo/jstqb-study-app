insert into public.learning_sessions (
  id, user_id, mode, title, status, question_ids, current_index,
  answered_question_ids, revision, started_at, updated_at
) values (
  'a4000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001',
  'random', 'upgrade duplicate question session', 'active',
  array['upgrade-q-1', 'upgrade-q-1'], 0, '{}', 1,
  '2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'
);
