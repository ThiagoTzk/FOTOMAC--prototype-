import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, panel } from '@/theme/tokens';

export type Option<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  placeholder: string;
  options: Option<T>[];
  /** Single select: one value or null. Multiple: array of values. */
  value: T | null | T[];
  onChange: (value: any) => void;
  multiple?: boolean;
  invalid?: boolean;
  accessibilityLabel?: string;
};

/** Dropdown ("Entrada" + chevron-down in the Figma filters and forms). */
export function Select<T extends string | number>({ placeholder, options, value, onChange, multiple,
                                                    invalid, accessibilityLabel }: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = multiple ? (value as T[]) : value === null ? [] : [value as T];
  const text = options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ');

  function pick(v: T) {
    if (!multiple) {
      onChange(selected.includes(v) ? null : v);
      setOpen(false);
      return;
    }
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <View style={{ zIndex: open ? 50 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={[styles.box, open && { borderColor: panel.primary }, invalid && { borderColor: panel.danger, borderWidth: 2 }]}>
        <Text style={[styles.text, !text && { color: placeholder.startsWith('Selecione') ? panel.placeholder : panel.text }]}
              numberOfLines={1}>
          {text || placeholder}
        </Text>
        <ChevronDown size={14} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
      </Pressable>
      {open && (
        <View style={styles.menu} accessibilityRole="menu">
          <ScrollView style={{ maxHeight: 240 }}>
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <Pressable key={String(o.value)} accessibilityRole="menuitem" accessibilityState={{ selected: on }}
                           onPress={() => pick(o.value)} style={({ hovered }: any) => [styles.item, hovered && { backgroundColor: panel.page }]}>
                  <Text style={[styles.itemText, on && { fontFamily: fonts.bold }]}>{o.label}</Text>
                  {on && <Check size={14} color={panel.primary} strokeWidth={2} absoluteStrokeWidth />}
                </Pressable>
              );
            })}
          </ScrollView>
          {multiple && (
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>Concluir</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 42, borderWidth: 1, borderColor: panel.border, borderRadius: panel.radius, backgroundColor: '#FFFFFF',
         paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  menu: { position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: '#FFFFFF', borderWidth: 1,
          borderColor: panel.border, borderRadius: panel.radius, boxShadow: '0px 8px 24px rgba(24, 55, 72, 0.12)',
          paddingVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 9 },
  itemText: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  done: { borderTopWidth: 1, borderColor: panel.border, paddingVertical: 9, alignItems: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 13, color: panel.primary },
});
