import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip, EmptyState } from '@/components/ui';
import { filterWrongQuestionIds } from '@/domain/filters';
import type { WrongFilter } from '@/domain/types';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

const filters: { value: WrongFilter; label: string }[] = [
  { value: 'unresolved', label: '未克服' },
  { value: 'latest-wrong', label: '直近の誤答' },
  { value: 'last-7-days', label: '7日以内' },
  { value: 'last-30-days', label: '30日以内' },
  { value: 'last-90-days', label: '90日以内' },
  { value: 'ever', label: '過去すべて' },
  { value: 'recovered', label: '克服済み' },
];

export default function WrongScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<WrongFilter>('unresolved');
  const states = useLearningStore((state) => state.questionStates);
  const attempts = useLearningStore((state) => state.attempts);
  const startSession = useLearningStore((state) => state.startSession);
  const questionIds = useMemo(
    () => filterWrongQuestionIds(states, attempts, filter, new Date().toISOString()),
    [attempts, filter, states],
  );
  const unresolvedCount = filterWrongQuestionIds(states, attempts, 'unresolved', new Date().toISOString()).length;
  const recoveredCount = filterWrongQuestionIds(states, attempts, 'recovered', new Date().toISOString()).length;

  const begin = async () => {
    const filterLabel = filters.find((item) => item.value === filter)?.label ?? '誤答';
    const sessionId = await startSession('wrong', `${filterLabel}の問題`, questionIds);
    router.push({ pathname: '/practice/[sessionId]', params: { sessionId } });
  };

  return (
    <Screen title="誤答だけを解く" description="間違えた問題を絞り込み、理解できるまで繰り返します。">
      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>未克服</Text><Text style={styles.summaryValue}>{unresolvedCount}</Text><Text style={styles.summaryUnit}>問</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>克服済み</Text><Text style={[styles.summaryValue, styles.recovered]}>{recoveredCount}</Text><Text style={styles.summaryUnit}>問</Text>
        </Card>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>出題する誤答</Text>
        <View style={styles.chips}>{filters.map((item) => <Chip key={item.value} label={item.label} selected={filter === item.value} onPress={() => setFilter(item.value)} />)}</View>
      </View>

      {questionIds.length === 0 ? (
        <EmptyState
          title={filter === 'unresolved' ? '未克服の問題はありません' : '条件に合う問題がありません'}
          description={filter === 'unresolved' ? 'まず通常学習を進めましょう。間違えた問題は、自動でここへ集まります。' : '期間や状態を変えると、対象が見つかる場合があります。'}
          action={<Button label="章から学ぶ" variant="secondary" onPress={() => router.push('/learn')} />}
        />
      ) : (
        <Card style={styles.startCard}>
          <View style={styles.startCopy}>
            <Text style={styles.startTitle}>{questionIds.length}問を出題できます</Text>
            <Text style={styles.startDescription}>正解しても同じセッション内では克服になりません。別の学習機会で2回続けて正解すると克服です。</Text>
          </View>
          <Button label="誤答トレーニングを開始" onPress={() => void begin()} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 14 },
  summaryCard: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 5, shadowOpacity: 0 },
  summaryLabel: { position: 'absolute', top: 16, left: 18, color: colors.inkMuted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  summaryValue: { color: colors.danger, fontFamily: fonts.display, fontSize: 33, marginTop: 18 },
  recovered: { color: colors.success },
  summaryUnit: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13 },
  filterSection: { gap: 12 },
  filterTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  startCard: { gap: 20 },
  startCopy: { gap: 7 },
  startTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20 },
  startDescription: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
});
