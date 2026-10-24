import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { addTime, stopTimer, timer } from '@/lib/ui-state';
import { F, useTheme } from '@/theme';
import { T } from '@/ui';

/** The countdown bar shown at the bottom of the Today screen while resting. */
export function RestTimerBar() {
  const { c } = useTheme();
  const { on, end, total } = timer.use();
  const [, tickState] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => tickState((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  const left = Math.max(0, Math.round((end - Date.now()) / 1000));
  const label = left <= 0 ? 'Go' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const pct = Math.max(0, Math.min(100, (left / Math.max(1, total)) * 100));
  const btn = {
    borderWidth: 1,
    borderColor: c.bg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 40,
    justifyContent: 'center' as const,
  };
  return (
    <View
      accessibilityRole="timer"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.ink, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T v="small" color={c.bg}>Rest</T>
      <T color={c.bg} style={{ fontFamily: F.condHeavy, fontSize: 29, lineHeight: 32, minWidth: 64 }}>{label}</T>
      <View style={{ flex: 1, height: 8, backgroundColor: 'rgba(127,127,127,.35)', borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: c.accent }} />
      </View>
      <Pressable accessibilityRole="button" onPress={() => addTime(30)} style={btn}>
        <T color={c.bg} style={{ fontFamily: F.semi }}>+30s</T>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={stopTimer} style={btn}>
        <T color={c.bg} style={{ fontFamily: F.semi }}>Done</T>
      </Pressable>
    </View>
  );
}
