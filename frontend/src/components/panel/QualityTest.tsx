import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import {
  ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, FileImage, FlaskConical, Play, ScanFace, ShieldCheck, ShieldX, Square, SquareCheck,
  Trash2, TriangleAlert, X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal as RNModal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { saveParameters } from '@/api/admin';
import { previewUrl, thumbUrl } from '@/api/images';
import {
  addRun, at, closeTest, createTest, deleteRun, discardTest, getOverview, getTest, putMark, putWrongFace, queryFrameUrl,
  type Item, type Mark, type Overview, type Run, type TestDetail,
} from '@/api/quality';
import { Modal } from '@/components/panel/Modal';
import { ProgressBar } from '@/components/panel/Progress';
import { Select } from '@/components/panel/Select';
import { Button, Card, Field, Input, Notice, Pill, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

import { GuidedCapture } from '@/components/capture/GuidedCapture';

import { extractFrames } from './videoFrames';

/**
 * Quality test of facial recognition — fotomac-lab's Test 1 inside the panel (RNF18).
 *
 * One test = one event + one photo of a person who CONSENTED + one ground truth, marked once and
 * shared by every candidate (the engines of the builder, InsightFace as the yardstick). The score
 * is the lab's: 100 × best F1, over the marked photos only.
 */
export function QualityTab() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? <TestScreen id={open} onBack={() => setOpen(null)} /> : <TestsHome onOpen={setOpen} />;
}

const RUN_COLORS = ['#007DC5', '#15835D', '#B45309', '#7C3AED', '#C63D4A'];
const num = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? '—' : v.toFixed(digits).replace('.', ','));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const score = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ','));
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const runName = (r: { engine_label: string; view: string; view_label: string }) =>
  (r.view === 'single' ? r.engine_label : `${r.engine_label} — ${r.view_label}`);

// ------------------------------------------------------------------ list + new test

