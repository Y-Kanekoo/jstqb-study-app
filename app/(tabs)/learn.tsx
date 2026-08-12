import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { examConfig } from '@/config/exam';
import { getQuestionsByChapter, questions } from '@/content/questions';
import { Screen } from '@/components/screen';
import { Button, Card, Chip, Eyebrow } from '@/components/ui';
import { isReviewDue } from '@/domain/learning';
import { selectExamQuestionIds, selectPracticeQuestionIds, type PracticeStrategy } from '@/domain/session-selection';
import type { SessionMode } from '@/domain/types';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

const chapterTitles = [...new Map(questions.map((question) => [question.chapterNumber, question.chapterTitle])).entries()];
const questionCountOptions = [10, 20, 30, 40] as const;
const strategyOptions: { value: PracticeStrategy; label: string }[] = [
  { value: 'random', label: 'ランダム' },
  { value: 'unanswered', label: '未回答' },
  { value: 'weak', label: '弱点優先' },
];

export default function LearnScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const startSession = useLearningStore((state) => state.startSession);
  const startExam = useLearningStore((state) => state.startExam);
  const saving = useLearningStore((state) => state.saving);
  const questionStates = useLearningStore((state) => state.questionStates);
  const bookmarks = useLearningStore((state) => state.bookmarks);
  const [questionCount, setQuestionCount] = useState<(typeof questionCountOptions)[number]>(10);
  const [chapterNumber, setChapterNumber] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<PracticeStrategy>('random');
  const [actionError, setActionError] = useState<string | null>(null);
  const wide = width >= 760;

  const dueQuestionIds = Object.values(questionStates)
    .filter((state) => isReviewDue(state, new Date().toISOString()))
    .map((state) => state.questionId);
  const unansweredQuestionIds = questions.filter((question) => !questionStates[question.id]).map((question) => question.id);

  const beginQuestionSet = async (mode: SessionMode, title: string, questionIds: string[]) => {
    const sessionId = await startSession(mode, title, questionIds);
    router.push({ pathname: '/practice/[sessionId]', params: { sessionId } });
  };

  const beginConfiguredPractice = async () => {
    setActionError(null);
    const questionIds = selectPracticeQuestionIds(questions, questionStates, { count: questionCount, chapterNumber, strategy });
    if (questionIds.length === 0) {
      setActionError('条件に合う問題がありません。範囲または出題方法を変更してください。');
      return;
    }
    const chapterTitle = chapterNumber === null
      ? '全範囲'
      : `第${chapterNumber}章 ${chapterTitles.find(([number]) => number === chapterNumber)?.[1] ?? ''}`;
    const strategyLabel = strategyOptions.find((item) => item.value === strategy)?.label ?? '演習';
    await beginQuestionSet(chapterNumber === null ? 'random' : 'chapter', `${chapterTitle}・${strategyLabel} ${questionIds.length}問`, questionIds);
  };

  const beginMockExam = async () => {
    setActionError(null);
    const questionIds = selectExamQuestionIds(questions);
    if (questionIds.length !== examConfig.questionCount) {
      setActionError(`模試には章構成を満たす${examConfig.questionCount}問が必要です。本番問題の同期後に開始できます。`);
      return;
    }
    try {
      const sessionId = await startExam(questionIds);
      router.push({ pathname: '/practice/[sessionId]', params: { sessionId } });
    } catch (error: unknown) {
      setActionError(error instanceof Error
        ? error.message
        : '模試を開始できませんでした。通信状態を確認して再試行してください。');
    }
  };

  return (
    <Screen title="学ぶ" description="章ごとに理解を積み上げます。各回答は1問単位で保存されます。" wide>
      <Card style={styles.guideCard}>
        <View style={styles.guideNumber}><Text style={styles.guideNumberText}>10</Text></View>
        <View style={styles.guideCopy}>
          <Eyebrow>おすすめ</Eyebrow>
          <Text style={styles.guideTitle}>短い単位で、毎日続ける</Text>
          <Text style={styles.guideText}>解説を読み、誤答は別セッションで2回正解すると「克服済み」になります。</Text>
        </View>
      </Card>

      <Card style={styles.practiceBuilder}>
        <View style={styles.builderHeader}>
          <View style={styles.builderCopy}>
            <Eyebrow>PRACTICE</Eyebrow>
            <Text style={styles.builderTitle}>今日の演習を組み立てる</Text>
            <Text style={styles.builderDescription}>問数・範囲・出題方法を選びます。候補が少ない場合は重複させず、実数で開始します。</Text>
          </View>
          <View style={styles.bookmarkShape}><Text style={styles.bookmarkShapeText}>{questionCount}</Text></View>
        </View>

        <View style={styles.optionGroup}>
          <Text style={styles.optionLabel}>問題数</Text>
          <View style={styles.chips}>{questionCountOptions.map((count) => (
            <Chip key={count} label={`${count}問`} selected={questionCount === count} onPress={() => setQuestionCount(count)} />
          ))}</View>
        </View>
        <View style={styles.optionGroup}>
          <Text style={styles.optionLabel}>範囲</Text>
          <View style={styles.chips}>
            <Chip label="全範囲" selected={chapterNumber === null} onPress={() => setChapterNumber(null)} />
            {chapterTitles.map(([number]) => <Chip key={number} label={`第${number}章`} selected={chapterNumber === number} onPress={() => setChapterNumber(number)} />)}
          </View>
        </View>
        <View style={styles.optionGroup}>
          <Text style={styles.optionLabel}>出題方法</Text>
          <View style={styles.chips}>{strategyOptions.map((option) => (
            <Chip key={option.value} label={option.label} selected={strategy === option.value} onPress={() => setStrategy(option.value)} />
          ))}</View>
        </View>
        <Button label="この条件で始める" onPress={() => void beginConfiguredPractice()} />
      </Card>

      <Card style={styles.examCard}>
        <View style={styles.examHeader}>
          <View style={styles.examClock}><Text style={styles.examClockText}>60</Text><Text style={styles.examClockUnit}>min</Text></View>
          <View style={styles.examCopy}>
            <Text style={styles.quickLabel}>MOCK EXAM · {examConfig.syllabusVersion}</Text>
            <Text style={styles.examTitle}>40問を、本番と同じ時間感覚で。</Text>
            <Text style={styles.quickDescription}>回答は1問ごとに保存します。提出するまで正誤と解説は表示せず、{examConfig.passScore}点以上で合格です。</Text>
          </View>
        </View>
        <Button label="模擬試験を始める" variant="secondary" disabled={selectExamQuestionIds(questions, () => 0.5).length !== examConfig.questionCount} loading={saving} onPress={() => void beginMockExam()} />
        <Text style={styles.examNotice}>開始時だけ通信が必要です。サーバー時刻で60分の終了時刻と問題版を確定してから開始します。</Text>
        {questions.length < examConfig.questionCount && <Text style={styles.examNotice}>現在は開発用サンプル{questions.length}問です。章構成を満たす本番問題の同期後に利用できます。</Text>}
      </Card>

      {actionError && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{actionError}</Text></View>}

      <View style={[styles.quickGrid, wide && styles.quickGridWide]}>
        <Card style={styles.quickCard}>
          <Text style={styles.quickLabel}>TODAY</Text>
          <Text style={styles.quickTitle}>今日の復習</Text>
          <Text style={styles.quickCount}>{dueQuestionIds.length}<Text style={styles.quickUnit}> 問</Text></Text>
          <Text style={styles.quickDescription}>1・3・7・14・30・90日の間隔で、忘れる前に確認します。</Text>
          <Button label={dueQuestionIds.length > 0 ? '復習をはじめる' : '今日は復習済み'} disabled={dueQuestionIds.length === 0} onPress={() => void beginQuestionSet('review', '今日の復習', dueQuestionIds)} />
        </Card>
        <Card style={styles.quickCard}>
          <Text style={styles.quickLabel}>COVERAGE</Text>
          <Text style={styles.quickTitle}>まだ解いていない問題</Text>
          <Text style={styles.quickCount}>{unansweredQuestionIds.length}<Text style={styles.quickUnit}> 問</Text></Text>
          <Text style={styles.quickDescription}>未学習の範囲から最大10問を選び、全体の穴を減らします。</Text>
          <Button label="未回答から10問" variant="secondary" disabled={unansweredQuestionIds.length === 0} onPress={() => void beginQuestionSet('random', '未回答から10問', unansweredQuestionIds.slice(0, 10))} />
        </Card>
        <Card style={styles.quickCard}>
          <Text style={styles.quickLabel}>BOOKMARK</Text>
          <Text style={styles.quickTitle}>保存した問題</Text>
          <Text style={styles.quickCount}>{bookmarks.length}<Text style={styles.quickUnit}> 問</Text></Text>
          <Text style={styles.quickDescription}>気になった問題だけをまとめて、あとから解き直せます。</Text>
          <Button label="保存問題を解く" variant="secondary" disabled={bookmarks.length === 0} onPress={() => void beginQuestionSet('review', '保存した問題', bookmarks)} />
        </Card>
      </View>

      <Text style={styles.sectionTitle}>章ごとの状況</Text>
      <View style={[styles.chapterGrid, wide && styles.chapterGridWide]}>
        {chapterTitles.map(([chapterNumber, chapterTitle]) => {
          const chapterQuestions = getQuestionsByChapter(chapterNumber);
          const learned = chapterQuestions.filter((question) => questionStates[question.id]).length;
          return (
            <Card key={chapterNumber} style={styles.chapterCard}>
              <View style={styles.chapterTop}>
                <View style={styles.chapterBadge}><Text style={styles.chapterBadgeText}>{chapterNumber}</Text></View>
                <Text style={styles.chapterCount}>{learned}/{chapterQuestions.length}問 学習済み</Text>
              </View>
              <Text style={styles.chapterTitle}>{chapterTitle}</Text>
              <Text style={styles.chapterMeta}>第{chapterNumber}章 · {chapterQuestions.length}問</Text>
              <Button label="この章を条件に設定" variant="secondary" onPress={() => setChapterNumber(chapterNumber)} />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  guideCard: { backgroundColor: colors.ink, borderColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 18, shadowOpacity: 0 },
  guideNumber: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  guideNumberText: { color: colors.brand, fontFamily: fonts.display, fontSize: 27 },
  guideCopy: { flex: 1, gap: 5 },
  guideTitle: { color: colors.surface, fontFamily: fonts.display, fontSize: 19 },
  guideText: { color: '#C9D6E3', fontFamily: fonts.body, fontSize: 13, lineHeight: 21 },
  practiceBuilder: { gap: 19 },
  builderHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  builderCopy: { flex: 1, gap: 6 },
  builderTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 29 },
  builderDescription: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 21 },
  bookmarkShape: { width: 62, height: 76, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  bookmarkShapeText: { color: colors.surface, fontFamily: fonts.display, fontSize: 23 },
  optionGroup: { gap: 9 },
  optionLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  examCard: { backgroundColor: colors.brandSoft, borderColor: '#C7DDF8', gap: 15, shadowOpacity: 0 },
  examHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  examClock: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  examClockText: { color: colors.surface, fontFamily: fonts.display, fontSize: 23, lineHeight: 25 },
  examClockUnit: { color: '#C9D6E3', fontFamily: fonts.bodyBold, fontSize: 9 },
  examCopy: { flex: 1, gap: 5 },
  examTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 19, lineHeight: 27 },
  examNotice: { color: colors.warning, fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 18 },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  quickGrid: { gap: 14 },
  quickGridWide: { flexDirection: 'row' },
  quickCard: { flex: 1, gap: 10, minWidth: 230 },
  quickLabel: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.3 },
  quickTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 25 },
  quickCount: { color: colors.brandStrong, fontFamily: fonts.display, fontSize: 30 },
  quickUnit: { fontSize: 12 },
  quickDescription: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 20, flex: 1 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, marginTop: 5 },
  chapterGrid: { gap: 16 },
  chapterGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  chapterCard: { gap: 13, minWidth: 290, flex: 1 },
  chapterTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chapterBadge: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  chapterBadgeText: { color: colors.brand, fontFamily: fonts.display, fontSize: 17 },
  chapterCount: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 11 },
  chapterTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 27, minHeight: 52 },
  chapterMeta: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
});
