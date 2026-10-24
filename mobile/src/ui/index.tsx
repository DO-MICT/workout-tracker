import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, useTheme } from '@/theme';

/* Small building blocks used by every screen, styled like the web app. */

type Variant = 'body' | 'small' | 'label' | 'title' | 'h2' | 'h3' | 'num';
const sizes: Record<Variant, { fontSize: number; lineHeight: number; fontFamily: string }> = {
  body: { fontSize: 16, lineHeight: 22, fontFamily: F.body },
  small: { fontSize: 13.5, lineHeight: 18, fontFamily: F.med },
  label: { fontSize: 12.5, lineHeight: 16, fontFamily: F.semi },
  title: { fontSize: 32, lineHeight: 34, fontFamily: F.condHeavy },
  h2: { fontSize: 28, lineHeight: 30, fontFamily: F.condHeavy },
  h3: { fontSize: 21, lineHeight: 24, fontFamily: F.cond },
  num: { fontSize: 18, lineHeight: 22, fontFamily: F.cond },
};

export function T({
  v = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { v?: Variant; muted?: boolean; color?: string }) {
  const { c } = useTheme();
  return <Text {...rest} style={[sizes[v], { color: color ?? (muted ? c.muted : c.ink) }, style]} />;
}

export function Card({ children, style, done }: { children: ReactNode; style?: StyleProp<ViewStyle>; done?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: c.card, borderRadius: 12, padding: 14 },
        done && { borderLeftWidth: 5, borderLeftColor: c.done },
        style,
      ]}>
      {children}
    </View>
  );
}

type BtnProps = {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'ghost' | 'chip' | 'link' | 'accent';
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  selected?: boolean;
};
export function Btn({ title, onPress, kind = 'primary', loading, disabled, danger, style, small, selected }: BtnProps) {
  const { c } = useTheme();
  const off = disabled || loading;
  const base: ViewStyle = { alignItems: 'center', justifyContent: 'center', opacity: off ? 0.55 : 1 };
  let box: ViewStyle = {};
  let color = c.ink;
  let font: string = F.semi;
  let size = 16;
  if (kind === 'primary') {
    box = { backgroundColor: danger ? c.danger : c.ink, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52 };
    color = danger ? '#fff' : c.bg;
    font = F.cond;
    size = 22;
  } else if (kind === 'accent') {
    box = { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52 };
    color = c.accentInk;
    font = F.cond;
    size = 22;
  } else if (kind === 'ghost') {
    box = { borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 48 };
    color = danger ? c.danger : c.muted;
  } else if (kind === 'chip') {
    box = {
      borderWidth: 2,
      borderColor: danger ? c.danger : c.ink,
      borderRadius: 999,
      paddingVertical: small ? 4 : 6,
      paddingHorizontal: small ? 12 : 14,
      minHeight: small ? 34 : 40,
      backgroundColor: selected ? c.ink : 'transparent',
    };
    color = selected ? c.bg : danger ? c.danger : c.ink;
    size = small ? 14.5 : 16;
  } else {
    box = { paddingVertical: 8, minHeight: 40 };
    color = danger ? c.danger : c.blue;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, selected }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [base, box, pressed && { opacity: 0.7 }, style]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={{ color, fontFamily: font, fontSize: size }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: boolean }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      {label ? <T v="label" muted>{label}</T> : null}
      <TextInput
        placeholderTextColor={c.muted}
        {...rest}
        onFocus={(e) => {
          setFocus(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        style={[
          {
            borderWidth: 2,
            borderColor: error ? c.danger : focus ? c.blue : c.line,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 11,
            fontSize: 17,
            fontFamily: F.body,
            color: c.ink,
            backgroundColor: c.card,
          },
          style,
        ]}
      />
    </View>
  );
}

/** Page title row used at the top of tab screens. */
export function Header({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <T v="title">{title}</T>
        {sub ? <T v="small" muted style={{ marginTop: 4 }}>{sub}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** Space for the status bar / notch above a screen's content. */
export function useTopInset() {
  return useSafeAreaInsets().top;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

export function ErrorText({ children }: { children?: string }) {
  const { c } = useTheme();
  return children ? (
    <T v="small" color={c.danger} accessibilityRole="alert" style={{ fontFamily: F.semi }}>
      {children}
    </T>
  ) : null;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 14 },
});
