import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip } from '@/components/ui';
import { useAuthStore } from '@/state/auth-store';
import { colors, fonts, radii } from '@/theme/tokens';

export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const requestPasswordReset = useAuthStore((state) => state.requestPasswordReset);

  const submit = async () => {
    if (!email.includes('@') || (mode !== 'reset' && password.length < 8)) {
      setLocalError(mode === 'reset' ? 'メールアドレスを入力してください。' : 'メールアドレスと8文字以上のパスワードを入力してください。');
      return;
    }
    setLocalError(null);
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email.trim());
        setResetSent(true);
        return;
      }
      if (mode === 'sign-in') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      router.back();
    } catch {
      setLocalError(mode === 'sign-in'
        ? 'ログインできませんでした。入力内容をご確認ください。'
        : mode === 'sign-up' ? 'アカウントを作成できませんでした。' : '再設定メールを送信できませんでした。');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Card style={styles.formCard}>
          <Button label="閉じる" variant="quiet" style={styles.closeButton} onPress={() => router.back()} />
          <Text style={styles.brand}>学習のしおり</Text>
          <Text accessibilityRole="header" style={styles.title}>どの端末でも、続きから。</Text>
          <Text style={styles.description}>同じアカウントでログインすると、Web・iOS・Androidの学習履歴を引き継げます。</Text>
          <View style={styles.modeRow}>
            <Chip label="ログイン" selected={mode === 'sign-in'} onPress={() => setMode('sign-in')} />
            <Chip label="新規登録" selected={mode === 'sign-up'} onPress={() => setMode('sign-up')} />
          </View>
          {resetSent && <Text accessibilityRole="alert" style={styles.success}>再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。</Text>}
          <View style={styles.field}>
            <Text style={styles.label}>メールアドレス</Text>
            <TextInput
              accessibilityLabel="メールアドレス"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              value={email}
            />
          </View>
          {mode !== 'reset' && <View style={styles.field}>
            <Text style={styles.label}>パスワード</Text>
            <TextInput
              accessibilityLabel="パスワード"
              autoCapitalize="none"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              onChangeText={setPassword}
              placeholder="8文字以上"
              placeholderTextColor={colors.inkMuted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>}
          {(localError || error) && <Text accessibilityRole="alert" style={styles.error}>{localError ?? '認証処理に失敗しました。'}</Text>}
          <Button label={mode === 'sign-in' ? 'ログインする' : mode === 'sign-up' ? 'アカウントを作る' : '再設定メールを送る'} loading={loading} onPress={() => void submit()} />
          {mode === 'sign-in'
            ? <Button label="パスワードを忘れた" variant="quiet" onPress={() => {
              setLocalError(null);
              setMode('reset');
            }} />
            : mode === 'reset' && <Button label="ログインへ戻る" variant="quiet" onPress={() => setMode('sign-in')} />}
          <Text style={styles.privacy}>認証情報はSupabase Authで管理し、パスワードをアプリの学習DBへ保存しません。</Text>
        </Card>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, justifyContent: 'center', padding: 18 },
  formCard: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 17, padding: 26 },
  closeButton: { alignSelf: 'flex-end', minHeight: 38, paddingVertical: 7 },
  brand: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.1 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, lineHeight: 38 },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
  modeRow: { flexDirection: 'row', gap: 8 },
  field: { gap: 7 },
  label: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.small, padding: 11, fontFamily: fonts.body, fontSize: 12 },
  success: { color: colors.success, backgroundColor: colors.successSoft, borderRadius: radii.small, padding: 11, fontFamily: fonts.body, fontSize: 12, lineHeight: 20 },
  privacy: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 10, lineHeight: 17, textAlign: 'center' },
});
