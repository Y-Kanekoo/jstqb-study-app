import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { examConfig } from '@/config/exam';
import { Screen } from '@/components/screen';
import { Button, Card, ProgressBar } from '@/components/ui';
import { getSessionQuestion } from '@/domain/session-question';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts, radii } from '@/theme/tokens';

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function PracticeScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [reviewExamResults, setReviewExamResults] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(examConfig.durationMinutes * 60);
  const autoSubmittingRef = useRef(false);
  const sessions = useLearningStore((state) => state.sessions);
  const drafts = useLearningStore((state) => state.drafts);
  const attempts = useLearningStore((state) => state.attempts);
  const bookmarks = useLearningStore((state) => state.bookmarks);
  const notes = useLearningStore((state) => state.notes);
  const saving = useLearningStore((state) => state.saving);
  const storageError = useLearningStore((state) => state.storageError);
  const selectChoice = useLearningStore((state) => state.selectChoice);
  const submitAnswer = useLearningStore((state) => state.submitAnswer);
  const moveToNext = useLearningStore((state) => state.moveToNext);
  const goToQuestion = useLearningStore((state) => state.goToQuestion);
  const toggleReviewMark = useLearningStore((state) => state.toggleReviewMark);
  const toggleBookmark = useLearningStore((state) => state.toggleBookmark);
  const saveNote = useLearningStore((state) => state.saveNote);
  const submitExam = useLearningStore((state) => state.submitExam);

  const session = sessions.find((item) => item.id === sessionId);

  useEffect(() => {
    if (!session || session.mode !== 'exam' || session.status !== 'active' || !session.expiresAt) return undefined;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((new Date(session.expiresAt ?? '').getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0 && !autoSubmittingRef.current) {
        autoSubmittingRef.current = true;
        void submitExam(session.id).catch(() => {
          autoSubmittingRef.current = false;
          setActionError('時間切れの結果を保存できませんでした。通信状態と空き容量をご確認ください。');
        });
      }
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [session, submitExam]);

  if (!session) {
    return (
      <Screen title="学習を開けませんでした" description="この端末にセッションが見つかりません。">
        <Button label="ホームへ戻る" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const sessionAttempts = attempts.filter((attempt) => attempt.sessionId === session.id);
  if (session.status === 'completed' && !(session.mode === 'exam' && reviewExamResults)) {
    const invalidatedCount = sessionAttempts.filter((attempt) => attempt.invalidated).length;
    const validAttempts = sessionAttempts.filter((attempt) => !attempt.invalidated);
    const correctCount = validAttempts.filter((attempt) => attempt.isCorrect).length;
    const denominator = session.mode === 'exam'
      ? Math.max(0, session.questionIds.length - invalidatedCount)
      : validAttempts.length;
    const accuracy = denominator === 0 ? 0 : Math.round((correctCount / denominator) * 100);
    const passed = session.mode === 'exam' && correctCount >= examConfig.passScore;
    return (
      <Screen
        title={session.mode === 'exam' ? (passed ? '合格です' : 'あと一歩です') : 'おつかれさまでした'}
        description={session.mode === 'exam' ? `模擬試験 ${examConfig.syllabusVersion} の結果を保存しました。` : '1問ごとの結果は保存済みです。'}
      >
        <Card style={styles.resultSummary}>
          <View style={styles.resultSeal}><Text style={styles.resultSealText}>{accuracy}%</Text></View>
          <Text style={styles.resultTitle}>{correctCount} / {denominator}問 正解</Text>
          <Text style={styles.resultCopy}>
            {session.mode === 'exam'
              ? `${examConfig.passScore}点以上で合格です。未回答は${Math.max(0, denominator - sessionAttempts.length)}問でした。正誤と解説は「解答を見直す」から確認できます。`
              : '間違えた問題は「誤答」へ追加されました。別セッションで2回続けて正解すると克服になります。'}
          </Text>
        </Card>
        <View style={styles.resultActions}>
          {session.mode === 'exam' && <Button label="解答を見直す" variant="secondary" onPress={() => {
            setReviewExamResults(true);
            void goToQuestion(session.id, 0);
          }} />}
          <Button label="ホームへ戻る" onPress={() => router.replace('/')} />
          <Button label="誤答を確認" variant="secondary" onPress={() => router.replace('/wrong')} />
        </View>
      </Screen>
    );
  }

  const questionId = session.questionIds[session.currentIndex];
  const question = questionId ? getSessionQuestion(session, questionId) : undefined;
  if (!question) {
    return (
      <Screen title="問題を表示できませんでした" description="問題データが更新された可能性があります。">
        <Button label="ホームへ戻る" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const draft = drafts[`${session.id}:${question.id}`];
  const selectedChoiceIds = draft?.selectedChoiceIds ?? [];
  const selectionType = question.selectionType ?? 'single';
  const requiredChoiceCount = question.requiredChoiceCount ?? 1;
  const attempt = sessionAttempts.find((item) => item.questionId === question.id);
  const bookmarked = bookmarks.includes(question.id);
  const note = notes[question.id]?.body ?? '';
  const isExam = session.mode === 'exam';
  const isExamReview = isExam && session.status === 'completed';
  const reviewMarked = (session.reviewQuestionIds ?? []).includes(question.id);
  const answeredDraftCount = session.questionIds.filter((id) => {
    const targetQuestion = getSessionQuestion(session, id);
    return (drafts[`${session.id}:${id}`]?.selectedChoiceIds.length ?? 0) === (targetQuestion?.requiredChoiceCount ?? 1);
  }).length;
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

  const navigateExam = async (index: number) => {
    setActionError(null);
    try {
      await goToQuestion(session.id, index);
    } catch {
      setActionError('表示位置を保存できませんでした。もう一度お試しください。');
    }
  };

  const finishExam = async () => {
    setShowSubmitConfirm(false);
    setActionError(null);
    try {
      await submitExam(session.id);
    } catch {
      setActionError('模試結果を保存できませんでした。空き容量をご確認ください。');
    }
  };

  const updateNote = async (body: string) => {
    try {
      await saveNote(question.id, question.versionId, body);
    } catch {
      setActionError('メモを保存できませんでした。空き容量をご確認ください。');
    }
  };

  return (
    <Screen>
      <View style={styles.practiceHeader}>
        <Button label="終了" variant="quiet" style={styles.headerButton} onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text>
          <Text style={isExam && session.status === 'active' ? styles.examTimer : styles.saveStatus}>
            {isExam && session.status === 'active' ? `残り ${formatRemainingTime(secondsRemaining)}` : saving ? '端末へ保存中…' : 'この問題まで保存済み'}
          </Text>
        </View>
        <Pressable accessibilityLabel={bookmarked ? 'ブックマークを解除' : 'ブックマークへ追加'} accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void toggleBookmark(question.id)} style={styles.bookmark}>
          <Text style={[styles.bookmarkText, bookmarked && styles.bookmarkActive]}>{bookmarked ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      <View style={styles.progressArea}>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>問題 {session.currentIndex + 1}</Text>
          <Text style={styles.progressCount}>{isExam && session.status === 'active' ? `回答済み ${answeredDraftCount} / ${session.questionIds.length}` : `${session.currentIndex + 1} / ${session.questionIds.length}`}</Text>
        </View>
        <ProgressBar value={(session.currentIndex + 1) / session.questionIds.length} />
        {isExam && (
          <View style={styles.examTools}>
            <Button
              label={reviewMarked ? '見直し印を外す' : 'あとで見直す'}
              variant={reviewMarked ? 'secondary' : 'quiet'}
              style={styles.examToolButton}
              onPress={() => void toggleReviewMark(session.id, question.id)}
            />
            {session.status === 'active' && <Button label="問題一覧・提出" variant="quiet" style={styles.examToolButton} onPress={() => setShowSubmitConfirm(true)} />}
          </View>
        )}
      </View>

      <Card style={styles.questionCard}>
        <View style={styles.metaRow}>
          <View style={styles.chapterPill}><Text style={styles.chapterPillText}>第{question.chapterNumber}章</Text></View>
          <Text style={styles.objective}>{question.objectiveCode}</Text>
          <Text style={styles.difficulty}>{'●'.repeat(question.difficulty)}{'○'.repeat(3 - question.difficulty)}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.prompt}>{question.prompt}</Text>
        <Text style={styles.instruction}>
          {selectionType === 'multiple'
            ? `適切なものを${requiredChoiceCount}つ選んでください（現在${selectedChoiceIds.length}つ）`
            : '最も適切なものを1つ選んでください'}
        </Text>

        <View style={styles.choices}>
          {question.choices.map((choice) => {
            const selected = selectedChoiceIds.includes(choice.id);
            const resultCorrect = false;
            const resultWrong = false;
            return (
              <Pressable
                aria-checked={selected}
                key={choice.id}
                accessibilityRole={selectionType === 'multiple' ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: selected, disabled: Boolean(attempt || isExamReview) }}
                disabled={Boolean(attempt || isExamReview)}
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
                <View style={styles.choiceCopy}>
                  <Text style={styles.choiceBody}>{choice.body}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={styles.questionActions}>
        <Button label="問題を報告" variant="quiet" style={styles.questionActionButton} onPress={() => router.push({ pathname: '/report/[questionId]', params: { questionId: question.id, sessionId: session.id } })} />
        <Text style={styles.versionLabel}>問題ID {question.id} · 版 {question.versionId}</Text>
      </View>

      <Card style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <Text style={styles.noteTitle}>自分用メモ</Text>
          <Text style={styles.noteStatus}>{saving ? '保存中' : '自動保存'}</Text>
        </View>
        <TextInput
          accessibilityLabel="この問題の自分用メモ"
          multiline
          onChangeText={(body) => void updateNote(body)}
          placeholder="覚え方や、間違えた理由を書いておけます。"
          placeholderTextColor={colors.inkMuted}
          style={styles.noteInput}
          textAlignVertical="top"
          value={note}
        />
        <Text style={styles.notePrivacy}>このメモは自分のアカウントだけに保存されます。</Text>
      </Card>

      {visibleError && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{visibleError}</Text></View>}

      {attempt ? (
        <Card style={[styles.feedbackCard, attempt.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}>
          <Text style={[styles.feedbackResult, attempt.isCorrect ? styles.correctText : styles.wrongText]}>{attempt.isCorrect ? '正解です' : 'もう一度、整理しましょう'}</Text>
          <Text style={styles.feedbackExplanation}>{question.explanation}</Text>
          <View style={styles.sourceLine} /><Text style={styles.source}>{question.sourceReference} · 独自作成問題</Text>
          <Button
            label={isExamReview && isLastQuestion ? '結果へ戻る' : isLastQuestion ? '結果を見る' : '次の問題へ'}
            loading={saving}
            onPress={() => {
              if (isExamReview && isLastQuestion) setReviewExamResults(false);
              else if (isExamReview) void navigateExam(session.currentIndex + 1);
              else void next();
            }}
          />
        </Card>
      ) : isExamReview ? (
        <Card style={[styles.feedbackCard, styles.feedbackWrong]}>
          <Text style={[styles.feedbackResult, styles.wrongText]}>未回答でした</Text>
          <Text style={styles.feedbackExplanation}>{question.explanation}</Text>
          <Button
            label={isLastQuestion ? '結果へ戻る' : '次の問題へ'}
            onPress={() => isLastQuestion ? setReviewExamResults(false) : void navigateExam(session.currentIndex + 1)}
          />
        </Card>
      ) : isExam ? (
        <View style={styles.examNavigation}>
          <Button label="前の問題" variant="secondary" disabled={session.currentIndex === 0} style={styles.examNavigationButton} onPress={() => void navigateExam(session.currentIndex - 1)} />
          <Button label={isLastQuestion ? '提出確認へ' : '次の問題'} style={styles.examNavigationButton} onPress={() => isLastQuestion ? setShowSubmitConfirm(true) : void navigateExam(session.currentIndex + 1)} />
        </View>
      ) : (
        <Button
          label="回答を確定する"
          disabled={selectedChoiceIds.length !== requiredChoiceCount}
          loading={saving}
          onPress={() => void submit()}
        />
      )}

      <Modal animationType="fade" onRequestClose={() => setShowSubmitConfirm(false)} transparent visible={showSubmitConfirm}>
        <View style={styles.modalOverlay}>
          <Card style={styles.examOverview} accessibilityLabel="模試の回答状況">
            <Text accessibilityRole="header" style={styles.overviewTitle}>回答状況を確認</Text>
            <Text style={styles.overviewDescription}>回答済み {answeredDraftCount}問 · 未回答 {session.questionIds.length - answeredDraftCount}問 · 見直し {(session.reviewQuestionIds ?? []).length}問</Text>
            <View style={styles.questionGrid}>
              {session.questionIds.map((id, index) => {
                const targetQuestion = getSessionQuestion(session, id);
                const answered = (drafts[`${session.id}:${id}`]?.selectedChoiceIds.length ?? 0) === (targetQuestion?.requiredChoiceCount ?? 1);
                const marked = (session.reviewQuestionIds ?? []).includes(id);
                return (
                  <Pressable
                    accessibilityLabel={`問題${index + 1}、${answered ? '回答済み' : '未回答'}${marked ? '、見直しあり' : ''}`}
                    accessibilityRole="button"
                    key={id}
                    onPress={() => {
                      setShowSubmitConfirm(false);
                      void navigateExam(index);
                    }}
                    style={[styles.questionIndex, answered && styles.questionIndexAnswered, marked && styles.questionIndexMarked]}
                  >
                    <Text style={[styles.questionIndexText, answered && styles.questionIndexTextAnswered]}>{index + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.overviewActions}>
              <Button label="試験に戻る" variant="secondary" style={styles.overviewAction} onPress={() => setShowSubmitConfirm(false)} />
              <Button label="採点して提出" style={styles.overviewAction} onPress={() => void finishExam()} />
            </View>
            <Text style={styles.submitNotice}>提出後は回答を変更できません。未回答は0点として判定します。</Text>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  practiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 14 },
  headerCenter: { flex: 1, alignItems: 'center' },
  sessionTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13, maxWidth: 360 },
  saveStatus: { color: colors.success, fontFamily: fonts.body, fontSize: 10, marginTop: 3 },
  examTimer: { color: colors.warning, fontFamily: fonts.bodyBold, fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  bookmark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
  bookmarkText: { color: colors.inkMuted, fontSize: 25 },
  bookmarkActive: { color: colors.warning },
  progressArea: { gap: 9 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  progressCount: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  examTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  examToolButton: { flex: 1, minWidth: 145, minHeight: 42, paddingVertical: 8 },
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
  choiceCopy: { flex: 1, gap: 5 },
  choiceBody: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 23 },
  choiceExplanation: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 11, lineHeight: 18 },
  questionActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  questionActionButton: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 13 },
  versionLabel: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 10 },
  noteCard: { gap: 10, shadowOpacity: 0 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  noteTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 16 },
  noteStatus: { color: colors.success, fontFamily: fonts.bodyBold, fontSize: 10 },
  noteInput: { minHeight: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 22, padding: 12 },
  notePrivacy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 10 },
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
  examNavigation: { flexDirection: 'row', gap: 10 },
  examNavigationButton: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(23, 50, 77, 0.55)', justifyContent: 'center', padding: 18 },
  examOverview: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', gap: 15, padding: 24 },
  overviewTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 23 },
  overviewDescription: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 21 },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  questionIndex: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  questionIndexAnswered: { backgroundColor: colors.brand, borderColor: colors.brand },
  questionIndexMarked: { borderWidth: 3, borderColor: colors.warning },
  questionIndexText: { color: colors.inkMuted, fontFamily: fonts.bodyBold, fontSize: 12 },
  questionIndexTextAnswered: { color: colors.surface },
  overviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewAction: { flex: 1, minWidth: 180 },
  submitNotice: { color: colors.warning, fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 18 },
  resultSummary: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  resultSeal: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft, borderWidth: 8, borderColor: '#C7DDF8' },
  resultSealText: { color: colors.brandStrong, fontFamily: fonts.display, fontSize: 25 },
  resultTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 },
  resultCopy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22, textAlign: 'center', maxWidth: 520 },
  resultActions: { gap: 10 },
});
