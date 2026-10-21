import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Clock, Eye, Trash2, TriangleAlert, Undo2, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { cancelDeletion, coverUrl, getEvent, isoToBr, requestDeletion, setCollaboration, type EventItem } from '@/api/events';
import { EventProgress } from '@/components/panel/EventProgress';
import { EventTabs } from '@/components/panel/EventTabs';
import { Modal } from '@/components/panel/Modal';
import { useAuth } from '@/auth/AuthContext';
import { MONTH_NAMES } from '@/components/panel/dates';
import { PageHeader } from '@/components/panel/PageHeader';
import { MinorsCard } from '@/components/panel/MinorsCard';
import { Button, Card, InfoItem, Notice, SectionTitle, StatusPill, statusLabel } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

function longDate(e: EventItem) {
  if (e.date_precision !== 'day') return e.date_label;
  const [y, m, d] = e.date_start.split('-').map(Number);
  return `${d} de ${MONTH_NAMES[m - 1].toLowerCase()} de ${y}`;
}

/** Figma "05 — Detalhes do evento" + Colaboração card (adaptation for RF025). */
export default function EventDetailsScreen() {
  const { id, aba } = useLocalSearchParams<{ id: string; aba?: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab = aba === 'colaboracao' ? 'info' : 'overview';     // in the URL: Imagens links back to a tab
  const [restored, setRestored] = useState(false);            // deletion just undone: event left unpublished
  const [saving, setSaving] = useState(false);
  const { account } = useAuth();
  const [deleting, setDeleting] = useState<string | null>(null);  // the date the photos would go, if confirmed now

  useFocusEffect(useCallback(() => { getEvent(id).then(setEvent).catch((e) => setError(e.message)); }, [id]));

  if (error) return <Notice tone="danger" icon={TriangleAlert} title="Evento indisponível" description={error} />;
  if (!event) return <Card><ActivityIndicator color={panel.primary} /></Card>;

  async function toggleCollaboration(open: boolean) {
    setSaving(true);
    try { setEvent(await setCollaboration(event!.id, open)); } finally { setSaving(false); }
  }

  const viewer = event.relation === 'viewer';           // marketing on someone else's published event (RF030)
  const contractor = event.relation === 'contractor';   // hired photographer, temporary account (RF031)
  const scheduled = !!event.deletion_due_at;          // "Excluir evento" asked: out of the site, can be undone
  const toImages = (filter?: string) => router.navigate(`/eventos/${event.id}/imagens${filter ? `?filtro=${filter}` : ''}`);
  const dueLabel = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  async function confirmDeletion() {
    setSaving(true);
    try { setEvent(await requestDeletion(event!.id)); setDeleting(null); } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.'); setDeleting(null);
    } finally { setSaving(false); }
  }
  async function undoDeletion() {
    setSaving(true);
    try { setEvent(await cancelDeletion(event!.id)); setRestored(true); } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível desfazer.');
    } finally { setSaving(false); }
  }
  const photographers = event.collaborators.length
    ? event.collaborators.map((c) => c.signature).join(', ')
    : event.owner.full_name;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name }]} title={event.name}
                  badge={<StatusPill status={event.status} deleting={scheduled} />}
                  actions={event.status !== 'expired' ? (
                    <>
                      {event.can_manage && !scheduled && <Button variant="secondary" label="Editar evento" onPress={() => router.navigate(`/eventos/${event.id}/editar`)} />}
                      {event.can_manage && !scheduled && <Button variant="danger" icon={Trash2} label="Excluir evento"
                                                                    onPress={() => setDeleting(new Date(Date.now() + event.deletion_grace_days * 86400000).toLocaleDateString('pt-BR'))} />}
                    </>) : undefined} />
      {/* Sending and publishing images live in the Imagens tab; the overview keeps what is about the
          event itself — edit and delete (17/10/2026). */}
      <EventTabs event={event} value={tab} />

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
                <InfoItem label="Criado por" value={`${event.owner.full_name}${event.owner.team ? ` — ${event.owner.team}` : ''}`} style={styles.cell} />
                <InfoItem label="Status" value={statusLabel(event.status, scheduled)} style={styles.cell} />
                <InfoItem label="Quantidade de imagens" value={String(event.photos)} style={styles.cell} />
                <InfoItem label="Expiração do acervo" value={isoToBr(event.expires_on)} style={styles.cell} />
              </View>
            </Card>
          </View>
          {scheduled && (
            <Notice tone="danger" icon={Trash2} title={`Exclusão agendada para ${dueLabel(event.deletion_due_at!)}`}
                    description="O evento já saiu do site e os dados de reconhecimento facial foram apagados. Até a data acima as fotos continuam guardadas e a exclusão pode ser desfeita — o evento volta despublicado, para você conferir e publicar de novo. Depois, tudo é eliminado definitivamente."
                    actionLabel={event.can_manage ? 'Desfazer exclusão' : undefined} onAction={event.can_manage ? undoDeletion : undefined} />
          )}
          {restored && !scheduled && event.status === 'editing' && (
            <Notice tone="warning" icon={Undo2} title="Exclusão desfeita — o evento não está publicado"
                    description="As imagens voltaram para a conferência e o evento não aparece no site. Confira, exclua o que não deve voltar e publique de novo: só então o evento volta ao site e os rostos são indexados outra vez."
                    actionLabel="Conferir e publicar" onAction={() => toImages('in_review')} />
          )}
          {viewer && (
            <Notice tone="info" icon={Eye} title="Só visualização"
                    description="Você vê as imagens publicadas deste evento para escolher o que divulgar. As imagens em conferência e as que tiveram remoção pedida não aparecem. O download para divulgação ainda não está disponível." />
          )}
          {contractor && account?.valid_until && (
            <Notice tone="warning" icon={Clock}
                    title={`Conta temporária: vale até ${new Date(account.valid_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                    description="Você vê e gerencia só as imagens que enviou. Elas são publicadas depois da aprovação da administração, com o seu crédito."
                    actionLabel="Ir para Imagens" onAction={() => toImages()} />
          )}
          {account?.role === 'admin' && event.approvals_pending > 0 && (
            <Notice tone="warning" icon={Clock}
                    title={`${event.approvals_pending} ${event.approvals_pending === 1 ? 'imagem aguarda' : 'imagens aguardam'} a sua aprovação`}
                    description="Enviadas por fotógrafo contratado. Só entram na publicação depois de aprovadas (RF031)."
                    actionLabel="Revisar" onAction={() => toImages('pending_approval')} />
          )}
          {event.has_minors && <MinorsCard event={event} onChange={setEvent} />}
          {/* D1 (17/10/2026): one card with the steps of the event instead of a pile of notices. */}
          {!viewer && !contractor && !scheduled && <EventProgress event={event} />}
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
      <Modal visible={!!deleting} onClose={() => setDeleting(null)} icon={Trash2} tone="danger" title="Excluir este evento?" width={520}>
        <View style={{ gap: 12 }}>
          <Text style={styles.text}>
            “{event.name}” sai do site agora e os dados de reconhecimento facial das fotos são apagados na hora.
          </Text>
          <Text style={styles.text}>
            As {event.photos} {event.photos === 1 ? 'foto fica guardada' : 'fotos ficam guardadas'} por {event.deletion_grace_days}{' '}
            {event.deletion_grace_days === 1 ? 'dia' : 'dias'} (até {deleting}). Nesse prazo você pode desfazer a exclusão — o evento
            volta despublicado, para você conferir e publicar de novo. Depois,
            fotos, capa e pacotes são eliminados definitivamente e não há como recuperar.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="secondary" label="Cancelar" onPress={() => setDeleting(null)} />
            <Button variant="danger" label="Excluir evento" loading={saving} onPress={confirmDeletion} />
          </View>
        </View>
      </Modal>
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
