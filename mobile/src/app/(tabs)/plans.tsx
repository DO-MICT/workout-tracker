import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activePlan, allPlans, buildDaysFor, isEdited, planRest, switchPlan } from '@/lib/plans';
import { toast } from '@/lib/ui-state';
import { profileRest, useS } from '@/state/store';
import { useTheme } from '@/theme';
import { Btn, Card, Header, T } from '@/ui';

const fmtRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function PlansScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useS();
  const act = activePlan().id;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: 40, gap: 12 }}>
      <Header title="Workout plans" sub="Pick the plan you’re following. Each plan keeps its own edits. Your logs and PRs follow the exercise, whichever plan you’re on." />
      {allPlans().map((p) => {
        const days = buildDaysFor(p.id);
        const on = p.id === act;
        const rest = planRest(p.id);
        return (
          <Card key={p.id} style={on ? { borderWidth: 2, borderColor: c.accent } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T v="h3" style={{ flex: 1 }}>{p.name}</T>
              {on ? (
                <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
                  <T v="label" color={c.accentInk}>Active</T>
                </View>
              ) : null}
            </View>
            {p.desc ? <T v="small" muted>{`${p.desc}${isEdited(p.id) ? ' (edited)' : ''}`}</T> : null}
            <T v="small" muted style={{ marginTop: 4 }}>{`${days.length} day${days.length === 1 ? '' : 's'} a week · rest ${fmtRest(rest || profileRest())}${rest ? '' : ' (default)'}`}</T>
            <View style={{ marginTop: 8, gap: 2 }}>
              {days.map((d) => (
                <View key={d.id} style={{ flexDirection: 'row', gap: 8 }}>
                  <T v="label" style={{ width: 34 }}>{d.short}</T>
                  <T v="small" style={{ flex: 1 }}>{d.title}</T>
                  <T v="small" muted>{d.ex.length ? `${d.ex.length} exercises` : 'Empty'}</T>
                </View>
              ))}
            </View>
            {on ? null : (
              <Btn
                kind="chip"
                small
                title="Use this plan"
                style={{ alignSelf: 'flex-start', marginTop: 10 }}
                onPress={() => {
                  switchPlan(p.id);
                  toast(`Now on: ${p.name}`);
                }}
              />
            )}
          </Card>
        );
      })}
      <T v="small" muted style={{ textAlign: 'center' }}>Creating and editing plans is coming to the app. Plans you make in the web app show up here.</T>
    </ScrollView>
  );
}
