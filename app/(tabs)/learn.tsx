import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { getQuestionsByChapter, questions } from '@/content/questions';
import { Screen } from '@/components/screen';
import { Button, Card, Eyebrow } from '@/components/ui';
import { isReviewDue } from '@/domain/learning';
import type { SessionMode } from '@/domain/types';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

const chapterTitles = [...new Map(questions.map((question) => [question.chapterNumber, question.chapterTitle])).entries()];

export default function LearnScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const startSession = useLearningStore((state) => state.startSession);
  const questionStates = useLearningStore((state) => state.questionStates);
  const bookmarks = useLearningStore((state) => state.bookmarks);
  const wide = width >= 760;

  const dueQuestionIds = Object.values(questionStates)
    .filter((state) => isReviewDue(state, new Date().toISOString()))
    .map((state) => state.questionId);
  const unansweredQuestionIds = questions.filter((question) => !questionStates[question.id]).map((question) => question.id);

  const beginQuestionSet = async (mode: SessionMode, title: string, questionIds: string[]) => {
    const sessionId = await startSession(mode, title, questionIds);
    router.push({ pathname: '/practice/[sessionId]', params: { sessionId } });
  };

  const begin = async (chapterNumber: number, chapterTitle: string) => {
    const questionIds = getQuestionsByChapter(chapterNumber).map((question) => question.id);
    await beginQuestionSet('chapter', `第${chapterNumber}章 ${chapterTitle}`, questionIds);
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

      <Text style={styles.sectionTitle}>Foundation Level 2023</Text>
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
              <Button label="この章を学ぶ" variant="secondary" onPress={() => void begin(chapterNumber, chapterTitle)} />
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
