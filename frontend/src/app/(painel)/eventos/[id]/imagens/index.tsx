import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Download, Images, Info, ListChecks, LoaderCircle, RefreshCw, ScanFace, Send, Trash2, TriangleAlert, Upload, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { canUploadTo, getEvent, type EventItem } from '@/api/events';
import { decideApprovals, getProcessing, listImages, publishEvent, type ImageCounts, type ImageFilter, type ImageItem,
         type Processing } from '@/api/images';
import { useAuth } from '@/auth/AuthContext';
import { EventTabs } from '@/components/panel/EventTabs';
import { ImageCard, gridStyle } from '@/components/panel/ImageCard';
import { Indicator, Indicators } from '@/components/panel/Indicator';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, Pill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const PAGE = 60;

/** Figma "12 — Gerenciamento das imagens". */
export default function ImagesScreen() {
  const { id, filtro } = useLocalSearchParams<{ id: string; filtro?: ImageFilter }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [filter, setFilter] = useState<ImageFilter>(filtro ?? 'all');
  const [data, setData] = useState<{ items: ImageItem[]; counts: ImageCounts } | null>(null);
  const [proc, setProc] = useState<Processing | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [publishing, setPublishing] = useState<'all' | 'selected' | null>(null);   // confirmation open
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const { account } = useAuth();
  const isAdmin = account?.role === 'admin';

  const load = useCallback(() => {
    getEvent(id).then(setEvent).catch(() => undefined);
    listImages(id, filter).then(setData).catch(() => undefined);
    getProcessing(id).then(setProc).catch(() => undefined);
  }, [id, filter]);
  useFocusEffect(load);

  if (!event || !data || !proc) return <Card><ActivityIndicator color={panel.primary} /></Card>;
  const c = data.counts;
  const filters: { key: ImageFilter; label: string; bg?: string; fg?: string }[] = [
    { key: 'all', label: `Todas · ${c.all}` },
    { key: 'in_review', label: `Em conferência · ${c.in_review}` },
    { key: 'published', label: `Publicada · ${c.published}` },
    { key: 'discarded', label: `Descartada · ${c.discarded}` },
    { key: 'no_faces', label: `Sem faces detectadas · ${c.no_faces}` },
    { key: 'failed', label: `Falha · ${c.failed}` },
    // RF011 note 2 / RF023 note 7: removal requests get their own highlight.
    { key: 'removal', label: `Remoção solicitada · ${c.removal}`, ...(c.removal > 0 && { bg: panel.dangerSoft, fg: panel.danger }) },
    // RF031 note 3: photos of a hired photographer waiting for the administrator.
    ...(c.pending_approval > 0 ? [{ key: 'pending_approval' as ImageFilter, label: `Aguardando aprovação · ${c.pending_approval}`,
                                    bg: panel.warningSoft, fg: panel.warning }] : []),
  ];
  const deletable = [...selected].filter((sid) => data.items.find((i) => i.id === sid)?.can_manage);
  const approvable = [...selected].filter((sid) => data.items.find((i) => i.id === sid)?.approval === 'pending');
  const pendingHere = data.items.filter((i) => i.approval === 'pending');
  // Under review and not waiting for the administrator (RF031): what can be published now.
  const isReady = (i?: ImageItem) => !!i && i.review_status === 'in_review' && i.approval !== 'pending';
  const publishable = [...selected].filter((sid) => isReady(data.items.find((i) => i.id === sid)));
  const canPublish = event.can_manage && !event.deletion_due_at && event.status !== 'expired';
  const toPublish = publishing === 'all' ? c.ready : publishable.length;

  /** "Selecionar para publicar": shows the images under review with every ready one already selected. */
  async function selectReady() {
    const r = await listImages(id, 'in_review');
    setFilter('in_review'); setShown(PAGE); setData(r);
    setSelected(new Set(r.items.filter(isReady).map((i) => i.id))); setSelecting(true);
  }

  /** RF009: publishing is what allows the face indexing. All the ready ones, or only the selected. */
  async function publish() {
    setBusy(true); setError(null);
    try {
      await publishEvent(id, publishing === 'selected' ? publishable : undefined);
      router.navigate(`/eventos/${id}/processamento`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar.');
    } finally { setBusy(false); setPublishing(null); }
  }

  /** RF031: approve or reject the selected photos at once. Who approved each one is recorded. */
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const r = await decideApprovals(id, approvable, approve);
      setMessage(approve
        ? `${r.decided} ${r.decided === 1 ? 'foto aprovada' : 'fotos aprovadas'}. Já podem ser publicadas: use “Publicar” abaixo.`
        : `${r.decided} ${r.decided === 1 ? 'foto rejeitada e excluída' : 'fotos rejeitadas e excluídas'}.`);
      setSelected(new Set()); setSelecting(false); setConfirmReject(false);
      load();
    } finally { setBusy(false); }
  }

  async function deleteSelected() {
    setBusy(true);
    try {
      const r = await api<{ deleted: number; refused: number }>(`/events/${id}/images/delete`, { body: { ids: deletable } });
      setMessage(`${r.deleted} ${r.deleted === 1 ? 'imagem excluída' : 'imagens excluídas'}, com os dados de indexação facial.`);
      setSelected(new Set()); setSelecting(false); setConfirm(false);
      load();
    } finally { setBusy(false); }
  }

  async function reprocessFailed() {
    const r = await api<{ queued: number }>(`/events/${id}/images/reprocess-failed`, { method: 'POST' });
    setMessage(r.queued ? `${r.queued} ${r.queued === 1 ? 'imagem voltou' : 'imagens voltaram'} para a fila de indexação.` : 'Nenhuma imagem elegível para reprocessamento.');
    load();
  }

  const processingLabel = proc.total === 0 ? '—' : proc.pending > 0 ? `${proc.percent}%` : 'Concluído';
  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` }, { label: 'Imagens' }]}
                  title="Imagens"
                  actions={(
                    <>
                      {c.published > 0 && (
                        <Button variant="secondary" icon={Download} label={event.can_manage ? 'Baixar acervo' : event.relation === 'viewer' ? 'Baixar para divulgação' : 'Baixar minhas imagens'}
                                onPress={() => router.navigate(`/eventos/${id}/download`)} />)}
                      {canUploadTo(event) && (
                        <Button icon={Upload} label="Enviar imagens" onPress={() => router.navigate(`/eventos/${id}/enviar`)} />)}
                    </>)} />
      <EventTabs event={event} value="images" />
      <Indicators>
        <Indicator label="Total de imagens" value={c.all} icon={Images} bg={panel.primarySoft} fg={panel.primary} />
        <Indicator label="Faces indexadas" value={proc.faces} icon={ScanFace} bg={panel.primarySoft} fg={panel.primary} />
        <Indicator label="Processamento" value={processingLabel} icon={proc.pending > 0 ? LoaderCircle : CircleCheck}
                   bg={panel.successSoft} fg={panel.success} />
      </Indicators>
      <View style={styles.toolbar}>
        <View style={styles.filters} accessibilityRole="tablist">
          {filters.map((f) => (
            <Pressable key={f.key} accessibilityRole="tab" accessibilityState={{ selected: filter === f.key }}
                       onPress={() => { setFilter(f.key); setShown(PAGE); }}>
              <Pill label={f.label} bg={filter === f.key ? panel.primarySoft : f.bg ?? panel.page}
                    fg={filter === f.key ? panel.primaryText : f.fg ?? panel.muted} />
            </Pressable>
          ))}
        </View>
        <View style={styles.bulk}>
          <Button variant="secondary" label={selecting ? 'Cancelar seleção' : 'Selecionar'}
                  onPress={() => { setSelecting(!selecting); setSelected(new Set()); }} />
          {isAdmin && selecting && pendingHere.length > 0 && (
            <Button variant="secondary" icon={ListChecks} label={`Selecionar as que aguardam aprovação (${pendingHere.length})`}
                    onPress={() => setSelected(new Set(pendingHere.map((i) => i.id)))} />
          )}
          {isAdmin && approvable.length > 0 && (
            <>
              <Button icon={CircleCheck} label={`Aprovar selecionadas (${approvable.length})`} loading={busy} onPress={() => decide(true)} />
              <Button variant="danger" icon={X} label={`Rejeitar (${approvable.length})`} onPress={() => setConfirmReject(true)} />
            </>
          )}
          <Button variant="secondary" icon={Trash2} label={`Excluir selecionadas${deletable.length ? ` (${deletable.length})` : ''}`}
                  disabled={!deletable.length} onPress={() => setConfirm(true)} />
          <Button variant="secondary" icon={RefreshCw} label="Reprocessar elegíveis" disabled={!c.failed} onPress={reprocessFailed} />
        </View>
      </View>
      {message && <Notice tone="success" icon={CircleCheck} title={message} />}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {/* 17/10/2026: publishing happens here, where the images are reviewed — all the ready ones or a selection. */}
      {canPublish && c.ready > 0 && (
        <Card padding={18} style={styles.publishBar}>
          <View style={{ gap: 4, flex: 1, minWidth: 260 }}>
            <Text style={styles.big}>{c.ready} {c.ready === 1 ? 'imagem pronta' : 'imagens prontas'} para publicação</Text>
            <Text style={styles.text}>
              {event.status === 'published' ? 'O evento continua no site enquanto as novas imagens são indexadas.'
                : 'O evento vai para o site quando a indexação facial terminar.'}
              {c.pending_approval > 0 ? ` ${c.pending_approval} aguardando aprovação ${c.pending_approval === 1 ? 'fica' : 'ficam'} de fora.` : ''}
            </Text>
          </View>
          <View style={styles.bulk}>
            {selecting && publishable.length > 0
              ? <Button icon={Send} label={`Publicar selecionadas (${publishable.length})`} onPress={() => setPublishing('selected')} />
              : <Button variant="secondary" icon={ListChecks} label="Selecionar para publicar" onPress={selectReady} />}
            <Button icon={Send} variant={selecting && publishable.length > 0 ? 'secondary' : 'primary'}
                    label={`Publicar todas (${c.ready})`} onPress={() => setPublishing('all')} />
          </View>
        </Card>
      )}
      {!event.can_manage && event.relation !== 'viewer' && c.ready > 0 && (
        <Notice tone="info" icon={Info} title={`${c.ready} ${c.ready === 1 ? 'imagem aguarda' : 'imagens aguardam'} publicação pelo responsável`}
                description={`Quem publica é ${event.owner.full_name}, responsável pelo evento, ou a administração.`} />
      )}
      {data.items.length === 0 ? (
        <Notice tone="info" icon={Images} title="Nenhuma imagem neste filtro" />
      ) : (
        <View style={gridStyle.grid}>
          {data.items.slice(0, shown).map((img) => (
            <ImageCard key={img.id} image={img} selectable={selecting} selected={selected.has(img.id)}
                       onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(img.id)) n.delete(img.id); else n.add(img.id); return n; })}
                       onOpen={() => router.navigate(`/eventos/${id}/imagens/${img.id}?filtro=${filter}`)}
                       action={{ label: 'Abrir', onPress: () => router.navigate(`/eventos/${id}/imagens/${img.id}?filtro=${filter}`) }} />
          ))}
        </View>
      )}
      {data.items.length > shown && <View style={{ alignItems: 'center' }}><Button variant="secondary" label={`Carregar mais (${data.items.length - shown})`} onPress={() => setShown(shown + PAGE)} /></View>}

      <Modal visible={confirmReject} onClose={() => setConfirmReject(false)} icon={X} tone="danger"
             title={`Rejeitar ${approvable.length} ${approvable.length === 1 ? 'foto' : 'fotos'}?`} width={500}>
        <Text style={styles.text}>
          As fotos rejeitadas são excluídas definitivamente, sem nunca gerar dado biométrico. A rejeição fica registrada com o seu nome.
        </Text>
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setConfirmReject(false)} />
          <Button variant="danger" label="Rejeitar e excluir" onPress={() => decide(false)} loading={busy} />
        </View>
      </Modal>

      <Modal visible={!!publishing} onClose={() => setPublishing(null)} icon={Send}
             title={`Publicar ${toPublish} ${toPublish === 1 ? 'imagem' : 'imagens'}?`} width={520}>
        <Text style={styles.text}>
          Só imagens publicadas passam pela indexação facial e podem ser encontradas pelos visitantes.
          {publishing === 'selected' && c.ready > toPublish ? ` As outras ${c.ready - toPublish} continuam em conferência.` : ''}
        </Text>
        {c.discarded > 0 && (
          <Notice tone="warning" icon={TriangleAlert}
                  title={`${c.discarded} ${c.discarded === 1 ? 'imagem descartada será excluída' : 'imagens descartadas serão excluídas'} definitivamente`} />
        )}
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setPublishing(null)} />
          <Button icon={Send} label={`Publicar ${toPublish} ${toPublish === 1 ? 'imagem' : 'imagens'}`} onPress={publish} loading={busy} />
        </View>
      </Modal>

      {/* RF011 note 4: batch deletion informs the quantity before confirming. */}
      <Modal visible={confirm} onClose={() => setConfirm(false)} icon={Trash2} tone="danger"
             title={`Excluir ${deletable.length} ${deletable.length === 1 ? 'imagem' : 'imagens'}?`} width={500}>
        <Text style={styles.text}>
          As imagens selecionadas, suas cópias e os dados associados à indexação facial serão removidos definitivamente. Esta ação não poderá ser desfeita.
        </Text>
        {selected.size > deletable.length && (
          <Notice tone="warning" icon={TriangleAlert} title={`${selected.size - deletable.length} selecionadas são de outros fotógrafos e não serão excluídas.`} />
        )}
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(false)} />
          <Button variant="danger" label="Excluir imagens" onPress={deleteSelected} loading={busy} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 300 },
  bulk: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  publishBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  big: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
});
