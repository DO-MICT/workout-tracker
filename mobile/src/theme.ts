import { useColorScheme } from 'react-native';

import { createStore } from '@/lib/createStore';
import type { ThemePref } from '@/state/types';

/* Same palette as the web app (src/styles.css). */
export type Palette = {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string;
  blue: string;
  steel: string;
  done: string;
  doneBg: string;
  onDone: string;
  warn: string;
  danger: string;
  shadow: string;
};

export const light: Palette = {
  bg: '#EEF0F2',
  card: '#FFFFFF',
  ink: '#16202B',
  muted: '#5B6672',
  line: '#D3D8DE',
  accent: '#F2C230',
  accentInk: '#1A1500',
  blue: '#2446A8',
  steel: '#A9B2BC',
  done: '#1F7A4D',
  doneBg: '#E3F3EA',
  onDone: '#FFFFFF',
  warn: '#A85A12',
  danger: '#C0392B',
  shadow: 'rgba(0,0,0,.2)',
};
export const dark: Palette = {
  bg: '#12161B',
  card: '#1B2027',
  ink: '#E9ECEF',
  muted: '#9AA4AE',
  line: '#2C333C',
  accent: '#F2C230',
  accentInk: '#1A1500',
  blue: '#8AA6FF',
  steel: '#56606B',
  done: '#45C08A',
  doneBg: '#173226',
  onDone: '#06240F',
  warn: '#F0A867',
  danger: '#E5736A',
  shadow: 'rgba(0,0,0,.55)',
};

export const F = {
  body: 'Barlow_400Regular',
  med: 'Barlow_500Medium',
  semi: 'Barlow_600SemiBold',
  cond: 'BarlowCondensed_700Bold',
  condSemi: 'BarlowCondensed_600SemiBold',
  condHeavy: 'BarlowCondensed_800ExtraBold',
} as const;

/** The user's light / dark / auto choice (kept in the app state as `theme`). */
export const themeStore = createStore<{ pref: ThemePref }>({ pref: 'auto' });

export function useTheme(): { c: Palette; isDark: boolean } {
  const sys = useColorScheme();
  const { pref } = themeStore.use();
  const isDark = pref === 'dark' || (pref === 'auto' && sys === 'dark');
  return { c: isDark ? dark : light, isDark };
}
