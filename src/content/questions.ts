import type { Choice, Question, QuestionDifficulty } from '@/domain/types';

interface QuestionSeed {
  id: string;
  chapterNumber: number;
  chapterTitle: string;
  objectiveCode: string;
  prompt: string;
  correct: string;
  distractors: [string, string, string];
  explanation: string;
  difficulty: QuestionDifficulty;
  sourceReference: string;
}

const labels = ['A', 'B', 'C', 'D'] as const;

function createQuestion(seed: QuestionSeed): Question {
  const sourceBodies = [seed.correct, ...seed.distractors];
  const offset = Number.parseInt(seed.id.slice(-3), 10) % sourceBodies.length;
  const bodies = [...sourceBodies.slice(offset), ...sourceBodies.slice(0, offset)];
  const choices: Choice[] = bodies.map((body, index) => ({
    id: `${seed.id}-${labels[index]}`,
    label: labels[index] ?? String(index + 1),
    body,
    explanation: body === seed.correct ? 'この選択肢が正解です。' : 'この記述は該当する概念を正しく表していません。',
    isCorrect: body === seed.correct,
  }));

  return {
    id: seed.id,
    versionId: `${seed.id}-v1`,
    chapterNumber: seed.chapterNumber,
    chapterTitle: seed.chapterTitle,
    objectiveCode: seed.objectiveCode,
    prompt: seed.prompt,
    explanation: seed.explanation,
    difficulty: seed.difficulty,
    sourceReference: seed.sourceReference,
    selectionType: 'single',
    requiredChoiceCount: 1,
    choices,
  };
}

