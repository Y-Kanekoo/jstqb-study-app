import { useCallback, useState, type PropsWithChildren, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';

interface ScreenProps extends PropsWithChildren {
  title?: string;
  description?: string;
  accessory?: ReactNode;
  wide?: boolean;
}

export function Screen({ children, title, description, accessory, wide = false }: ScreenProps) {
  const { width } = useWindowDimensions();
  const [focused, setFocused] = useState(true);
  const horizontalPadding = width < 520 ? 18 : 28;

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  return (
    <SafeAreaView
      aria-hidden={!focused}
      accessibilityElementsHidden={!focused}
      edges={['top']}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding, maxWidth: wide ? 1180 : 880 }]}
        keyboardShouldPersistTaps="handled"
      >
        {(title || accessory) && (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              {title && <Text accessibilityRole="header" style={styles.title}>{title}</Text>}
              {description && <Text style={styles.description}>{description}</Text>}
            </View>
            {accessory}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { width: '100%', alignSelf: 'center', paddingTop: 26, paddingBottom: 48, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 4 },
  headerCopy: { flex: 1, gap: 7 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 29, lineHeight: 38 },
  description: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 23 },
});
