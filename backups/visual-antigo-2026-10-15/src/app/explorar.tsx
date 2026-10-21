import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PublicFilters } from '@/api/public';
import { EventList, usePublicEvents } from '@/components/visitor/EventList';
import { VisitorFilters } from '@/components/visitor/Filters';
import { VisitorHeader } from '@/components/visitor/Header';
import { Column, vtext } from '@/components/visitor/ui';
import { poppins, visitor } from '@/theme/tokens';

/** "Todos" — every published event, page by page, with the same filters as the home. */
export default function AllEvents() {
  const [filters, setFilters] = useState<PublicFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const { items, total, loading, error, more } = usePublicEvents(filters);

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader back="/" />
      <Column style={{ gap: 16, marginTop: 24 }}>
        <View style={styles.titleRow}>
          <View>
            <Text style={vtext.h2} accessibilityRole="header">Todos</Text>
            {!loading && <Text style={vtext.small}>{total === 1 ? '1 evento' : `${total} eventos`}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters((s) => !s)}
                     style={styles.filter}>
            <Text style={styles.filterText}>Filtrar</Text>
            <SlidersHorizontal size={20} color={visitor.primary} strokeWidth={1.6} absoluteStrokeWidth />
          </Pressable>
        </View>
        {showFilters && <VisitorFilters value={filters} onChange={setFilters} />}
        <EventList items={items} loading={loading} error={error} more={more} empty="Nenhum evento encontrado." />
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: visitor.page },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterText: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.primary },
});
