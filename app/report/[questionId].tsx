import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip } from '@/components/ui';
import { getSessionQuestion } from '@/domain/session-question';
import type { ContentIssueCategory } from '@/domain/types';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts, radii } from '@/theme/tokens';

const categoryOptions: { value: ContentIssueCategory; label: string }[] = [
  { value: 'incorrect_answer', label: '正答・解説' },
  { value: 'unclear', label: '表現が不明確' },
  { value: 'outdated', label: '内容が古い' },
  { value: 'typo', label: '誤字・脱字' },
  { value: 'other', label: 'その他' },
];

export default function ReportQuestionScreen() {
  const router = useRouter();
  const { questionId, sessionId } = useLocalSearchParams<{ questionId: string; sessionId?: string }>();
  const session = useLearningStore((state) => state.sessions.find((item) => item.id === sessionId));
  const question = session ? getSessionQuestion(session, questionId) : undefined;
  const reportIssue = useLearningStore((state) => state.reportIssue);
  const [category, setCategory] = useState<ContentIssueCategory>('incorrect_answer');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  if (!question) {
    return (
      <Screen title="問題を確認できません" description="問題報告には、問題を開いた学習セッションが必要です。">
        <Button label="戻る" onPress={() => router.back()} />
      </Screen>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await reportIssue(question.id, question.versionId, category, description);
      setCompleted(true);
    } catch (submissionError: unknown) {
      setError(submissionError instanceof Error ? submissionError.message : '問題報告を保存できませんでした。');
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <Screen title="報告を保存しました" description="オフラインの場合も端末に保持し、ログイン後に同期します。">
        <Card style={styles.completedCard}>
          <Text style={styles.completedMark}>✓</Text>
          <Text style={styles.cardTitle}>確認に必要な版情報も一緒に保存済みです</Text>
          <Text style={styles.description}>問題ID {question.id} · 版 {question.versionId}</Text>
        </Card>
        <Button label="問題へ戻る" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title="問題を報告" description="正答や表現に気になる点があれば、あとで確認できるよう記録します。">
      <Card style={styles.questionCard}>
        <Text style={styles.meta}>問題ID {question.id} · 版 {question.versionId}</Text>
        <Text style={styles.prompt}>{question.prompt}</Text>
      </Card>

      <Card style={styles.formCard}>
        <View style={styles.field}>
          <Text style={styles.label}>報告の種類</Text>
          <View style={styles.chips}>{categoryOptions.map((option) => (
            <Chip key={option.value} label={option.label} selected={category === option.value} onPress={() => setCategory(option.value)} />
          ))}</View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>気になった点</Text>
          <TextInput
            accessibilityLabel="問題報告の内容"
            multiline
            onChangeText={setDescription}
            placeholder="どの記述を、どのように直すとよいか入力してください。"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            textAlignVertical="top"
            value={description}
          />
          <Text style={styles.counter}>{description.trim().length}文字 · 5文字以上</Text>
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="この内容で報告する" disabled={description.trim().length < 5} loading={submitting} onPress={() => void submit()} />
        <Button label="キャンセル" variant="quiet" onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  questionCard: { gap: 10, backgroundColor: colors.brandSoft, borderColor: '#C7DDF8', shadowOpacity: 0 },
  meta: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 10 },
  prompt: { color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 28 },
  formCard: { gap: 18 },
  field: { gap: 9 },
  label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 150, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 23, padding: 13 },
  counter: { alignSelf: 'flex-end', color: colors.inkMuted, fontFamily: fonts.body, fontSize: 10 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.small, padding: 11, fontFamily: fonts.body, fontSize: 12 },
  completedCard: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  completedMark: { color: colors.success, fontFamily: fonts.display, fontSize: 34 },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: 'center' },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 12, textAlign: 'center' },
});
