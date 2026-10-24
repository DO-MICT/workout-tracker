import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseCard } from '@/components/ExerciseCard';
import { NoteModal } from '@/components/NoteModal';
import { PickerModal } from '@/components/PickerModal';
import { RestTimerBar } from '@/components/RestTimerBar';
import { todayId, weekLong, missingFor, LIB } from '@/data';
import { dayProgress, doneCount, groupOf, groupsOf, nextUndone, toggleSet } from '@/lib/day';
import { allPlans, activePlan, buildDays, dayLoc, restSec, switchPlan } from '@/lib/plans';
import { useSyncLabel } from '@/lib/status';
import { doneStore, startTimer, stopTimer, toast } from '@/lib/ui-state';
import { finishWorkout } from '@/lib/workout';
import { useS } from '@/state/store';
import type { Day, DayEx, ExGroup } from '@/state/types';
import { F, useTheme } from '@/theme';
import { Btn, Card, T } from '@/ui';

function Chevron({ size = 10 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRightWidth: 2.5,
        borderBottomWidth: 2.5,
        borderColor: c.ink,
        transform: [{ rotate: '45deg' }],
        marginTop: -4,
        marginRight: 4,
      }}
    />
  );
}

export default function TodayScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useS(); /* re-render whenever the app data changes */
  const syncLabel = useSyncLabel();
  const plan = activePlan();
  const days = buildDays();
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const day: Day | undefined = days.find((d) => d.id === pickedDay) ?? days.find((d) => d.id === todayId()) ?? days[0];
  const [planPicker, setPlanPicker] = useState(false);
  const [dayPicker, setDayPicker] = useState(false);
  const [noteEx, setNoteEx] = useState<DayEx | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ys = useRef<Record<string, number>>({});

  if (!day) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: insets.top + 20 }}>
        <T v="title">{plan.name}</T>
        <T muted style={{ marginTop: 8 }}>This plan has no days yet. Pick another plan from the Plans tab.</T>
      </View>
    );
  }

  const { loc, isSet } = dayLoc(plan.id, day.id);
  const gear = loc.gear.length ? loc.gear : null;
  const miss = gear ? day.ex.filter((x) => LIB[x.id] && missingFor(LIB[x.id], gear).length) : [];
  const { done, total } = dayProgress(day);
  const groups = groupsOf(day);
  const cardKey = (g: ExGroup) => (g.kind === 'single' ? g.items[0].id : `g:${g.items[0].id}`);
  const k = (key: string) => `${day.id}:${key}`;
  const firstUndone = groups.find((g) => !g.items.every((x) => doneCount(x) === x.sets));
  const defaultKey = firstUndone ? cardKey(firstUndone) : '';
  const isOpen = (key: string) => open[k(key)] ?? key === defaultKey;
  const isInnerOpen = (id: string) => open[k(id)] ?? true;
  const setOpenKey = (key: string, v: boolean) => setOpen((o) => ({ ...o, [k(key)]: v }));

  const advance = (ex: DayEx) => {
    const g = groupOf(day, ex);
    const key = g ? `g:${g.items[0].id}` : ex.id;
    const nxt = nextUndone(day, ex);
    const nextG = nxt ? groups.find((x) => x.items.some((i) => i.id === nxt.id)) : null;
    setOpen((o) => {
      const n = { ...o, [k(key)]: false };
      if (nextG) n[k(cardKey(nextG))] = true;
      return n;
    });
    if (nextG) {
      setTimeout(() => {
        const y = ys.current[k(cardKey(nextG))];
        if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }, 150);
    }
  };

  const onTick = (ex: DayEx, i: number) => {
    const r = toggleSet(day, ex, i);
    if (!r.ticked) return;
    if (r.startTimer) startTimer(restSec());
    else if (r.next) toast(`Next: ${r.next.n}, set ${i + 1}`);
    if (r.advance) setTimeout(() => advance(ex), 450);
  };

  const onFinish = () => {
    const res = finishWorkout(day);
    stopTimer();
    setOpen({});
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (res.saved && res.rec) doneStore.set({ open: true, rec: res.rec, day, wins: res.wins });
    else toast('Nothing logged yet. Enter a weight or reps first.');
  };

  const card = (ex: DayEx, inGroup: boolean) => (
    <ExerciseCard
      key={ex.id}
      ex={ex}
      open={inGroup ? isInnerOpen(ex.id) : isOpen(ex.id)}
      onToggle={() => (inGroup ? setOpenKey(ex.id, !isInnerOpen(ex.id)) : setOpenKey(ex.id, !isOpen(ex.id)))}
      onTick={onTick}
      onNote={setNoteEx}
      gear={gear}
      locName={loc.name}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: 140 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Plan: ${plan.name}. Tap to switch plan`} onPress={() => setPlanPicker(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="title" style={{ flexShrink: 1 }}>{plan.name}</T>
          <Chevron size={12} />
        </Pressable>
        <T v="small" muted style={{ marginTop: 4, marginBottom: 12 }}>{syncLabel}</T>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${weekLong(day.id)}. Tap to pick a day`}
          disabled={days.length < 2}
          onPress={() => setDayPicker(true)}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 60, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T v="h2">{weekLong(day.id)}</T>
              {day.id === todayId() ? (
                <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 }}>
                  <T v="label" color={c.accentInk}>Today</T>
                </View>
              ) : null}
            </View>
            <T v="small" muted>{days.length < 2 ? 'Today’s session' : `Day ${days.indexOf(day) + 1} of ${days.length} · tap to change`}</T>
          </View>
          {days.length < 2 ? null : <Chevron />}
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <T v="h2">{day.title}</T>
          <T v="small" muted>{`At ${loc.name}${isSet ? '' : ' (default)'}`}</T>
        </View>

        {day.ex.length ? (
          !gear ? (
            <T v="small" muted style={{ marginBottom: 8 }}>{`No equipment is set for ${loc.name} yet, so exercises can’t be checked against your gear.`}</T>
          ) : miss.length ? (
            <View style={{ backgroundColor: c.card, borderRadius: 10, padding: 10, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: c.warn }}>
              <T v="small" color={c.warn}>{`${miss.length} of ${day.ex.length} exercises need gear that isn’t at ${loc.name}.`}</T>
            </View>
          ) : (
            <T v="small" color={c.done} style={{ marginBottom: 8, fontFamily: F.semi }}>{`✓  Everything for today is at ${loc.name}.`}</T>
          )
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ flex: 1, height: 10, borderRadius: 6, backgroundColor: c.line, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: c.done }} />
          </View>
          <T v="small" muted>{`${done} of ${total} sets`}</T>
        </View>

        {!day.ex.length ? (
          <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
            <T muted>{day.title === 'Rest day' ? 'Rest day. Recover, walk, stretch.' : 'No exercises on this day yet.'}</T>
            <T v="small" muted style={{ textAlign: 'center' }}>Editing workouts is coming to the app. For now, edit this day in the web app and it will sync here.</T>
          </Card>
        ) : null}

        {groups.map((g) => {
          const key = cardKey(g);
          if (g.kind === 'single') {
            return (
              <View key={key} onLayout={(e) => (ys.current[k(key)] = e.nativeEvent.layout.y)}>
                {card(g.items[0], false)}
              </View>
            );
          }
          const tot = g.items.reduce((n, x) => n + x.sets, 0);
          const nd = g.items.reduce((n, x) => n + doneCount(x), 0);
          const gOpen = isOpen(key);
          const label = g.items[0].gl || (g.kind === 'circuit' ? 'Circuit' : 'Superset');
          const hint =
            g.kind === 'circuit'
              ? 'Go straight from one exercise to the next. The rest timer starts once set 1 of every exercise is ticked, and so on.'
              : 'Do one set of each, back and forth. The rest timer starts once both set 1s are ticked, then both set 2s, and so on.';
          return (
            <View key={key} onLayout={(e) => (ys.current[k(key)] = e.nativeEvent.layout.y)} style={{ borderLeftWidth: 4, borderLeftColor: c.blue, paddingLeft: 8, marginBottom: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: gOpen }}
                onPress={() => {
                  setOpenKey(key, !gOpen);
                  if (!gOpen) g.items.forEach((x) => setOpenKey(x.id, true));
                }}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 4 }}>
                <View style={{ flex: 1 }}>
                  <T v="h3" color={c.blue}>{label}</T>
                  <T v="label" muted>{`${g.items.length} exercises`}</T>
                </View>
                <T v="label" color={nd === tot ? c.done : c.muted}>{`${nd}/${tot} sets`}</T>
              </Pressable>
              {gOpen ? (
                <View>
                  <T v="small" muted style={{ marginBottom: 8 }}>{hint}</T>
                  {g.items.map((x) => card(x, true))}
                </View>
              ) : null}
            </View>
          );
        })}

        {day.ex.length ? <Btn title="Complete workout" onPress={onFinish} style={{ marginTop: 12 }} /> : null}
      </ScrollView>

      <RestTimerBar />

      <PickerModal
        visible={planPicker}
        title="Switch plan"
        options={allPlans().map((p) => ({ key: p.id, label: p.name, sub: p.desc || undefined, selected: p.id === plan.id }))}
        onPick={(id) => {
          setPlanPicker(false);
          if (id !== plan.id) {
            switchPlan(id);
            setPickedDay(null);
            setOpen({});
            toast(`Now on: ${allPlans().find((p) => p.id === id)?.name ?? ''}`);
          }
        }}
        onClose={() => setPlanPicker(false)}
        footer={{
          label: 'Manage plans',
          onPress: () => {
            setPlanPicker(false);
            router.navigate('/plans');
          },
        }}
      />
      <PickerModal
        visible={dayPicker}
        title="Pick a day"
        options={days.map((d) => ({
          key: d.id,
          label: weekLong(d.id),
          sub: d.title,
          tag: d.id === todayId() ? 'Today' : undefined,
          selected: d.id === day.id,
        }))}
        onPick={(id) => {
          setDayPicker(false);
          setPickedDay(id);
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        }}
        onClose={() => setDayPicker(false)}
      />
      <NoteModal ex={noteEx} onClose={() => setNoteEx(null)} />
    </View>
  );
}
