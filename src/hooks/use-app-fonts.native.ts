import { BIZUDPGothic_700Bold } from '@expo-google-fonts/biz-udpgothic/700Bold';
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import { NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp/700Bold';
import { useFonts } from 'expo-font';

export function useAppFonts(): readonly [boolean, Error | null] {
  return useFonts({ BIZUDPGothic_700Bold, NotoSansJP_400Regular, NotoSansJP_700Bold });
}
