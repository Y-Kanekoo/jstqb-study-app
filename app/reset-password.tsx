import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/state/auth-store';
import { colors, fonts, radii } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const loading = useAuthStore((state) => state.loading);
  const updatePassword = useAuthStore((state) => state.updatePassword);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const submit = async () => {
    if (password.length < 8 || password !== confirmation) {
      setError('8文字以上の同じパスワードを2回入力してください。');
      return;
    }
    setError(null);
    try {
      await updatePassword(password);
      setCompleted(true);
    } catch {
      setError('パスワードを更新できませんでした。再設定メールのリンクをもう一度開いてください。');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Card style={styles.card}>
          <Text style={styles.brand}>学習のしおり</Text>
          <Text accessibilityRole="header" style={styles.title}>{completed ? '変更しました' : '新しいパスワード'}</Text>
          {completed ? (
            <>
              <Text style={styles.description}>次回から新しいパスワードでログインできます。</Text>
              <Button label="アプリへ戻る" onPress={() => router.replace('/')} />
            </>
          ) : !session ? (
            <>
              <Text accessibilityRole="alert" style={styles.error}>再設定用の認証情報を確認できません。メール内のリンクを、この端末でもう一度開いてください。</Text>
              <Button label="ログイン画面へ" onPress={() => router.replace('/sign-in')} />
            </>
          ) : (
            <>
              <Text style={styles.description}>8文字以上で、他のサービスと異なるパスワードを設定してください。</Text>
              <TextInput accessibilityLabel="新しいパスワード" autoComplete="new-password" onChangeText={setPassword} placeholder="新しいパスワード" placeholderTextColor={colors.inkMuted} secureTextEntry style={styles.input} value={password} />
              <TextInput accessibilityLabel="新しいパスワードの確認" autoComplete="new-password" onChangeText={setConfirmation} placeholder="もう一度入力" placeholderTextColor={colors.inkMuted} secureTextEntry style={styles.input} value={confirmation} />
              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <Button label="パスワードを変更" loading={loading} onPress={() => void submit()} />
            </>
          )}
        </Card>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16, padding: 26 },
  brand: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.1 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, lineHeight: 38 },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.small, padding: 11, fontFamily: fonts.body, fontSize: 12, lineHeight: 20 },
});
