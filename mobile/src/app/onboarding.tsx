import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildDaysFor, allPlans, switchPlan } from '@/lib/plans';
import { getS, save, useS } from '@/state/store';
import { useTheme } from '@/theme';
import { Btn, Card, Header, T } from '@/ui';

/** Gear the express setup ticks for a typical commercial gym. */
const GYM_GEAR = [
  'adjbench', 'flatbench', 'barbell', 'plates', 'ezbar', 'dumbbells', 'lyingpress', 'shoulderpress',
  'latpulldown', 'legext', 'lyingcurl', 'standcalf', 'abbench', 'romanchair', 'cablecross', 'pullupbar',
  'bands', 'yogamat', 'treadmill', 'smith', 'stabball',
];

export default function Onboarding() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useS();
  const plans = allPlans();
  const [pick, setPick] = useState(plans[0]?.id ?? 'split5');
  const [gym, setGym] = useState(true);

  const finish = () => {
    switchPlan(pick);
    const S = getS();
    if (gym) S.locs = { active: 'loc1', list: [{ id: 'loc1', name: 'Gym', gear: GYM_GEAR.slice() }] };
    S.onboarded = true;
    save();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 14, paddingBottom: 40, gap: 12 }}>
      <Header title="Pick your plan" sub="You can change this any time on the Plans tab." />
      {plans.map((p) => {
        const on = p.id === pick;
        const days = buildDaysFor(p.id);
        return (
          <Card key={p.id} style={on ? { borderWidth: 2, borderColor: c.accent } : undefined}>
            <T v="h3">{p.name}</T>
            {p.desc ? <T v="small" muted>{p.desc}</T> : null}
            <T v="small" muted style={{ marginTop: 4 }}>{`${days.length} days a week`}</T>
            <Btn kind="chip" small selected={on} title={on ? 'Selected' : 'Choose'} style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={() => setPick(p.id)} />
          </Card>
        );
      })}
      <Card style={{ gap: 8 }}>
        <T v="h3">Your equipment</T>
        <T v="small" muted>Exercises you can’t do with your gear get flagged. Start with a typical commercial gym; fine-tuning comes later.</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn kind="chip" small selected={gym} title="Full gym" onPress={() => setGym(true)} />
          <Btn kind="chip" small selected={!gym} title="Skip for now" onPress={() => setGym(false)} />
        </View>
      </Card>
      <Btn kind="accent" title="Start training" onPress={finish} />
    </ScrollView>
  );
}
