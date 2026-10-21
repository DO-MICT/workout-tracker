import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { LIB, missingFor, needsText } from '@/data';
import { doneCount, labOf, lastText, phFor, setsRead, updateSet } from '@/lib/day';
import { getS } from '@/state/store';
import type { DayEx } from '@/state/types';
import { F, useTheme } from '@/theme';
import { Card, T } from '@/ui';

import { Diagram } from './Diagram';

type Props = {
  ex: DayEx;
  open: boolean;
  onToggle: () => void;
  onTick: (ex: DayEx, i: number) => void;
  onNote: (ex: DayEx) => void;
  /** gear at today's location (null = not set up, so no gear check) */
  gear: string[] | null;
  locName: string;
};

function Chevron({ open }: { open: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRightWidth: 2.5,
        borderBottomWidth: 2.5,
        borderColor: c.muted,
        transform: [{ rotate: open ? '-135deg' : '45deg' }],
        marginHorizontal: 6,
        marginTop: open ? 4 : -4,
      }}
    />
  );
}

export function ExerciseCard({ ex, open, onToggle, onTick, onNote, gear, locName }: Props) {
  const { c } = useTheme();
  const [how, setHow] = useState(false);
  const sets = setsRead(ex).slice(0, ex.sets);
  const nd = doneCount(ex);
  const all = nd === ex.sets;
  const lb = labOf(ex);
  const note = getS().notes?.[ex.id] ?? '';
  const lib = LIB[ex.id];
  const miss = gear && lib ? missingFor(lib, gear) : [];

  return (
    <Card done={all} style={{ marginBottom: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={2}>{ex.n}</T>
          {miss.length ? (
            <T v="label" color={c.warn} style={{ marginTop: 2 }}>Needs gear</T>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <T v="label" muted>{`${ex.sets} × ${ex.reps}`}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${note ? 'Edit' : 'Add'} injury note for ${ex.n}`}
              hitSlop={10}
              onPress={() => onNote(ex)}>
              <T style={{ fontSize: 18, opacity: note ? 1 : 0.45 }}>🩹</T>
            </Pressable>
            <T v="label" color={all ? c.done : c.muted}>{`${nd}/${ex.sets} sets`}</T>
          </View>
        </View>
        <Chevron open={open} />
      </Pressable>

      {open ? (
        <View style={{ marginTop: 6, gap: 8 }}>
          {note ? (
            <View style={{ borderLeftWidth: 4, borderLeftColor: c.warn, backgroundColor: c.bg, borderRadius: 8, padding: 10 }}>
              <T v="label" color={c.warn}>Injury note</T>
              <T v="small">{note}</T>
            </View>
          ) : null}
          {miss.length && lib && gear ? (
            <View style={{ backgroundColor: c.bg, borderRadius: 8, padding: 10 }}>
              <T v="small" color={c.warn}>{`Not possible at ${locName}: needs ${needsText(lib, gear)}.`}</T>
            </View>
          ) : null}
          <T v="small" muted>{lastText(ex)}</T>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}
            style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
            <T v="small" color={c.blue} style={{ fontFamily: F.semi }}>See history and progress</T>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: how }}
            onPress={() => setHow(!how)}
            style={{ paddingVertical: 6 }}>
            <T v="small" style={{ fontFamily: F.semi }}>{`${how ? '▾' : '▸'}  How to do it safely`}</T>
          </Pressable>
          {how ? (
            <View>
              <Diagram id={ex.f} />
              {ex.c.map((cue, k) => (
                <T key={k} v="small" style={{ marginTop: 4 }}>{`•  ${cue}`}</T>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 6, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6 }} accessibilityElementsHidden>
              <View style={{ width: 28 }} />
              <T v="label" muted style={{ flex: 1, textAlign: 'center' }}>{lb[0]}</T>
              <T v="label" muted style={{ flex: 1, textAlign: 'center' }}>{lb[1]}</T>
              <View style={{ width: 52 }} />
            </View>
            {sets.map((s, i) => {
              const ph = phFor(ex, i);
              const field = {
                flex: 1,
                borderWidth: 1,
                borderColor: s.d ? 'transparent' : c.line,
                backgroundColor: s.d ? c.doneBg : c.bg,
                borderRadius: 8,
                paddingVertical: 9,
                paddingHorizontal: 8,
                textAlign: 'center' as const,
                fontSize: 17,
                fontFamily: F.med,
                color: c.ink,
                minHeight: 44,
              };
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T v="num" muted style={{ width: 28, textAlign: 'center' }}>{i + 1}</T>
                  {lb[0] ? (
                    <TextInput
                      accessibilityLabel={`Set ${i + 1} ${lb[0]}`}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      value={s.w}
                      placeholder={ph[0]}
                      placeholderTextColor={c.steel}
                      onChangeText={(t) => updateSet(ex, i, 'w', t)}
                      selectTextOnFocus
                      style={field}
                    />
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <TextInput
                    accessibilityLabel={`Set ${i + 1} ${lb[1]}`}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    value={s.r}
                    placeholder={ph[1]}
                    placeholderTextColor={c.steel}
                    onChangeText={(t) => updateSet(ex, i, 'r', t)}
                    selectTextOnFocus
                    style={field}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark set ${i + 1} done`}
                    accessibilityState={{ selected: s.d }}
                    onPress={() => onTick(ex, i)}
                    style={{
                      width: 52,
                      height: 44,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: s.d ? c.done : c.line,
                      backgroundColor: s.d ? c.done : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <T style={{ color: s.d ? c.onDone : c.muted, fontFamily: F.cond, fontSize: 22 }}>✓</T>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </Card>
  );
}
