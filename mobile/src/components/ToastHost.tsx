import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toastStore } from '@/lib/ui-state';
import { useTheme } from '@/theme';
import { T } from '@/ui';

/** Short messages that fade out after a couple of seconds. */
export function ToastHost() {
  const { c } = useTheme();
  const { msg, n } = toastStore.use();
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!n) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(2300),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [n, opacity]);
  if (!n) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 110, alignItems: 'center' }}>
      <Animated.View style={{ opacity, backgroundColor: c.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
        <T color={c.bg} style={{ textAlign: 'center' }}>{msg}</T>
      </Animated.View>
    </View>
  );
}
