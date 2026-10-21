import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pendingWorkouts } from '@/lib/history';
import { signOut } from '@/lib/sync';
import { useSyncLabel } from '@/lib/status';
import { toast } from '@/lib/ui-state';
import { session } from '@/state/session';
import { acct, getS, prof, profileRest, save, useS } from '@/state/store';
import type { ThemePref } from '@/state/types';
import { useTheme } from '@/theme';
import { Btn, Card, ErrorText, Field, Header, T } from '@/ui';

const PF: [string, string, string][] = [
  ['height', 'Height', 'cm'],
  ['weight', 'Weight', 'kg'],
  ['waist', 'Waist', 'cm'],
  ['chest', 'Chest', 'cm'],
  ['uarm', 'Upper arm', 'cm'],
  ['larm', 'Lower arm', 'cm'],
  ['abd', 'Abdomen', 'cm'],
  ['glutes', 'Glutes', 'cm'],
  ['thighs', 'Thighs', 'cm'],
  ['calves', 'Calves', 'cm'],
];
const fmtRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ProfileScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const S = useS();
  const { user, serverTier } = session.use();
  const sync = useSyncLabel();
  const [name, setName] = useState(S.names[0] ?? '');
  const [vals, setVals] = useState<Record<string, string>>({ ...prof().vals });
  const [bad, setBad] = useState<string[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const theme: ThemePref = S.theme ?? 'auto';
  const rest = profileRest();
  const lastMeasured = prof().hist.length ? prof().hist[prof().hist.length - 1].d : '';

  const saveName = () => {
    const n = name.trim().slice(0, 40);
    if (!n) return toast('Enter a name');
    S.names[0] = n;
    save();
    toast('Details saved');
  };

  const saveMeasurements = () => {
    const out: Record<string, string> = {};
    const errors: string[] = [];
    PF.forEach(([id]) => {
      const raw = (vals[id] ?? '').trim().replace(',', '.');
      if (!raw) return;
      const n = Number(raw);
      if (!isFinite(n) || n <= 0 || n > 500) errors.push(id);
      else out[id] = String(Math.round(n * 10) / 10);
    });
    setBad(errors);
    if (errors.length) return toast('Check the highlighted fields: numbers only');
    const P = prof();
    if (!Object.keys(out).length && !Object.keys(P.vals).length) return toast('Enter at least one measurement');
    P.vals = out;
    const lastS = P.hist.length ? P.hist[P.hist.length - 1] : null;
    if (!lastS || JSON.stringify(lastS.v) !== JSON.stringify(out)) {
      P.hist.push({ d: new Date().toISOString(), v: out });
      if (P.hist.length > 200) P.hist = P.hist.slice(-200);
    }
    save();
    toast('Measurements saved');
  };

  const confirmSignOut = () => {
    const waiting = pendingWorkouts().length;
    const msg = waiting
      ? `${waiting} workout${waiting > 1 ? 's haven’t' : ' hasn’t'} finished uploading and will be lost if you sign out now. Connect to the internet and wait a moment first.`
      : 'Your data stays safe in your account. You can sign in again any time.';
    Alert.alert('Sign out?', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: waiting ? 'Sign out anyway' : 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: 60, gap: 14 }}>
        <Header title="Profile" sub={sync} />

        <Card style={{ gap: 10 }}>
          <T v="h3">Your details</T>
          <T v="small" muted>{`Signed in as ${user?.email ?? acct().email ?? ''}. Your data syncs to your account.`}</T>
          <Field label="Name" value={name} onChangeText={setName} maxLength={40} autoComplete="name" />
          <Btn title="Save details" onPress={saveName} />
          <T v="small" muted>{`Account: ${serverTier || acct().serverTier || 'tester'} tier`}</T>
          <Btn kind="ghost" danger title="Sign out" loading={signingOut} onPress={confirmSignOut} />
        </Card>

        <Card style={{ gap: 10 }}>
          <T v="h3">Appearance</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['auto', 'light', 'dark'] as ThemePref[]).map((t) => (
              <Btn
                key={t}
                kind="chip"
                title={t[0].toUpperCase() + t.slice(1)}
                selected={theme === t}
                style={{ flex: 1 }}
                onPress={() => {
                  getS().theme = t;
                  save();
                }}
              />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <T v="h3">Rest timer</T>
          <T v="small" muted>Default rest between sets. A plan can set its own.</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Btn
              kind="chip"
              title="− 15s"
              onPress={() => {
                prof().rest = Math.max(5, rest - 15);
                save();
              }}
            />
            <T v="title">{fmtRest(rest)}</T>
            <Btn
              kind="chip"
              title="+ 15s"
              onPress={() => {
                prof().rest = Math.min(600, rest + 15);
                save();
              }}
            />
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <T v="h3">Body measurements</T>
          <T v="small" muted>{lastMeasured ? `Last saved ${new Date(lastMeasured).toLocaleDateString()}. Each change is kept so you can see progress.` : 'Optional. Each time you save, the change is kept so you can see progress.'}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {PF.map(([id, label, unit]) => (
              <View key={id} style={{ width: '47%' }}>
                <Field
                  label={`${label} (${unit})`}
                  value={vals[id] ?? ''}
                  onChangeText={(t) => setVals((v) => ({ ...v, [id]: t }))}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  error={bad.includes(id)}
                />
              </View>
            ))}
          </View>
          <ErrorText>{bad.length ? 'Numbers only, up to 500.' : ''}</ErrorText>
          <Btn title="Save measurements" onPress={saveMeasurements} />
        </Card>

        <T v="small" muted style={{ textAlign: 'center' }}>{`Workout tracker ${Constants.expoConfig?.version ?? ''}`}</T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
