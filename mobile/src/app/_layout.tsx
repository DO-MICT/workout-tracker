import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
} from '@expo-google-fonts/barlow';
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { DonePopup } from '@/components/DonePopup';
import { TimerEngine } from '@/components/TimerEngine';
import { ToastHost } from '@/components/ToastHost';
import { initAuth } from '@/lib/sync';
import { session } from '@/state/session';
import { useS } from '@/state/store';
import { themeStore, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  const S = useS();
  const { ready, user, syncing } = session.use();
  const { c, isDark } = useTheme();

  useEffect(() => {
    void initAuth();
  }, []);

  /* the theme choice lives in the app state so it follows the account */
  useEffect(() => {
    themeStore.set({ pref: S.theme ?? 'auto' });
  }, [S.theme]);

  const appReady = fontsLoaded && ready;
  useEffect(() => {
    if (appReady) void SplashScreen.hideAsync();
  }, [appReady]);

  if (!appReady) return null;

  const signedIn = !!user || !!S.account?.signedIn;
  const onboarded = !!S.onboarded;
  const loading = signedIn && !onboarded && syncing;

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.ink, border: c.line, primary: c.blue } };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator color={c.ink} size="large" />
        </View>
      ) : (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="auth" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !onboarded}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && onboarded}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="exercise/[id]" />
          </Stack.Protected>
        </Stack>
      )}
      <TimerEngine />
      <ToastHost />
      <DonePopup />
    </ThemeProvider>
  );
}
