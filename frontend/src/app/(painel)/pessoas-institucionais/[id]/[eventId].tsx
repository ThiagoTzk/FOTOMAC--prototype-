import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, CircleCheck, Maximize2, ShieldAlert, TriangleAlert, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDate } from '@/api/images';
import { decideMarks, markedImageUrl, personEventImages, type EventMarks, type MarkedImage } from '@/api/institutional';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, Pill } from '@/components/panel/ui';
import { ZoomImage } from '@/components/ui/ZoomImage';
import { fonts, panel } from '@/theme/tokens';

/**
 * Figma "18 — Fotos da pessoa institucional" (RF021 notes 6 and 7): only this person's images in this
 * event. The marks come from facial similarity and can be wrong: before any institutional use, a person
 * of the team confirms or rejects them. A rejected image leaves the list for good.
 */
export default function PersonEventPhotos() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const [data, setData] = useState<EventMarks | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<MarkedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    personEventImages(id, eventId).then(setData).catch((e) => setError(e.message));
  }, [id, eventId]);
  useFocusEffect(load);

  async function decide(confirm: boolean) {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await decideMarks(id, selected, confirm);
      setDone(confirm ? `${r.decided} ${r.decided === 1 ? 'imagem confirmada' : 'imagens confirmadas'}.`
        : `${r.decided} ${r.decided === 1 ? 'imagem rejeitada' : 'imagens rejeitadas'}: não aparecem mais para esta pessoa.`);
      setSelected([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : <Card><ActivityIndicator color={panel.primary} /></Card>;
  const { person, event, images } = data;
  const toggle = (imageId: string) =>
    setSelected((s) => (s.includes(imageId) ? s.filter((x) => x !== imageId) : [...s, imageId]));
  const pending = images.filter((i) => i.status === 'pending').map((i) => i.image_id);

  return (
    <View style={{ gap: 20 }}>
      <PageHeader crumbs={[{ label: 'Pessoas institucionais', href: `/pessoas-institucionais?pessoa=${id}` }, { label: person.full_name },
                           { label: event.name }]}
                  title={`${person.full_name} — ${event.name}`}
                  subtitle={`${images.length} de ${event.total} ${event.total === 1 ? 'imagem deste evento contém' : 'imagens deste evento contêm'} esta pessoa.`} />
      <Card padding={18} style={styles.eventInfo}>
        {[event.date_label, event.location, ...event.themes].map((t) => <Pill key={t} label={t} bg={panel.page} fg={panel.muted} />)}
      </Card>
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}

      <Card padding={20} style={{ gap: 14 }}>
        <View style={styles.bar}>
          <Text style={styles.count}>{images.length} {images.length === 1 ? 'foto identificada' : 'fotos identificadas'}
            {pending.length ? ` · ${pending.length} a confirmar` : ''}</Text>
          <View style={styles.barActions}>
            {pending.length > 0 && <Button variant="secondary" label="Selecionar as não confirmadas" onPress={() => setSelected(pending)} />}
            {selected.length > 0 && <Button variant="secondary" label="Limpar seleção" onPress={() => setSelected([])} />}
          </View>
        </View>
        <View style={styles.grid}>
          {images.map((image) => {
            const isSelected = selected.includes(image.image_id);
            return (
              <View key={image.image_id} style={[styles.card, isSelected && styles.cardSelected]}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }}
                           accessibilityLabel={`Selecionar foto de ${image.signature}`} onPress={() => toggle(image.image_id)}>
                  <Image source={{ uri: markedImageUrl(id, image.image_id, 'thumb', image.version) }} style={styles.photo}
                         contentFit="cover" recyclingKey={image.image_id} />
                  <View style={[styles.check, isSelected && styles.checkOn]}>
                    {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={2.4} absoluteStrokeWidth />}
                  </View>
                </Pressable>
                {image.status === 'confirmed'
                  ? <Pill label="Confirmada" bg={panel.successSoft} fg={panel.success} />
                  : <Pill label="A confirmar" bg={panel.warningSoft} fg={panel.warning} />}
                <Text style={styles.meta} numberOfLines={2}>
                  {image.captured_at ? formatDate(image.captured_at) : event.date_label} · {image.signature}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Abrir a foto ampliada" onPress={() => setOpen(image)}
                           style={styles.openLink}>
                  <Maximize2 size={13} color={panel.primary} strokeWidth={1.8} absoluteStrokeWidth />
                  <Text style={styles.action}>Abrir</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      <Notice tone="warning" icon={ShieldAlert} title="Confirmação humana necessária"
              description={`Antes do uso institucional, confirme visualmente se ${person.full_name} aparece nas fotos selecionadas e se o contexto é adequado. O reconhecimento indica semelhança, não identidade.`} />
      <View style={styles.actions}>
        <Button variant="danger" icon={X} label={selected.length ? `Rejeitar seleção (${selected.length})` : 'Rejeitar seleção'}
                disabled={!selected.length} loading={busy} onPress={() => decide(false)} />
        <Button icon={CircleCheck} label={selected.length ? `Confirmar seleção (${selected.length})` : 'Confirmar seleção'}
                disabled={!selected.length} loading={busy} onPress={() => decide(true)} />
      </View>

      <Modal visible={!!open} onClose={() => setOpen(null)} icon={Maximize2} title={open ? open.credit : ''} width={1000}>
        {open && (
          <ZoomImage uri={markedImageUrl(id, open.image_id, 'preview', open.version)}
                     placeholder={markedImageUrl(id, open.image_id, 'thumb', open.version)} style={styles.big}
                     alt={`Foto em que ${person.full_name} foi localizada`} keyboard />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  eventInfo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  barActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  count: { fontFamily: fonts.semiBold, fontSize: 15, color: panel.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 196, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: panel.border, borderRadius: 10, padding: 8, gap: 9 },
  cardSelected: { borderColor: panel.primary, borderWidth: 2, padding: 7 },
  photo: { width: 178, height: 124, borderRadius: 8, backgroundColor: panel.page },
  check: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF',
           backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: panel.primary, borderColor: panel.primary },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  action: { fontFamily: fonts.semiBold, fontSize: 13, color: panel.primary },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },
  big: { width: '100%', height: 560 },
});
