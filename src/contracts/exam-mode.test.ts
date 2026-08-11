import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import examModeContract from '../../contracts/exam-mode.v1.json';

const examContractSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal('exam'),
  questionCount: z.literal(40),
  durationMinutes: z.literal(60),
  passingScore: z.literal(26),
  scoring: z.literal('complete-match'),
  answerReveal: z.literal('after-submit'),
  timer: z.literal('wall-clock'),
  autosave: z.tuple([z.literal('selection'), z.literal('confirmation'), z.literal('position')]),
  offline: z.literal('supported'),
  stoppedQuestionPolicy: z.literal('exclude-from-denominator'),
}).strict();

describe('模試モード契約', () => {
  it('未実装期間も受入条件を固定し、スキップせず検証する', () => {
    const parsed: unknown = examModeContract;
    const contract = examContractSchema.parse(parsed);

    expect(contract.passingScore).toBeLessThanOrEqual(contract.questionCount);
    expect(contract.answerReveal).toBe('after-submit');
    expect(contract.timer).toBe('wall-clock');
  });
});
