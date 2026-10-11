import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CircleCheck, TriangleAlert } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getEvent, type EventItem } from '@/api/events';
import { getProcessing, listImages, thumbUrl, type ImageItem, type Processing } from '@/api/images';
import { imageStatus } from '@/components/panel/ImageCard';
import { PageHeader } from '@/components/panel/PageHeader';
import { ProgressBar } from '@/components/panel/Progress';
import { Button, Card, Notice, Pill, StatusPill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/** Figma "11 — Processamento / indexação facial". Refreshes every 2 s while there is work. */
export default function ProcessingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [status, setStatus] = useState<Processing | null>(null);
  const [sample, setSample] = useState<ImageItem[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    async function tick() {
      try {
        const [e, s, imgs] = await Promise.all([getEvent(id), getProcessing(id), listImages(id, 'published')]);
        if (!alive) return;
        setEvent(e); setStatus(s); setSample(imgs.items.slice(0, 5));
        if (s.pending > 0) setTimeout(tick, 2000);
      } catch { if (alive) setTimeout(tick, 4000); }
    }
    tick();
    return () => { alive = false; };
  }, [id]));

  if (!event || !status) return <Card><ActivityIndicator color={panel.primary} /></Card>;
  const done = status.pending === 0;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` }]}
                  title="Processamento das imagens" badge={<StatusPill status={event.status} />}
                  subtitle={done ? 'As fotos publicadas foram processadas para indexação facial.'
                    : 'As fotos publicadas estão sendo processadas para indexação facial. O evento ficará público quando esta etapa for concluída.'} />
      <Card padding={22} style={{ gap: 14 }}>
        <View style={styles.between}>
          <Text style={styles.big}>
            {done ? `${status.total} de ${status.total} imagens processadas` : `Processando ${status.total - status.pending} de ${status.total} imagens`}
          </Text>
          <Text style={styles.percent}>{status.percent}%</Text>
        </View>
        <ProgressBar percent={status.percent} />
        <View style={styles.counts}>
          {[['Processadas', status.processed], ['Pendentes', status.pending], ['Sem faces detectadas', status.no_faces], ['Falhas', status.failed]]
            .map(([label, value]) => (
              <View key={label as string} style={styles.count}>
                <Text style={styles.small}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
        </View>
      </Card>
      {sample.length > 0 && (
        // Figma "Amostra de estados": a sample (5) — the full gallery is the Imagens screen.
        <View style={styles.sampleHead}>
          <Text style={styles.sampleTitle}>Amostra das imagens</Text>
          <Pressable accessibilityRole="link" onPress={() => router.navigate(`/eventos/${id}/imagens`)}>
            <Text style={styles.link}>Ver todas as imagens ({status.total})</Text>
          </Pressable>
        </View>
      )}
      {sample.length > 0 && (
        <View style={styles.samples}>
          {sample.map((img) => {
            const s = imageStatus(img);
            return (
              <View key={img.id} style={styles.sample}>
                <Image source={{ uri: thumbUrl(img.id, img.version) }} style={styles.sampleImg} contentFit="cover" />
                <Pill label={s.label} bg={s.bg} fg={s.fg} />
              </View>
            );
          })}
        </View>
      )}
      {status.failed > 0 && (
        <Notice tone="danger" icon={TriangleAlert}
                title={`${status.failed} ${status.failed === 1 ? 'falha' : 'falhas'} de processamento`}
                description="A falha não impede a conclusão do restante do lote. O reprocessamento manual está disponível."
                actionLabel="Ver imagens" onAction={() => router.navigate({ pathname: '/eventos/[id]/imagens', params: { id, filtro: 'failed' } })} />
      )}
      {done && (
        <Card padding={22}>
          <View style={styles.doneRow}>
            <View style={styles.doneIcon}><CircleCheck size={25} color={panel.success} strokeWidth={1.6} absoluteStrokeWidth /></View>
            <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
              <Text style={styles.value}>Processamento concluído</Text>
              <Text style={styles.text}>
                {event.status === 'published'
                  ? `Todas as imagens elegíveis foram processadas (${status.faces} rostos indexados). O evento agora está público.`
                  : 'Todas as imagens elegíveis foram processadas.'}
              </Text>
            </View>
            <StatusPill status={event.status} />
          </View>
          <View style={styles.doneActions}>
            <Button variant="secondary" label="Ver imagens" onPress={() => router.navigate(`/eventos/${id}/imagens`)} />
            <Button label="Ir para o evento" onPress={() => router.navigate(`/eventos/${id}`)} />
          </View>
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  big: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
  percent: { fontFamily: fonts.regular, fontSize: 14, color: panel.primary },
  counts: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  count: { gap: 5, flexGrow: 1, minWidth: 130 },
  small: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  value: { fontFamily: fonts.regular, fontSize: 20, color: panel.text },
  text: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted },
  samples: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  sample: { width: 218, maxWidth: '100%', gap: 8 },  // Figma: 218 px per sample
  sampleImg: { width: '100%', height: 110, borderRadius: 10, backgroundColor: panel.page },
  sampleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sampleTitle: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
  link: { fontFamily: fonts.bold, fontSize: 14, color: panel.primary },
  doneActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  doneIcon: { width: 48, height: 48, borderRadius: 999, backgroundColor: panel.successSoft, alignItems: 'center', justifyContent: 'center' },
});
