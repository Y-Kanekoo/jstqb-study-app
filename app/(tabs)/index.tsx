import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { questions } from '@/content/questions';
import { Screen } from '@/components/screen';
import { Button, Card, Eyebrow, ProgressBar } from '@/components/ui';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

function formatDate(): string {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}

function isToday(isoDate: string): boolean {
  return new Date(isoDate).toLocaleDateString('ja-JP') === new Date().toLocaleDateString('ja-JP');
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const sessions = useLearningStore((state) => state.sessions);
  const attempts = useLearningStore((state) => state.attempts);
  const dailyGoal = useLearningStore((state) => state.dailyGoal);
  const startSession = useLearningStore((state) => state.startSession);
  const activeSessions = sessions.filter((session) => session.status === 'active').slice(0, 3);
  const todayCount = attempts.filter((attempt) => isToday(attempt.answeredAt)).length;
  const answeredTotal = new Set(attempts.map((attempt) => attempt.questionId)).size;
  const columns = width >= 760;

  const openSession = (sessionId: string) => {
    router.push({ pathname: '/practice/[sessionId]', params: { sessionId } });
  };

  const startQuickStudy = async () => {
    const questionIds = [...questions]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(10, questions.length))
      .map((question) => question.id);
    const sessionId = await startSession('random', '基礎ミックス10問', questionIds);
    openSession(sessionId);
  };

  return (
    <Screen wide>
      <View style={styles.topline}>
        <View><Eyebrow>{formatDate()}</Eyebrow><Text accessibilityRole="header" style={styles.pageTitle}>今日も、ひとつずつ。</Text></View>
        <View style={styles.profile}><Text style={styles.profileText}>私</Text></View>
      </View>

      <View style={[styles.grid, columns && styles.gridWide]}>
        <Card style={styles.heroCard}>
          <View style={styles.heroRule} />
          <Eyebrow>今日の学習</Eyebrow>
          <Text style={styles.heroTitle}>あと{Math.max(dailyGoal - todayCount, 0)}問で、今日の目標です。</Text>
          <Text style={styles.heroCopy}>回答は1問ごとに端末へ保存されます。途中で閉じても、次は同じ場所から再開できます。</Text>
          <View style={styles.progressCopy}><Text style={styles.progressMain}>{todayCount}</Text><Text style={styles.progressSub}> / {dailyGoal}問</Text></View>
          <ProgressBar value={todayCount / dailyGoal} />
          <Button label="10問をはじめる" onPress={() => void startQuickStudy()} />
        </Card>

        <View style={styles.statsColumn}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>学習した問題</Text>
            <Text style={styles.statValue}>{answeredTotal}<Text style={styles.statUnit}> 問</Text></Text>
            <Text style={styles.statHint}>収録 {questions.length}問（開発用サンプル）</Text>
          </Card>
          <Card style={styles.noteCard}>
            <Text style={styles.noteMark}>BOOKMARK</Text>
            <Text style={styles.noteTitle}>本番目標は500問</Text>
            <Text style={styles.noteCopy}>現在は機能確認用の初期問題です。著作権と正確性のレビューを通した問題だけを公開数に含めます。</Text>
          </Card>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>続きから</Text>
        <Text style={styles.sectionMeta}>{activeSessions.length}件の学習中</Text>
      </View>
      {activeSessions.length === 0 ? (
        <Card style={styles.resumeEmpty}>
          <Text style={styles.resumeEmptyTitle}>中断中の学習はありません</Text>
          <Text style={styles.resumeEmptyCopy}>「学ぶ」から章や出題方法を選ぶと、ここに再開位置が表示されます。</Text>
        </Card>
      ) : (
        <View style={[styles.sessionGrid, columns && styles.sessionGridWide]}>
          {activeSessions.map((session) => (
            <Card key={session.id} style={styles.sessionCard}>
              <Eyebrow>{session.mode === 'wrong' ? '誤答トレーニング' : '学習中'}</Eyebrow>
              <Text style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.sessionCount}>{session.answeredQuestionIds.length} / {session.questionIds.length}問 完了</Text>
              <ProgressBar value={session.answeredQuestionIds.length / session.questionIds.length} />
              <Button label="続きから再開" variant="secondary" onPress={() => openSession(session.id)} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 31, lineHeight: 42, marginTop: 6 },
  profile: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  profileText: { color: colors.surface, fontFamily: fonts.display, fontSize: 14 },
  grid: { gap: 18 },
  gridWide: { flexDirection: 'row', alignItems: 'stretch' },
  heroCard: { flex: 1.65, overflow: 'hidden', gap: 16, padding: 26 },
  heroRule: { position: 'absolute', width: 8, top: 0, bottom: 0, left: 0, backgroundColor: colors.brand },
  heroTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, lineHeight: 36, maxWidth: 560 },
  heroCopy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 24, maxWidth: 620 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  progressMain: { color: colors.brandStrong, fontFamily: fonts.display, fontSize: 36 },
  progressSub: { color: colors.inkMuted, fontFamily: fonts.bodyMedium, fontSize: 15 },
  statsColumn: { flex: 1, gap: 18 },
  statCard: { gap: 8 },
  statLabel: { color: colors.inkMuted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  statValue: { color: colors.ink, fontFamily: fonts.display, fontSize: 34 },
  statUnit: { fontSize: 15 },
  statHint: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  noteCard: { backgroundColor: colors.warningSoft, borderColor: '#F2D99A', gap: 8 },
  noteMark: { color: colors.warning, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  noteTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
  noteCopy: { color: colors.warning, fontFamily: fonts.body, fontSize: 12, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 },
  sectionMeta: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  resumeEmpty: { backgroundColor: colors.brandSoft, borderColor: '#C7DDF8', shadowOpacity: 0 },
  resumeEmptyTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  resumeEmptyCopy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22, marginTop: 5 },
  sessionGrid: { gap: 16 },
  sessionGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  sessionCard: { gap: 13, minWidth: 260, flex: 1 },
  sessionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 26 },
  sessionCount: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13 },
});
