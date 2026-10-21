import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { PublicFilters } from '@/api/public';
import { EventList, usePublicEvents } from '@/components/visitor/EventList';
import { VisitorFilters } from '@/components/visitor/Filters';
import { VisitorHeader } from '@/components/visitor/Header';
import { Column, vtext } from '@/components/visitor/ui';
import { poppins, visitor } from '@/theme/tokens';

/**
 * Visitor home ("Home - Mobile" / "Home - busca"): public, no account (RF013). Lists ONLY
 * published events; no photo of the collection appears here except the event covers.
 */
export default function Home() {
  const [filters, setFilters] = useState<PublicFilters>({});
  const filtering = !!(filters.q?.trim() || filters.theme_ids?.length || filters.day || filters.period_start);
  const { items, total, loading, error, more } = usePublicEvents(filters);

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader>
        <View style={{ gap: 8, marginTop: 12 }}>
          <Text style={vtext.h1} accessibilityRole="header">Encontre suas fotos nos eventos do CESMAC</Text>
          <Text style={vtext.body}>Reviva momentos especiais e encontre apenas as fotos em que você aparece.</Text>
        </View>
        <VisitorFilters value={filters} onChange={setFilters} />
      </VisitorHeader>
      <Column style={{ gap: 12, marginTop: 32 }}>
        <View style={styles.titleRow}>
          <Text style={vtext.h2}>{filtering ? 'Resultado da busca' : 'Eventos recentes'}</Text>
          {filtering ? (
            <Text style={styles.count}>{total === 1 ? '1 resultado' : `${total} resultados`}</Text>
          ) : (
            <Pressable accessibilityRole="link" onPress={() => router.push('/explorar')} style={styles.seeAll}>
              <Text style={styles.count}>Ver todos</Text>
              <ChevronRight size={20} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth />
            </Pressable>
          )}
        </View>
        <EventList items={filtering ? items : items.slice(0, 6)} loading={loading} error={error} more={filtering ? more : null}
                   empty={filtering ? 'Nenhum evento encontrado com esses filtros.' : 'Ainda não há eventos publicados.'} />
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: visitor.page },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.primary },
});
