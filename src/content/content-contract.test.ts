import { describe, expect, it } from 'vitest';

import { questions } from './questions';

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
}

describe('公開サンプル問題のコンテンツ契約', () => {
  it('識別子、学習目標、出典が追跡可能である', () => {
    for (const question of questions) {
      expect(question.id).toMatch(/^fl-\d{3}$/u);
      expect(question.versionId).toMatch(new RegExp(`^${question.id}-v\\d+$`, 'u'));
      expect(question.objectiveCode).toMatch(/^FL-\d+\.\d+\.\d+$/u);
      expect(question.sourceReference.trim().length).toBeGreaterThan(10);
    }
  });

  it('問題文と選択肢に重複がなく、全選択肢へ説明がある', () => {
    const normalizedPrompts = questions.map((question) => normalize(question.prompt));
    expect(new Set(normalizedPrompts).size).toBe(normalizedPrompts.length);

    for (const question of questions) {
      const choiceBodies = question.choices.map((choice) => normalize(choice.body));
      expect(new Set(choiceBodies).size).toBe(choiceBodies.length);
      for (const choice of question.choices) {
        expect(choice.body.trim()).not.toBe('');
        expect(choice.explanation.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it('過去問または公式問題と誤認させる表示を含まない', () => {
    const serialized = JSON.stringify(questions);
    expect(serialized).not.toMatch(/過去問|公式問題|JSTQB公認/u);
  });
});
