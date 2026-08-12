import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip } from '@/components/ui';
import { isSupabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/state/auth-store';
import { useLearningStore } from '@/state/learning-store';
import { colors, fonts } from '@/theme/tokens';

const goalOptions = [5, 10, 20, 40];

export default function SettingsScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const signOut = useAuthStore((state) => state.signOut);
  const loading = useAuthStore((state) => state.loading);
  const dailyGoal = useLearningStore((state) => state.dailyGoal);
  const setDailyGoal = useLearningStore((state) => state.setDailyGoal);
  const outboxCount = useLearningStore((state) => state.outbox.length);
  const storageError = useLearningStore((state) => state.storageError);

  return (
    <Screen title="設定" description="アカウント、同期、毎日の学習量を管理します。">
      <Card style={styles.accountCard}>
        <View style={[styles.statusMark, session ? styles.statusOnline : styles.statusLocal]}><Text style={styles.statusMarkText}>{session ? '✓' : '端'}</Text></View>
        <View style={styles.accountCopy}>
          <Text style={styles.cardTitle}>{session ? 'アカウントで同期中' : '個人端末モード'}</Text>
          <Text style={styles.cardDescription}>
            {session?.user.email ?? (isSupabaseConfigured ? 'ログインするとWeb・スマホ間で学習履歴を引き継げます。' : '同期サーバー設定後に、同じアカウントでWeb・スマホを利用できます。')}
          </Text>
        </View>
        {session
          ? <Button label="ログアウト" variant="quiet" loading={loading} onPress={() => void signOut()} />
          : <Button label="ログイン" variant="secondary" disabled={!isSupabaseConfigured} onPress={() => router.push('/sign-in')} />}
      </Card>

      <Card style={styles.syncCard}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>保存と同期</Text><View style={styles.syncBadge}><Text style={styles.syncBadgeText}>{outboxCount === 0 ? '保存済み' : `未同期 ${outboxCount}件`}</Text></View></View>
        <Text style={styles.cardDescription}>選択は端末へ即時保存し、回答確定後は同期キューへ追加します。オフラインでも学習できます。</Text>
        {storageError && <View style={styles.errorBox}><Text style={styles.errorText}>{storageError}</Text></View>}
      </Card>

      <Card style={styles.goalCard}>
        <Text style={styles.cardTitle}>1日の目標</Text>
        <Text style={styles.cardDescription}>無理なく毎日続けられる問題数を選んでください。</Text>
        <View style={styles.chips}>{goalOptions.map((goal) => <Chip key={goal} label={`${goal}問`} selected={dailyGoal === goal} onPress={() => void setDailyGoal(goal)} />)}</View>
      </Card>

      <Card style={styles.dataCard}>
        <Text style={styles.cardTitle}>データとアカウント</Text>
        <Text style={styles.cardDescription}>JSONバックアップ、回答履歴CSV、復元、アカウント削除を管理します。</Text>
        <View style={styles.dataActions}>
          <Button label="データ管理" variant="secondary" style={styles.dataAction} onPress={() => router.push('/data-management')} />
          <Button label="アカウント管理" variant="quiet" style={styles.dataAction} onPress={() => router.push('/account')} />
        </View>
      </Card>

      <Card style={styles.infoCard}>
        <Text style={styles.cardTitle}>コンテンツについて</Text>
        <Text style={styles.cardDescription}>JSTQB公式問題の転載ではありません。シラバスを基に作成し、正答根拠・表現・類似性をレビューした独自問題だけを公開します。</Text>
        <View style={styles.divider} />
        <Text style={styles.version}>JSTQB 学習のしおり · v0.1.0</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  accountCard: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  statusMark: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusOnline: { backgroundColor: colors.successSoft },
  statusLocal: { backgroundColor: colors.warningSoft },
  statusMarkText: { color: colors.ink, fontFamily: fonts.display, fontSize: 16 },
  accountCopy: { flex: 1, minWidth: 220, gap: 6 },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 18 },
  cardDescription: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 22 },
  syncCard: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  syncBadge: { borderRadius: 999, backgroundColor: colors.brandSoft, paddingHorizontal: 11, paddingVertical: 6 },
  syncBadgeText: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 11 },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  goalCard: { gap: 12 },
  dataCard: { gap: 12 },
  dataActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dataAction: { flex: 1, minWidth: 180 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  infoCard: { gap: 12, shadowOpacity: 0 },
  divider: { height: 1, backgroundColor: colors.borderSoft },
  version: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 11 },
});
