import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/** "Indicador": label + coloured icon square + big number (Visão geral, Conferência, Imagens). */
export function Indicator({ label, value, icon: Icon, bg, fg }: { label: string; value: number | string; icon: LucideIcon; bg: string; fg: string }) {
  return (
    <Card padding={16} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.icon, { backgroundColor: bg }]}>
          <Icon size={15} color={fg} strokeWidth={1.6} absoluteStrokeWidth />
        </View>
      </View>
      <Text style={styles.value}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</Text>
    </Card>
  );
}

export function Indicators({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  card: { flexGrow: 1, flexBasis: 200, gap: 12, borderColor: panel.borderSoft },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.regular, fontSize: 24, color: panel.text },
});
