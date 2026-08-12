import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/202608120020_content_security.sql', 'utf8');
const pgtap = readFileSync('supabase/tests/content_security_test.sql', 'utf8');
const failures = [];

if (migration.includes('learner_question_catalog as') || migration.includes('grant select on public.learner_question_catalog')) {
  failures.push('採点前catalogをview直接公開しています');
}
for (const required of [
  'revoke all on table public.question_versions',
  'revoke all on table public.choices',
  'revoke all on table public.question_answer_keys',
  'create or replace function public.get_learner_question_catalog',
  'create or replace function public.assert_content_release_gate',
  'author_id',
  'technical_reviewer_id',
  'editorial_reviewer_id',
  'final_approver_id',
  'content_release_approvals_distinct_people',
  'raw_hash',
  'canonical_hash',
]) {
  if (!migration.includes(required)) failures.push(`DB契約が不足しています: ${required}`);
}
for (const forbidden of ['practice_session_items', 'create_practice_session', 'submit_practice_answer', 'get_practice_feedback']) {
  if (migration.includes(forbidden)) failures.push(`PR #7以外の二重session/answer契約が残っています: ${forbidden}`);
}
if (!pgtap.includes("select plan(12)")) failures.push('content security pgTAPが12検査を宣言していません');
if (!pgtap.includes('hasnt_privilege')) failures.push('基底table SELECT撤回のpgTAP検査がありません');

if (failures.length > 0) {
  process.stderr.write(`DB契約検査に失敗しました:\n${failures.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('DB契約検査: 合格（採点分離、認証RPC、release監査、hash分離、pgTAP）\n');
}
