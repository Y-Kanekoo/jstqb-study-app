/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { contentObjectives, targetChapterDistribution } from '../src/content/objectives.ts';
import { validateContentBundle, type ContentQualityReport } from '../src/content/quality.ts';
import type { ProductionBundle, ProductionQuestion } from '../src/content/production-schema.ts';

type Command = 'validate' | 'seed' | 'rollback';

interface CliOptions {
  command: Command;
  file: string;
  output?: string;
  dryRun: boolean;
  releaseGate: boolean;
}

function usage(): string {
  return [
    '使い方:',
    '  pnpm content:validate -- --file <bundle.json> [--release]',
    '  pnpm content:seed -- --file <bundle.json> --output <seed.sql> [--dry-run] [--release]',
    '  pnpm content:rollback -- --file <bundle.json> --output <rollback.sql> [--dry-run]',
  ].join('\n');
}

function parseCommand(value: string | undefined): Command {
  if (value === 'validate' || value === 'seed' || value === 'rollback') {
    return value;
  }
  throw new Error(`コマンドが不正です。\n${usage()}`);
}

function parseOptions(argv: readonly string[]): CliOptions {
  const command = parseCommand(argv[0]);
  let file: string | undefined;
  let output: string | undefined;
  let dryRun = false;
  let releaseGate = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--file') {
      file = argv[index + 1];
      index += 1;
    } else if (argument === '--output') {
      output = argv[index + 1];
      index += 1;
    } else if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument === '--release') {
      releaseGate = true;
    } else {
      throw new Error(`未対応の引数です: ${argument}\n${usage()}`);
    }
  }

  if (file === undefined) {
    throw new Error(`--fileは必須です。\n${usage()}`);
  }
  if (command !== 'validate' && !dryRun && output === undefined) {
    throw new Error(`SQLを生成する場合は--outputが必須です。\n${usage()}`);
  }
  return {
    command,
    file: resolve(file),
    dryRun,
    releaseGate,
    ...(output === undefined ? {} : { output: resolve(output) }),
  };
}