function TestsHome({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState<{ name: string; frames: Blob[]; steps?: string[] } | null>(null);
  const [recording, setRecording] = useState(false);
  const [reading, setReading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getOverview().then(setData).catch((e) => setError(e.message)); }, []);

  // A photo, several photos (poses) or a short video: the video is cut into frames HERE, in the browser.
  async function choose() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'video/*'], multiple: true,
                                                     copyToCacheDirectory: false });
    const files = (r.assets ?? []).filter((a) => a.file);
    if (!files.length) return;
    setError(null);
    const video = files.find((a) => (a.mimeType ?? a.file!.type).startsWith('video/'));
    if (!video) return setQuery({ name: files.length === 1 ? files[0].name : `${files.length} fotos`, frames: files.map((a) => a.file!) });
    setReading(true);
    try {
      const frames = await extractFrames(video.file!);
      setQuery({ name: `${video.name} — ${frames.length} quadros extraídos (o vídeo não é enviado)`, frames });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o vídeo.');
    } finally { setReading(false); }
  }

  async function create() {
    if (!eventId || !query) return;
    setBusy(true); setError(null);
    try {
      const { id } = await createTest(eventId, label, query.frames, consent, query.steps);
      onOpen(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o teste.');
      setBusy(false);
    }
  }

  if (!data) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : null;
  return (
    <View style={{ gap: 20 }}>
      <Card padding={24} style={{ zIndex: 5 }}>
        <SectionTitle title="Novo teste de precisão" />
        <Text style={s.text}>
          O mesmo teste do fotomac-lab, no acervo do sistema: escolha um evento e envie uma foto de uma pessoa que aparece nele.
          Cada modelo ordena as fotos pela semelhança; você marca, uma vez só, em quais a pessoa está, e o sistema calcula a nota
          de cada modelo (100 × o melhor F1), o melhor limiar e a velocidade. Mede o acerto do reconhecimento, não a qualidade
          das fotos. Usa só fotos publicadas.
        </Text>
        {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
        <View style={[s.form, { zIndex: 3 }]}>
          <Field label="Evento" style={{ flex: 1, minWidth: 280 }}>
            <Select placeholder="Selecione o evento" options={data.events.map((e) => ({ value: e.id, label: `${e.name} · ${e.photos} fotos publicadas` }))}
                    value={eventId} onChange={setEventId} accessibilityLabel="Evento do teste" />
          </Field>
          <Field label="Nome do teste" help="Sem o nome da pessoa. Ex.: Teste 2." style={{ width: 260 }}>
            <Input value={label} onChangeText={setLabel} maxLength={80} accessibilityLabel="Nome do teste" />
          </Field>
        </View>
        <Field label="Consulta: uma foto, várias fotos ou um vídeo curto"
               help="Vídeo: 3 a 6 segundos virando o rosto devagar — para os lados, para cima e para baixo. O sistema guarda até 5 quadros, um por pose.">
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button icon={ScanFace} label="Gravar com a câmera (guiado)" onPress={() => setRecording(true)} />
            <Pressable accessibilityRole="button" onPress={choose} disabled={reading} style={[s.picker, { flex: 1, minWidth: 280 }]}>
              <FileImage size={20} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth />
              <Text style={s.pickerText} numberOfLines={1}>{reading ? 'Lendo o vídeo…' : query ? query.name : 'ou escolher foto(s) / vídeo do computador'}</Text>
            </Pressable>
          </View>
        </Field>
        <GuidedCapture visible={recording} onClose={() => setRecording(false)}
                       onDone={(frames, steps, order) => {
                         setRecording(false);
                         setQuery({ name: `Gravação guiada — ${frames.length} quadros · ordem sorteada: ${order.join(', ')}`, frames, steps });
                       }} />
        {/* LGPD Art. 11, I: specific and highlighted consent of the person in the query photo. */}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((c) => !c)} style={s.consent}>
          {consent ? <SquareCheck size={22} color={panel.primary} strokeWidth={1.8} absoluteStrokeWidth />
            : <Square size={22} color={panel.muted} strokeWidth={1.8} absoluteStrokeWidth />}
          <Text style={[s.text, { flex: 1 }]}>
            <Text style={{ fontFamily: fonts.bold }}>A pessoa da consulta autorizou </Text>
            o uso da imagem dela neste teste de calibragem (LGPD, Art. 11, I). Ficam guardados só os quadros escolhidos (até 5),
            enquanto o teste estiver aberto (no máximo 30 dias); ao encerrar, eles, as marcações e as notas por foto são
            apagados — fica só o resultado.
          </Text>
        </Pressable>
        <View style={s.actions}>
          <Button icon={FlaskConical} label="Criar teste" loading={busy} disabled={!eventId || !query || reading || !consent || label.trim().length < 2}
                  onPress={create} />
        </View>
      </Card>

      <Card padding={24}>
        <SectionTitle title="Testes" />
        <Text style={s.help}>
          Régua: Teste 1 do fotomac-lab — InsightFace 97,6 · YuNet + SFace 89,5 (388 fotos de 2 eventos, 1 pessoa). Notas de
          acervos ou pessoas diferentes não se comparam diretamente: compare os modelos DENTRO do mesmo teste.
        </Text>
        {data.tests.length === 0 ? <Text style={s.help}>Nenhum teste ainda.</Text> : data.tests.map((t) => (
          <Pressable key={t.id} accessibilityRole="button" onPress={() => onOpen(t.id)}
                     style={({ hovered }: any) => [s.testRow, hovered && { backgroundColor: panel.page }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.label}>{t.label}</Text>
              <Text style={s.help}>{t.event_name} · {t.created_by} · {when(t.created_at)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 520 }}>
              {t.runs.map((r) => (
                <Pill key={r.id} label={`${runName(r)}: ${r.status === 'done' ? score(r.result?.score) : r.status === 'failed' ? 'falhou' : '…'}`} />
              ))}
              <Pill label={t.closed_at ? 'Encerrado' : 'Aberto'} bg={t.closed_at ? panel.borderSoft : panel.successSoft}
                    fg={t.closed_at ? panel.muted : panel.success} />
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

// ------------------------------------------------------------------ one test

type Filter = 'todo' | 'present' | 'absent' | 'all';

function TestScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<TestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todo');
  const [review, setReview] = useState<number | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'close' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { getTest(id).then(setData).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const running = data?.runs.some((r) => r.status === 'pending' || r.status === 'running');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [running, load]);

  const runs = useMemo(() => data?.runs ?? [], [data]);
  const selected = runs.find((r) => r.id === runId) ?? runs.find((r) => r.engine_key === data?.active_engine) ?? runs[0];
  const color = (r: Run) => RUN_COLORS[runs.indexOf(r) % RUN_COLORS.length];

  // Order of the marking list: the selected run's ranking (photos without a face at the end).
  const ordered = useMemo(() => {
    if (!data) return [];
    const sim = (i: Item) => (selected && i.scores[selected.id] ? i.scores[selected.id].similarity : -2);
    return [...data.items].sort((a, b) => sim(b) - sim(a));
  }, [data, selected]);
  const visible = ordered.filter((i) => filter === 'all' || (filter === 'todo' ? !i.mark : i.mark === filter));

  // Marking: optimistic on screen, the server answers with the recalculated scores.
  async function setMark(item: Item, mark: Mark | null) {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, mark } : i)) });
    try {
      const r = await putMark(id, item.id, mark);
      setData((d) => d && { ...d, runs: r.runs });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível marcar.');
      load();
    }
  }
  async function setWrong(item: Item, run: Run, wrong: boolean) {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, scores: { ...i.scores, [run.id]: { ...i.scores[run.id], wrong_face: wrong } } } : i)) });
    const r = await putWrongFace(id, run, item.id, wrong).catch(() => null);
    if (r) setData((d) => d && { ...d, runs: r.runs });
  }

  async function run() {
    if (!candidate) return;
    setError(null);
    try { await addRun(id, candidate); setCandidate(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível rodar.'); }
  }
  async function finish(kind: 'close' | 'discard') {
    setBusy(true);
    try {
      if (kind === 'close') { await closeTest(id); load(); } else { await discardTest(id); onBack(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally { setBusy(false); setConfirm(null); }
  }

  if (!data) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : null;
  const closed = !!data.closed_at;
  const marked = data.items.filter((i) => i.mark).length;
  const free = data.candidates.filter((c) => !runs.some((r) => r.engine_key === c.key && r.status !== 'failed'));

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Pressable accessibilityRole="link" onPress={onBack} style={s.back}>
          <ArrowLeft size={18} color={panel.primary} strokeWidth={1.8} absoluteStrokeWidth />
          <Text style={s.backText}>Testes</Text>
        </Pressable>
        <Text style={s.title}>{data.label}</Text>
        <Text style={s.help}>{data.event_name} · {when(data.created_at)}</Text>
        {closed && <Pill label="Encerrado — só o resultado ficou guardado" bg={panel.borderSoft} fg={panel.muted} />}
      </View>
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {data.query_liveness && <LivenessCard live={data.query_liveness} />}
      {data.query_poses.length > 0 && (
        <Card padding={16}>
          <Text style={s.label}>Consulta guardada ({data.query_poses.length === 1 ? '1 imagem' : `${data.query_poses.length} poses escolhidas`})</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {data.query_poses.map((pose, n) => (
              <View key={n} style={{ alignItems: 'center', gap: 4 }}>
                <Image source={queryFrameUrl(data.id, n)} style={s.pose} contentFit="cover" accessibilityLabel={`Pose ${pose}`} />
                <Text style={s.help}>{pose}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card padding={24} style={{ zIndex: 6 }}>
        <SectionTitle title="Rodadas — um modelo em cada" />
        <ScrollView horizontal>
          <View style={{ minWidth: 980 }}>
            <View style={[s.tr, s.th]}>
              {['Modelo', 'Nota', 'Produto', 'Melhor limiar', 'No limiar atual', 'mAP', 'AUC', 'Intrusos', 'Por foto', 'Busca', ''].map((h, i) => (
                <Text key={h + i} style={[s.thText, { width: COLS[i] }]}>{h}</Text>
              ))}
            </View>
            {runs.map((r) => {
              const res = r.result;
              const now = res ? at(res.model, data.threshold) : null;
              return (
                // The row selects the run; the delete button sits beside it (a button inside a button is invalid HTML).
                <View key={r.id} style={[s.tr, { paddingVertical: 0, paddingHorizontal: 0 }, r === selected && { backgroundColor: panel.primarySoft }]}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: r === selected }} onPress={() => setRunId(r.id)}
                           style={[s.tr, { borderTopWidth: 0, flex: 1 }]}>
                  <View style={{ width: COLS[0], flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={[s.dot, { backgroundColor: color(r) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.label} numberOfLines={2}>{runName(r)}</Text>
                      {r.status === 'done' ? (
                        <Text style={s.help}>{r.faces} rostos · lab: {r.lab_score ? score(r.lab_score) : 'não medido'}</Text>
                      ) : r.status === 'failed' ? <Text style={[s.help, { color: panel.danger }]}>{r.error}</Text> : (
                        <View style={{ gap: 4, marginTop: 4 }}>
                          <ProgressBar percent={r.total ? (100 * r.done) / r.total : 0} height={6} />
                          <Text style={s.help}>{r.status === 'pending' ? 'Na fila' : `${r.done} de ${r.total} fotos`}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[s.big, { width: COLS[1] }]}>{score(res?.score)}</Text>
                  <Text style={[s.td, { width: COLS[2] }]}>{score(res?.score_product)}</Text>
                  <Text style={[s.td, { width: COLS[3] }]}>{num(res?.model.best?.threshold)}</Text>
                  <Text style={[s.td, { width: COLS[4] }]}>{now ? `${now.found} certas · ${now.wrong} erradas` : '—'}</Text>
                  <Text style={[s.td, { width: COLS[5] }]}>{num(res?.model.map, 3)}</Text>
                  <Text style={[s.td, { width: COLS[6] }]}>{num(res?.model.auc, 3)}</Text>
                  <Text style={[s.td, { width: COLS[7] }]}>{res?.model.intruders ?? '—'}</Text>
                  <Text style={[s.td, { width: COLS[8] }]}>{r.index_s_per_photo !== null ? `${num(r.index_s_per_photo, 2)} s` : '—'}</Text>
                  <Text style={[s.td, { width: COLS[9] }]}>{r.search_ms !== null ? `${num(r.search_ms, 1)} ms` : '—'}</Text>
                </Pressable>
                  <View style={{ width: COLS[10] }}>
                    {!closed && r.status !== 'running' && r.view === 'single' && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Excluir rodada ${r.engine_label}`} hitSlop={6}
                                 onPress={() => deleteRun(id, r.run_id).then(load).catch((e) => setError(e.message))}>
                        <Trash2 size={16} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
        <Text style={s.help}>
          Com várias poses, cada modelo aparece em três linhas: 1 quadro (de frente, como uma selfie), a pose mais parecida e o
          rosto médio das poses — comparadas no mesmo gabarito. Nota = 100 × o melhor F1 (rosto errado conta como erro); Produto = rosto errado conta como acerto. Só as fotos marcadas
          entram na conta ({marked} de {data.items.length || '—'}). Clique numa rodada para ver o limiar e ordenar a conferência por ela.
        </Text>
        {!closed && (
          <View style={[s.form, { alignItems: 'flex-end', zIndex: 3 }]}>
            <Field label="Rodar outro modelo" style={{ flex: 1, minWidth: 300 }}>
              <Select placeholder={free.length ? 'Escolha o modelo' : 'Todos os modelos já rodaram'}
                      options={free.map((c) => ({ value: c.key, label: c.reference_only ? `${c.label} — só comparação` : c.label }))}
                      value={candidate} onChange={setCandidate} accessibilityLabel="Modelo da nova rodada" />
            </Field>
            <Button icon={Play} label="Rodar" disabled={!candidate} onPress={run} />
          </View>
        )}
      </Card>

      {selected?.result && <ThresholdCard run={selected} color={color(selected)} system={data.threshold}
                                          canApply={!closed && selected.engine_key === data.active_engine} onApplied={load} />}

      {!closed && (
        <Card padding={24}>
          <SectionTitle title="Conferência — em quais fotos a pessoa está" />
          <View style={{ gap: 6 }}>
            <ProgressBar percent={data.items.length ? (100 * marked) / data.items.length : 0} />
            <Text style={s.help}>
              {marked} de {data.items.length} fotos conferidas. A marcação vale para todos os modelos. Atalhos na revisão: S = está,
              N = não está, E = o rosto da caixa é de outra pessoa (rodada selecionada), setas = navegar.
            </Text>
          </View>
          <View style={s.filters}>
            {([['todo', 'A conferir'], ['present', 'Está'], ['absent', 'Não está'], ['all', 'Todas']] as [Filter, string][]).map(([k, l]) => (
              <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: filter === k }} onPress={() => setFilter(k)}
                         style={[s.filter, filter === k && s.filterOn]}>
                <Text style={[s.filterText, filter === k && { color: panel.primary }]}>
                  {l} ({k === 'all' ? data.items.length : k === 'todo' ? data.items.length - marked : data.items.filter((i) => i.mark === k).length})
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={s.grid}>
            {visible.slice(0, 240).map((item) => (
              <PhotoCard key={item.id} item={item} rank={ordered.indexOf(item) + 1} run={selected} color={selected ? color(selected) : panel.primary}
                         onMark={(m) => setMark(item, m)} onOpen={() => setReview(ordered.indexOf(item))} />
            ))}
          </View>
          {visible.length === 0 && <Text style={s.help}>Nada aqui.</Text>}
        </Card>
      )}

      {!closed && (
        <View style={s.actions}>
          <Button variant="secondary" icon={Trash2} label="Descartar teste" onPress={() => setConfirm('discard')} />
          <Button icon={CircleCheck} label="Encerrar teste" onPress={() => setConfirm('close')} />
        </View>
      )}

      {review !== null && ordered[review] && (
        <Review items={ordered} index={review} runs={runs.filter((r) => r.status === 'done')} selected={selected} color={color}
                onIndex={setReview} onClose={() => setReview(null)} onMark={setMark} onWrong={setWrong} />
      )}
      <Modal visible={!!confirm} onClose={() => setConfirm(null)} icon={confirm === 'discard' ? Trash2 : CircleCheck}
             tone={confirm === 'discard' ? 'danger' : 'primary'} title={confirm === 'discard' ? 'Descartar o teste?' : 'Encerrar o teste?'}>
        <View style={{ gap: 14 }}>
          <Text style={s.text}>
            {confirm === 'discard'
              ? 'Tudo deste teste é apagado: a foto de consulta, as marcações, as rodadas e o resultado.'
              : 'Fica guardado só o resultado de cada rodada (notas, limiares, velocidade). A foto de consulta, as marcações e as notas de cada foto são apagadas — não dá para continuar conferindo depois.'}
          </Text>
          <View style={s.actions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(null)} />
            <Button variant={confirm === 'discard' ? 'danger' : 'primary'} label={confirm === 'discard' ? 'Descartar' : 'Encerrar'} loading={busy}
                    onPress={() => confirm && finish(confirm)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const COLS = [250, 70, 70, 95, 160, 60, 60, 70, 80, 75, 30];

// ------------------------------------------------------------------ liveness (guided recording)

/** Did the head follow the order drawn for this recording? A diagnostic here; the gate of the visitor's search in 2.0. */
function LivenessCard({ live }: { live: NonNullable<TestDetail['query_liveness']> }) {
  return (
    <Card padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {live.passed ? <ShieldCheck size={22} color={panel.success} strokeWidth={1.8} absoluteStrokeWidth />
          : <ShieldX size={22} color={panel.danger} strokeWidth={1.8} absoluteStrokeWidth />}
        <Text style={s.label}>Prova de pessoa viva: {live.passed ? 'passou' : 'não passou'}</Text>
        {live.order && <Text style={s.help}>ordem sorteada: {live.order.join(' → ')}</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {live.steps.map((st) => (
          <Pill key={st.step} label={`${st.step}: ${st.movement === null ? 'sem rosto' : num(st.movement, 2)} (mín. ${num(st.limit, 2)})`}
                bg={st.ok ? panel.successSoft : panel.dangerSoft} fg={st.ok ? panel.success : panel.danger} />
        ))}
      </View>
      {live.inverted && (
        <Text style={[s.help, { color: panel.warning }]}>
          Todos os movimentos foram feitos, mas no sentido contrário ao esperado: é uma convenção de sentido a corrigir no sistema, não uma fraude.
        </Text>
      )}
      {live.reason && <Text style={s.help}>{live.reason}</Text>}
    </Card>
  );
}

// ------------------------------------------------------------------ threshold explorer

function ThresholdCard({ run, color, system, canApply, onApplied }: {
  run: Run; color: string; system: number; canApply: boolean; onApplied: () => void;
}) {
  const result = run.result!;
  const [draft, setDraft] = useState(num(system));
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = Number(draft.replace(',', '.'));
  const valid = !Number.isNaN(t) && t >= 0.2 && t <= 0.8;
  const point = valid ? at(result.model, t) : null;
  const best = result.model.best;
  const bins = result.distribution.bins;
  const peak = Math.max(1, ...result.distribution.present, ...result.distribution.absent, ...result.distribution.wrong_face);

  async function apply() {
    setBusy(true);
    try {
      await saveParameters({ similarity_threshold: Math.round(t * 10000) / 10000 }, true);
      setDone(`Limiar do sistema agora é ${num(t)}. Vale para as próximas buscas e ficou registrado.`);
      onApplied();
    } finally { setBusy(false); setConfirm(false); }
  }

  return (
    <Card padding={24}>
      <SectionTitle title={`Limiar — ${run.engine_label}`} />
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}
      <Text style={s.help}>
        A nota não muda com o limiar: ele só escolhe o ponto de operação — mais fotos achadas ou menos fotos erradas.
        O sistema prioriza a precisão: mostrar a foto de outra pessoa é o erro mais grave.
      </Text>
      <View style={[s.form, { alignItems: 'flex-end' }]}>
        <Field label="Limiar a testar" style={{ width: 160 }}>
          <Input value={draft} onChangeText={setDraft} inputMode="decimal" invalid={!valid} accessibilityLabel="Limiar a testar" />
        </Field>
        <Button variant="secondary" label="−0,01" onPress={() => valid && setDraft(num(t - 0.01))} />
        <Button variant="secondary" label="+0,01" onPress={() => valid && setDraft(num(t + 0.01))} />
        {best && <Button variant="secondary" label={`Melhor F1: ${num(best.threshold)}`} onPress={() => setDraft(num(best.threshold))} />}
        <Button variant="secondary" label={`Atual: ${num(system)}`} onPress={() => setDraft(num(system))} />
        {canApply && valid && Math.abs(t - system) > 1e-6 && <Button label="Usar no sistema" onPress={() => setConfirm(true)} />}
      </View>
      {point && (
        <View style={s.stats}>
          <Stat label="Fotos da pessoa achadas" value={`${point.found} de ${result.model.expected}`} />
          <Stat label="Fotos de outras pessoas mostradas" value={String(point.wrong)} danger={point.wrong > 0} />
          <Stat label="Precisão" value={pct(point.precision)} />
          <Stat label="Revocação" value={pct(point.recall)} />
          <Stat label="F1" value={pct(point.f1)} />
          <Stat label="Perdidas na detecção" value={String(result.model.lost_in_detection)} />
        </View>
      )}
      {/* Where the hits and the errors fall — the lab's most convincing chart. */}
      <View style={s.chart} accessibilityLabel="Distribuição das semelhanças">
        {bins.slice(0, -1).map((b, i) => (
          <View key={b} style={s.bar}>
            <View style={{ flex: 1, justifyContent: 'flex-end', gap: 1 }}>
              <View style={{ height: `${(100 * result.distribution.absent[i]) / peak}%`, backgroundColor: '#CBD5E1' }} />
              <View style={{ height: `${(100 * result.distribution.wrong_face[i]) / peak}%`, backgroundColor: '#F59E0B' }} />
              <View style={{ height: `${(100 * result.distribution.present[i]) / peak}%`, backgroundColor: color }} />
            </View>
          </View>
        ))}
        {valid && <View style={[s.cut, { left: `${(100 * (t - bins[0])) / (bins[bins.length - 1] - bins[0])}%` }]} />}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.help}>{num(bins[0], 1)}</Text>
        <Text style={s.help}><Text style={{ color }}>■</Text> está · <Text style={{ color: '#F59E0B' }}>■</Text> rosto errado · <Text style={{ color: '#94A3B8' }}>■</Text> não está · | limiar</Text>
        <Text style={s.help}>{num(bins[bins.length - 1], 1)}</Text>
      </View>
      <Modal visible={confirm} onClose={() => setConfirm(false)} icon={TriangleAlert} tone="danger" title="Usar este limiar no sistema?">
        <View style={{ gap: 14 }}>
          <Text style={s.text}>
            O limiar decide quando uma foto é entregue ao visitante. Neste teste, {num(t)} achou {point?.found} de {result.model.expected} fotos
            e mostrou {point?.wrong} foto(s) de outras pessoas. Lembre: o teste mediu uma pessoa; com outras pessoas o resultado varia.
            A mudança vale na hora e fica registrada com o seu nome.
          </Text>
          <View style={s.actions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(false)} />
            <Button variant="danger" label="Entendi, usar" loading={busy} onPress={apply} />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, danger && { color: panel.danger }]}>{value}</Text>
      <Text style={s.help}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ marking

function Box({ item, run, color, dashed }: { item: Item; run: Run; color: string; dashed?: boolean }) {
  const score = item.scores[run.id];
  if (!score) return null;
  const [x, y, w, h] = score.box;
  return (
    <View pointerEvents="none" style={{
      position: 'absolute', left: `${(100 * x) / item.width}%`, top: `${(100 * y) / item.height}%`, width: `${(100 * w) / item.width}%`,
      height: `${(100 * h) / item.height}%`, borderWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid', borderRadius: 3,
    }} />
  );
}

function PhotoCard({ item, rank, run, color, onMark, onOpen }: {
  item: Item; rank: number; run: Run | undefined; color: string; onMark: (m: Mark | null) => void; onOpen: () => void;
}) {
  const sc = run ? item.scores[run.id] : undefined;
  return (
    <View style={[s.card, item.mark === 'present' && { borderColor: panel.success }, item.mark === 'absent' && { borderColor: panel.border, opacity: 0.75 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir foto ${rank}`} onPress={onOpen}
                 style={{ width: '100%', aspectRatio: item.width / item.height, backgroundColor: panel.borderSoft }}>
        <Image source={thumbUrl(item.id)} style={StyleSheet.absoluteFill} contentFit="cover" />
        {run && <Box item={item} run={run} color={color} />}
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.help}>#{rank}</Text>
        <Text style={s.label}>{sc ? num(sc.similarity) : 'sem rosto'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <MarkButton label="Está" on={item.mark === 'present'} tone="success" onPress={() => onMark(item.mark === 'present' ? null : 'present')} />
        <MarkButton label="Não está" on={item.mark === 'absent'} tone="muted" onPress={() => onMark(item.mark === 'absent' ? null : 'absent')} />
      </View>
    </View>
  );
}

function MarkButton({ label, on, tone, onPress }: { label: string; on: boolean; tone: 'success' | 'muted'; onPress: () => void }) {
  const fg = tone === 'success' ? panel.success : panel.text;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
               style={[s.mark, on && { backgroundColor: tone === 'success' ? panel.successSoft : panel.borderSoft, borderColor: fg }]}>
      <Text style={[s.markText, on && { color: fg, fontFamily: fonts.bold }]}>{label}</Text>
    </Pressable>
  );
}

/** Full-screen review, like the lab's /marcar: big photo with every run's box, S/N/E and arrows. */
function Review({ items, index, runs, selected, color, onIndex, onClose, onMark, onWrong }: {
  items: Item[]; index: number; runs: Run[]; selected: Run | undefined; color: (r: Run) => string;
  onIndex: (i: number) => void; onClose: () => void; onMark: (item: Item, m: Mark | null) => void;
  onWrong: (item: Item, run: Run, wrong: boolean) => void;
}) {
  const item = items[index];
  const [area, setArea] = useState({ w: 0, h: 0 });
  // The photo is drawn at its own proportion inside the area, so boxes in % land on the face.
  const k = area.w && area.h ? Math.min(area.w / item.width, area.h / item.height) : 0;
  const go = useCallback((d: number) => onIndex(Math.max(0, Math.min(items.length - 1, index + d))), [index, items.length, onIndex]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const key = (e: KeyboardEvent) => {
      const k2 = e.key.toLowerCase();
      if (k2 === 'escape') onClose();
      else if (k2 === 'arrowright') go(1);
      else if (k2 === 'arrowleft') go(-1);
      else if (k2 === 's') { onMark(item, 'present'); go(1); }
      else if (k2 === 'n') { onMark(item, 'absent'); go(1); }
      else if (k2 === 'e' && selected && item.scores[selected.id] && item.mark === 'present') onWrong(item, selected, !item.scores[selected.id].wrong_face);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [item, selected, go, onClose, onMark, onWrong]);

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.review}>
        <View style={{ flex: 1 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {k > 0 && (
            <View style={{ position: 'absolute', width: item.width * k, height: item.height * k, left: (area.w - item.width * k) / 2,
                           top: (area.h - item.height * k) / 2 }}>
              <Image source={previewUrl(item.id)} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`Foto ${index + 1}`} />
              {runs.map((r) => <Box key={r.id} item={item} run={r} color={color(r)} dashed={r !== selected} />)}
            </View>
          )}
        </View>
        <View style={s.side}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.sideTitle}>Foto {index + 1} de {items.length}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar revisão" onPress={onClose} hitSlop={8}>
              <X size={24} color="#FFFFFF" strokeWidth={1.8} absoluteStrokeWidth />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant={item.mark === 'present' ? 'primary' : 'secondary'} label="Está (S)" onPress={() => { onMark(item, 'present'); go(1); }} />
            <Button variant={item.mark === 'absent' ? 'primary' : 'secondary'} label="Não está (N)" onPress={() => { onMark(item, 'absent'); go(1); }} />
          </View>
          {runs.map((r) => {
            const sc = item.scores[r.id];
            return (
              <View key={r.id} style={s.sideRun}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.dot, { backgroundColor: color(r) }]} />
                  <Text style={[s.sideText, { flex: 1 }]} numberOfLines={2}>{r.engine_label}</Text>
                  <Text style={s.sideValue}>{sc ? num(sc.similarity) : 'sem rosto'}</Text>
                </View>
                {sc && item.mark === 'present' && (
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: sc.wrong_face }} onPress={() => onWrong(item, r, !sc.wrong_face)}
                             style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {sc.wrong_face ? <SquareCheck size={18} color="#F59E0B" strokeWidth={1.8} absoluteStrokeWidth />
                      : <Square size={18} color="#CBD5E1" strokeWidth={1.8} absoluteStrokeWidth />}
                    <Text style={s.sideHelp}>A caixa marcou outra pessoa{r === selected ? ' (E)' : ''}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          <Text style={s.sideHelp}>Caixa cheia = rodada selecionada; tracejada = as outras.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 'auto' }}>
            <Button variant="secondary" icon={ChevronLeft} label="Anterior" disabled={index === 0} onPress={() => go(-1)} />
            <Button variant="secondary" icon={ChevronRight} label="Próxima" disabled={index === items.length - 1} onPress={() => go(1)} />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const s = StyleSheet.create({
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: panel.muted },
  label: { fontFamily: fonts.bold, fontSize: 13, color: panel.text },
  title: { fontFamily: fonts.regular, fontSize: 22, color: panel.text },
  form: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
            borderColor: panel.primary, backgroundColor: panel.primarySoft, maxWidth: 520 },
  pickerText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: panel.primary },
  consent: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 10, backgroundColor: panel.warningSoft },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 8, borderTopWidth: 1,
             borderColor: panel.borderSoft, borderRadius: 8, flexWrap: 'wrap' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: panel.primarySoft },
  backText: { fontFamily: fonts.semiBold, fontSize: 14, color: panel.primary },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8, borderTopWidth: 1, borderColor: panel.borderSoft },
  th: { borderTopWidth: 0, paddingVertical: 6 },
  thText: { fontFamily: fonts.bold, fontSize: 11, color: panel.muted, textTransform: 'uppercase' },
  td: { fontFamily: fonts.regular, fontSize: 13, color: panel.text },
  big: { fontFamily: fonts.bold, fontSize: 20, color: panel.text },
  dot: { width: 12, height: 12, borderRadius: 6 },
  pose: { width: 96, height: 96, borderRadius: 8, backgroundColor: panel.borderSoft },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { minWidth: 150, flexGrow: 1, padding: 12, borderRadius: 10, backgroundColor: panel.page, gap: 2 },
  statValue: { fontFamily: fonts.bold, fontSize: 20, color: panel.text },
  chart: { height: 140, flexDirection: 'row', alignItems: 'stretch', gap: 2, borderBottomWidth: 1, borderColor: panel.border, marginTop: 6 },
  bar: { flex: 1 },
  cut: { position: 'absolute', top: -6, bottom: -6, width: 2, backgroundColor: panel.text },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filter: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: panel.border },
  filterOn: { borderColor: panel.primary, backgroundColor: panel.primarySoft },
  filterText: { fontFamily: fonts.medium, fontSize: 13, color: panel.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: 196, gap: 6, padding: 8, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#FFFFFF',
          boxShadow: panel.cardShadow },
  mark: { flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: panel.border, alignItems: 'center' },
  markText: { fontFamily: fonts.medium, fontSize: 12, color: panel.muted },
  review: { flex: 1, flexDirection: 'row', backgroundColor: '#0B0F14' },
  side: { width: 320, padding: 20, gap: 14, backgroundColor: '#111827' },
  sideTitle: { fontFamily: fonts.bold, fontSize: 16, color: '#FFFFFF' },
  sideRun: { gap: 6, padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  sideText: { fontFamily: fonts.medium, fontSize: 13, color: '#FFFFFF' },
  sideValue: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  sideHelp: { fontFamily: fonts.regular, fontSize: 12, color: '#CBD5E1' },
});