const seeds: QuestionSeed[] = [
  {
    id: 'fl-001', chapterNumber: 1, chapterTitle: 'テストの基礎', objectiveCode: 'FL-1.1.1',
    prompt: 'ソフトウェアテストの代表的な目的として、最も適切なものはどれですか。',
    correct: '作業成果物を評価し、欠陥や故障のリスクを低減すること',
    distractors: ['すべての欠陥が存在しないことを証明すること', '開発者を評価するために欠陥数を数えること', 'デバッグ作業だけを効率化すること'],
    explanation: 'テストは品質に関する情報を提供し、欠陥や故障のリスク低減に寄与します。欠陥がないことの完全な証明ではありません。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 1.1',
  },
  {
    id: 'fl-002', chapterNumber: 1, chapterTitle: 'テストの基礎', objectiveCode: 'FL-1.2.1',
    prompt: 'テストとデバッグの関係について、最も適切な記述はどれですか。',
    correct: 'テストは故障や欠陥を明らかにし、デバッグは原因を特定して修正する活動である',
    distractors: ['テストとデバッグは同じ活動である', 'デバッグは欠陥がないことを証明する活動である', 'テスト担当者だけがデバッグを実施できる'],
    explanation: '動的テストで故障を観察した後、デバッグで原因となる欠陥を診断・修正し、確認テストを行います。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 1.2',
  },
  {
    id: 'fl-003', chapterNumber: 1, chapterTitle: 'テストの基礎', objectiveCode: 'FL-1.3.1',
    prompt: '「テストの網羅性には限界がある」という原則から導かれる対応はどれですか。',
    correct: 'リスクと優先度に基づいてテスト対象と深さを選ぶ',
    distractors: ['全入力値を必ず組み合わせる', '自動テストだけを使用する', '欠陥が見つからなくなるまで無期限に続ける'],
    explanation: '網羅的テストは単純な対象を除き現実的ではないため、リスク分析やテスト技法で効果的に絞り込みます。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 1.3',
  },
  {
    id: 'fl-004', chapterNumber: 1, chapterTitle: 'テストの基礎', objectiveCode: 'FL-1.4.1',
    prompt: 'テストプロセスの「テスト分析」で主に決める内容はどれですか。',
    correct: '何をテストするかを識別し、テスト条件を定義する',
    distractors: ['テスト環境を停止する日時を決める', '欠陥の修正コードを実装する', 'プロジェクトの給与計算を行う'],
    explanation: 'テスト分析ではテストベースを分析し、テスト可能なフィーチャーとテスト条件を識別します。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 1.4',
  },
  {
    id: 'fl-005', chapterNumber: 2, chapterTitle: '開発ライフサイクル全体を通してのテスト', objectiveCode: 'FL-2.1.1',
    prompt: 'シフトレフトを実践する例として、最も適切なものはどれですか。',
    correct: '要件レビューへテスト担当者が早期に参加する',
    distractors: ['リリース後までテストを延期する', '本番障害だけをテスト結果として扱う', 'すべてのテストを開発最終日に実施する'],
    explanation: 'シフトレフトは、レビューやテスト設計などの品質活動をライフサイクルの早い段階へ移します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 2.1',
  },
  {
    id: 'fl-006', chapterNumber: 2, chapterTitle: '開発ライフサイクル全体を通してのテスト', objectiveCode: 'FL-2.2.1',
    prompt: 'コンポーネントテストの主な対象はどれですか。',
    correct: '個々のコンポーネントを分離して確認する',
    distractors: ['組織全体の業務プロセスだけを確認する', '運用中の市場反応だけを確認する', '複数企業間の契約だけを確認する'],
    explanation: 'コンポーネントテストは単体のコンポーネントを対象とし、インターフェースや内部ロジックなどを検証します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 2.2',
  },
  {
    id: 'fl-007', chapterNumber: 2, chapterTitle: '開発ライフサイクル全体を通してのテスト', objectiveCode: 'FL-2.2.3',
    prompt: 'リグレッションテストの目的はどれですか。',
    correct: '変更が既存の領域へ悪影響を与えていないか確認する',
    distractors: ['修正した欠陥そのものだけを再現する', '新規要件を承認する', 'テスト環境を廃棄する'],
    explanation: '確認テストは修正の成否を確認し、リグレッションテストは変更による意図しない影響を確認します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 2.2',
  },
  {
    id: 'fl-008', chapterNumber: 3, chapterTitle: '静的テスト', objectiveCode: 'FL-3.1.1',
    prompt: '静的テストで評価できる成果物の例として適切なものはどれですか。',
    correct: '要件仕様書やソースコード',
    distractors: ['実行中にだけ発生するCPU温度', '本番利用者の将来の感情', 'まだ定義されていない架空の入力'],
    explanation: '静的テストは成果物を実行せず、レビューや静的解析によって欠陥を検出します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 3.1',
  },
  {
    id: 'fl-009', chapterNumber: 3, chapterTitle: '静的テスト', objectiveCode: 'FL-3.2.2',
    prompt: '正式なレビューで、レビュー会議の進行と効果的な参加を支援する役割はどれですか。',
    correct: 'モデレータ',
    distractors: ['作成者だけ', '顧客の会計担当者', '運用監視ツール'],
    explanation: 'モデレータはレビューの円滑な進行、時間管理、安全な議論などを支援します。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 3.2',
  },
  {
    id: 'fl-010', chapterNumber: 4, chapterTitle: 'テスト分析と設計', objectiveCode: 'FL-4.2.1',
    prompt: '同値分割法を使う主な理由はどれですか。',
    correct: '同じように処理される値の集合から代表値を選ぶため',
    distractors: ['すべての入力値を実行するため', 'コードの行数を増やすため', 'レビュー参加者を決めるため'],
    explanation: '同値分割法では、同等に扱われると期待する値を同値パーティションに分け、代表値を選択します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 4.2',
  },
  {
    id: 'fl-011', chapterNumber: 4, chapterTitle: 'テスト分析と設計', objectiveCode: 'FL-4.2.2',
    prompt: '有効範囲が1以上100以下の整数であるとき、2値境界値分析の境界値セットはどれですか。',
    correct: '0、1、100、101',
    distractors: ['1、50、100、150', '0、50、101、200', '2、3、98、99'],
    explanation: '2値境界値分析では各境界について境界上と隣接する外側の値を扱います。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 4.2',
  },
  {
    id: 'fl-012', chapterNumber: 4, chapterTitle: 'テスト分析と設計', objectiveCode: 'FL-4.2.3',
    prompt: 'デシジョンテーブルテストが特に有効な対象はどれですか。',
    correct: '条件の組み合わせによって異なるアクションが決まる業務ルール',
    distractors: ['単一の文章の誤字だけ', '画面の色の好みだけ', '実行環境の設置場所だけ'],
    explanation: '複数条件の組み合わせと結果を体系的に表すことで、複雑な業務ルールの抜けを見つけやすくします。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 4.2',
  },
  {
    id: 'fl-013', chapterNumber: 4, chapterTitle: 'テスト分析と設計', objectiveCode: 'FL-4.2.4',
    prompt: '状態遷移テストで扱う情報として最も適切なものはどれですか。',
    correct: '現在の状態、イベント、遷移後の状態',
    distractors: ['担当者の勤続年数だけ', 'ソースファイルの文字数だけ', '端末の購入価格だけ'],
    explanation: '状態遷移テストは状態、イベント、遷移、必要に応じてガード条件やアクションをモデル化します。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 4.2',
  },
  {
    id: 'fl-014', chapterNumber: 4, chapterTitle: 'テスト分析と設計', objectiveCode: 'FL-4.3.1',
    prompt: 'ステートメントカバレッジ100%が意味することはどれですか。',
    correct: '実行可能な各ステートメントを少なくとも1回実行した',
    distractors: ['すべての欠陥を検出した', 'すべての分岐結果を必ず実行した', 'テストが不要になった'],
    explanation: 'ステートメントカバレッジはコード要素の実行割合を表します。100%でも欠陥不在や分岐網羅は保証しません。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 4.3',
  },
  {
    id: 'fl-015', chapterNumber: 5, chapterTitle: 'テスト活動のマネジメント', objectiveCode: 'FL-5.1.3',
    prompt: 'テストを独立した視点で行う利点はどれですか。',
    correct: '作成者と異なる認知バイアスにより別種の欠陥を見つけやすい',
    distractors: ['開発者との協力が不要になる', 'テスト計画が不要になる', '品質責任がテスト担当者だけに移る'],
    explanation: '独立性は異なる視点をもたらしますが、孤立や対立を避け、チームで品質責任を共有することも重要です。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 5.1',
  },
  {
    id: 'fl-016', chapterNumber: 5, chapterTitle: 'テスト活動のマネジメント', objectiveCode: 'FL-5.2.1',
    prompt: 'プロダクトリスクの例として最も適切なものはどれですか。',
    correct: '決済金額が誤って計算され、利用者へ損失を与える可能性',
    distractors: ['テスト担当者の採用が遅れる可能性', '会議室を予約できない可能性', '開発契約の締結が遅れる可能性'],
    explanation: 'プロダクトリスクは品質特性に関するリスクです。人員や日程などは一般にプロジェクトリスクです。',
    difficulty: 2, sourceReference: 'Foundation Level シラバス 5.2',
  },
  {
    id: 'fl-017', chapterNumber: 5, chapterTitle: 'テスト活動のマネジメント', objectiveCode: 'FL-5.3.1',
    prompt: 'テスト進捗の監視に適したメトリクスはどれですか。',
    correct: '計画済みテストケースに対する実行済み件数の割合',
    distractors: ['チームの雑談時間だけ', 'オフィスの座席数だけ', '製品名の文字数だけ'],
    explanation: '実行進捗、合否、欠陥状況、カバレッジなど、目的に対応した測定可能な指標を使用します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 5.3',
  },
  {
    id: 'fl-018', chapterNumber: 6, chapterTitle: 'テストツール', objectiveCode: 'FL-6.1.1',
    prompt: 'テスト自動化を導入する際のリスクとして適切なものはどれですか。',
    correct: '保守コストや必要スキルを過小評価すること',
    distractors: ['自動化すると必ず手動テストが禁止されること', 'ツールが必ず全欠陥を修正すること', '自動化すると要件が自動で承認されること'],
    explanation: '導入・保守コスト、学習、ツール依存、非現実的な期待などを考慮し、段階的に導入します。',
    difficulty: 1, sourceReference: 'Foundation Level シラバス 6.1',
  },
];

export const questions = seeds.map(createQuestion);

export function getQuestion(questionId: string): Question | undefined {
  return questions.find((question) => question.id === questionId);
}

export function getQuestionsByChapter(chapterNumber: number): Question[] {
  return questions.filter((question) => question.chapterNumber === chapterNumber);
}
