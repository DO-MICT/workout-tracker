import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ProgressChart } from '@/components/ProgressChart';
import { LIB } from '@/data';
import { type ExSetRow, fmtNum, fmtSet, hDate, histExercise, metricOf } from '@/lib/history';
import { F, useTheme } from '@/theme';
import { Card, ErrorText, T } from '@/ui';

type Session = { id: string; at: string; sets: ExSetRow[]; best: number | null; pending?: boolean };

/** Progress for one exercise: best set per workout (chart) and every session. */
export default function ExerciseProgress() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lib = LIB[id];
  const [rows, setRows] = useState<ExSetRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    histExercise(id)
      .then((r) => live && setRows(r))
      .catch(() => {
        if (!live) return;
        setRows([]);
        setErr('Couldn’t load this exercise’s history. Check your connection.');
      });
    return () => {
      live = false;
    };
  }, [id]);

  const title = lib?.n ?? id;
  let body: React.ReactNode;
  if (rows === null) body = <T muted>Loading…</T>;
  else if (!rows.length)
    body = (
      <Card style={{ gap: 4 }}>
        <T v="h3">Nothing logged yet</T>
        <T muted>{`Once you complete a workout with ${title}, your sets and progress show here.`}</T>
      </Card>
    );
  else {
    const measure = rows[0].measure || lib?.lab || 'w';
    let m = metricOf(measure);
    if (measure === 'bw' && rows.some((r) => (r.weight ?? 0) > 0)) m = ['Top added weight', 'kg', 'weight'];
    const by: Record<string, Session> = {};
    const order: string[] = [];
    rows.forEach((r) => {
      if (!by[r.workout_id]) {
        by[r.workout_id] = { id: r.workout_id, at: r.performed_at, sets: [], best: null, pending: r.pending };
        order.push(r.workout_id);
      }
      by[r.workout_id].sets.push(r);
    });
    const sessions = order.map((wid) => {
      const s = by[wid];
      s.sets.sort((a, b) => a.set_no - b.set_no);
      s.sets.forEach((x) => {
        const n = x[m[2]];
        if (n != null && (s.best === null || n > s.best)) s.best = +n;
      });
      return s;
    });
    const vals = sessions.filter((s): s is Session & { best: number } => s.best != null);
    let top: (Session & { best: number }) | null = null;
    vals.forEach((s) => {
      if (!top || s.best > top.best) top = s;
    });
    const first = vals.length ? vals[vals.length - 1] : null;
    const latest = vals.length ? vals[0] : null;
    const short = { day: 'numeric', month: 'short' } as const;
    const stat = (label: string, value: string, sub?: string) => (
      <Card style={{ flex: 1, minWidth: 100 }}>
        <T v="label" muted>{label}</T>
        <T style={{ fontFamily: F.cond, fontSize: 24, lineHeight: 28 }}>{value}</T>
        {sub ? <T v="label" muted>{sub}</T> : null}
      </Card>
    );
    const topBest = top ? (top as Session & { best: number }) : null;
    body = (
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {stat(m[0], topBest ? `${fmtNum(topBest.best)} ${m[1]}` : '–', topBest ? hDate(topBest.at, short) : undefined)}
          {stat('Workouts', String(sessions.length), `since ${hDate(sessions[sessions.length - 1].at, short)}`)}
          {first && latest && vals.length > 1
            ? stat('Change', `${latest.best - first.best >= 0 ? '+' : ''}${fmtNum(latest.best - first.best)} ${m[1]}`, 'first to latest')
            : null}
        </View>
        {vals.length > 1 ? <ProgressChart points={vals.slice(0, 24).reverse()} label={m[0]} unit={m[1]} /> : null}
        <T v="h3" style={{ marginTop: 6 }}>Every workout</T>
        {sessions.map((s) => (
          <Card key={s.id} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T style={{ fontFamily: F.semi }}>{hDate(s.at)}</T>
              {s.pending ? <T v="label" color={c.warn}>Waiting to sync</T> : null}
            </View>
            <T v="small" muted>{s.sets.map((x) => fmtSet(x) || '–').join(', ')}</T>
          </Card>
        ))}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title, headerShown: true, headerBackTitle: 'Back', headerStyle: { backgroundColor: c.bg }, headerTintColor: c.ink, headerShadowVisible: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <ErrorText>{err}</ErrorText>
        {body}
      </ScrollView>
    </>
  );
}
