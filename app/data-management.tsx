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
  const conflicts = useLearningStore((state) => state.conflicts ?? []);
  const resolveConflict = useLearningStore((state) => state.resolveConflict);
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
      setMessage(`${backup.exportedAt} のバックアップを端末専用データとして復元しました。別アカウントのサーバー履歴へは自動同期しません。`);
      setConfirmation('');
    } catch {
      setError('バックアップを端末へ保存できませんでした。空き容量をご確認ください。');
    }
  };

  const resolve = async (conflictId: string, action: 'keep-local' | 'accept-remote' | 'merge', mergedValue?: string | string[]) => {
    setError(null);
    try {
      await resolveConflict(conflictId, action, mergedValue);
      setMessage('同期競合を解決しました。');
    } catch (resolutionError: unknown) {
      setError(resolutionError instanceof Error ? resolutionError.message : '同期競合を解決できませんでした。');
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

      {conflicts.map((conflict) => (
        <Card key={conflict.id} style={styles.conflictCard}>
          <Text style={styles.cardTitle}>同期競合を解決</Text>
          {conflict.kind === 'draft' ? (
            <>
              <Text style={styles.description}>途中回答が別端末でも更新されました。採用する内容を選んでください。</Text>
              <Text style={styles.conflictValue}>端末: {conflict.local.selectedChoiceIds.join(', ') || '未選択'}</Text>
              <Text style={styles.conflictValue}>サーバー: {conflict.remote.selectedChoiceIds.join(', ') || '未選択'}</Text>
              <View style={styles.actions}>
                <Button label="端末を採用" style={styles.action} onPress={() => void resolve(conflict.id, 'keep-local')} />
                <Button label="サーバーを採用" variant="secondary" style={styles.action} onPress={() => void resolve(conflict.id, 'accept-remote')} />
                <Button
                  label="両方を統合"
                  variant="quiet"
                  style={styles.action}
                  onPress={() => void resolve(conflict.id, 'merge', [...new Set([...conflict.local.selectedChoiceIds, ...conflict.remote.selectedChoiceIds])])}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.description}>メモが別端末でも更新されました。採用する内容を選んでください。</Text>
              <Text style={styles.conflictValue}>端末: {conflict.local.body || '空'}</Text>
              <Text style={styles.conflictValue}>サーバー: {conflict.remote.body || '空'}</Text>
              <View style={styles.actions}>
                <Button label="端末を採用" style={styles.action} onPress={() => void resolve(conflict.id, 'keep-local')} />
                <Button label="サーバーを採用" variant="secondary" style={styles.action} onPress={() => void resolve(conflict.id, 'accept-remote')} />
                <Button
                  label="両方を統合"
                  variant="quiet"
                  style={styles.action}
                  onPress={() => void resolve(conflict.id, 'merge', `${conflict.local.body}\n\n--- 別端末のメモ ---\n${conflict.remote.body}`)}
                />
              </View>
            </>
          )}
        </Card>
      ))}

      {message && <Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button label="設定へ戻る" variant="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  exportCard: { gap: 13 },
  restoreCard: { gap: 12 },
  conflictCard: { gap: 12, borderColor: colors.warning, backgroundColor: '#FFF8E8' },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 19 },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
  conflictValue: { color: colors.ink, backgroundColor: colors.paper, borderRadius: radii.small, padding: 10, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flex: 1, minWidth: 190 },
  backupInput: { minHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 19, padding: 12 },
  label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  confirmInput: { minHeight: 50, borderWidth: 1, borderColor: colors.danger, borderRadius: radii.medium, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 15 },
  success: { color: colors.success, backgroundColor: colors.successSoft, borderRadius: radii.medium, padding: 12, fontFamily: fonts.body, fontSize: 12 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.medium, padding: 12, fontFamily: fonts.body, fontSize: 12 },
});
