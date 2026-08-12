-- 202608120002_server_integrity.sql の非可逆な制約作成とバックフィルを、
-- 暗黙のPostgreSQLエラーではなく対象データ付きで停止させる。
do $$
declare
  duplicate_row record;
  missing_item record;
begin
  select user_id, session_id, question_id, count(*) as attempt_count
  into duplicate_row
  from public.answer_attempts
  where invalidated_at is null
  group by user_id, session_id, question_id
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        'SERVER_INTEGRITY_PREFLIGHT_FAILED: 有効なanswer_attemptsが重複しています（user_id=%s, session_id=%s, question_id=%s, count=%s）。',
        duplicate_row.user_id,
        duplicate_row.session_id,
        duplicate_row.question_id,
        duplicate_row.attempt_count
      );
  end if;

  select learning_session.id as session_id, requested.question_id
  into missing_item
  from public.learning_sessions as learning_session
  cross join lateral unnest(learning_session.question_ids) as requested(question_id)
  where not exists (
    select 1
    from public.questions as question
    join public.question_versions as version
      on version.id = coalesce(
        (
          select attempt.question_version_id
          from public.answer_attempts as attempt
          where attempt.user_id = learning_session.user_id
            and attempt.session_id = learning_session.id
            and attempt.question_id = requested.question_id
          order by attempt.answered_at desc, attempt.received_at desc
          limit 1
        ),
        question.current_version_id
      )
     and version.question_id = question.id
    where question.id = requested.question_id
  )
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      message = format(
        'SERVER_INTEGRITY_PREFLIGHT_FAILED: learning_session_itemsのバックフィル対象を解決できません（session_id=%s, question_id=%s）。',
        missing_item.session_id,
        missing_item.question_id
      );
  end if;
end;
$$;
