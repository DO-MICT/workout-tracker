import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';

import { toast } from '@/lib/ui-state';
import { getS, save } from '@/state/store';
import type { DayEx } from '@/state/types';
import { F, useTheme } from '@/theme';
import { Btn, T } from '@/ui';

/** One injury note per exercise. It shows on that exercise every time it comes up. */
export function NoteModal({ ex, onClose }: { ex: DayEx | null; onClose: () => void }) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  useEffect(() => {
    if (ex) setText(getS().notes?.[ex.id] ?? '');
  }, [ex]);
  if (!ex) return null;
  const existing = getS().notes?.[ex.id] ?? '';
  const write = (del: boolean) => {
    const S = getS();
    if (!S.notes) S.notes = {};
    const v = del ? '' : text.trim();
    if (v) S.notes[ex.id] = v;
    else delete S.notes[ex.id];
    save();
    toast(v ? 'Note saved' : 'Note deleted');
    onClose();
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)' }} onPress={onClose} />
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, gap: 10 }}>
          <T v="h2">Injury note</T>
          <T v="small" muted>{`${ex.n}. Shows on this exercise every time it comes up.`}</T>
          <TextInput
            autoFocus
            multiline
            maxLength={400}
            value={text}
            onChangeText={setText}
            placeholder="e.g. Left shoulder: keep elbows tucked, stop at any pinch."
            placeholderTextColor={c.muted}
            accessibilityLabel={`Injury note for ${ex.n}`}
            style={{ minHeight: 110, borderWidth: 2, borderColor: c.line, borderRadius: 10, padding: 12, fontSize: 17, fontFamily: F.body, color: c.ink, backgroundColor: c.bg, textAlignVertical: 'top' }}
          />
          <Btn title="Save note" onPress={() => write(false)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" title="Cancel" onPress={onClose} style={{ flex: 1 }} />
            {existing ? <Btn kind="ghost" danger title="Delete note" onPress={() => write(true)} style={{ flex: 1 }} /> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
