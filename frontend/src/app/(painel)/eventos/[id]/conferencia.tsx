import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, Images, Info, Send, Trash2, TriangleAlert, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { getEvent, type EventItem } from '@/api/events';
import { discardImage, listImages, previewUrl, publishEvent, restoreImage, thumbUrl, type ImageItem } from '@/api/images';
import { ImageCard, gridStyle } from '@/components/panel/ImageCard';
import { Indicator, Indicators } from '@/components/panel/Indicator';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, Pill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

type Filter = 'all' | 'in_review' | 'discarded' | 'mine';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const PAGE = 60;

/** RF009 note 2: the review position survives leaving and coming back. */
const positionKey = (eventId: string) => `fotomac:conferencia:${eventId}`;
const savePosition = (eventId: string, imageId: string) => { try { localStorage.setItem(positionKey(eventId), imageId); } catch { /* optional */ } };
const loadPosition = (eventId: string) => { try { return localStorage.getItem(positionKey(eventId)); } catch { return null; } };

/** Figma "08 — Conferência", "09 — Visualização individual" and "10 — Confirmação de publicação". */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [images, setImages] = useState<ImageItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getEvent(id).then(setEvent).catch((e) => setError(e.message));
    // Only what is not published yet is under review here.
    listImages(id).then((r) => {
      const pending = r.items.filter((i) => i.review_status !== 'published');
      setImages(pending);
      // Reopen the grid far enough to show where the review stopped (RF009 note 2).
      const last = loadPosition(id);
      const idx = last ? pending.findIndex((i) => i.id === last) : -1;
      if (idx >= PAGE) setShown(Math.ceil((idx + 1) / PAGE) * PAGE);
    }).catch((e) => setError(e.message));
  }, [id]);
  useFocusEffect(load);

  const list = useMemo(() => (images ?? []).filter((i) =>
    filter === 'all' ? true : filter === 'mine' ? i.mine : i.review_status === filter), [images, filter]);

  const replaceLocal = (img: ImageItem) => setImages((all) => all?.map((i) => (i.id === img.id ? img : i)) ?? null);

  async function toggle(img: ImageItem) {
    setError(null);
    try { replaceLocal(await (img.review_status === 'discarded' ? restoreImage(img.id) : discardImage(img.id))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a imagem.'); }
  }

  async function replaceFile(img: ImageItem) {
    const r = await DocumentPicker.getDocumentAsync({ type: 'image/jpeg', copyToCacheDirectory: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: File };
    const form = new FormData();
    if (Platform.OS === 'web' && a.file) form.append('file', a.file, a.name);
    else form.append('file', { uri: a.uri, name: a.name, type: 'image/jpeg' } as unknown as Blob);
    setBusy(true);
    try { replaceLocal(await api<ImageItem>(`/images/${img.id}/file`, { method: 'PUT', body: form })); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Não foi possível substituir o arquivo.'); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    try {
      await publishEvent(id);
      try { localStorage.removeItem(positionKey(id)); } catch { /* optional */ }
      router.replace(`/eventos/${id}/processamento`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar.');
      setConfirm(false);
    } finally { setBusy(false); }
  }

  // Keyboard navigation in the viewer (web): ← → move, Esc closes, D discards/undoes.
  useEffect(() => {
    if (Platform.OS !== 'web' || viewer === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setViewer((v) => (v !== null && v < list.length - 1 ? v + 1 : v));
      if (e.key === 'ArrowLeft') setViewer((v) => (v !== null && v > 0 ? v - 1 : v));
      if (e.key === 'Escape') setViewer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, list.length]);
  useEffect(() => {
    if (viewer === null || !list[viewer]) return;
    savePosition(id, list[viewer].id);
    // Load the previous and next photos ahead of time: moving with ← → shows them at once.
    const near = [list[viewer - 1], list[viewer + 1]].filter(Boolean).map((i) => previewUrl(i.id, i.version));
    Image.prefetch(near).catch(() => undefined);
  }, [viewer, list, id]);

  if (!event || !images) return error ? <Notice tone="danger" icon={TriangleAlert} title="Conferência indisponível" description={error} /> : <Card><ActivityIndicator color={panel.primary} /></Card>;

  const inReview = images.filter((i) => i.review_status === 'in_review').length;
  const discarded = images.filter((i) => i.review_status === 'discarded').length;

  // ---------------------------------------------------------------- 09 — single image
  if (viewer !== null && list[viewer]) {
    const img = list[viewer];
    return (
      <>
        <View style={styles.viewerTop}>
          <Pressable accessibilityRole="button" onPress={() => setViewer(null)} style={styles.back}>
            <ArrowLeft size={16} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth />
            <Text style={styles.backText}>Voltar à conferência</Text>
          </Pressable>
          <Text style={styles.position}>Foto {viewer + 1} de {list.length}</Text>
          <Button variant="secondary" icon={X} label="Fechar" onPress={() => setViewer(null)} />
        </View>
        {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
        <Card padding={16} style={{ gap: 14 }}>
          <View style={styles.viewerRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Foto anterior" disabled={viewer === 0}
                       onPress={() => setViewer(viewer - 1)} style={[styles.nav, viewer === 0 && { opacity: 0.4 }]}>
              <ChevronLeft size={22} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
            </Pressable>
            {/* The thumbnail (already in the browser cache) shows instantly while the preview loads. */}
            <Image source={{ uri: previewUrl(img.id, img.version) }} placeholder={{ uri: thumbUrl(img.id, img.version) }}
                   placeholderContentFit="contain" style={styles.preview} contentFit="contain" recyclingKey={img.id}
                   accessibilityLabel={`Foto ${viewer + 1}, enviada por ${img.signature}`} />
            <Pressable accessibilityRole="button" accessibilityLabel="Próxima foto" disabled={viewer === list.length - 1}
                       onPress={() => setViewer(viewer + 1)} style={[styles.nav, viewer === list.length - 1 && { opacity: 0.4 }]}>
              <ChevronRight size={22} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
            </Pressable>
          </View>
          <View style={styles.divider} />
          <View style={styles.viewerActions}>
            <View style={{ gap: 4, flex: 1, minWidth: 240 }}>
              <Text style={styles.help}>{img.credit}</Text>
              <Text style={styles.help}>Sua posição de revisão será preservada ao voltar. Use ← → no teclado para navegar.</Text>
            </View>
            {img.can_manage ? (
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="secondary" label="Substituir arquivo" onPress={() => replaceFile(img)} loading={busy}
                        disabled={img.review_status !== 'in_review'} />
                {img.review_status === 'discarded'
                  ? <Button variant="secondary" label="Desfazer descarte" onPress={() => toggle(img)} />
                  : <Button variant="danger" label="Descartar imagem" onPress={() => toggle(img)} />}
              </View>
            ) : (
              <Pill label={`Imagem de ${img.signature}: somente o autor gerencia`} bg={panel.page} fg={panel.muted} />
            )}
          </View>
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------- 08 — grid
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `Todas · ${images.length}` },
    { key: 'in_review', label: `Em conferência · ${inReview}` },
    { key: 'discarded', label: `Descartadas · ${discarded}` },
    { key: 'mine', label: `Minhas imagens · ${images.filter((i) => i.mine).length}` },
  ];
  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` }, { label: 'Conferir' }]}
                  title="Conferir imagens"
                  subtitle="Revise as imagens enviadas e descarte apenas aquelas que não devem fazer parte do acervo." />
      <Indicators>
        <Indicator label="Total" value={images.length} icon={Images} bg={panel.primarySoft} fg={panel.primary} />
        <Indicator label="Descartadas" value={discarded} icon={Trash2} bg={panel.dangerSoft} fg={panel.danger} />
        <Indicator label="Prontas para publicação" value={inReview} icon={CircleCheck} bg={panel.successSoft} fg={panel.success} />
      </Indicators>
      {/* Adaptation (v1.6): "Requer atenção" (age estimation of v1.5) replaced by the author filter (RF009 note 4). */}
      <View style={styles.filters} accessibilityRole="tablist">
        {filters.map((f) => (
          <Pressable key={f.key} accessibilityRole="tab" accessibilityState={{ selected: filter === f.key }}
                     onPress={() => { setFilter(f.key); setShown(PAGE); }}>
            <Pill label={f.label} bg={filter === f.key ? panel.primarySoft : panel.page} fg={filter === f.key ? panel.primaryText : panel.muted} />
          </Pressable>
        ))}
      </View>
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {images.length === 0 ? (
        <Notice tone="info" icon={Info} title="Nenhuma imagem em conferência"
                description="Envie imagens a este evento; elas aparecem aqui antes de serem publicadas."
                actionLabel="Enviar imagens" onAction={() => router.navigate(`/eventos/${id}/enviar`)} />
      ) : (
        <View style={gridStyle.grid}>
          {list.slice(0, shown).map((img, idx) => (
            <ImageCard key={img.id} image={img} onOpen={() => setViewer(idx)}
                       action={img.can_manage
                         ? { label: img.review_status === 'discarded' ? 'Desfazer descarte' : 'Descartar', onPress: () => toggle(img) }
                         : { label: 'Abrir', onPress: () => setViewer(idx) }} />
          ))}
        </View>
      )}
      {list.length > shown && <View style={{ alignItems: 'center' }}><Button variant="secondary" label={`Carregar mais (${list.length - shown})`} onPress={() => setShown(shown + PAGE)} /></View>}

      {inReview > 0 && (
        <Card padding={18} style={styles.publishBar}>
          <Text style={styles.big}>{inReview} {inReview === 1 ? 'imagem pronta' : 'imagens prontas'} para publicação</Text>
          {event.can_manage
            ? <Button icon={Send} label={`Publicar ${inReview} ${inReview === 1 ? 'imagem' : 'imagens'}`} onPress={() => setConfirm(true)} />
            : <Pill label={`Aguardando publicação pelo responsável (${event.owner.full_name})`} bg={panel.page} fg={panel.muted} />}
        </Card>
      )}

      <Modal visible={confirm} onClose={() => setConfirm(false)} icon={Send} title="Publicar imagens?">
        <View style={{ gap: 10 }}>
          {[['Enviadas', plural(images.length, 'imagem enviada', 'imagens enviadas')],
            ['Descartadas', plural(discarded, 'imagem descartada', 'imagens descartadas')],
            ['Publicação', plural(inReview, 'imagem será publicada', 'imagens serão publicadas')]].map(([label, value]) => (
            <View key={label} style={{ gap: 5 }}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>
        <Notice tone="info" icon={Info} title="Indexação facial"
                description="Apenas imagens publicadas serão submetidas à indexação facial. Imagens descartadas serão excluídas definitivamente e não serão indexadas." />
        <View style={styles.modalActions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(false)} />
          <Button label={`Publicar ${plural(inReview, 'imagem', 'imagens')}`} onPress={publish} loading={busy} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  publishBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  big: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
  viewerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16 },
  backText: { fontFamily: fonts.bold, fontSize: 14, color: panel.primary },
  position: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  nav: { width: 44, height: 44, borderRadius: 999, backgroundColor: panel.page, alignItems: 'center', justifyContent: 'center' },
  preview: { flex: 1, height: 558, borderRadius: 10, backgroundColor: panel.page },
  divider: { height: 1, backgroundColor: panel.border },
  viewerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  help: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  infoLabel: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  infoValue: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
