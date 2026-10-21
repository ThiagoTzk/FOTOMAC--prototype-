import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getPrivacy, type PublicFilters } from '@/api/public';
import { EventList, usePublicEvents } from '@/components/visitor/EventList';
import { VisitorFilters } from '@/components/visitor/Filters';
import { VisitorHeader } from '@/components/visitor/Header';
import { Column, useWide, VButton, vtext } from '@/components/visitor/ui';
import { EventGrid, Hero, HowItWorks, PrivacyBand, SectionTitle, ThemeStrip } from '@/components/visitor/web/Home';
import { WebPage, Wrap } from '@/components/visitor/web/Site';
import { poppins, visitor } from '@/theme/tokens';

/**
 * Visitor home: public, no account (RF013). Lists ONLY published events; no photo of the
 * collection appears here except the event covers. On a computer it is a web page
 * (WebHome); on a phone, the Figma screen ("Home - Mobile" / "Home - busca").
 */
export default function Home() {
  return useWide() ? <WebHome /> : <MobileHome />;
}

const isFiltering = (f: PublicFilters) => !!(f.q?.trim() || f.theme_ids?.length || f.day || f.period_start);

function WebHome() {
  const { secao } = useLocalSearchParams<{ secao?: string }>();
  const [filters, setFilters] = useState<PublicFilters>({});
  const filtering = isFiltering(filters);
  const { items, total, loading, error, more } = usePublicEvents(filters);
  const [retention, setRetention] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const eventsY = useRef(0);
  const howY = useRef(0);

  // The retention actually practised, from the server (RF022 note 5) — never a fixed "6 meses".
  useEffect(() => { getPrivacy().then((p) => setRetention(p.retention)).catch(() => undefined); }, []);
  // "Como funciona" in the top bar points here.
  useEffect(() => {
    if (secao !== 'como-funciona') return;
    const t = setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, howY.current - 24), animated: true }), 300);
    return () => clearTimeout(t);
  }, [secao]);
  const toEvents = () => scroll.current?.scrollTo({ y: Math.max(0, eventsY.current - 16), animated: true });

  return (
    <WebPage scrollRef={scroll}>
      <Hero filters={filters} onFilters={setFilters} onSearch={toEvents} onSeeAll={() => router.push('/explorar')} />
      <ThemeStrip selected={filters.theme_ids ?? []} onSelect={(ids) => setFilters({ ...filters, theme_ids: ids, page: 1 })} />
      <View onLayout={(e) => { eventsY.current = e.nativeEvent.layout.y; }}>
        <Wrap style={{ paddingVertical: 56 }}>
          <SectionTitle
            title={filtering ? 'Resultado da busca' : 'Eventos recentes'}
            sub={filtering ? (total === 1 ? '1 evento encontrado' : `${total} eventos encontrados`)
              : retention ? `Fotos disponíveis por ${retention} após o evento.` : undefined}
            right={(
              <Pressable accessibilityRole="link" onPress={() => router.push('/explorar')} style={styles.seeAll}>
                <Text style={styles.seeAllText}>Ver todos os eventos</Text>
                <ChevronRight size={18} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth />
              </Pressable>
            )} />
          <EventGrid items={filtering ? items : items.slice(0, 8)} loading={loading} error={error}
                     empty={filtering ? 'Nenhum evento encontrado com esses filtros.' : 'Ainda não há eventos publicados.'} />
          <View style={{ alignItems: 'center', marginTop: 36 }}>
            {filtering
              ? more && <VButton label="Carregar mais eventos" onPress={more} loading={loading} />
              : total > 8 && <VButton label="Ver mais eventos" onPress={() => router.push('/explorar')} />}
          </View>
        </Wrap>
      </View>
      <View onLayout={(e) => { howY.current = e.nativeEvent.layout.y; }}><HowItWorks /></View>
      <PrivacyBand />
    </WebPage>
  );
}

function MobileHome() {
  const [filters, setFilters] = useState<PublicFilters>({});
  const filtering = isFiltering(filters);
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
  seeAllText: { fontFamily: poppins.semiBold, fontSize: 15, color: visitor.primary },
});
