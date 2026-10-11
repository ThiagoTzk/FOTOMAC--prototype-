import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshCw, Trash2, TriangleAlert } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getEvent, type EventItem } from '@/api/events';
import { deleteImage, formatDateTime, getImage, previewUrl, reprocessImage, thumbUrl, type ImageItem } from '@/api/images';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

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
  const { id, imageId } = useLocalSearchParams<{ id: string; imageId: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [image, setImage] = useState<ImageItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getEvent(id).then(setEvent).catch(() => undefined);
    getImage(imageId).then(setImage).catch((e) => setError(e.message));
  }, [id, imageId]));

  if (error && !image) return <Notice tone="danger" icon={TriangleAlert} title="Imagem indisponível" description={error} />;
  if (!event || !image) return <Card><ActivityIndicator color={panel.primary} /></Card>;

  async function remove() {
    setBusy(true);
    try { await deleteImage(image!.id); router.replace(`/eventos/${id}/imagens`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir.'); setConfirm(false); }
    finally { setBusy(false); }
  }

  async function reprocess() {
    setError(null);
    try { setImage(await reprocessImage(image!.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível reprocessar.'); }
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
                  actions={image.can_manage ? (
                    <>
                      {published && <Button variant="secondary" icon={RefreshCw} label="Reprocessar imagem" onPress={reprocess} />}
                      <Button variant="danger" icon={Trash2} label="Excluir imagem" onPress={() => setConfirm(true)} />
                    </>) : undefined} />
      {image.removal_deadline && (
        // Adaptation to v1.6 (RF023 note 6): deletion is automatic at the deadline.
        <Notice tone="danger" icon={TriangleAlert} title="Remoção solicitada"
                description={`Uma pessoa retratada pediu a remoção desta imagem. Ela já não aparece nas buscas e será excluída automaticamente em ${formatDateTime(image.removal_deadline)}, caso não seja excluída antes.`} />
      )}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <View style={styles.row}>
        <Card padding={12} style={styles.photoCard}>
          <Image source={{ uri: previewUrl(image.id, image.version) }} placeholder={{ uri: thumbUrl(image.id, image.version) }} style={styles.photo} contentFit="contain"
                 accessibilityLabel={`Imagem enviada por ${image.signature}`} />
        </Card>
        <Card padding={22} style={styles.meta}>
          <SectionTitle title="Detalhes" />
          <Info label="Evento" value={event.name} />
          <Info label="Data de envio" value={formatDateTime(image.uploaded_at)} />
          {image.captured_at && <Info label="Data de captura" value={formatDateTime(image.captured_at)} />}
          <Info label="Crédito do fotógrafo" value={image.credit} />
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
  row: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  photoCard: { flexGrow: 2, flexBasis: 420 },
  photo: { width: '100%', aspectRatio: 696 / 520, borderRadius: 10, backgroundColor: panel.page },
  meta: { flexGrow: 1, flexBasis: 300, gap: 18 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  value: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.text },
  divider: { height: 1, backgroundColor: panel.border },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.muted },
  modalPhoto: { width: '100%', height: 210, borderRadius: 10, backgroundColor: panel.page },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
