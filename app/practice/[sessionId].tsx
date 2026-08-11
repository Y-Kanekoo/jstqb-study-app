import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getQuestion } from '@/content/questions';
import { Screen } from '@/components/screen';
import { Button, Card, ProgressBar } from '@/components/ui';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts, radii } from '@/theme/tokens';

export default function PracticeScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const sessions = useLearningStore((state) => state.sessions);
  const drafts = useLearningStore((state) => state.drafts);
  const attempts = useLearningStore((state) => state.attempts);
  const bookmarks = useLearningStore((state) => state.bookmarks);
  const saving = useLearningStore((state) => state.saving);
  const storageError = useLearningStore((state) => state.storageError);
  const selectChoice = useLearningStore((state) => state.selectChoice);
  const submitAnswer = useLearningStore((state) => state.submitAnswer);
  const moveToNext = useLearningStore((state) => state.moveToNext);
  const toggleBookmark = useLearningStore((state) => state.toggleBookmark);

  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    return (
      <Screen title="学習を開けませんでした" description="この端末にセッションが見つかりません。">
        <Button label="ホームへ戻る" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const sessionAttempts = attempts.filter((attempt) => attempt.sessionId === session.id);
  if (session.status === 'completed') {
    const correctCount = sessionAttempts.filter((attempt) => attempt.isCorrect).length;
    const accuracy = sessionAttempts.length === 0 ? 0 : Math.round((correctCount / sessionAttempts.length) * 100);
    return (
      <Screen title="おつかれさまでした" description="1問ごとの結果は保存済みです。">
        <Card style={styles.resultSummary}>
          <View style={styles.resultSeal}><Text style={styles.resultSealText}>{accuracy}%</Text></View>
          <Text style={styles.resultTitle}>{correctCount} / {sessionAttempts.length}問 正解</Text>
          <Text style={styles.resultCopy}>間違えた問題は「誤答」へ追加されました。別セッションで2回続けて正解すると克服になります。</Text>
        </Card>
        <View style={styles.resultActions}>
          <Button label="ホームへ戻る" onPress={() => router.replace('/')} />
          <Button label="誤答を確認" variant="secondary" onPress={() => router.replace('/wrong')} />
        </View>
      </Screen>
    );
  }

  const questionId = session.questionIds[session.currentIndex];
  const question = questionId ? getQuestion(questionId) : undefined;
  if (!question) {
    return (
      <Screen title="問題を表示できませんでした" description="問題データが更新された可能性があります。">
        <Button label="ホームへ戻る" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const draft = drafts[`${session.id}:${question.id}`];
  const selectedChoiceIds = draft?.selectedChoiceIds ?? [];
  const attempt = sessionAttempts.find((item) => item.questionId === question.id);
  const bookmarked = bookmarks.includes(question.id);
  const isLastQuestion = session.currentIndex === session.questionIds.length - 1;
  const visibleError = actionError ?? storageError;

  const choose = async (choiceId: string) => {
    setActionError(null);
    try {
      await selectChoice(session.id, question.id, choiceId);
    } catch {
      setActionError('選択を端末へ保存できませんでした。空き容量をご確認ください。');
    }
  };

  const submit = async () => {
    setActionError(null);
    try {
      await submitAnswer(session.id, question.id);
    } catch {
      setActionError('回答を保存できませんでした。次の問題へは進めません。');
    }
  };

  const next = async () => {
    setActionError(null);
    try {
      await moveToNext(session.id, question.id);
    } catch {
      setActionError('進捗を保存できませんでした。もう一度お試しください。');
    }
  };

  return (
    <Screen>
      <View style={styles.practiceHeader}>
        <Button label="終了" variant="quiet" style={styles.headerButton} onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text>
          <Text style={styles.saveStatus}>{saving ? '端末へ保存中…' : 'この問題まで保存済み'}</Text>
        </View>
        <Pressable accessibilityLabel={bookmarked ? 'ブックマークを解除' : 'ブックマークへ追加'} accessibilityRole="button" onPress={() => void toggleBookmark(question.id)} style={styles.bookmark}>
          <Text style={[styles.bookmarkText, bookmarked && styles.bookmarkActive]}>{bookmarked ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      <View style={styles.progressArea}>
        <View style={styles.progressLabels}><Text style={styles.progressLabel}>問題 {session.currentIndex + 1}</Text><Text style={styles.progressCount}>{session.currentIndex + 1} / {session.questionIds.length}</Text></View>
        <ProgressBar value={(session.currentIndex + 1) / session.questionIds.length} />
      </View>

      <Card style={styles.questionCard}>
        <View style={styles.metaRow}>
          <View style={styles.chapterPill}><Text style={styles.chapterPillText}>第{question.chapterNumber}章</Text></View>
          <Text style={styles.objective}>{question.objectiveCode}</Text>
          <Text style={styles.difficulty}>{'●'.repeat(question.difficulty)}{'○'.repeat(3 - question.difficulty)}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.prompt}>{question.prompt}</Text>
        <Text style={styles.instruction}>最も適切なものを1つ選んでください</Text>

        <View style={styles.choices}>
          {question.choices.map((choice) => {
            const selected = selectedChoiceIds.includes(choice.id);
            const resultCorrect = Boolean(attempt && choice.isCorrect);
            const resultWrong = Boolean(attempt && selected && !choice.isCorrect);
            return (
              <Pressable
                aria-checked={selected}
                key={choice.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: Boolean(attempt) }}
                disabled={Boolean(attempt)}
                onPress={() => void choose(choice.id)}
                style={({ pressed }) => [
                  styles.choice,
                  selected && styles.choiceSelected,
                  resultCorrect && styles.choiceCorrect,
                  resultWrong && styles.choiceWrong,
                  pressed && styles.choicePressed,
                ]}
              >
                <View style={[styles.choiceLabel, selected && styles.choiceLabelSelected, resultCorrect && styles.choiceLabelCorrect, resultWrong && styles.choiceLabelWrong]}>
                  <Text style={[styles.choiceLabelText, (selected || resultCorrect || resultWrong) && styles.choiceLabelTextSelected]}>{choice.label}</Text>
                </View>
                <Text style={styles.choiceBody}>{choice.body}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {visibleError && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{visibleError}</Text></View>}

      {attempt ? (
        <Card style={[styles.feedbackCard, attempt.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}>
          <Text style={[styles.feedbackResult, attempt.isCorrect ? styles.correctText : styles.wrongText]}>{attempt.isCorrect ? '正解です' : 'もう一度、整理しましょう'}</Text>
          <Text style={styles.feedbackExplanation}>{question.explanation}</Text>
          <View style={styles.sourceLine} /><Text style={styles.source}>{question.sourceReference} · 独自作成問題</Text>
          <Button label={isLastQuestion ? '結果を見る' : '次の問題へ'} loading={saving} onPress={() => void next()} />
        </Card>
      ) : (
        <Button label="回答を確定する" disabled={selectedChoiceIds.length === 0} loading={saving} onPress={() => void submit()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  practiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 14 },
  headerCenter: { flex: 1, alignItems: 'center' },
  sessionTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13, maxWidth: 360 },
  saveStatus: { color: colors.success, fontFamily: fonts.body, fontSize: 10, marginTop: 3 },
  bookmark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
  bookmarkText: { color: colors.inkMuted, fontSize: 25 },
  bookmarkActive: { color: colors.warning },
  progressArea: { gap: 9 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  progressCount: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  questionCard: { gap: 20, padding: 24 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  chapterPill: { backgroundColor: colors.brandSoft, borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 6 },
  chapterPillText: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 11 },
  objective: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 11 },
  difficulty: { color: colors.warning, fontSize: 10, marginLeft: 'auto', letterSpacing: 2 },
  prompt: { color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 34 },
  instruction: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  choices: { gap: 11 },
  choice: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.medium, padding: 13, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  choiceCorrect: { borderColor: colors.success, backgroundColor: colors.successSoft },
  choiceWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  choicePressed: { opacity: 0.76 },
  choiceLabel: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  choiceLabelSelected: { backgroundColor: colors.brand },
  choiceLabelCorrect: { backgroundColor: colors.success },
  choiceLabelWrong: { backgroundColor: colors.danger },
  choiceLabelText: { color: colors.ink, fontFamily: fonts.display, fontSize: 13 },
  choiceLabelTextSelected: { color: colors.surface },
  choiceBody: { flex: 1, color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 23 },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radii.medium, padding: 13 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  feedbackCard: { gap: 13, shadowOpacity: 0 },
  feedbackCorrect: { backgroundColor: colors.successSoft, borderColor: '#B5E0D0' },
  feedbackWrong: { backgroundColor: colors.warningSoft, borderColor: '#F2D99A' },
  feedbackResult: { fontFamily: fonts.display, fontSize: 20 },
  correctText: { color: colors.success },
  wrongText: { color: colors.warning },
  feedbackExplanation: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 25 },
  sourceLine: { height: 1, backgroundColor: colors.border, opacity: 0.65 },
  source: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 10 },
  resultSummary: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  resultSeal: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft, borderWidth: 8, borderColor: '#C7DDF8' },
  resultSealText: { color: colors.brandStrong, fontFamily: fonts.display, fontSize: 25 },
  resultTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 },
  resultCopy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22, textAlign: 'center', maxWidth: 520 },
  resultActions: { gap: 10 },
});
