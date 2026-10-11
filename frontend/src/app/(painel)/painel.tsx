import { router, useFocusEffect } from 'expo-router';
import { CalendarDays, CircleCheck, Images, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDashboard, listEvents, type Dashboard, type EventFilters as Filters, type EventItem } from '@/api/events';
import { useAuth } from '@/auth/AuthContext';
import { EventFilters } from '@/components/panel/EventFilters';
import { EventsTable } from '@/components/panel/EventsTable';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

function Indicator({ label, value, icon: Icon, bg, fg }: { label: string; value: number; icon: LucideIcon; bg: string; fg: string }) {
  return (
    <Card padding={16} style={styles.indicator}>
      <View style={styles.indicatorHead}>
        <Text style={styles.indicatorLabel}>{label}</Text>
        <View style={[styles.indicatorIcon, { backgroundColor: bg }]}>
          <Icon size={15} color={fg} strokeWidth={1.6} absoluteStrokeWidth />
        </View>
      </View>
      <Text style={styles.indicatorValue}>{value.toLocaleString('pt-BR')}</Text>
    </Card>
  );
}

function hoursLeft(requestedAt: string) {
  // RF023: automatic deletion 72 h after the request, whatever the photographer does.
  const ms = new Date(requestedAt).getTime() + 72 * 3600 * 1000 - Date.now();
  return Math.max(0, Math.round(ms / 3600 / 1000));
}

/** Figma "01 — Visão geral". */
export default function OverviewScreen() {
  const { account } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [filters, setFilters] = useState<Filters>({ scope: 'mine' });
  const [events, setEvents] = useState<EventItem[] | null>(null);

  useFocusEffect(useCallback(() => {
    getDashboard().then(setData).catch(() => undefined);
  }, []));
  useFocusEffect(useCallback(() => {
    listEvents(filters).then((p) => setEvents(p.items.slice(0, 5))).catch(() => setEvents([]));
  }, [filters]));

  const firstName = account?.full_name.split(' ')[0] ?? '';
  return (
    <>
      <PageHeader title={`Olá, ${firstName}!`} subtitle="Acompanhe seus eventos e fotografias."
                  actions={<Button label="+ Novo evento" onPress={() => router.navigate('/eventos/novo')} />} />

      <View style={styles.indicators}>
        <Indicator label="Meus eventos" value={data?.events_owned ?? 0} icon={CalendarDays} bg={panel.primarySoft} fg={panel.primary} />
        <Indicator label="Em processamento" value={data?.processing ?? 0} icon={LoaderCircle} bg={panel.primarySoft} fg={panel.primary} />
        <Indicator label="Requer atenção" value={data?.attention ?? 0} icon={TriangleAlert} bg={panel.dangerSoft} fg={panel.danger} />
        <Indicator label="Fotos publicadas" value={data?.photos_published ?? 0} icon={Images} bg={panel.successSoft} fg={panel.success} />
      </View>

      <Card style={{ zIndex: 10 }}>
        <SectionTitle title="Meus eventos" action={
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/eventos')}>
            <Text style={styles.link}>Ver todos</Text>
          </Pressable>} />
        <EventFilters value={filters} onChange={setFilters} showScope={false} />
        {events && events.length > 0 && <EventsTable events={events} />}
        {events && events.length === 0 && (
          <Text style={styles.empty}>
            {Object.values(filters).some((v) => v && v !== 'mine')
              ? 'Nenhum evento encontrado com esses filtros.'
              : 'Você ainda não cadastrou eventos. Comece pelo botão “+ Novo evento”.'}
          </Text>
        )}
      </Card>

      <Card padding={18} style={{ gap: 12 }}>
        <SectionTitle title="Requer atenção" />
        <View style={styles.attention}>
          {data && data.indexing_failures > 0 && (
            <Notice tone="warning" icon={Info} style={styles.attentionItem}
                    title={`${data.indexing_failures} ${data.indexing_failures === 1 ? 'falha' : 'falhas'} de processamento`}
                    description="Reprocessamento disponível." />
          )}
          {data && data.removal_requests > 0 && data.oldest_removal_request && (
            // Adaptation to v1.6 (RF023): deletion is AUTOMATIC in 72 h — not a "response deadline".
            <Notice tone="danger" icon={TriangleAlert} style={styles.attentionItem}
                    title={`${data.removal_requests} ${data.removal_requests === 1 ? 'solicitação' : 'solicitações'} de remoção`}
                    description={`Exclusão automática em ${hoursLeft(data.oldest_removal_request)} h.`} />
          )}
          {data && data.attention === 0 && (
            <Notice tone="success" icon={CircleCheck} style={styles.attentionItem} title="Nenhuma pendência"
                    description="Falhas de processamento e pedidos de remoção aparecerão aqui." />
          )}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  indicators: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  indicator: { flexGrow: 1, flexBasis: 200, gap: 12, borderColor: panel.borderSoft },
  indicatorHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  indicatorLabel: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  indicatorIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  indicatorValue: { fontFamily: fonts.regular, fontSize: 24, color: panel.text },
  link: { fontFamily: fonts.bold, fontSize: 14, color: panel.primary },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted, paddingVertical: 12 },
  attention: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  attentionItem: { flexGrow: 1, flexBasis: 300 },
});
