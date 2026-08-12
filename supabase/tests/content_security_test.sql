begin;

select plan(12);

select ok(
  to_regprocedure('public.get_learner_question_catalog()') is not null,
  '採点前catalog RPCが存在する'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.get_learner_question_catalog()'::regprocedure),
  '採点前catalog RPCはSECURITY DEFINERである'
);
select ok(
  has_function_privilege('anon', 'public.get_learner_question_catalog()', 'execute') is false,
  'anonは採点前catalog RPCを実行できない'
);
select ok(
  has_function_privilege('authenticated', 'public.get_learner_question_catalog()', 'execute'),
  'authenticatedだけが採点前catalog RPCを実行できる'
);
select ok(
  to_regclass('public.learner_question_catalog') is null,
  '採点前catalog viewを直接公開していない'
);
select ok(
  to_regprocedure('public.record_content_release_approval(text,text,uuid,uuid,uuid)') is not null,
  '認証主体付きrelease承認RPCが存在する'
);
select ok(
  to_regprocedure('public.assert_content_release_gate(text,text,text,uuid)') is not null,
  'DB監査済みrelease gateが存在する'
);
select has_table('public', 'content_release_approvals', '認証済み承認記録が存在する');
select has_table('public', 'content_release_audit', 'DB release監査が存在する');
select hasnt_privilege(
  'authenticated',
  'public.question_versions',
  'select',
  'learnerはquestion_versionsを直接selectできない'
);
select hasnt_privilege(
  'authenticated',
  'public.choices',
  'select',
  'learnerはchoicesを直接selectできない'
);
select hasnt_privilege(
  'authenticated',
  'public.question_answer_keys',
  'select',
  'learnerはanswer keyを直接selectできない'
);

select * from finish();
rollback;
