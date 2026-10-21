import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { CircleCheck, Download, Info, LoaderCircle, TriangleAlert, Upload, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { coverUrl, getEvent, isoToBr, setCollaboration, type EventItem } from '@/api/events';
import { MONTH_NAMES } from '@/components/panel/dates';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, SectionTitle, StatusPill, Tabs, statusLabel } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

function InfoItem({ label, value, style }: { label: string; value: string; style?: object }) {
  return (
    <View style={[{ gap: 5 }, style]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function longDate(e: EventItem) {
  if (e.date_precision !== 'day') return e.date_label;
  const [y, m, d] = e.date_start.split('-').map(Number);
  return `${d} de ${MONTH_NAMES[m - 1].toLowerCase()} de ${y}`;
}

/** Figma "05 — Detalhes do evento" + Colaboração card (adaptation for RF025). */
export default function EventDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'images' | 'info'>('overview');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { getEvent(id).then(setEvent).catch((e) => setError(e.message)); }, [id]));

  if (error) return <Notice tone="danger" icon={TriangleAlert} title="Evento indisponível" description={error} />;
  if (!event) return <Card><ActivityIndicator color={panel.primary} /></Card>;

  async function toggleCollaboration(open: boolean) {
    setSaving(true);
    try { setEvent(await setCollaboration(event!.id, open)); } finally { setSaving(false); }
  }

  const inReview = event.photos - event.published;
  const photographers = event.collaborators.length
    ? event.collaborators.map((c) => c.signature).join(', ')
    : event.owner.full_name;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name }]} title={event.name}
                  badge={<StatusPill status={event.status} />}
                  actions={event.status !== 'expired' ? (
                    <>
                      {event.can_manage && <Button variant="secondary" label="Editar evento" onPress={() => router.navigate(`/eventos/${event.id}/editar`)} />}
                      {/* Responsible/admin always; others only while collaboration is open (RF025). */}
                      {(event.can_manage || event.collaboration_open) && (
                        <Button icon={Upload} label="Enviar imagens" onPress={() => router.navigate(`/eventos/${event.id}/enviar`)} />)}
                    </>) : undefined} />

      <Tabs tabs={[{ key: 'overview', label: 'Visão geral' }, { key: 'images', label: 'Imagens' }, { key: 'info', label: 'Colaboração' }]}
            value={tab} onChange={(k) => (k === 'images' ? router.navigate(`/eventos/${event.id}/imagens`) : setTab(k))} />

      {tab === 'overview' && (
        <>
          <View style={styles.summary}>
            <Card padding={12} style={styles.coverCard}>
              <Image source={{ uri: coverUrl(event.id) }} style={styles.cover} contentFit="cover"
                     accessibilityLabel={`Capa do evento ${event.name}`} />
            </Card>
            <Card padding={24} style={styles.infoCard}>
              <InfoItem label="Nome" value={event.name} />
              <View style={styles.infoRow}>
                <InfoItem label="Temas" value={event.themes.map((t) => t.name).join(' · ')} style={styles.cell} />
                <InfoItem label="Data" value={longDate(event)} style={styles.cell} />
                <InfoItem label="Local" value={event.location} style={styles.cell} />
              </View>
              <InfoItem label="Descrição" value={event.description} />
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <InfoItem label={event.collaborators.length > 1 ? 'Fotógrafos' : 'Fotógrafo'} value={photographers} style={styles.cell} />
                <InfoItem label="Status" value={statusLabel(event.status)} style={styles.cell} />
                <InfoItem label="Quantidade de fotos" value={String(event.photos)} style={styles.cell} />
                <InfoItem label="Expiração do acervo" value={isoToBr(event.expires_on)} style={styles.cell} />
              </View>
            </Card>
          </View>
          {inReview > 0 ? (
            <Notice tone="info" icon={Info} title="Próxima ação recomendada"
                    description={`${inReview} ${inReview === 1 ? 'imagem aguarda' : 'imagens aguardam'} conferência e publicação.`}
                    actionLabel="Conferir imagens" onAction={() => router.navigate(`/eventos/${event.id}/conferencia`)} />
          ) : event.status === 'editing' ? (
            <Notice tone="info" icon={Info} title="Próxima ação recomendada"
                    description="Envie e confira as imagens para publicar o acervo deste evento."
                    actionLabel="Enviar imagens" onAction={() => router.navigate(`/eventos/${event.id}/enviar`)} />
          ) : null}
          {event.status === 'processing' && (
            <Notice tone="info" icon={LoaderCircle} title="Indexação facial em andamento"
                    description="O evento ficará público quando todas as imagens publicadas forem processadas."
                    actionLabel="Acompanhar" onAction={() => router.navigate(`/eventos/${event.id}/processamento`)} />
          )}
          {event.published > 0 ? (
            <Notice tone="success" icon={Download} title={event.can_manage ? 'Baixar acervo' : 'Baixar minhas imagens'}
                    description="Prepare um pacote ZIP com as fotografias originais publicadas, com os créditos nos metadados."
                    actionLabel="Preparar pacote" onAction={() => router.navigate(`/eventos/${event.id}/download`)} />
          ) : (
            <Notice tone="success" icon={CircleCheck} title="Download após publicação"
                    description="A ação Baixar acervo ficará disponível quando o evento tiver imagens publicadas." />
          )}
          <Notice tone="warning" icon={TriangleAlert} title="Prazo de retenção"
                  description={`O acervo deste evento será eliminado automaticamente em ${isoToBr(event.expires_on)}, junto com os dados do reconhecimento facial. Baixe o pacote antes, se precisar guardar as fotos.`} />
        </>
      )}

      {tab === 'info' && (
        <Card padding={24}>
          <SectionTitle title="Colaboração" />
          <Text style={styles.text}>
            Liberada a colaboração, todo fotógrafo com conta ativa pode enviar imagens a este evento. Cada um mantém o crédito e
            gerencia apenas as próprias imagens; a publicação continua sendo do responsável.
          </Text>
          {event.can_manage ? (
            <View style={styles.switchRow}>
              <Switch value={event.collaboration_open} onValueChange={toggleCollaboration} disabled={saving || event.status === 'expired'}
                      trackColor={{ true: panel.primary, false: panel.border }} accessibilityLabel="Liberar colaboração" />
              <Text style={styles.switchText}>{event.collaboration_open ? 'Colaboração liberada' : 'Colaboração não liberada'}</Text>
            </View>
          ) : (
            <Notice tone="info" icon={Users} title="Você colabora neste evento"
                    description={`O responsável é ${event.owner.full_name}. Você envia e gerencia apenas as imagens que enviou.`} />
          )}
          <View style={styles.divider} />
          <Text style={styles.infoLabel}>FOTÓGRAFOS COM IMAGENS NESTE EVENTO</Text>
          {event.collaborators.length === 0 ? (
            <Text style={styles.text}>Nenhuma imagem enviada ainda.</Text>
          ) : (
            event.collaborators.map((c) => (
              <View key={c.signature} style={styles.collabRow}>
                <Text style={styles.infoValue}>{c.signature}</Text>
                <Text style={styles.text}>{c.photos} {c.photos === 1 ? 'imagem' : 'imagens'}</Text>
              </View>
            ))
          )}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  coverCard: { width: 420, maxWidth: '100%', flexGrow: 0 },
  cover: { width: '100%', aspectRatio: 396 / 244, borderRadius: 10, backgroundColor: panel.page },
  infoCard: { flex: 1, minWidth: 300, gap: 18 },
  infoRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  cell: { flexGrow: 1, flexBasis: 140 },
  infoLabel: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  infoValue: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.text },
  divider: { height: 1, backgroundColor: panel.border },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { fontFamily: fonts.bold, fontSize: 14, color: panel.text },
  collabRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderColor: panel.borderSoft },
});
