import { Pressable, StyleSheet, Text, View } from 'react-native';

import { THEME_ICONS } from '@/components/icons/themeIcons';
import { fonts, panel } from '@/theme/tokens';

const GROUPS = [...new Set(THEME_ICONS.map((i) => i.group))];

/** Grid of the symbols a theme (tag) can have, grouped; the chosen one is highlighted. */
export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <View style={{ gap: 14 }} accessibilityRole="radiogroup" accessibilityLabel="Ícone do tema">
      {GROUPS.map((g) => (
        <View key={g} style={{ gap: 6 }}>
          <Text style={styles.group}>{g}</Text>
          <View style={styles.grid}>
            {THEME_ICONS.filter((i) => i.group === g).map(({ name, label, Icon }) => {
              const on = name === value;
              return (
                <Pressable key={name} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
                           onPress={() => onChange(name)}
                           style={({ hovered }: any) => [styles.cell, hovered && !on && { backgroundColor: panel.page }, on && styles.on]}>
                  <Icon size={22} color={on ? panel.primary : panel.text} strokeWidth={1.7} absoluteStrokeWidth />
                  <Text style={[styles.label, on && { color: panel.primary, fontFamily: fonts.bold }]} numberOfLines={1}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 84, height: 70, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1,
          borderColor: 'transparent' },
  on: { backgroundColor: panel.primarySoft, borderColor: panel.primary },
  label: { fontFamily: fonts.regular, fontSize: 11, color: panel.muted, maxWidth: 78 },
});
