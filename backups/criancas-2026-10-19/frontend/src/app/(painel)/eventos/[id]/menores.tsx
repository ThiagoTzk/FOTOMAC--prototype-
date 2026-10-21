import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CircleCheck, TriangleAlert } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getEvent, type EventItem } from '@/api/events';
import { listImages, type ImageItem } from '@/api/images';
import { BlurEditor } from '@/components/panel/BlurEditor';
import { PageHeader } from '@/components/panel/PageHeader';
import { ProgressBar } from '@/components/panel/Progress';
import { Button, Card, Notice } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/**
 * Blurring, photo after photo, the face of a child who appears BY CHANCE in an event that is not meant
 * for children (LGPD Art. 14, RF009 note 7). A human decides each face. Events FOR children need no
 * blurring: taking part requires the guardians' signed term, collected by the school.
 */
export default function MinorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [photos, setPhotos] = useState<ImageItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getEvent(id).then(setEvent).catch((e) => setError(e.message));
    listImages(id).then((r) => setPhotos(r.items.filter((i) => i.review_status !== 'discarded'))).catch((e) => setError(e.message));
  }, [id]));

  if (error) return <Notice tone="danger" icon={TriangleAlert} title="Não foi possível abrir" description={error} />;
  if (!event || !photos) return <Card><ActivityIndicator color={panel.primary} /></Card>;

  const pending = photos.filter((p) => !p.minors_reviewed);
  const current = pending[Math.min(index, pending.length - 1)];
  const done = photos.length - pending.length;

  return (
    <View style={{ gap: 20, maxWidth: 1200 }}>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` }]}
                  title="Borrar rostos de crianças que aparecem por acaso"
                  subtitle="Para cada foto: borre o rosto da criança (o arquivo original é substituído) ou confirme que não há criança." />
      <Card padding={20} style={{ gap: 8 }}>
        <Text style={s.label}>{done} de {photos.length} fotos conferidas</Text>
        <ProgressBar percent={photos.length ? (100 * done) / photos.length : 100} />

      </Card>
      {current ? (
        <Card padding={20} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Text style={s.label}>Foto {Math.min(index, pending.length - 1) + 1} de {pending.length} a conferir
              {current.review_status === 'published' ? ' · publicada (será reindexada sem os rostos borrados)' : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="secondary" label="Anterior" disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
              <Button variant="secondary" label="Pular" disabled={index >= pending.length - 1} onPress={() => setIndex((i) => i + 1)} />
            </View>
          </View>
          <BlurEditor key={current.id + current.version} image={current} height={620}
                      onDone={(updated) => setPhotos((list) => list && list.map((p) => (p.id === updated.id ? updated : p)))} />
        </Card>
      ) : (
        <Notice tone="success" icon={CircleCheck} title="Todas as fotos foram conferidas"
                description="Os rostos escolhidos foram borrados no próprio arquivo e não geram dado biométrico." />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fonts.bold, fontSize: 14, color: panel.text },
  help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: panel.muted },
});
