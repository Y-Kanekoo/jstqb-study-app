import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/state/auth-store';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts, radii } from '@/theme/tokens';

export default function AccountScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const loading = useAuthStore((state) => state.loading);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const clearLearningData = useLearningStore((state) => state.clearLearningData);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const removeAccount = async () => {
    if (confirmation !== '削除') return;
    setError(null);
    try {
      const result = await deleteAccount(password);
      try {
        await clearLearningData();
      } catch {
        Alert.alert('アカウントは削除済みです', 'サーバー上のアカウントと認証情報は削除されましたが、端末の学習データを消去できませんでした。端末のデータ管理から再試行してください。');
        router.replace('/');
        return;
      }
      if (!result.authCleared) {
        Alert.alert('アカウントは削除済みです', 'サーバー上のアカウントは削除されましたが、認証トークンのローカル消去を確認できませんでした。アプリを再起動してください。');
      }
      router.replace('/');
    } catch {
      setError('アカウントを削除できませんでした。再度ログインしてからお試しください。');
    }
  };

  if (!session) {
    return (
      <Screen title="アカウント管理" description="アカウントへログインすると、削除を含む管理操作を行えます。">
        <Button label="ログイン" onPress={() => router.replace('/sign-in')} />
        <Button label="設定へ戻る" variant="quiet" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title="アカウント管理" description={session.user.email ?? 'ログイン中のアカウント'}>
      <Card style={styles.backupCard}>
        <Text style={styles.cardTitle}>削除前にバックアップできます</Text>
        <Text style={styles.description}>学習履歴・途中の回答・メモをJSONで保存しておくと、必要なときに復元できます。</Text>
        <Button label="データ管理を開く" variant="secondary" onPress={() => router.push('/data-management')} />
      </Card>

      <Card style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>アカウントを完全に削除</Text>
        <Text style={styles.description}>サーバー上の学習履歴、回答、メモ、報告、認証情報と、この端末の学習データを削除します。この操作は取り消せません。</Text>
        <Text style={styles.label}>現在のパスワードで再認証</Text>
        <TextInput
          accessibilityLabel="アカウント削除の再認証パスワード"
          autoCapitalize="none"
          autoComplete="current-password"
          onChangeText={setPassword}
          placeholder="現在のパスワード"
          placeholderTextColor={colors.inkMuted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <Text style={styles.label}>確認のため「削除」と入力</Text>
        <TextInput
          accessibilityLabel="アカウント削除の確認"
          autoCapitalize="none"
          onChangeText={setConfirmation}
          placeholder="削除"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          value={confirmation}
        />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="アカウントを完全に削除" variant="danger" disabled={confirmation !== '削除' || password.length === 0} loading={loading} onPress={() => void removeAccount()} />
      </Card>
      <Button label="設定へ戻る" variant="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backupCard: { gap: 12 },
  dangerCard: { gap: 12, borderColor: '#F4B9B3', backgroundColor: colors.dangerSoft, shadowOpacity: 0 },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
  dangerTitle: { color: colors.danger, fontFamily: fonts.display, fontSize: 19 },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
  label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.danger, borderRadius: radii.medium, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.surface, borderRadius: radii.small, padding: 11, fontFamily: fonts.body, fontSize: 12 },
});
