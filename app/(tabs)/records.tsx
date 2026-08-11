import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, ProgressBar } from '@/components/ui';
import { questions } from '@/content/questions';
import { isUnresolvedWrong } from '@/domain/learning';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

export default function RecordsScreen() {
  const router = useRouter();
  const attempts = useLearningStore((state) => state.attempts);
  const states = useLearningStore((state) => state.questionStates);
  const sessions = useLearningStore((state) => state.sessions);
  const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
  const accuracy = attempts.length === 0 ? 0 : correctCount / attempts.length;
  const unresolvedCount = Object.values(states).filter(isUnresolvedWrong).length;
  const firstAttempts = [...attempts]
    .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))
    .filter((attempt, index, sorted) => sorted.findIndex((item) => item.questionId === attempt.questionId) === index);
  const firstAccuracy = firstAttempts.length === 0 ? 0 : firstAttempts.filter((attempt) => attempt.isCorrect).length / firstAttempts.length;
  const consumption = questions.length === 0 ? 0 : Object.keys(states).length / questions.length;
  const wrongStates = Object.values(states).filter((state) => state.wrongEver);
  const recoveryRate = wrongStates.length === 0 ? 0 : wrongStates.filter((state) => state.recoveredAt !== null).length / wrongStates.length;
  const retentionRate = Object.keys(states).length === 0
    ? 0
    : Object.values(states).filter((state) => state.reviewStage >= 4 && state.latestOutcome === 'correct').length / Object.keys(states).length;
  const latestSessions = [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 10);

  return (
    <Screen title="学習記録" description="点数だけでなく、どこまで理解が定着したかを見ます。">
      <View style={styles.metrics}>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>総回答</Text><Text style={styles.metricValue}>{attempts.length}</Text><Text style={styles.metricUnit}>問</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>初見正答率</Text><Text style={styles.metricValue}>{Math.round(firstAccuracy * 100)}</Text><Text style={styles.metricUnit}>%</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>問題消化率</Text><Text style={styles.metricValue}>{Math.round(consumption * 100)}</Text><Text style={styles.metricUnit}>%</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>未克服</Text><Text style={[styles.metricValue, styles.danger]}>{unresolvedCount}</Text><Text style={styles.metricUnit}>問</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>克服率</Text><Text style={styles.metricValue}>{Math.round(recoveryRate * 100)}</Text><Text style={styles.metricUnit}>%</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>定着率</Text><Text style={styles.metricValue}>{Math.round(retentionRate * 100)}</Text><Text style={styles.metricUnit}>%</Text></Card>
      </View>

      <Card style={styles.coverageCard}>
        <View style={styles.coverageHeader}><Text style={styles.cardTitle}>章別の学習範囲</Text><Text style={styles.coverageTotal}>{Object.keys(states).length}/{questions.length}問</Text></View>
        {[1, 2, 3, 4, 5, 6].map((chapterNumber) => {
          const chapterQuestions = questions.filter((question) => question.chapterNumber === chapterNumber);
          const learned = chapterQuestions.filter((question) => states[question.id]).length;
          return (
            <View key={chapterNumber} style={styles.chapterRow}>
              <View style={styles.chapterCopy}><Text style={styles.chapterName}>第{chapterNumber}章</Text><Text style={styles.chapterCount}>{learned}/{chapterQuestions.length}</Text></View>
              <ProgressBar value={chapterQuestions.length === 0 ? 0 : learned / chapterQuestions.length} />
            </View>
          );
        })}
      </Card>

      <View style={styles.historyHeader}>
        <Text style={styles.cardTitle}>セッション履歴</Text>
        <Text style={styles.coverageTotal}>問題版付きで保存</Text>
      </View>
      {latestSessions.length === 0 ? (
        <Card style={styles.emptyHistory}>
          <Text style={styles.chapterName}>まだ履歴はありません</Text>
          <Text style={styles.insightCopy}>1問回答すると、セッションと問題版を含む履歴がここに残ります。</Text>
        </Card>
      ) : latestSessions.map((session) => {
        const sessionAttempts = attempts.filter((attempt) => attempt.sessionId === session.id);
        const correct = sessionAttempts.filter((attempt) => attempt.isCorrect).length;
        const versions = [...new Set(sessionAttempts.map((attempt) => attempt.questionVersionId))];
        return (
          <Card key={session.id} style={styles.historyCard}>
            <View style={styles.historyTop}>
              <View style={styles.historyCopy}>
                <Text style={styles.historyTitle}>{session.title}</Text>
                <Text style={styles.historyMeta}>{new Date(session.updatedAt).toLocaleString('ja-JP')} · {session.status === 'active' ? '中断中' : '完了'}</Text>
              </View>
              <Text style={styles.historyScore}>{correct}/{session.mode === 'exam' ? session.questionIds.length : sessionAttempts.length}</Text>
            </View>
            <Text style={styles.versionText}>{versions.length > 0 ? `問題版 ${versions.length}件 · ${versions.slice(0, 3).join('、')}${versions.length > 3 ? '…' : ''}` : '確定回答はまだありません'}</Text>
            {session.status === 'active' && <Button label="続きから" variant="secondary" onPress={() => router.push({ pathname: '/practice/[sessionId]', params: { sessionId: session.id } })} />}
          </Card>
        );
      })}

      <Card style={styles.insightCard}>
        <Text style={styles.insightLabel}>LEARNING NOTE</Text>
        <Text style={styles.insightTitle}>{attempts.length === 0 ? '最初の1問から記録が始まります' : accuracy >= 0.8 ? 'よいペースです。定着の確認へ進みましょう' : '誤答の解説を読み、別の日にもう一度'}</Text>
        <Text style={styles.insightCopy}>正答率は目安です。「未克服」が減っているか、章ごとの未学習部分がないかも合わせて確認してください。</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { flex: 1, minWidth: 120, shadowOpacity: 0 },
  metricLabel: { color: colors.inkMuted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  metricValue: { color: colors.brandStrong, fontFamily: fonts.display, fontSize: 32, marginTop: 9 },
  metricUnit: { position: 'absolute', right: 16, bottom: 21, color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  danger: { color: colors.danger },
  coverageCard: { gap: 19 },
  coverageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 19 },
  coverageTotal: { color: colors.inkMuted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  historyCard: { gap: 12, shadowOpacity: 0 },
  historyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  historyCopy: { flex: 1, gap: 4 },
  historyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 23 },
  historyMeta: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 11 },
  historyScore: { color: colors.brandStrong, fontFamily: fonts.display, fontSize: 20 },
  versionText: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 10, lineHeight: 17 },
  emptyHistory: { gap: 7, shadowOpacity: 0 },
  chapterRow: { gap: 8 },
  chapterCopy: { flexDirection: 'row', justifyContent: 'space-between' },
  chapterName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13 },
  chapterCount: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  insightCard: { backgroundColor: colors.brandSoft, borderColor: '#C7DDF8', gap: 8, shadowOpacity: 0 },
  insightLabel: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  insightTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 27 },
  insightCopy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
});
