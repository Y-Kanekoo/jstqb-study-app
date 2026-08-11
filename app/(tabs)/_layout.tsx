import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

function TabMark({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.mark, focused && styles.markFocused]}>
      <Text accessible={false} style={[styles.markText, focused && styles.markTextFocused]}>{label}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 3 },
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'ホーム', tabBarIcon: ({ focused }) => <TabMark label="H" focused={focused} /> }} />
      <Tabs.Screen name="learn" options={{ title: '学ぶ', tabBarIcon: ({ focused }) => <TabMark label="L" focused={focused} /> }} />
      <Tabs.Screen name="wrong" options={{ title: '誤答', tabBarIcon: ({ focused }) => <TabMark label="W" focused={focused} /> }} />
      <Tabs.Screen name="records" options={{ title: '記録', tabBarIcon: ({ focused }) => <TabMark label="R" focused={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarIcon: ({ focused }) => <TabMark label="S" focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { height: 74, paddingTop: 8, paddingBottom: 8, borderTopColor: colors.borderSoft, backgroundColor: colors.surface },
  mark: { width: 27, height: 27, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  markFocused: { backgroundColor: colors.brandSoft },
  markText: { color: colors.inkMuted, fontFamily: fonts.display, fontSize: 12 },
  markTextFocused: { color: colors.brand },
});
