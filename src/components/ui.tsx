import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radii, shadows } from '@/theme/tokens';

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ children, style, accessibilityLabel }: CardProps) {
  return <View accessibilityLabel={accessibilityLabel} style={[styles.card, style]}>{children}</View>;
}

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
  leading?: ReactNode;
}

export function Button({ label, variant = 'primary', loading = false, leading, disabled, style, ...pressableProps }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        typeof style === 'function' ? style({ pressed, hovered: false }) : style,
      ]}
      {...pressableProps}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.surface : colors.brand} /> : leading}
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      aria-pressed={selected}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.buttonPressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const percentage = Math.max(0, Math.min(value, 1)) * 100;
  return (
    <View accessible accessibilityLabel={label ?? `進捗${Math.round(percentage)}パーセント`}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
    </View>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>✓</Text></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.borderSoft, borderRadius: radii.large, borderWidth: 1, padding: 20, ...shadows },
  button: { minHeight: 50, borderRadius: radii.medium, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1 },
  button_primary: { backgroundColor: colors.brand, borderColor: colors.brand },
  button_secondary: { backgroundColor: colors.surface, borderColor: colors.brand },
  button_quiet: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft },
  button_danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  buttonText_primary: { color: colors.surface },
  buttonText_secondary: { color: colors.brand },
  buttonText_quiet: { color: colors.brandStrong },
  buttonText_danger: { color: colors.danger },
  chip: { minHeight: 44, paddingHorizontal: 15, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.inkMuted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: colors.surface },
  progressTrack: { height: 8, borderRadius: radii.pill, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.brand },
  eyebrow: { color: colors.brand, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.1 },
  emptyCard: { alignItems: 'center', paddingVertical: 34, gap: 10 },
  emptyMark: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  emptyMarkText: { color: colors.success, fontFamily: fonts.display, fontSize: 22 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, marginTop: 4 },
  emptyDescription: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 23, textAlign: 'center', maxWidth: 420, marginBottom: 8 },
});
