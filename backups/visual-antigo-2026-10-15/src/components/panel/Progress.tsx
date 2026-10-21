import { StyleSheet, View } from 'react-native';

import { panel } from '@/theme/tokens';

/** "Trilho" + "Progresso": track #DDE5EA and a primary (or red, on failure) fill. */
export function ProgressBar({ percent, height = 10, danger = false }: { percent: number; height?: number; danger?: boolean }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View style={[styles.track, { height }]} accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}>
      <View style={[styles.fill, { width: `${p}%`, backgroundColor: danger ? panel.danger : panel.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: panel.border, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
