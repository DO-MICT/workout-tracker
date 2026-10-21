import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sendReset, signIn, signUp } from '@/lib/sync';
import { useTheme } from '@/theme';
import { Btn, Card, ErrorText, Field, T } from '@/ui';

type Mode = 'in' | 'up' | 'reset';

export default function AuthScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const go = (m: Mode) => {
    setMode(m);
    setErr('');
    setInfo('');
  };

  const submit = async () => {
    const em = email.trim();
    setErr('');
    setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(em)) return setErr('Enter a valid email address.');
    if (mode !== 'reset' && pw.length < 6) return setErr('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (mode === 'in') {
        const e = await signIn(em, pw);
        if (e) setErr(e);
      } else if (mode === 'up') {
        const r = await signUp(name.trim(), em, pw);
        if (r.error) setErr(r.error);
        else if (r.needsConfirm) {
          setInfo('Check your email and tap the confirmation link, then come back here and sign in.');
          setMode('in');
        }
      } else {
        const e = await sendReset(em);
        if (e) setErr(e);
        else setInfo('If that email has an account, a reset link is on its way. The link opens the web app.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 18, paddingBottom: 40, gap: 16 }}>
        <View>
          <T v="title" style={{ fontSize: 44, lineHeight: 46 }}>Workout tracker</T>
          <T muted>Plan it. Lift it. Watch it go up.</T>
        </View>
        <Card style={{ gap: 12 }}>
          <T v="h2">{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Reset password'}</T>
          {mode === 'up' ? <Field label="Name" value={name} onChangeText={setName} autoComplete="name" maxLength={40} /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" />
          {mode !== 'reset' ? (
            <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} onSubmitEditing={submit} />
          ) : null}
          <ErrorText>{err}</ErrorText>
          {info ? <T v="small" color={c.done}>{info}</T> : null}
          <Btn kind="accent" title={mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'} loading={busy} onPress={submit} />
          {mode === 'in' ? (
            <>
              <Btn kind="link" title="Forgot password?" onPress={() => go('reset')} />
              <Btn kind="link" title="New here? Create an account" onPress={() => go('up')} />
            </>
          ) : (
            <Btn kind="link" title="Back to sign in" onPress={() => go('in')} />
          )}
        </Card>
        <Btn kind="link" title="Prefer the web app?" onPress={() => void Linking.openURL('https://do-mict.github.io/workout-tracker/')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
