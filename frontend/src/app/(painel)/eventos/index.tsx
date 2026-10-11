import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { listEvents, type EventFilters as Filters, type EventPage } from '@/api/events';
import { EventFilters } from '@/components/panel/EventFilters';
import { EventsTable } from '@/components/panel/EventsTable';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/** Figma "02 — Lista de eventos" (with its empty-result variation). */
export default function EventsScreen() {
  const [filters, setFilters] = useState<Filters>({ scope: 'all', page: 1 });
  const [data, setData] = useState<EventPage | null>(null);

  useFocusEffect(useCallback(() => {
    listEvents(filters).then(setData).catch(() => setData({ items: [], total: 0, page: 1, page_size: 20 }));
  }, [filters]));

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const page = filters.page ?? 1;
  return (
    <>
      <PageHeader title="Eventos" subtitle="Gerencie os eventos e seus respectivos acervos fotográficos."
                  actions={<Button label="+ Novo evento" onPress={() => router.navigate('/eventos/novo')} />} />
      <Card style={{ zIndex: 10 }}>
        <EventFilters value={filters} onChange={setFilters} />
        {!data && <ActivityIndicator color={panel.primary} />}
        {data && data.items.length > 0 && (
          <>
            <EventsTable events={data.items} />
            <View style={styles.pager}>
              <Text style={styles.muted}>Mostrando {data.items.length} de {data.total} eventos</Text>
              {pages > 1 && (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Página anterior" disabled={page <= 1}
                             onPress={() => setFilters({ ...filters, page: page - 1 })} style={styles.pageBtn}>
                    <ChevronLeft size={18} color={page <= 1 ? panel.border : panel.text} />
                  </Pressable>
                  <Text style={[styles.muted, { alignSelf: 'center' }]}>{page} / {pages}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Próxima página" disabled={page >= pages}
                             onPress={() => setFilters({ ...filters, page: page + 1 })} style={styles.pageBtn}>
                    <ChevronRight size={18} color={page >= pages ? panel.border : panel.text} />
                  </Pressable>
                </View>
              )}
            </View>
          </>
        )}
      </Card>
      {data && data.items.length === 0 && (
        <Card style={styles.empty}>
          <View style={styles.emptyIcon}><SearchX size={24} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth /></View>
          <View style={{ flex: 1, gap: 4, minWidth: 200 }}>
            <Text style={styles.emptyTitle}>Nenhum evento encontrado</Text>
            <Text style={styles.muted}>Ajuste os filtros ou limpe a busca para ver outros eventos.</Text>
          </View>
          <Button variant="secondary" label="Limpar filtros" onPress={() => setFilters({ scope: 'all', page: 1 })} />
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  muted: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
  emptyIcon: { width: 52, height: 52, borderRadius: 999, backgroundColor: panel.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 16, color: panel.text },
});
