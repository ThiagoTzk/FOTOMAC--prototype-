import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Download, Images, LoaderCircle, RefreshCw, ScanFace, Trash2, TriangleAlert } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { getEvent, type EventItem } from '@/api/events';
import { getProcessing, listImages, type ImageCounts, type ImageFilter, type ImageItem, type Processing } from '@/api/images';
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

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
  ];
  const deletable = [...selected].filter((sid) => data.items.find((i) => i.id === sid)?.can_manage);

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
                  actions={c.published > 0 ? (
                    <Button variant="secondary" icon={Download} label={event.can_manage ? 'Baixar acervo' : 'Baixar minhas imagens'}
                            onPress={() => router.navigate(`/eventos/${id}/download`)} />) : undefined} />
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
          <Button variant="secondary" icon={Trash2} label={`Excluir selecionadas${deletable.length ? ` (${deletable.length})` : ''}`}
                  disabled={!deletable.length} onPress={() => setConfirm(true)} />
          <Button variant="secondary" icon={RefreshCw} label="Reprocessar elegíveis" disabled={!c.failed} onPress={reprocessFailed} />
        </View>
      </View>
      {message && <Notice tone="success" icon={CircleCheck} title={message} />}
      {data.items.length === 0 ? (
        <Notice tone="info" icon={Images} title="Nenhuma imagem neste filtro" />
      ) : (
        <View style={gridStyle.grid}>
          {data.items.slice(0, shown).map((img) => (
            <ImageCard key={img.id} image={img} selectable={selecting} selected={selected.has(img.id)}
                       onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(img.id)) n.delete(img.id); else n.add(img.id); return n; })}
                       onOpen={() => router.navigate(`/eventos/${id}/imagens/${img.id}`)}
                       action={{ label: 'Abrir', onPress: () => router.navigate(`/eventos/${id}/imagens/${img.id}`) }} />
          ))}
        </View>
      )}
      {data.items.length > shown && <View style={{ alignItems: 'center' }}><Button variant="secondary" label={`Carregar mais (${data.items.length - shown})`} onPress={() => setShown(shown + PAGE)} /></View>}

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
});
