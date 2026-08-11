export type ContentKLevel = 1 | 2 | 3;

export interface ContentObjective {
  code: string;
  chapterNumber: number;
  section: string;
  kLevel: ContentKLevel;
  title: string;
}

export const chapterTitles = {
  1: 'テストの基礎',
  2: 'ソフトウェア開発ライフサイクル全体を通してのテスト',
  3: '静的テスト',
  4: 'テスト分析と設計',
  5: 'テスト活動のマネジメント',
  6: 'テストツール',
} as const;

export const contentObjectives: readonly ContentObjective[] = [
  { code: 'FL-1.1.1', chapterNumber: 1, section: '1.1', kLevel: 1, title: 'テスト目的' },
  { code: 'FL-1.1.2', chapterNumber: 1, section: '1.1', kLevel: 2, title: 'テストとデバッグ' },
  { code: 'FL-1.2.1', chapterNumber: 1, section: '1.2', kLevel: 2, title: 'テストの必要性' },
  { code: 'FL-1.2.2', chapterNumber: 1, section: '1.2', kLevel: 1, title: 'テストと品質保証' },
  { code: 'FL-1.2.3', chapterNumber: 1, section: '1.2', kLevel: 2, title: 'エラー・欠陥・故障・根本原因' },
  { code: 'FL-1.3.1', chapterNumber: 1, section: '1.3', kLevel: 2, title: 'テストの原則' },
  { code: 'FL-1.4.1', chapterNumber: 1, section: '1.4', kLevel: 2, title: 'テスト活動とタスク' },
  { code: 'FL-1.4.2', chapterNumber: 1, section: '1.4', kLevel: 2, title: 'テストのコンテキスト' },
  { code: 'FL-1.4.3', chapterNumber: 1, section: '1.4', kLevel: 2, title: 'テストウェア' },
  { code: 'FL-1.4.4', chapterNumber: 1, section: '1.4', kLevel: 2, title: 'トレーサビリティ' },
  { code: 'FL-1.4.5', chapterNumber: 1, section: '1.4', kLevel: 2, title: 'テストの役割' },
  { code: 'FL-1.5.1', chapterNumber: 1, section: '1.5', kLevel: 2, title: 'テストに必要なスキル' },
  { code: 'FL-1.5.2', chapterNumber: 1, section: '1.5', kLevel: 1, title: 'チーム全体アプローチ' },
  { code: 'FL-1.5.3', chapterNumber: 1, section: '1.5', kLevel: 2, title: 'テストの独立性' },
  { code: 'FL-2.1.1', chapterNumber: 2, section: '2.1', kLevel: 2, title: 'SDLCとテスト' },
  { code: 'FL-2.1.2', chapterNumber: 2, section: '2.1', kLevel: 1, title: 'SDLC共通のテスト実践' },
  { code: 'FL-2.1.3', chapterNumber: 2, section: '2.1', kLevel: 1, title: 'テストファーストアプローチ' },
  { code: 'FL-2.1.4', chapterNumber: 2, section: '2.1', kLevel: 2, title: 'DevOpsとテスト' },
  { code: 'FL-2.1.5', chapterNumber: 2, section: '2.1', kLevel: 2, title: 'シフトレフト' },
  { code: 'FL-2.1.6', chapterNumber: 2, section: '2.1', kLevel: 2, title: 'ふりかえりと改善' },
  { code: 'FL-2.2.1', chapterNumber: 2, section: '2.2', kLevel: 2, title: 'テストレベル' },
  { code: 'FL-2.2.2', chapterNumber: 2, section: '2.2', kLevel: 2, title: 'テストタイプ' },
  { code: 'FL-2.2.3', chapterNumber: 2, section: '2.2', kLevel: 2, title: '確認テストとリグレッションテスト' },
  { code: 'FL-2.3.1', chapterNumber: 2, section: '2.3', kLevel: 2, title: 'メンテナンステスト' },
  { code: 'FL-3.1.1', chapterNumber: 3, section: '3.1', kLevel: 1, title: '静的テスト対象' },
  { code: 'FL-3.1.2', chapterNumber: 3, section: '3.1', kLevel: 2, title: '静的テストの価値' },
  { code: 'FL-3.1.3', chapterNumber: 3, section: '3.1', kLevel: 2, title: '静的テストと動的テスト' },
  { code: 'FL-3.2.1', chapterNumber: 3, section: '3.2', kLevel: 1, title: '早期フィードバック' },
  { code: 'FL-3.2.2', chapterNumber: 3, section: '3.2', kLevel: 2, title: 'レビュープロセス' },
  { code: 'FL-3.2.3', chapterNumber: 3, section: '3.2', kLevel: 1, title: 'レビューの役割' },
  { code: 'FL-3.2.4', chapterNumber: 3, section: '3.2', kLevel: 2, title: 'レビュー種別' },
  { code: 'FL-3.2.5', chapterNumber: 3, section: '3.2', kLevel: 1, title: 'レビュー成功要因' },
  { code: 'FL-4.1.1', chapterNumber: 4, section: '4.1', kLevel: 2, title: 'テスト技法の分類' },
  { code: 'FL-4.2.1', chapterNumber: 4, section: '4.2', kLevel: 3, title: '同値分割法' },
  { code: 'FL-4.2.2', chapterNumber: 4, section: '4.2', kLevel: 3, title: '境界値分析' },
  { code: 'FL-4.2.3', chapterNumber: 4, section: '4.2', kLevel: 3, title: 'デシジョンテーブルテスト' },
  { code: 'FL-4.2.4', chapterNumber: 4, section: '4.2', kLevel: 3, title: '状態遷移テスト' },
  { code: 'FL-4.3.1', chapterNumber: 4, section: '4.3', kLevel: 2, title: 'ステートメントテスト' },
  { code: 'FL-4.3.2', chapterNumber: 4, section: '4.3', kLevel: 2, title: 'ブランチテスト' },
  { code: 'FL-4.3.3', chapterNumber: 4, section: '4.3', kLevel: 2, title: 'ホワイトボックステストの価値' },
  { code: 'FL-4.4.1', chapterNumber: 4, section: '4.4', kLevel: 2, title: 'エラー推測' },
  { code: 'FL-4.4.2', chapterNumber: 4, section: '4.4', kLevel: 2, title: '探索的テスト' },
  { code: 'FL-4.4.3', chapterNumber: 4, section: '4.4', kLevel: 2, title: 'チェックリストベースドテスト' },
  { code: 'FL-4.5.1', chapterNumber: 4, section: '4.5', kLevel: 2, title: 'ユーザーストーリーの共同作成' },
  { code: 'FL-4.5.2', chapterNumber: 4, section: '4.5', kLevel: 2, title: '受け入れ基準' },
  { code: 'FL-4.5.3', chapterNumber: 4, section: '4.5', kLevel: 3, title: 'ATDD' },
  { code: 'FL-5.1.1', chapterNumber: 5, section: '5.1', kLevel: 2, title: 'テスト計画書' },
  { code: 'FL-5.1.2', chapterNumber: 5, section: '5.1', kLevel: 1, title: 'イテレーション・リリース計画への貢献' },
  { code: 'FL-5.1.3', chapterNumber: 5, section: '5.1', kLevel: 2, title: '開始基準と終了基準' },
  { code: 'FL-5.1.4', chapterNumber: 5, section: '5.1', kLevel: 3, title: 'テスト見積り' },
  { code: 'FL-5.1.5', chapterNumber: 5, section: '5.1', kLevel: 3, title: 'テストケースの優先順位付け' },
  { code: 'FL-5.1.6', chapterNumber: 5, section: '5.1', kLevel: 1, title: 'テストピラミッド' },
  { code: 'FL-5.1.7', chapterNumber: 5, section: '5.1', kLevel: 2, title: 'テストの四象限' },
  { code: 'FL-5.2.1', chapterNumber: 5, section: '5.2', kLevel: 1, title: 'リスクレベル' },
  { code: 'FL-5.2.2', chapterNumber: 5, section: '5.2', kLevel: 2, title: 'プロジェクトリスクとプロダクトリスク' },
  { code: 'FL-5.2.3', chapterNumber: 5, section: '5.2', kLevel: 2, title: 'プロダクトリスク分析' },
  { code: 'FL-5.2.4', chapterNumber: 5, section: '5.2', kLevel: 2, title: 'プロダクトリスクコントロール' },
  { code: 'FL-5.3.1', chapterNumber: 5, section: '5.3', kLevel: 1, title: 'テストメトリクス' },
  { code: 'FL-5.3.2', chapterNumber: 5, section: '5.3', kLevel: 2, title: 'テストレポート' },
  { code: 'FL-5.3.3', chapterNumber: 5, section: '5.3', kLevel: 2, title: 'テスト状況の伝達' },
  { code: 'FL-5.4.1', chapterNumber: 5, section: '5.4', kLevel: 2, title: '構成管理' },
  { code: 'FL-5.5.1', chapterNumber: 5, section: '5.5', kLevel: 3, title: '欠陥レポート' },
  { code: 'FL-6.1.1', chapterNumber: 6, section: '6.1', kLevel: 2, title: 'テストツールによる支援' },
  { code: 'FL-6.2.1', chapterNumber: 6, section: '6.2', kLevel: 1, title: 'テスト自動化の利点とリスク' },
] as const;

export const objectiveByCode = new Map(contentObjectives.map((objective) => [objective.code, objective]));

export const targetChapterDistribution: Readonly<Record<number, number>> = {
  1: 100,
  2: 75,
  3: 50,
  4: 138,
  5: 112,
  6: 25,
};

export const targetKLevelDistribution: Readonly<Record<ContentKLevel, number>> = {
  1: 100,
  2: 300,
  3: 100,
};
