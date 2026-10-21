import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Info, ShieldAlert, TriangleAlert, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getEvent, type EventItem } from '@/api/events';
import { formatBytes } from '@/api/images';
import { Dropzone } from '@/components/panel/Dropzone';
import { PageHeader } from '@/components/panel/PageHeader';
import { ProgressBar } from '@/components/panel/Progress';
import { Button, Card, Notice, Pill, SectionTitle } from '@/components/panel/ui';
import { MAX_FILES_PER_BATCH, newEntries, runQueue, validate, type Entry, type EntryStatus } from '@/components/panel/upload';
import { fonts, panel } from '@/theme/tokens';

const PILL: Record<EntryStatus, { label: string; bg: string; fg: string }> = {
  checking: { label: 'Verificando', bg: panel.page, fg: panel.muted },
  valid: { label: 'Válido', bg: panel.successSoft, fg: panel.success },
  invalid: { label: 'Inválido', bg: panel.dangerSoft, fg: panel.danger },
  duplicate: { label: 'Duplicado', bg: panel.warningSoft, fg: panel.warning },
  waiting: { label: 'Aguardando', bg: panel.page, fg: panel.muted },
  sending: { label: 'Enviando', bg: panel.primarySoft, fg: panel.primaryText },
  done: { label: 'Concluído', bg: panel.successSoft, fg: panel.success },
  failed: { label: 'Falha', bg: panel.dangerSoft, fg: panel.danger },
};

