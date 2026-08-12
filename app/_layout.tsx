import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLearningStore } from '@/state/learning-store';
import { useAuthStore } from '@/state/auth-store';
import { colors, fonts } from '@/theme/tokens';
import { LearningSyncCoordinator } from '@/services/learning-sync';
import { handleAuthCallback } from '@/services/supabase';
import { useAppFonts } from '@/hooks/use-app-fonts';

export default function RootLayout() {
  const initialize = useLearningStore((state) => state.initialize);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const hydrated = useLearningStore((state) => state.hydrated);
  const storageOwnerId = useLearningStore((state) => state.storageOwnerId);
  const authInitialized = useAuthStore((state) => state.initialized);
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (authInitialized) {
      void initialize(userId);
    }
  }, [authInitialized, initialize, userId]);

  useEffect(() => {
    const processUrl = (url: string | null) => {
      if (url) {
        void handleAuthCallback(url).catch(() => {
          // 再設定画面でリンクの再実行手順を案内します。
        });
      }
    };
    void Linking.getInitialURL().then(processUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => processUrl(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const baseUrl = process.env.EXPO_PUBLIC_BASE_URL?.replace(/\/$/u, '') ?? '';
      void navigator.serviceWorker.register(`${baseUrl}/sw.js`, { scope: `${baseUrl}/` });
    }
  }, []);

  if (fontError) {
    return <View style={styles.center}><Text style={styles.error}>フォントを読み込めませんでした。</Text></View>;
  }
  if (!fontsLoaded || !authInitialized || !hydrated || storageOwnerId !== userId) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <LearningSyncCoordinator />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="practice/[sessionId]" />
        <Stack.Screen name="report/[questionId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reset-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account" />
        <Stack.Screen name="data-management" />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 15 },
});
