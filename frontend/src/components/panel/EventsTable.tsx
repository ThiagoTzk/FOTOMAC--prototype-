import { router } from 'expo-router';
import { ChevronRight, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { EventItem } from '@/api/events';
import { Pill, StatusPill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const RELATION_PILL: Partial<Record<EventItem['relation'], string>> = {
  collaborator: 'Colaboração', viewer: 'Só visualização', contractor: 'Contratado',
};
const owner = (e: EventItem) => `${e.owner.full_name}${e.owner.team ? ` — ${e.owner.team}` : ''}`;

/** "Tabela de eventos" of the Visão geral and Eventos screens. Rows open the event. */
export function EventsTable({ events }: { events: EventItem[] }) {
  const { width } = useWindowDimensions();
  const compact = width < 900; // phones/tablets: one card per event instead of columns (RNF08)

  if (compact) {
    return (
      <View style={{ gap: 10 }}>
        {events.map((e) => (
          <Pressable key={e.id} accessibilityRole="link" onPress={() => router.navigate(`/eventos/${e.id}`)} style={styles.cardRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.name}>{e.name}</Text>
              <Text style={styles.cell}>{e.date_label} · {e.location} · {e.photos} {e.photos === 1 ? 'imagem' : 'imagens'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <StatusPill status={e.status} deleting={!!e.deletion_due_at} />
                {RELATION_PILL[e.relation] && <Pill label={RELATION_PILL[e.relation]!} />}
                {e.approvals_pending > 0 && <Pill label={`${e.approvals_pending} a aprovar`} bg={panel.warningSoft} fg={panel.warning} />}
              </View>
            </View>
            <ChevronRight size={18} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.table} accessibilityRole="list">
      <View style={styles.head}>
        <Text style={[styles.th, { width: 310 }]}>EVENTO</Text>
        <Text style={[styles.th, { width: 130 }]}>DATA</Text>
        <Text style={[styles.th, { width: 145 }]}>LOCAL</Text>
        <Text style={[styles.th, { width: 120 }]}>IMAGENS</Text>
        <Text style={[styles.th, { width: 160 }]}>STATUS</Text>
        <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>AÇÕES</Text>
      </View>
      {events.map((e) => (
        <Pressable key={e.id} accessibilityRole="link" accessibilityLabel={`Abrir ${e.name}`}
                   onPress={() => router.navigate(`/eventos/${e.id}`)}
                   style={({ hovered }: any) => [styles.row, hovered && { backgroundColor: panel.page }]}>
          <View style={{ width: 310, paddingRight: 12, gap: 4 }}>
            <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
            {/* Adaptation (RF025): events of other photographers with collaboration released. */}
            {RELATION_PILL[e.relation] && <Text style={styles.collab}>{RELATION_PILL[e.relation]} · responsável: {owner(e)}</Text>}
            {e.relation !== 'owner' && !RELATION_PILL[e.relation] && e.owner.team && <Text style={styles.collab}>Responsável: {owner(e)}</Text>}
          </View>
          <Text style={[styles.cell, { width: 130 }]}>{e.date_label}</Text>
          <View style={{ width: 145, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 }}>
            <MapPin size={15} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
            <Text style={[styles.cell, { flex: 1 }]} numberOfLines={2}>{e.location}</Text>
          </View>
          <Text style={[styles.cell, { width: 120 }]}>{e.photos} {e.photos === 1 ? 'imagem' : 'imagens'}</Text>
          <View style={{ width: 160, gap: 4, alignItems: 'flex-start' }}>
            <StatusPill status={e.status} deleting={!!e.deletion_due_at} />
            {/* RF031: photos of a hired photographer waiting for the administrator. */}
            {e.approvals_pending > 0 && <Pill label={`${e.approvals_pending} a aprovar`} bg={panel.warningSoft} fg={panel.warning} />}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <ChevronRight size={18} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: panel.border, borderRadius: panel.cardRadius, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  head: { height: 42, backgroundColor: panel.page, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  th: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
         borderTopWidth: 1, borderColor: panel.borderSoft },
  name: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  collab: { fontFamily: fonts.regular, fontSize: 12, color: panel.primaryText },
  cell: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: panel.border,
             borderRadius: panel.radius, backgroundColor: '#FFFFFF' },
});