function FileRow({ entry, sending, onRemove }: { entry: Entry; sending: boolean; onRemove?: () => void }) {
  const p = PILL[entry.status];
  return (
    <View style={styles.file}>
      <Image source={{ uri: entry.previewUrl }} style={styles.thumb} contentFit="cover" />
      <View style={{ width: 300, maxWidth: '40%', gap: 4 }}>
        <Text style={styles.fileName} numberOfLines={1}>{entry.file.name}</Text>
        <Text style={styles.small}>{formatBytes(entry.file.size)}</Text>
        {entry.message && entry.status !== 'duplicate' && <Text style={[styles.small, { color: panel.danger }]}>{entry.message}</Text>}
      </View>
      {sending ? (
        <View style={{ flex: 1, gap: 5, minWidth: 80 }}>
          <ProgressBar percent={entry.progress} height={6} danger={entry.status === 'failed'} />
          <Text style={styles.tiny}>{entry.progress}%</Text>
        </View>
      ) : <View style={{ flex: 1 }} />}
      {/* Pills align to the top by default (made for columns); in a row they must be centred. */}
      <View style={{ alignSelf: 'center' }}><Pill label={p.label} bg={p.bg} fg={p.fg} /></View>
      {onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${entry.file.name}`} onPress={onRemove}>
          <X size={17} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
        </Pressable>
      )}
    </View>
  );
}

/** Figma "06 — Upload de imagens" and "07 — Acompanhamento do upload". */
export default function UploadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [phase, setPhase] = useState<'select' | 'sending' | 'finished'>('select');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = useRef(new Map<string, File>());
  const cancelled = useRef(false);

  useEffect(() => { getEvent(id).then(setEvent).catch((e) => setError(e.message)); }, [id]);
  // Free the in-memory previews when leaving the screen.
  useEffect(() => () => entries.forEach((e) => URL.revokeObjectURL(e.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing the tab in the middle of a batch (web).
  useEffect(() => {
    if (Platform.OS !== 'web' || phase !== 'sending') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  const update = useCallback((key: string, patch: Partial<Entry>) => {
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  async function addFiles(selected: File[]) {
    setError(null);
    const room = MAX_FILES_PER_BATCH - entries.length;
    if (selected.length > room) setError(`Máximo de ${MAX_FILES_PER_BATCH} arquivos por envio: ${selected.length - room} não foram incluídos.`);
    const fresh = newEntries(selected.slice(0, Math.max(0, room)));
    fresh.forEach((e) => files.current.set(e.key, e.file));
    setEntries((list) => [...list, ...fresh]);
    setChecking(true);
    try {
      const checked = await validate(id, fresh);
      setEntries((list) => list.map((e) => checked.find((c) => c.key === e.key) ?? e));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível verificar os arquivos.');
    } finally {
      setChecking(false);
    }
  }

  function remove(key: string) {
    setEntries((list) => list.filter((e) => e.key !== key));
    files.current.delete(key);
  }

  async function start(keys: string[]) {
    setPhase('sending');
    cancelled.current = false;
    keys.forEach((k) => update(k, { status: 'waiting', progress: 0, message: undefined }));
    await runQueue(id, keys, update, (k) => files.current.get(k), () => cancelled.current);
    setPhase('finished');
  }

  if (error && !event) return <Notice tone="danger" icon={TriangleAlert} title="Evento indisponível" description={error} />;
  if (!event) return <Card><ActivityIndicator color={panel.primary} /></Card>;

  const valid = entries.filter((e) => e.status === 'valid');
  const sent = entries.filter((e) => e.status === 'done').length;
  const failed = entries.filter((e) => e.status === 'failed');
  const queue = entries.filter((e) => ['waiting', 'sending', 'done', 'failed'].includes(e.status));
  const waiting = entries.filter((e) => e.status === 'waiting' || e.status === 'sending').length;
  const percent = queue.length ? Math.round(queue.reduce((s, e) => s + e.progress, 0) / queue.length) : 0;

  if (phase !== 'select') {
    return (
      <>
        <PageHeader title={phase === 'finished' ? 'Envio concluído' : 'Enviando imagens'} subtitle={event.name} />
        <Card padding={22} style={{ gap: 12 }}>
          <View style={styles.between}>
            <Text style={styles.big}>{sent} de {queue.length} imagens enviadas</Text>
            <Text style={styles.percent}>{percent}%</Text>
          </View>
          <ProgressBar percent={percent} />
          <Text style={styles.small}>
            {phase === 'finished' ? 'Lote finalizado. As imagens estão em conferência e ainda não são públicas.'
              : 'Mantenha esta página aberta enquanto o lote é enviado.'}
          </Text>
        </Card>
        <Card padding={18} style={{ gap: 4 }}>
          {queue.map((e, i) => (
            <View key={e.key}>
              {i > 0 && <View style={styles.divider} />}
              <FileRow entry={e} sending />
            </View>
          ))}
          {failed.length > 0 && (
            // RF008 note 3: the photo identifies the file (images have no name in the system).
            <Notice tone="danger" icon={TriangleAlert} style={{ marginTop: 8 }}
                    title={failed.length === 1 ? 'Esta imagem não conseguiu ser renderizada ou enviada' : `${failed.length} imagens não conseguiram ser renderizadas ou enviadas`}
                    description="As demais imagens seguem normalmente. Tente reenviar somente os arquivos com falha."
                    actionLabel={phase === 'finished' ? 'Tentar novamente' : undefined}
                    onAction={() => start(failed.map((e) => e.key))} />
          )}
        </Card>
        <Card padding={18}>
          <View style={[styles.between, { flexWrap: 'wrap', gap: 16 }]}>
            {[['Enviadas com sucesso', sent], ['Falhas', failed.length], ['Na fila', waiting]].map(([label, value]) => (
              <View key={label as string} style={{ gap: 5, flexGrow: 1, minWidth: 140 }}>
                <Text style={styles.small}>{label}</Text>
                <Text style={styles.big20}>{value}</Text>
              </View>
            ))}
            <Button label="Conferir imagens" disabled={phase !== 'finished' || sent === 0}
                    onPress={() => router.replace(`/eventos/${id}/conferencia`)} />
          </View>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${id}` }, { label: 'Enviar imagens' }]}
                  title="Enviar imagens" />
      <Dropzone onFiles={addFiles} />
      <Card padding={16}>
        <View style={styles.rules}>
          <Pill label="JPEG apenas" />
          <Pill label="Máximo de 25 MB por imagem" bg={panel.page} fg={panel.muted} />
          <Pill label="Máximo de 300 arquivos por envio" bg={panel.page} fg={panel.muted} />
          <Pill label="Máximo de 1.000 imagens por evento" bg={panel.page} fg={panel.muted} />
        </View>
      </Card>
      {/* Adaptation to v1.6 (RF007 note 12): highlighted warning BEFORE every upload. The system does
          not estimate ages; the check is human and the face must be suppressed IN the file. */}
      <Notice tone="warning" icon={ShieldAlert} title="Antes de enviar: pessoas menores de 18 anos"
              description="Confira se o conjunto contém imagens de pessoas menores de 18 anos. Nesses casos, suprima o rosto no próprio arquivo antes do envio — não basta esconder na tela. O sistema não estima idade." />
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {entries.length > 0 && (
        <Card padding={18} style={{ gap: 8 }}>
          <SectionTitle title={`Arquivos selecionados · ${entries.length}`} action={checking ? <ActivityIndicator color={panel.primary} /> : undefined} />
          {entries.map((e, i) => (
            <View key={e.key}>
              {i > 0 && <View style={styles.divider} />}
              <FileRow entry={e} sending={false} onRemove={() => remove(e.key)} />
            </View>
          ))}
          {entries.filter((e) => e.status === 'duplicate').map((e) => (
            <Notice key={`dup-${e.key}`} tone="warning" icon={Info} title="Arquivo duplicado"
                    description={`${e.file.name} já está no acervo e não será enviado novamente.`} />
          ))}
          <View style={styles.actions}>
            <Button variant="secondary" label="Cancelar" onPress={() => router.navigate(`/eventos/${id}`)} />
            <Button label={valid.length ? `Iniciar envio (${valid.length})` : 'Iniciar envio'} disabled={!valid.length || checking}
                    onPress={() => start(valid.map((e) => e.key))} />
          </View>
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  rules: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  file: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  thumb: { width: 54, height: 42, borderRadius: 10, backgroundColor: panel.page },
  fileName: { fontFamily: fonts.bold, fontSize: 14, color: panel.text },
  small: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  tiny: { fontFamily: fonts.regular, fontSize: 11, color: panel.muted },
  divider: { height: 1, backgroundColor: panel.border },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  big: { fontFamily: fonts.regular, fontSize: 16, color: panel.text },
  big20: { fontFamily: fonts.regular, fontSize: 20, color: panel.text },
  percent: { fontFamily: fonts.bold, fontSize: 14, color: panel.primary },
});
