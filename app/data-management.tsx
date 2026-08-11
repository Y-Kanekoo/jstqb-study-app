import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card } from '@/components/ui';
import { parseLearningBackup, serializeAttemptsCsv, serializeLearningBackup } from '@/domain/backup';
import { deliverTextFile } from '@/services/data-export';
import { getCurrentLearningSnapshot, useLearningStore } from '@/state/learning-store';
import { colors, fonts, radii } from '@/theme/tokens';

export default function DataManagementScreen() {
  const router = useRouter();
  const restoreSnapshot = useLearningStore((state) => state.restoreSnapshot);
  const saving = useLearningStore((state) => state.saving);
  const [backupText, setBackupText] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportJson = async () => {
    setError(null);
    const date = new Date().toISOString().slice(0, 10);
    try {
      await deliverTextFile(`jstqb-learning-backup-${date}.json`, 'application/json', serializeLearningBackup(getCurrentLearningSnapshot()));
      setMessage('JSONバックアップを出力しました。');
    } catch {
      setError('JSONバックアップを出力できませんでした。');
    }
  };

  const exportCsv = async () => {
    setError(null);
    const date = new Date().toISOString().slice(0, 10);
    try {
      await deliverTextFile(`jstqb-answer-history-${date}.csv`, 'text/csv', serializeAttemptsCsv(getCurrentLearningSnapshot()));
      setMessage('回答履歴CSVを出力しました。');
    } catch {
      setError('回答履歴CSVを出力できませんでした。');
    }
  };

  const restore = async () => {
    setError(null);
    const backup = parseLearningBackup(backupText);
    if (!backup) {
      setError('バックアップ形式を確認できませんでした。JSON全体を貼り付けてください。');
      return;
    }
    try {
      await restoreSnapshot(backup.snapshot);
      setMessage(`${backup.exportedAt} のバックアップを復元しました。`);
      setConfirmation('');
    } catch {
      setError('バックアップを端末へ保存できませんでした。空き容量をご確認ください。');
    }
  };

  return (
    <Screen title="データ管理" description="学習データを持ち出し、端末を替えたときに復元できます。">
      <Card style={styles.exportCard}>
        <Text style={styles.cardTitle}>データを出力</Text>
        <Text style={styles.description}>JSONには途中の回答・履歴・復習状態・ブックマーク・メモを含みます。CSVは表計算ソフトで読める回答履歴です。</Text>
        <View style={styles.actions}>
          <Button label="JSONバックアップ" style={styles.action} onPress={() => void exportJson()} />
          <Button label="回答履歴CSV" variant="secondary" style={styles.action} onPress={() => void exportCsv()} />
        </View>
      </Card>

      <Card style={styles.restoreCard}>
        <Text style={styles.cardTitle}>バックアップを復元</Text>
        <Text style={styles.description}>JSONファイルの内容を貼り付けます。復元すると、この端末の現在データをバックアップ内容で置き換えます。</Text>
        <TextInput
          accessibilityLabel="復元するJSONバックアップ"
          autoCapitalize="none"
          multiline
          onChangeText={setBackupText}
          placeholder="{ ... JSONバックアップ ... }"
          placeholderTextColor={colors.inkMuted}
          style={styles.backupInput}
          textAlignVertical="top"
          value={backupText}
        />
        <Text style={styles.label}>確認のため「復元」と入力</Text>
        <TextInput accessibilityLabel="復元の確認" onChangeText={setConfirmation} placeholder="復元" placeholderTextColor={colors.inkMuted} style={styles.confirmInput} value={confirmation} />
        <Button label="このバックアップで置き換える" variant="danger" disabled={confirmation !== '復元' || backupText.trim().length === 0} loading={saving} onPress={() => void restore()} />
      </Card>

      {message && <Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button label="設定へ戻る" variant="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  exportCard: { gap: 13 },
  restoreCard: { gap: 12 },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 19 },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flex: 1, minWidth: 190 },
  backupInput: { minHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 19, padding: 12 },
  label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  confirmInput: { minHeight: 50, borderWidth: 1, borderColor: colors.danger, borderRadius: radii.medium, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 15 },
  success: { color: colors.success, backgroundColor: colors.successSoft, borderRadius: radii.medium, padding: 12, fontFamily: fonts.body, fontSize: 12 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.medium, padding: 12, fontFamily: fonts.body, fontSize: 12 },
});