async function readBundle(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return parsed;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlTextArray(values: readonly string[]): string {
  return `array[${values.map(sqlString).join(', ')}]::text[]`;
}

function sqlJson(value: unknown): string {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function bundleHash(bundle: ProductionBundle): string {
  return createHash('sha256').update(JSON.stringify(bundle), 'utf8').digest('hex');
}

function certificationIdQuery(bundle: ProductionBundle): string {
  return `(select id from public.certifications where code = ${sqlString(bundle.certificationCode)})`;
}

function syllabusIdQuery(bundle: ProductionBundle): string {
  return `(select sv.id from public.syllabus_versions sv join public.certifications c on c.id = sv.certification_id where c.code = ${sqlString(bundle.certificationCode)} and sv.version = ${sqlString(bundle.syllabusVersion)})`;
}

function chapterIdQuery(bundle: ProductionBundle, chapterNumber: number): string {
  return `(select id from public.chapters where syllabus_version_id = ${syllabusIdQuery(bundle)} and number = ${chapterNumber})`;
}

function objectiveIdQuery(objectiveCode: string): string {
  return `(select id from public.learning_objectives where code = ${sqlString(objectiveCode)})`;
}

function questionMetadata(question: ProductionQuestion): Record<string, unknown> {
  return {
    createdBy: question.createdBy,
    createdAt: question.createdAt,
    originStatement: question.originStatement,
    prohibitedSourceCheck: question.prohibitedSourceCheck,
    sourceUrl: question.sourceUrl,
    generationMethod: question.generationMethod,
    caseFamily: question.caseFamily,
    premises: question.premises,
    choicePremiseMap: question.choices.map((choice) => ({
      choiceId: choice.id,
      addressedPremiseKeys: choice.addressedPremiseKeys,
    })),
  };
}

export function buildSeedSql(bundle: ProductionBundle, sourceFilename: string): string {
  const lines: string[] = [
    '-- 自動生成された非公開コンテンツ投入SQL。正答データを含むため公開リポジトリへ追加しないこと。',
    '\\set ON_ERROR_STOP on',
    'begin;',
    '',
  ];

  for (const [chapterText, count] of Object.entries(targetChapterDistribution)) {
    const chapterNumber = Number(chapterText);
    const title = bundle.questions.find((question) => question.chapterNumber === chapterNumber)?.chapterTitle;
    if (title === undefined) {
      continue;
    }
    lines.push(
      'insert into public.chapters (syllabus_version_id, number, title, exam_weight)',
      `values (${syllabusIdQuery(bundle)}, ${chapterNumber}, ${sqlString(title)}, ${(count / 5).toFixed(2)})`,
      'on conflict (syllabus_version_id, number) do update set title = excluded.title, exam_weight = excluded.exam_weight;',
      '',
    );
  }

  for (const objective of contentObjectives) {
    const count = bundle.questions.filter((question) => question.objectiveCode === objective.code).length;
    lines.push(
      'insert into public.learning_objectives (chapter_id, code, title, k_level, minimum_question_count)',
      `values (${chapterIdQuery(bundle, objective.chapterNumber)}, ${sqlString(objective.code)}, ${sqlString(objective.title)}, ${objective.kLevel}, ${count})`,
      'on conflict (code) do update set title = excluded.title, k_level = excluded.k_level, minimum_question_count = excluded.minimum_question_count;',
      '',
    );
  }

  for (const question of bundle.questions) {
    lines.push(
      'insert into public.questions (id, certification_id)',
      `values (${sqlString(question.id)}, ${certificationIdQuery(bundle)})`,
      'on conflict (id) do nothing;',
      '',
      'insert into public.question_versions (',
      '  id, question_id, version_no, syllabus_version_id, learning_objective_id, status,',
      '  selection_type, required_choice_count, prompt, explanation, difficulty, source_reference,',
      '  content_hash, compatibility, shuffle_choices, metadata_json, published_at',
      ') values (',
      `  ${sqlString(question.versionId)}, ${sqlString(question.id)}, ${question.versionNumber}, ${syllabusIdQuery(bundle)}, ${objectiveIdQuery(question.objectiveCode)}, ${sqlString(question.status)},`,
      `  ${sqlString(question.selectionType)}, ${question.requiredChoiceCount}, ${sqlString(question.prompt)}, ${sqlString(question.explanation)}, ${question.difficulty}, ${sqlString(question.sourceReference)},`,
      `  ${sqlString(question.contentHash)}, 'compatible', ${question.shuffleChoices}, ${sqlJson(questionMetadata(question))}, ${question.status === 'published' ? sqlString(bundle.generatedAt) : 'null'}`,
      ') on conflict (id) do nothing;',
      '',
    );

    question.choices.forEach((choice, index) => {
      lines.push(
        'insert into public.choices (id, question_version_id, label, body, is_correct, explanation, sort_order)',
        `values (${sqlString(choice.id)}, ${sqlString(question.versionId)}, ${sqlString(choice.label)}, ${sqlString(choice.body)}, ${choice.isCorrect}, ${sqlString(choice.explanation)}, ${index})`,
        'on conflict (id) do nothing;',
      );
    });

    const correctChoiceIds = question.choices.filter((choice) => choice.isCorrect).map((choice) => choice.id);
    lines.push(
      'insert into public.question_answer_keys (question_version_id, correct_choice_ids)',
      `values (${sqlString(question.versionId)}, ${sqlTextArray(correctChoiceIds)})`,
      'on conflict (question_version_id) do nothing;',
    );

    for (const review of question.reviews) {
      lines.push(
        'insert into public.content_reviews (question_version_id, reviewer_id, reviewer_label, review_type, result, comment, created_at)',
        `select ${sqlString(question.versionId)}, null, ${sqlString(review.reviewer)}, ${sqlString(review.type)}, ${sqlString(review.result)}, ${sqlString(review.notes)}, ${sqlString(review.reviewedAt)}`,
        'where not exists (',
        '  select 1 from public.content_reviews',
        `  where question_version_id = ${sqlString(question.versionId)} and reviewer_label = ${sqlString(review.reviewer)} and review_type = ${sqlString(review.type)} and created_at = ${sqlString(review.reviewedAt)}`,
        ');',
      );
    }
    if (question.status === 'published') {
      lines.push(
        `update public.questions set current_version_id = ${sqlString(question.versionId)} where id = ${sqlString(question.id)};`,
      );
    }
    lines.push('');
  }

  lines.push(
    'do $$',
    'begin',
    `  if (select count(*) from public.question_versions where id in (select unnest(${sqlTextArray(bundle.questions.map((question) => question.versionId))}))) <> ${bundle.questions.length} then`,
    "    raise exception '問題版の投入件数がバンドル件数と一致しません。';",
    '  end if;',
    'end;',
    '$$;',
    '',
    'do $$',
    'begin',
    `  if exists (select 1 from (values ${bundle.questions.map((question) => `(${sqlString(question.versionId)}, ${sqlString(question.contentHash)})`).join(', ')}) as expected(id, content_hash) join public.question_versions actual on actual.id = expected.id where actual.content_hash <> expected.content_hash) then`,
    "    raise exception '既存の問題版IDに異なるcontent hashが登録されています。新版IDを作成してください。';",
    '  end if;',
    'end;',
    '$$;',
    '',
    'do $$',
    'begin',
    `  if exists (select 1 from (values ${bundle.questions.map((question) => `(${sqlString(question.versionId)}, ${sqlString(question.selectionType)}, ${question.requiredChoiceCount})`).join(', ')}) as expected(id, selection_type, required_choice_count) join public.question_versions actual on actual.id = expected.id left join lateral (select count(*)::integer as correct_count from public.choices where question_version_id = actual.id and is_correct) answer on true where actual.selection_type <> expected.selection_type or actual.required_choice_count <> expected.required_choice_count or answer.correct_count <> expected.required_choice_count) then`,
    "    raise exception '選択方式・必要選択数・正答choice数がバンドルと一致しません。';",
    '  end if;',
    'end;',
    '$$;',
    '',
    'insert into public.content_imports (bundle_id, bundle_hash, certification_code, syllabus_version, question_count, status, source_filename, summary_json)',
    `values (${sqlString(bundle.bundleId)}, ${sqlString(bundleHash(bundle))}, ${sqlString(bundle.certificationCode)}, ${sqlString(bundle.syllabusVersion)}, ${bundle.questions.length}, 'applied', ${sqlString(sourceFilename)}, ${sqlJson({ questions: bundle.questions.length, statuses: bundle.questions.reduce<Record<string, number>>((counts, question) => ({ ...counts, [question.status]: (counts[question.status] ?? 0) + 1 }), {}) })})`,
    'on conflict (bundle_id) do update set bundle_hash = excluded.bundle_hash, question_count = excluded.question_count, status = excluded.status, source_filename = excluded.source_filename, applied_at = now(), rolled_back_at = null;',
    '',
    'commit;',
    '',
  );
  return lines.join('\n');
}

export function buildRollbackSql(bundle: ProductionBundle): string {
  const questionIds = bundle.questions.map((question) => question.id);
  const versionIds = bundle.questions.map((question) => question.versionId);
  return [
    '-- 自動生成された非公開コンテンツロールバックSQL。確定回答がある問題は削除しない。',
    '\\set ON_ERROR_STOP on',
    'begin;',
    'do $$',
    'begin',
    `  if exists (select 1 from public.answer_attempts where question_version_id in (select unnest(${sqlTextArray(versionIds)}))) then`,
    "    raise exception '回答履歴が存在するためロールバックできません。問題をretiredへ変更してください。';",
    '  end if;',
    'end;',
    '$$;',
    `update public.questions set current_version_id = null where id in (select unnest(${sqlTextArray(questionIds)}));`,
    `delete from public.question_answer_keys where question_version_id in (select unnest(${sqlTextArray(versionIds)}));`,
    `delete from public.content_reviews where question_version_id in (select unnest(${sqlTextArray(versionIds)}));`,
    `delete from public.question_versions where id in (select unnest(${sqlTextArray(versionIds)}));`,
    `delete from public.questions where id in (select unnest(${sqlTextArray(questionIds)}));`,
    `update public.content_imports set status = 'rolled_back', rolled_back_at = now() where bundle_id = ${sqlString(bundle.bundleId)};`,
    'commit;',
    '',
  ].join('\n');
}

function formatReport(report: ContentQualityReport): string {
  const issueLines = report.issues.slice(0, 50).map((item) => (
    `- [${item.severity}] ${item.code}${item.questionId === undefined ? '' : ` (${item.questionId})`}: ${item.message}`
  ));
  if (report.issues.length > issueLines.length) {
    issueLines.push(`- ほか${report.issues.length - issueLines.length}件`);
  }
  return [
    `問題数: ${report.questionCount}`,
    `章配分: ${JSON.stringify(report.chapterDistribution)}`,
    `Kレベル配分: ${JSON.stringify(report.kLevelDistribution)}`,
    `選択方式: ${JSON.stringify(report.selectionDistribution)}`,
    `作成方式: ${JSON.stringify(report.generationMethodDistribution)}`,
    `パラメーター派生: ${report.parameterDerivedCount}題 (${(report.parameterDerivedRate * 100).toFixed(1)}%)`,
    `学習目標カバー数: ${report.objectiveCoverage}/64`,
    `状態: ${JSON.stringify(report.statusDistribution)}`,
    `エラー: ${report.errorCount} / 警告: ${report.warningCount}`,
    `構造・品質検証: ${report.valid ? '合格' : '不合格'}`,
    `本番公開ゲート: ${report.releaseReady ? '合格' : '未承認または不合格'}`,
    ...issueLines,
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const input = await readBundle(options.file);
  const report = validateContentBundle(input, {
    enforceProductionDistribution: true,
    releaseGate: options.releaseGate,
  });
  process.stdout.write(`${formatReport(report)}\n`);
  if (!report.valid || report.bundle === undefined) {
    process.exitCode = 1;
    return;
  }
  if (options.command === 'validate' || options.dryRun) {
    return;
  }
  if (!options.releaseGate && report.bundle.questions.some((question) => question.status === 'published')) {
    throw new Error('published問題のSQL生成には--releaseが必要です。');
  }
  if (options.output === undefined) {
    throw new Error('--outputがありません。');
  }
  const sql = options.command === 'seed'
    ? buildSeedSql(report.bundle, basename(options.file))
    : buildRollbackSql(report.bundle);
  await writeFile(options.output, sql, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`SQLを生成しました: ${options.output}\n`);
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`コンテンツ処理に失敗しました: ${message}\n`);
    process.exitCode = 1;
  });
}
