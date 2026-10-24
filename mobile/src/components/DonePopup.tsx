import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Modal, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { fmtDur, fmtKg, fmtNum, hDate, histVolume } from '@/lib/history';
import { doneStore } from '@/lib/ui-state';
import { F, useTheme } from '@/theme';
import { Btn, T } from '@/ui';

const CHEERS = ['Well done!', 'High five!', 'Look at you go!', 'Crushed it!', 'Strong work!', 'That’s how it’s done!', 'Another one in the bank!', 'Beast mode: complete!', 'Nailed it!', 'You showed up and smashed it!'];
const PR_CHEERS = ['New PR! Look at you go!', 'PR day! High five!', 'Stronger than ever!', 'New record. Take a bow!'];

let lastCheer: string | null = null;
function pick(a: string[]): string {
  let i = Math.floor(Math.random() * a.length);
  if (a.length > 1 && a[i] === lastCheer) i = (i + 1) % a.length;
  lastCheer = a[i];
  return a[i];
}

/** Shown after "Complete workout": time, sets, kg lifted, new PRs and exercises that are up on last time. */
export function DonePopup() {
  const { c } = useTheme();
  const { open, rec, day, wins } = doneStore.use();
  const scale = useRef(new Animated.Value(0.85)).current;
  const cheer = useRef('');
  useEffect(() => {
    if (!open) return;
    cheer.current = pick(wins.prs.length ? PR_CHEERS : CHEERS);
    scale.setValue(0.85);
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [open, wins.prs.length, scale]);
  if (!rec || !day) return null;

  const close = () => doneStore.set({ open: false });
  const exCount = new Set(rec.sets.map((s) => s.exercise_order)).size;
  const vol = histVolume(rec);
  const ticked = rec.sets.filter((s) => s.done).length;
  const stats: [string, string][] = [
    [fmtDur(rec.duration_sec) || '–', 'Time'],
    [String(rec.sets.length), `Sets${ticked && ticked < rec.sets.length ? ` (${ticked} ticked)` : ''}`],
    [String(exCount), exCount === 1 ? 'Exercise' : 'Exercises'],
  ];
  if (vol > 0) stats.push([fmtKg(vol), 'Lifted']);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 18 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <Animated.View style={{ transform: [{ scale }], backgroundColor: c.bg, borderRadius: 20, padding: 20, paddingTop: 24, alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: 380 }}>
            <Svg width={64} height={64} viewBox="0 0 64 64">
              <Circle cx={32} cy={32} r={30} fill={c.accent} />
              <Path d="M22 18h20v8a10 10 0 0 1-20 0z" fill={c.accentInk} />
              <Path d="M22 21h-5a5 5 0 0 0 5 7M42 21h5a5 5 0 0 1-5 7" fill="none" stroke={c.accentInk} strokeWidth={2.6} strokeLinecap="round" />
              <Path d="M32 36v6M25 46h14" stroke={c.accentInk} strokeWidth={3.2} strokeLinecap="round" />
            </Svg>
            <T v="h2" style={{ marginTop: 8, textAlign: 'center' }}>{cheer.current}</T>
            <T v="small" muted style={{ marginTop: 2 }}>{`${day.title} · ${hDate(rec.performed_at)}`}</T>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16 }}>
              {stats.map(([v, l]) => (
                <View key={l} style={{ backgroundColor: c.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, minWidth: 92, alignItems: 'center' }}>
                  <T style={{ fontFamily: F.cond, fontSize: 24, lineHeight: 26 }}>{v}</T>
                  <T v="label" muted>{l}</T>
                </View>
              ))}
            </View>

            {wins.prs.length ? (
              <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
                <T v="h3">{wins.prs.length > 1 ? 'New PRs' : 'New PR'}</T>
                {wins.prs.map((p) => (
                  <View key={p.n} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 4 }}>
                    <T style={{ flex: 1 }}>{p.n}</T>
                    <T style={{ fontFamily: F.cond, fontSize: 19 }}>{`${fmtNum(p.now)} kg`}</T>
                    <T v="small" muted>{`was ${fmtNum(p.was)}`}</T>
                  </View>
                ))}
              </View>
            ) : null}
            {wins.up.length ? (
              <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
                <T v="h3">Up on last time</T>
                {wins.up.map((p) => (
                  <View key={p.n} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 4 }}>
                    <T style={{ flex: 1 }}>{p.n}</T>
                    <T color={c.done} style={{ fontFamily: F.cond, fontSize: 19 }}>{`+${fmtNum(p.by)} kg`}</T>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' }}>
              <Btn
                title="See in History"
                kind="ghost"
                style={{ flex: 1 }}
                onPress={() => {
                  close();
                  router.navigate('/history');
                }}
              />
              <Btn title="Done" style={{ flex: 1 }} onPress={close} />
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}
