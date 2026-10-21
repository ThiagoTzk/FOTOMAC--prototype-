import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Download, Info, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { API_URL, api } from '@/api/client';
import { getEvent, type EventItem } from '@/api/events';
import { formatBytes, type PackageJob } from '@/api/images';
import { PageHeader } from '@/components/panel/PageHeader';
import { ProgressBar } from '@/components/panel/Progress';
import { Button, Card, Notice, Pill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

function Step({ n, title, description, done, right, children }: {
  n: number; title: string; description: string; done?: boolean; right?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <Card padding={20} style={{ gap: 12 }}>
      <View style={styles.stepHead}>
        <View style={[styles.number, done && { backgroundColor: panel.successSoft }]}>
          <Text style={[styles.numberText, done && { color: panel.success }]}>{done ? '✓' : n}</Text>
        </View>
        <View style={{ flex: 1, gap: 3, minWidth: 200 }}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.text}>{description}</Text>
        </View>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** Figma "15 — Download do acervo completo" (RF012). */
export default function DownloadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [estimate, setEstimate] = useState<{ images: number; size_bytes: number; only_own: boolean } | null>(null);
  const [job, setJob] = useState<PackageJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getEvent(id).then(setEvent).catch((e) => setError(e.message));
    api<{ images: number; size_bytes: number; only_own: boolean }>(`/events/${id}/package/estimate`).then(setEstimate).catch(() => undefined);
  }, [id]));

  // Follow the background job until it is ready.
  useEffect(() => {
    if (!job || job.status === 'ready' || job.status === 'failed' || job.status === 'expired') return;
    const t = setTimeout(() => api<PackageJob>(`/packages/${job.id}`).then(setJob).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [job]);

  async function prepare() {
    setError(null);
    try { setJob(await api<PackageJob>(`/events/${id}/package`, { method: 'POST' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível preparar o pacote.'); }
  }

  // The id is a PARAMETER, not read from `job` inside the function: the React Compiler
  // memoizes this function and would evaluate `job.id` during render, while job is still null.
  async function download(packageId: string) {
    // The API checks the session and answers with a link signed for THIS login, valid for 30
    // minutes; the ZIP then comes through the API itself (never from the storage directly).
    try {
      const { url } = await api<{ url: string }>(`/packages/${packageId}/download-link`, { method: 'POST' });
      if (Platform.OS === 'web') window.location.href = `${API_URL}${url}`; else Linking.openURL(`${API_URL}${url}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar. Tente novamente.');
    }
  }

  if (!event || !estimate) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : <Card><ActivityIndicator color={panel.primary} /></Card>;
  const preparing = job && (job.status === 'pending' || job.status === 'running');
  const ready = job?.status === 'ready';

  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` }, { label: 'Baixar acervo' }]}
                  title={estimate.only_own ? 'Baixar minhas imagens' : 'Baixar acervo'}
                  subtitle={estimate.only_own ? 'Prepare um pacote com as fotografias publicadas que você enviou a este evento.'
                    : 'Prepare um pacote com as fotografias publicadas deste evento.'} />
      <Card padding={22}>
        <View style={styles.summary}>
          {[['Fotos publicadas', `${estimate.images} JPEG`], ['Tamanho estimado', formatBytes(estimate.size_bytes)], ['Evento', event.name]]
            .map(([label, value]) => (
              <View key={label} style={styles.summaryItem}>
                <Text style={styles.small}>{label}</Text>
                <Text style={styles.big} numberOfLines={2}>{value}</Text>
              </View>
            ))}
        </View>
        <Text style={styles.text}>
          O pacote contém as fotografias JPEG originais, sem recompressão, com os créditos gravados nos metadados e sem dados de localização.
        </Text>
      </Card>
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Step n={1} title="Preparar o pacote" description="Inicie a organização segura dos arquivos publicados." done={!!job}
            right={!job ? <Button label="Preparar arquivo" onPress={prepare} disabled={!estimate.images} /> : undefined} />
      {job && (
        <Step n={2} title={preparing ? 'Preparando acervo...' : job.status === 'failed' ? 'Falha ao preparar' : 'Acervo preparado'}
              description={preparing ? `Reunindo e compactando ${estimate.images} fotografias.` : job.status === 'failed'
                ? 'Não foi possível montar o pacote. Tente novamente.' : `${job.image_count} fotografias reunidas.`}
              done={ready} right={preparing ? <Pill label="Preparando acervo..." /> : job.status === 'failed'
                ? <Button label="Tentar novamente" onPress={prepare} /> : undefined}>
          {preparing && <ProgressBar percent={job.progress} height={7} />}
        </Step>
      )}
      {ready && job && (
        <Step n={3} title="Seu arquivo está pronto" description={`O pacote ${job.file_name} está disponível (${formatBytes(job.size_bytes)}).`} done
              right={<Button icon={Download} label="Baixar arquivo ZIP" onPress={() => download(job.id)} />} />
      )}
      {/* Adaptation to v1.6 (RF012 note 5): signed link valid for at most 30 minutes (the design said 24 h). */}
      <Notice tone="warning" icon={Info} title="Link temporário"
              description="Por segurança, o link de download expira em 30 minutos e vale somente para a sua conta. Depois disso, prepare um novo arquivo. Cada extração fica registrada." />
    </>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 28, flexWrap: 'wrap' },
  summaryItem: { flexGrow: 1, flexBasis: 200, gap: 5 },
  small: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  big: { fontFamily: fonts.regular, fontSize: 20, color: panel.text },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.muted },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  number: { width: 32, height: 32, borderRadius: 999, backgroundColor: panel.primarySoft, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontFamily: fonts.regular, fontSize: 14, color: panel.primary },
  stepTitle: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
});
