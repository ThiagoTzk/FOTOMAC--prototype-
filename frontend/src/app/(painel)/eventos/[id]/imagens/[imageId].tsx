import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArchiveRestore, ChevronLeft, ChevronRight, CircleCheck, Clock, Download, FileUp, RefreshCw, Trash2, TriangleAlert, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { getEvent, type EventItem } from '@/api/events';
import { API_URL, api, ApiError } from '@/api/client';
import {
  decideApproval, deleteImage, discardImage, formatBytes, formatDateTime, getImage, imageDownloadLink, listImages, previewUrl,
  reprocessImage, restoreImage, thumbUrl,
  type ImageFilter, type ImageItem,
} from '@/api/images';
import { useAuth } from '@/auth/AuthContext';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { ZoomImage } from '@/components/ui/ZoomImage';
import { Button, Card, Notice, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const REPLACE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/x-adobe-dng', 'image/*'];

const INDEXING: Record<string, string> = {
  not_queued: 'Aguardando publicação', pending: 'Na fila de indexação', processed: 'Processada',
  no_faces: 'Sem faces detectadas', failed: 'Falha no processamento',
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** Figma "13 — Imagem publicada" + "14 — Confirmação de exclusão". */
export default function ImageScreen() {
  const { id, imageId, filtro } = useLocalSearchParams<{ id: string; imageId: string; filtro?: ImageFilter }>();
  const filter: ImageFilter = filtro ?? 'all';
  const [ids, setIds] = useState<string[]>([]);  // the photos of the list it was opened from, in order
  const [event, setEvent] = useState<EventItem | null>(null);
  const [image, setImage] = useState<ImageItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { account } = useAuth();

  useFocusEffect(useCallback(() => {
    getEvent(id).then(setEvent).catch(() => undefined);
    getImage(imageId).then(setImage).catch((e) => setError(e.message));
    listImages(id, filter).then((r) => setIds(r.items.map((i) => i.id))).catch(() => undefined);
  }, [id, imageId, filter]));

  // Previous / next photo of the same list, without going back to the grid (buttons, ← → keys, swipe).
  const pos = ids.indexOf(imageId);
  const prev = pos > 0 ? ids[pos - 1] : undefined;
  const next = pos >= 0 && pos < ids.length - 1 ? ids[pos + 1] : undefined;
  const open = useCallback((target?: string, list: ImageFilter = filter) => {
    if (target) router.replace(`/eventos/${id}/imagens/${target}?filtro=${list}`);
  }, [id, filter]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || confirm) return;
      if (e.key === 'ArrowLeft') open(prev);
      if (e.key === 'ArrowRight') open(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, open, confirm]);

  if (error && !image) return <Notice tone="danger" icon={TriangleAlert} title="Imagem indisponível" description={error} />;
  if (!event || !image) return <Card><ActivityIndicator color={panel.primary} /></Card>;

  async function remove() {
    setBusy(true);
    try { await deleteImage(image!.id); router.replace(`/eventos/${id}/imagens`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir.'); setConfirm(false); }
    finally { setBusy(false); }
  }

  /** RF009: discarding is reversible until the publication; then it becomes definitive. */
  async function toggleDiscard() {
    setError(null);
    try { setImage(await (image!.review_status === 'discarded' ? restoreImage(image!.id) : discardImage(image!.id))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a imagem.'); }
  }

  /** RF009 note 7: an edited version replaces the file before publication. A hired photographer's photo goes
   *  back to the administrator's approval (audit A1): the approval was about the old file. */
  async function replaceFile() {
    // The same formats as the upload; the server checks the binary signature (RF007 note 2).
    const r = await DocumentPicker.getDocumentAsync({ type: REPLACE_TYPES, copyToCacheDirectory: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: File };
    const form = new FormData();
    if (Platform.OS === 'web' && a.file) form.append('file', a.file, a.name);
    else form.append('file', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as unknown as Blob);
    setBusy(true); setError(null);
    try { setImage(await api<ImageItem>(`/images/${image!.id}/file`, { method: 'PUT', body: form })); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Não foi possível substituir o arquivo.'); }
    finally { setBusy(false); }
  }

  /** JPEG with the credits and the ownership notice, WITHOUT watermark: the accounts work for CESMAC (RF030).
   *  The id is a parameter (React Compiler: never read `image` inside a memoized function). */
  async function download(imageId: string) {
    setError(null);
    try {
      const { url } = await imageDownloadLink(imageId);
      if (Platform.OS === 'web') window.location.href = `${API_URL}${url}`; else Linking.openURL(`${API_URL}${url}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível baixar. Tente novamente.'); }
  }

  async function reprocess() {
    setError(null);
    try { setImage(await reprocessImage(image!.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível reprocessar.'); }
  }

  /** RF031 note 3: the administrator decides on a hired photographer's photo. A rejected one is deleted. */
  async function decide(approve: boolean) {
    setError(null);
    try {
      const r = await decideApproval(image!.id, approve);
      // Straight to the next photo still waiting — reviewing 200 photos must not mean 200 round trips.
      const waiting = (await listImages(id, 'pending_approval')).items.map((i) => i.id);
      if (waiting.length) open(waiting[0], 'pending_approval');
      else if (r.image) setImage(r.image);
      else router.replace(`/eventos/${id}/imagens`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.'); }
  }

  const faces = image.faces_count === null ? '—'
    : image.faces_count === 0 ? 'Nenhum rosto detectado' : `${image.faces_count} ${image.faces_count === 1 ? 'rosto detectado e indexado' : 'rostos detectados e indexados'}`;
  const published = image.review_status === 'published';
  return (
    <>
      {/* Images have no name (RF007): the breadcrumb says "Imagem", identified by the photo itself. */}
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` },
                           { label: 'Imagens', href: `/eventos/${id}/imagens` }, { label: 'Imagem' }]}
                  title={published ? 'Imagem publicada' : image.review_status === 'discarded' ? 'Imagem descartada' : 'Imagem em conferência'}
                  actions={image.can_manage || image.can_download ? (
                    <>
                      {image.can_download && <Button variant="secondary" icon={Download} label="Baixar imagem" onPress={() => download(image.id)} />}
                      {image.can_manage && published && <Button variant="secondary" icon={RefreshCw} label="Reprocessar imagem" onPress={reprocess} />}
                      {image.can_manage && image.review_status === 'in_review' && (
                        <Button variant="secondary" icon={FileUp} label="Substituir arquivo" onPress={replaceFile} loading={busy} />)}
                      {image.can_manage && !published && (
                        <Button variant="secondary" icon={image.review_status === 'discarded' ? ArchiveRestore : X}
                                label={image.review_status === 'discarded' ? 'Desfazer descarte' : 'Descartar'} onPress={toggleDiscard} />)}
                      {image.can_manage && <Button variant="danger" icon={Trash2} label="Excluir imagem" onPress={() => setConfirm(true)} />}
                    </>) : undefined} />
      {image.removal_deadline && (
        // Adaptation to v1.6 (RF023 note 6): deletion is automatic at the deadline.
        <Notice tone="danger" icon={TriangleAlert} title="Remoção solicitada"
                description={`Uma pessoa retratada pediu a remoção desta imagem. Ela já não aparece nas buscas e será excluída automaticamente em ${formatDateTime(image.removal_deadline)}, caso não seja excluída antes.`} />
      )}
      {image.approval === 'pending' && (
        <Notice tone="warning" icon={Clock} title="Aguardando aprovação da administração"
                description={account?.role === 'admin'
                  ? 'Foto enviada por fotógrafo contratado. Ela só entra na publicação depois de aprovada. Rejeitar exclui a foto (ela nunca gera dado biométrico).'
                  : 'Foto enviada por fotógrafo contratado. Ela só entra na publicação depois que a administração aprovar.'} />
      )}
      {image.approval === 'pending' && account?.role === 'admin' && (
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="danger" icon={X} label="Rejeitar e excluir" onPress={() => decide(false)} />
          <Button icon={CircleCheck} label="Aprovar foto" onPress={() => decide(true)} />
        </View>
      )}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {ids.length > 1 && pos >= 0 && (
        <View style={styles.nav}>
          <Button variant="secondary" icon={ChevronLeft} label="Anterior" disabled={!prev} onPress={() => open(prev)} />
          <Text style={styles.navText}>
            Foto {pos + 1} de {ids.length}{filter === 'pending_approval' ? ' aguardando aprovação' : ''} · use ← → no teclado
          </Text>
          <Button variant="secondary" icon={ChevronRight} label="Próxima" disabled={!next} onPress={() => open(next)} />
        </View>
      )}
      <View style={styles.row}>
        <Card padding={12} style={styles.photoCard}>
          {/* Zoom (wheel, double click, pinch, buttons) to check faces and details before deciding. */}
          <ZoomImage uri={previewUrl(image.id, image.version)} placeholder={thumbUrl(image.id, image.version)} style={styles.photo}
                     alt={`Imagem enviada por ${image.signature}`} keyboard onSwipe={(d) => open(d === 1 ? next : prev)} />
        </Card>
        <Card padding={22} style={styles.meta}>
          <SectionTitle title="Detalhes" />
          <Info label="Evento" value={event.name} />
          <Info label="Data de envio" value={formatDateTime(image.uploaded_at)} />
          {image.captured_at && <Info label="Data de captura" value={formatDateTime(image.captured_at)} />}
          <Info label="Crédito do fotógrafo" value={image.credit} />
          <Info label="Formato" value={image.source_format
            ? `${image.source_format.toUpperCase()} (original guardado) · cópia JPEG para as telas e os downloads`
            : `JPEG · ${formatBytes(image.size_bytes)}`} />
          <Info label="Enviada por" value={image.uploaded_by_name} />
          {image.approved_by_name && image.approved_at && (
            <Info label="Revisada e aprovada por" value={`${image.approved_by_name} em ${formatDateTime(image.approved_at)}`} />
          )}
          {!!image.institutional?.length && <Info label="Pessoa institucional localizada" value={image.institutional.join(', ')} />}
          <Info label="Status de processamento" value={INDEXING[image.indexing_status]} />
          <Info label="Indexação facial" value={faces} />
          <View style={styles.divider} />
          <Text style={styles.note}>Informações biométricas internas não são exibidas nesta área.</Text>
        </Card>
      </View>

      <Modal visible={confirm} onClose={() => setConfirm(false)} icon={Trash2} tone="danger" title="Excluir imagem?" width={500}>
        <Image source={{ uri: thumbUrl(image.id, image.version) }} style={styles.modalPhoto} contentFit="cover" />
        <Text style={styles.text}>
          {published ? 'Excluir esta foto publicada também removerá os dados associados à indexação facial. ' : ''}Esta ação não poderá ser desfeita.
        </Text>
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(false)} />
          <Button variant="danger" label="Excluir imagem" onPress={remove} loading={busy} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  navText: { fontFamily: fonts.regular, fontSize: 13, color: panel.muted },
  row: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  photoCard: { flexGrow: 2, flexBasis: 420 },
  photo: { width: '100%', aspectRatio: 696 / 520, maxHeight: '75vh' as never, borderRadius: 10, backgroundColor: panel.page },
  meta: { flexGrow: 1, flexBasis: 300, gap: 18 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  value: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.text },
  divider: { height: 1, backgroundColor: panel.border },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.muted },
  modalPhoto: { width: '100%', height: 210, borderRadius: 10, backgroundColor: panel.page },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
