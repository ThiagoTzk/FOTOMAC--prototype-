import { router, useFocusEffect } from 'expo-router';
import { CalendarDays, CircleCheck, Clock, Images, Info, LoaderCircle, ScanFace, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getDashboard, getNotifications, listEvents, type Dashboard, type EventFilters as Filters, type EventItem, type PanelNotice,
} from '@/api/events';
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

const NOTICE_ICON: Record<PanelNotice['tone'], LucideIcon> = { danger: TriangleAlert, warning: Clock, info: Info };

/** Figma "01 — Visão geral". */
export default function OverviewScreen() {
  const { account } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const contractor = account?.role === 'contractor';
  const admin = account?.role === 'admin';
  // A hired photographer owns no event: it sees the one it was hired for (RF031). The administrator
  // looks after the whole system, so its overview lists every event (D2, 17/10/2026).
  const [filters, setFilters] = useState<Filters>({ scope: contractor || admin ? 'all' : 'mine' });
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [notices, setNotices] = useState<PanelNotice[] | null>(null);

  useFocusEffect(useCallback(() => {
    getDashboard().then(setData).catch(() => undefined);
    // Same source as the header bell: the two never disagree.
    getNotifications().then((r) => setNotices(r.items)).catch(() => setNotices([]));
  }, []));
  useFocusEffect(useCallback(() => {
    listEvents(filters).then((p) => setEvents(p.items.slice(0, 5))).catch(() => setEvents([]));
  }, [filters]));

  const firstName = account?.full_name.split(' ')[0] ?? '';
  return (
    <>
      <PageHeader title={`Olá, ${firstName}!`} subtitle="Acompanhe seus eventos e fotografias."
                  actions={!contractor ? <Button label="+ Novo evento" onPress={() => router.navigate('/eventos/novo')} /> : undefined} />
      {contractor && account?.valid_until && (
        <Notice tone="warning" icon={Clock}
                title={`Conta temporária: vale até ${new Date(account.valid_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                description="Envie as fotos da cobertura para o evento abaixo. Elas são publicadas depois da aprovação da administração, sempre com o seu crédito. Ao vencer o prazo, o acesso termina automaticamente."
                actionLabel={account.bound_event_id ? 'Abrir o evento' : undefined}
                onAction={account.bound_event_id ? () => router.navigate(`/eventos/${account.bound_event_id}`) : undefined} />
      )}

      {admin ? (
        <View style={styles.indicators}>
          <Indicator label="Eventos ativos" value={data?.active_events ?? 0} icon={CalendarDays} bg={panel.primarySoft} fg={panel.primary} />
          <Indicator label="Aguardando aprovação" value={data?.approvals_total ?? 0} icon={Clock} bg={panel.warningSoft} fg={panel.warning} />
          <Indicator label="Remoções pendentes" value={data?.removal_requests ?? 0} icon={Trash2} bg={panel.dangerSoft} fg={panel.danger} />
          <Indicator label="Falhas no reconhecimento" value={data?.indexing_failures ?? 0} icon={ScanFace} bg={panel.dangerSoft} fg={panel.danger} />
        </View>
      ) : (
        <View style={styles.indicators}>
          <Indicator label="Meus eventos" value={data?.events_owned ?? 0} icon={CalendarDays} bg={panel.primarySoft} fg={panel.primary} />
          <Indicator label="Em processamento" value={data?.processing ?? 0} icon={LoaderCircle} bg={panel.primarySoft} fg={panel.primary} />
          <Indicator label="Requer atenção" value={data?.attention ?? 0} icon={TriangleAlert} bg={panel.dangerSoft} fg={panel.danger} />
          <Indicator label="Imagens publicadas" value={data?.photos_published ?? 0} icon={Images} bg={panel.successSoft} fg={panel.success} />
        </View>
      )}

      <Card style={{ zIndex: 10 }}>
        <SectionTitle title={admin ? 'Eventos recentes' : 'Meus eventos'} action={
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/eventos')}>
            <Text style={styles.link}>Ver todos</Text>
          </Pressable>} />
        <EventFilters value={filters} onChange={setFilters} showScope={false} />
        {events && events.length > 0 && <EventsTable events={events} />}
        {events && events.length === 0 && (
          <Text style={styles.empty}>
            {Object.values(filters).some((v) => v && v !== 'mine' && v !== 'all')
              ? 'Nenhum evento encontrado com esses filtros.'
              : admin ? 'Nenhum evento cadastrado ainda.' : 'Você ainda não cadastrou eventos. Comece pelo botão “+ Novo evento”.'}
          </Text>
        )}
      </Card>

      <Card padding={18} style={{ gap: 12 }}>
        <SectionTitle title="Avisos e pendências" />
        <View style={styles.attention}>
          {notices?.map((n, k) => (
            <Notice key={`${n.kind}-${k}`} tone={n.tone} icon={NOTICE_ICON[n.tone]} style={styles.attentionItem}
                    title={n.title} description={n.description} actionLabel="Abrir" onAction={() => router.navigate(n.href as never)} />
          ))}
          {notices && notices.length === 0 && (
            <Notice tone="success" icon={CircleCheck} style={styles.attentionItem} title="Nenhuma pendência"
                    description="Pedidos de remoção, imagens a aprovar ou publicar, falhas e prazos aparecerão aqui." />
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
