import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLearningSnapshot } from '@/domain/backup';
import type { SessionQuestionSnapshot } from '@/domain/types';
import { useLearningStore } from './learning-store';

const mocks = vi.hoisted(() => ({
  ingestLearningEvents: vi.fn(),
  uuidCounter: { value: 0 },
}));
const storedValues = new Map<string, string>();

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));
vi.mock('@/storage/persistence', () => ({
  getStoredValue: async (key: string): Promise<string | null> => storedValues.get(key) ?? null,
  setStoredValue: async (key: string, value: string): Promise<void> => {
    storedValues.set(key, value);
  },
}));
vi.mock('@/services/learning-sync-api', () => ({
  ingestLearningEvents: mocks.ingestLearningEvents,
  fetchLearningEventsAfter: vi.fn(),
}));
vi.mock('@/domain/session-question', () => ({
  createQuestionSnapshots: (questionIds: string[]): SessionQuestionSnapshot[] => questionIds.map((id) => ({
    id,
    versionId: `${id}-v1`,
    chapterNumber: 1,
    chapterTitle: '第1章',
    objectiveCode: 'P0.1',
    prompt: `問題 ${id}`,
    explanation: 'runtimeに混入した解説',
    difficulty: 1,
    sourceReference: 'P0',
    selectionType: 'single',
    requiredChoiceCount: 1,
    choices: [
      { id: `${id}-a`, label: 'A', body: '選択肢A', explanation: 'runtime選択肢解説', isCorrect: true },
      { id: `${id}-b`, label: 'B', body: '選択肢B' },
    ],
  }) as unknown as SessionQuestionSnapshot),
  getSessionQuestion: (
    session: { questionIds: string[]; questionSnapshots?: { id: string }[] },
    questionId: string,
  ) => {
    const index = session.questionIds.indexOf(questionId);
    const question = session.questionSnapshots?.[index];
    return question?.id === questionId ? question : undefined;
  },
}));

const storageKey = 'learning-snapshot-v2:user:restart-user';

describe('学習ストアの再送・runtime境界', () => {
  beforeEach(async () => {
    storedValues.clear();
    mocks.ingestLearningEvents.mockReset();
    mocks.uuidCounter.value = 0;
    await useLearningStore.getState().initialize('restart-user');
  });

  it('連続通信失敗でもpending回答eventを重複保存せず、再起動後にdraftとoutboxを復元する', async () => {
    const sessionId = await useLearningStore.getState().startSession('random', '再送演習', ['retry-question']);
    const question = useLearningStore.getState().sessions[0]?.questionSnapshots?.[0];
    if (!question) throw new Error('テスト問題を作成できませんでした。');
    await useLearningStore.getState().selectChoice(sessionId, question.id, question.choices[0]?.id ?? '');

    const persistedAnswerCounts: number[] = [];
    mocks.ingestLearningEvents.mockImplementation(async () => {
      const rawSnapshot = storedValues.get(storageKey);
      const parsed = rawSnapshot ? parseLearningSnapshot(JSON.parse(rawSnapshot) as unknown) : null;
      persistedAnswerCounts.push(parsed?.outbox.filter((event) => event.kind === 'answer.submitted').length ?? -1);
      throw new Error('通信失敗');
    });

    await expect(useLearningStore.getState().submitAnswer(sessionId, question.id)).rejects.toThrow('通信失敗');
    const pendingAttemptId = useLearningStore.getState().outbox.find((event) => event.kind === 'answer.submitted')?.entityId;
    await expect(useLearningStore.getState().submitAnswer(sessionId, question.id)).rejects.toThrow('通信失敗');

    expect(persistedAnswerCounts).toEqual([1, 1]);
    const persisted = storedValues.get(storageKey);
    if (!persisted) throw new Error('回答失敗後のsnapshotが保存されていません。');
    const parsed = parseLearningSnapshot(JSON.parse(persisted) as unknown);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.drafts[`${sessionId}:${question.id}`]?.selectedChoiceIds).toEqual([question.choices[0]?.id]);
    expect(parsed.outbox.filter((event) => event.kind === 'answer.submitted')).toHaveLength(1);
    expect(new Set(parsed.outbox.map((event) => event.id)).size).toBe(parsed.outbox.length);

    await useLearningStore.getState().initialize('restart-user');

    const restored = useLearningStore.getState();
    expect(restored.drafts[`${sessionId}:${question.id}`]?.selectedChoiceIds).toEqual([question.choices[0]?.id]);
    expect(restored.outbox.filter((event) => event.kind === 'answer.submitted')).toHaveLength(1);
    expect(restored.outbox.find((event) => event.kind === 'answer.submitted')?.entityId).toBe(pendingAttemptId);
  });

  it('保存時にruntimeのexplanationと正答属性をsnapshot境界でsanitizeする', async () => {
    await useLearningStore.getState().startSession('random', '境界テスト', ['unsafe-question']);

    const persisted = storedValues.get(storageKey);
    if (!persisted) throw new Error('snapshotが保存されていません。');
    expect(persisted).not.toContain('runtimeに混入した解説');
    expect(persisted).not.toContain('runtime選択肢解説');
    expect(persisted).not.toContain('isCorrect');

    const parsed = parseLearningSnapshot(JSON.parse(persisted) as unknown);
    const question = parsed?.sessions[0]?.questionSnapshots?.[0];
    expect(question).toBeDefined();
    if (!question) return;
    expect(Object.hasOwn(question, 'explanation')).toBe(false);
    expect(question.choices.every((choice) => !Object.hasOwn(choice, 'explanation'))).toBe(true);
    expect(question.choices.every((choice) => !Object.hasOwn(choice, 'isCorrect'))).toBe(true);
  });
});
