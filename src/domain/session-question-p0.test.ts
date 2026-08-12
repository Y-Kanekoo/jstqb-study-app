import { describe, expect, expectTypeOf, it } from 'vitest';

import { createQuestionSnapshots } from './session-question';
import type { PreAnswerQuestionSnapshot, SessionChoice } from './types';

describe('回答前問題snapshotの境界', () => {
  it('型にも正答推測情報を定義しない', () => {
    expectTypeOf<Extract<keyof PreAnswerQuestionSnapshot, 'explanation' | 'correctChoiceIds'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof SessionChoice, 'explanation' | 'isCorrect'>>().toEqualTypeOf<never>();
  });

  it('問題catalogから正答推測情報をコピーしない', () => {
    const snapshot = createQuestionSnapshots(['fl-001'])[0];

    expect(snapshot).toBeDefined();
    if (!snapshot) return;

    expect(Object.hasOwn(snapshot, 'explanation')).toBe(false);
    expect(Object.hasOwn(snapshot, 'correctChoiceIds')).toBe(false);
    for (const choice of snapshot.choices) {
      expect(Object.hasOwn(choice, 'explanation')).toBe(false);
      expect(Object.hasOwn(choice, 'isCorrect')).toBe(false);
    }
    expect(JSON.stringify(snapshot)).not.toContain('解説');
  });
});
