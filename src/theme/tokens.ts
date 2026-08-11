import { Platform } from 'react-native';

export const colors = {
  ink: '#17324D',
  inkMuted: '#526579',
  paper: '#F6F8FB',
  surface: '#FFFFFF',
  brand: '#215EA8',
  brandStrong: '#17497F',
  brandSoft: '#EAF2FC',
  success: '#167A5A',
  successSoft: '#E7F5EF',
  warning: '#7A4E00',
  warningSoft: '#FFF4D8',
  danger: '#B42318',
  dangerSoft: '#FDECEB',
  border: '#CBD5E1',
  borderSoft: '#E4EAF0',
  focus: '#0B63CE',
  shadow: '#17324D',
} as const;

export const fonts = {
  body: Platform.OS === 'web' ? 'system-ui, -apple-system, "Yu Gothic", sans-serif' : 'NotoSansJP_400Regular',
  bodyMedium: Platform.OS === 'web' ? 'system-ui, -apple-system, "Yu Gothic", sans-serif' : 'NotoSansJP_700Bold',
  bodyBold: Platform.OS === 'web' ? 'system-ui, -apple-system, "Yu Gothic", sans-serif' : 'NotoSansJP_700Bold',
  display: Platform.OS === 'web' ? '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' : 'BIZUDPGothic_700Bold',
  displayRegular: Platform.OS === 'web' ? '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' : 'BIZUDPGothic_700Bold',
} as const;

export const radii = {
  small: 8,
  medium: 14,
  large: 22,
  pill: 999,
} as const;

export const shadows = Platform.select({
  web: {
    boxShadow: '0 12px 32px rgba(23, 50, 77, 0.08)',
  },
  default: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
});
