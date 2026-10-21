import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, useTheme } from '@/theme';
import { Btn, T } from '@/ui';

export type PickerOption = { key: string; label: string; sub?: string; tag?: string; selected?: boolean };

/** A bottom sheet with a list of choices (plan picker, day picker...). */
export function PickerModal({
  visible,
  title,
  options,
  onPick,
  onClose,
  footer,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  onPick: (key: string) => void;
  onClose: () => void;
  footer?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)' }} onPress={onClose} />
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingBottom: insets.bottom + 10, maxHeight: '75%' }}>
        <T v="label" muted style={{ paddingHorizontal: 18, paddingBottom: 6 }}>{title.toUpperCase()}</T>
        <ScrollView>
          {options.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              accessibilityState={{ selected: !!o.selected }}
              onPress={() => onPick(o.key)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18, minHeight: 56, backgroundColor: pressed ? c.bg : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T style={{ fontFamily: o.selected ? F.semi : F.med, fontSize: 17 }}>{o.label}</T>
                  {o.tag ? (
                    <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 }}>
                      <T v="label" color={c.accentInk}>{o.tag}</T>
                    </View>
                  ) : null}
                </View>
                {o.sub ? <T v="small" muted>{o.sub}</T> : null}
              </View>
              {o.selected ? <T color={c.done} style={{ fontFamily: F.cond, fontSize: 22 }}>✓</T> : null}
            </Pressable>
          ))}
        </ScrollView>
        {footer ? <Btn kind="link" title={footer.label} onPress={footer.onPress} /> : null}
      </View>
    </Modal>
  );
}
