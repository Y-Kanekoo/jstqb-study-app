import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card, ProgressBar } from '@/components/ui';
import { questions } from '@/content/questions';
import { isUnresolvedWrong } from '@/domain/learning';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

export default function RecordsScreen() {
  const attempts = useLearningStore((state) => state.attempts);
  const states = useLearningStore((state) => state.questionStates);
  const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
  const accuracy = attempts.length === 0 ? 0 : correctCount / attempts.length;
  const unresolvedCount = Object.values(states).filter(isUnresolvedWrong).length;

  return (
    <Screen title="学習記録" description="点数だけでなく、どこまで理解が定着したかを見ます。">
      <View style={styles.metrics}>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>総回答</Text><Text style={styles.metricValue}>{attempts.length}</Text><Text style={styles.metricUnit}>問</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>正答率</Text><Text style={styles.metricValue}>{Math.round(accuracy * 100)}</Text><Text style={styles.metricUnit}>%</Text></Card>
        <Card style={styles.metricCard}><Text style={styles.metricLabel}>未克服</Text><Text style={[styles.metricValue, styles.danger]}>{unresolvedCount}</Text><Text style={styles.metricUnit}>問</Text></Card>
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
  chapterRow: { gap: 8 },
  chapterCopy: { flexDirection: 'row', justifyContent: 'space-between' },
  chapterName: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13 },
  chapterCount: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12 },
  insightCard: { backgroundColor: colors.brandSoft, borderColor: '#C7DDF8', gap: 8, shadowOpacity: 0 },
  insightLabel: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  insightTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 27 },
  insightCopy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
});
