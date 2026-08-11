import { describe, expect, it } from 'vitest';

import { questions } from './questions';

describe('公開サンプル問題', () => {
  it('問題IDと問題版IDが一意である', () => {
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
    expect(new Set(questions.map((question) => question.versionId)).size).toBe(questions.length);
  });

  it('全問題が4選択肢かつ正答1つである', () => {
    for (const question of questions) {
      expect(question.choices).toHaveLength(4);
      expect(question.choices.filter((choice) => choice.isCorrect)).toHaveLength(1);
      expect(new Set(question.choices.map((choice) => choice.id)).size).toBe(4);
      expect(question.explanation.length).toBeGreaterThan(20);
      expect(question.sourceReference).toContain('Foundation Level');
    }
  });

  it('全6章を含む', () => {
    expect([...new Set(questions.map((question) => question.chapterNumber))].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
