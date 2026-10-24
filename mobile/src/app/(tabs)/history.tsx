import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type HistRow,
  fmtDur,
  fmtKg,
  fmtSet,
  hDate,
  histDelete,
  histFetch,
  histFlush,
  histSets,
  histStore,
  histVolume,
  pendingWorkouts,
} from '@/lib/history';
import { toast } from '@/lib/ui-state';
import { session } from '@/state/session';
import { useS } from '@/state/store';
import type { HistSet } from '@/state/types';
import { F, useTheme } from '@/theme';
import { Btn, Card, ErrorText, Header, T } from '@/ui';

function exerciseList(sets: HistSet[]) {
  const out: { order: number; id: string; name: string; tag: string | null; sets: HistSet[] }[] = [];
  let cur: (typeof out)[number] | null = null;
  sets.forEach((s) => {
    if (!cur || cur.order !== s.exercise_order) {
      cur = { order: s.exercise_order, id: s.exercise_id, name: s.exercise_name, tag: s.group_tag, sets: [] };
      out.push(cur);
    }
    cur.sets.push(s);
  });
  return out;
}

export default function HistoryScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useS();
  const { user } = session.use();
  const { version } = histStore.use();
  const [rows, setRows] = useState<HistRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [sets, setSets] = useState<Record<string, HistSet[] | null>>({});
  const seq = useRef(0);

  const fetchPage = useCallback(async (offset: number) => {
    const my = ++seq.current;
    setLoading(true);
    setErr('');
    try {
      const res = await histFetch(offset);
      if (my !== seq.current) return;
      setRows((prev) => (offset === 0 ? res.rows : (prev ?? []).concat(res.rows)));
      setMore(res.more);
    } catch {
      if (my !== seq.current) return;
      setRows((prev) => prev ?? []);
      setErr('Couldn’t load your history. Check your connection and try again.');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  /* reload every time this tab is shown, and after workouts finish uploading */
  useFocusEffect(
    useCallback(() => {
      void histFlush();
      if (user) void fetchPage(0);
      else setRows([]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, version, fetchPage]),
  );

  const waiting = pendingWorkouts();
  const seen = new Set(waiting.map((w) => w.id));
  const all: (HistRow & { pending?: boolean })[] = [
    ...waiting
      .slice()
      .reverse()
      .map((w) => ({
        id: w.id,
        performed_at: w.performed_at,
        started_at: w.started_at,
        duration_sec: w.duration_sec,
        plan_id: w.plan_id,
        plan_name: w.plan_name,
        day_id: w.day_id,
        day_title: w.day_title,
        location_name: w.location_name,
        set_count: w.sets.length,
        volume_kg: histVolume(w),
        source: w.source,
        pending: true,
      })),
    ...(rows ?? []).filter((w) => !seen.has(w.id)),
  ];

  const toggle = (id: string) => {
    const nowOpen = !openIds[id];
    setOpenIds((o) => ({ ...o, [id]: nowOpen }));
    if (nowOpen && sets[id] === undefined) {
      histSets(id)
        .then((s) => setSets((m) => ({ ...m, [id]: s })))
        .catch(() => {
          setSets((m) => ({ ...m, [id]: null }));
          toast('Couldn’t load that workout. Check your connection');
        });
    }
  };

  const remove = (id: string) =>
    Alert.alert('Delete this workout?', 'Your PRs stay.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          histDelete(id)
            .then(() => {
              setRows((r) => (r ?? []).filter((w) => w.id !== id));
              setOpenIds((o) => ({ ...o, [id]: false }));
              toast('Workout deleted');
            })
            .catch(() => toast('Couldn’t delete. Check your connection')),
      },
    ]);

  let month = '';
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: 40 }}>
      <Header title="History" sub="Every workout you complete is saved here. Tap one to see the sets, or an exercise to see your progress." />
      {waiting.length ? (
        <T v="small" color={c.warn} style={{ marginBottom: 10 }} accessibilityRole="alert">
          {`${waiting.length} workout${waiting.length > 1 ? 's' : ''} waiting to sync. ${user ? 'It’ll upload when you’re online.' : 'Sign in to upload.'}`}
        </T>
      ) : null}
      <ErrorText>{err}</ErrorText>
      {rows === null && !all.length ? <T muted>Loading…</T> : null}
      {rows !== null && !all.length && !err ? (
        <Card style={{ gap: 4 }}>
          <T v="h3">No workouts yet</T>
          <T muted>Log your sets and tap Complete workout. It’ll show up here with the date, sets and weights.</T>
        </Card>
      ) : null}

      {all.map((w) => {
        const m = hDate(w.performed_at, { month: 'long', year: 'numeric' });
        const header = m !== month ? m : null;
        month = m;
        const meta = [w.plan_name, w.location_name, `${w.set_count || 0} set${w.set_count === 1 ? '' : 's'}`, +w.volume_kg > 0 ? fmtKg(w.volume_kg) : '', fmtDur(w.duration_sec)]
          .filter(Boolean)
          .join(' · ');
        const isOpen = !!openIds[w.id];
        const wsets = sets[w.id];
        return (
          <View key={w.id}>
            {header ? <T v="h3" style={{ marginTop: 14, marginBottom: 6 }}>{header}</T> : null}
            <Card style={{ marginBottom: 8, padding: 0 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => toggle(w.id)} style={{ flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' }}>
                <View style={{ width: 44, alignItems: 'center', borderRightWidth: 1, borderRightColor: c.line, paddingRight: 10 }}>
                  <T style={{ fontFamily: F.condHeavy, fontSize: 25, lineHeight: 26 }}>{hDate(w.performed_at, { day: 'numeric' })}</T>
                  <T v="label" muted>{hDate(w.performed_at, { weekday: 'short' }).toUpperCase()}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3">{w.day_title || 'Workout'}</T>
                  <T v="small" muted>{meta}</T>
                  {w.pending ? <T v="label" color={c.warn}>Waiting to sync</T> : null}
                  {w.source === 'import' ? <T v="label" muted>From before history</T> : null}
                </View>
                <T muted>{isOpen ? '▾' : '▸'}</T>
              </Pressable>
              {isOpen ? (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
                  {wsets === undefined ? <T muted>Loading…</T> : null}
                  {wsets === null ? <T muted>Couldn’t load the sets.</T> : null}
                  {wsets
                    ? exerciseList(wsets).map((e) => (
                        <View key={e.order} style={{ paddingVertical: 4, borderLeftWidth: e.tag ? 3 : 0, borderLeftColor: c.blue, paddingLeft: e.tag ? 8 : 0 }}>
                          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })}>
                            <T color={c.blue} style={{ fontFamily: F.semi }}>{e.name}</T>
                          </Pressable>
                          <T v="small" muted>{e.sets.map((s) => fmtSet(s) || '–').join(', ')}</T>
                        </View>
                      ))
                    : null}
                  <Btn kind="link" danger title="Delete workout" onPress={() => remove(w.id)} style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      {more ? <Btn kind="ghost" title={loading ? 'Loading…' : 'Show older workouts'} disabled={loading} onPress={() => fetchPage(rows?.length ?? 0)} style={{ marginTop: 8 }} /> : null}
    </ScrollView>
  );
}
