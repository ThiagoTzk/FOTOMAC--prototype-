import { CircleCheck, Cpu, History, RefreshCw, Repeat, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  getParameters, getReindex, requestReindex, retentionImpact, saveParameters, switchEngine,
  type Parameter, type Parameters, type ReindexOverview, type ReindexScope,
} from '@/api/admin';
import { Modal } from '@/components/panel/Modal';
import { QualityTab } from '@/components/panel/QualityTest';
import { PageHeader } from '@/components/panel/PageHeader';
import { ProgressBar } from '@/components/panel/Progress';
import { Select } from '@/components/panel/Select';
import { Button, Card, Field, Input, Notice, SectionTitle, Tabs } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

type Tab = 'parametros' | 'reindexacao' | 'teste';

/** Brazilian number format on screen ("0,3741", "0,50"); the API speaks plain numbers. Up to 4
 *  decimals: the calibrated threshold of SFace (0,3741) must not show up rounded to "0,37". */
const decimal = (v: number) => v.toFixed(4).replace(/0{1,2}$/, '').replace('.', ',');
// A choice (e.g. the watermark corner) is shown by its name, never by the number behind it.
const show = (p: Parameter, v: number) => p.choices?.find(([c]) => c === v)?.[1] ?? (p.integer ? String(v) : decimal(v));
const parse = (text: string) => Number(text.replace(',', '.'));
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** RF026 (parameters) and RF028 (re-indexing): what governs the result delivered to the public. */
export default function RecognitionScreen() {
  const [tab, setTab] = useState<Tab>('parametros');
  return (
    <View style={{ gap: 24, maxWidth: tab === 'teste' ? 1400 : 1000 }}>
      <PageHeader title="Reconhecimento facial"
                  subtitle="Modelo, parâmetros que decidem quais fotos o visitante recebe, reindexação e o teste de precisão." />
      <Tabs tabs={[{ key: 'parametros', label: 'Parâmetros' }, { key: 'reindexacao', label: 'Reindexação' }, { key: 'teste', label: 'Teste de precisão' }]}
            value={tab} onChange={setTab} />
      {tab === 'parametros' ? <ParametersTab onOpenReindex={() => setTab('reindexacao')} /> : tab === 'reindexacao' ? <ReindexTab />
        : <QualityTab />}
    </View>
  );
}

// ------------------------------------------------------------------ parameters (RF026)

function ParametersTab({ onOpenReindex }: { onOpenReindex: () => void }) {
  const [data, setData] = useState<Parameters | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [warnThreshold, setWarnThreshold] = useState(false);
  const [impact, setImpact] = useState<{ months: number; changed: number; held: number; days: number } | null>(null);

  const fill = useCallback((d: Parameters) => {
    setData(d);
    // Choices keep the raw number in the draft; the list shows the name.
    setDraft(Object.fromEntries(d.items.map((p) => [p.key, p.choices ? String(p.value) : show(p, p.value)])));
  }, []);
  useEffect(() => { getParameters().then(fill).catch((e) => setError(e.message)); }, [fill]);

  if (!data) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : null;

  const changed = data.items.filter((p) => parse(draft[p.key] ?? '') !== p.value);
  const invalid = data.items.filter((p) => {
    const v = parse(draft[p.key] ?? '');
    return Number.isNaN(v) || v < p.minimum || v > p.maximum || (p.integer && !Number.isInteger(v));
  });

  async function save(ack: boolean) {
    setSaving(true); setError(null); setDone(null);
    try {
      const r = await saveParameters(Object.fromEntries(changed.map((p) => [p.key, parse(draft[p.key])])), ack);
      fill(r);
      setDone(r.changed.length ? `${r.changed.length} parâmetro(s) alterado(s). A mudança já vale para as próximas buscas e ficou registrada.` : 'Nada mudou.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
      setWarnThreshold(false);
      setImpact(null);
    }
  }

  // The warnings come BEFORE saving: threshold (RF026 note 1) and retention (note 2).
  async function requestSave() {
    const keys = changed.map((p) => p.key);
    if (keys.includes('retention_months') && !impact) {
      const months = parse(draft.retention_months);
      const r = await retentionImpact(months).catch(() => null);
      if (r) return setImpact({ months, changed: r.events_changed, held: r.held_by_notice, days: r.notice_days });
    }
    if (keys.includes('similarity_threshold')) return setWarnThreshold(true);
    return save(false);
  }

  const groups = [...new Set(data.items.map((p) => p.group))];
  return (
    <View style={{ gap: 20 }}>
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <EngineCard data={data} onSwitched={(r, message) => { fill(r); setError(null); setDone(message); }} onOpenReindex={onOpenReindex} />
      {groups.map((g) => (
        <Card key={g} padding={24}>
          <SectionTitle title={g} />
          <View style={styles.grid}>
            {data.items.filter((p) => p.group === g).map((p) => {
              const bad = invalid.includes(p);
              return (
                <Field key={p.key} label={p.label} style={styles.field}
                       error={bad ? `Entre ${show(p, p.minimum)} e ${show(p, p.maximum)}${p.integer ? ', número inteiro' : ''}.` : undefined}
                       help={`${p.help} Padrão: ${show(p, p.default)}${p.unit ? ` ${p.unit}` : ''}.`}>
                  {p.choices ? (
                    <View style={{ width: 260 }}>
                      <Select placeholder={p.label} options={p.choices.map(([value, label]) => ({ value, label }))}
                              value={parse(draft[p.key] ?? '')} accessibilityLabel={p.label}
                              onChange={(v: number | null) => v !== null && setDraft((d) => ({ ...d, [p.key]: String(v) }))} />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 140 }}>
                        <Input value={draft[p.key]} onChangeText={(t) => setDraft((d) => ({ ...d, [p.key]: t }))} inputMode="decimal"
                               invalid={bad} accessibilityLabel={p.label} />
                      </View>
                      {!!p.unit && <Text style={styles.help}>{p.unit}</Text>}
                    </View>
                  )}
                </Field>
              );
            })}
          </View>
        </Card>
      ))}
      <View style={styles.actions}>
        <Button variant="secondary" label="Descartar alterações" disabled={!changed.length} onPress={() => fill(data)} />
        <Button label={changed.length ? `Salvar ${changed.length} alteração(ões)` : 'Salvar'} disabled={!changed.length || invalid.length > 0}
                loading={saving} onPress={requestSave} />
      </View>

      <Card padding={24}>
        <SectionTitle title="Histórico de alterações" />
        <Text style={styles.help}>Registro inalterável — nem o administrador consegue editar ou apagar (RF026 nota 4).</Text>
        {data.history.length === 0 ? <Text style={styles.help}>Nenhuma alteração até agora: todos os valores são os de fábrica.</Text>
          : data.history.map((h, i) => {
            const p = data.items.find((x) => x.key === h.key);
            // Engine swaps carry engine keys; show their names.
            const value = (v: number | string) => (typeof v === 'string' ? data.engines.find((e) => e.key === v)?.label ?? v
              : p ? show(p, v) : String(v));
            return (
              <View key={i} style={styles.historyRow}>
                <History size={16} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
                <Text style={[styles.text, { flex: 1 }]}>
                  <Text style={{ fontFamily: fonts.bold }}>{h.label}</Text>: {value(h.previous)} → {value(h.new)}
                </Text>
                <Text style={styles.help}>{h.by} · {when(h.at)}</Text>
              </View>
            );
          })}
      </Card>

      <Modal visible={warnThreshold} onClose={() => setWarnThreshold(false)} icon={TriangleAlert} tone="danger" title="Alterar o limiar de similaridade?">
        <View style={{ gap: 14 }}>
          <Text style={styles.text}>
            O limiar decide quando uma foto é entregue ao visitante. <Text style={{ fontFamily: fonts.bold }}>Baixar o limiar aumenta o
            risco de falso positivo</Text> — entregar a alguém a foto de OUTRA pessoa, o erro mais grave deste sistema. Subir o
            limiar faz pessoas deixarem de encontrar fotos em que aparecem.
          </Text>
          <Text style={styles.text}>
            A regra é privilegiar a precisão. Depois da mudança, as métricas de precisão e revocação precisam ser apuradas de
            novo (RNF18). O valor padrão ({data.model.calibrated_threshold !== null ? decimal(data.model.calibrated_threshold) : '—'}) é o
            calibrado para o modelo em uso ({data.model.label}).
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setWarnThreshold(false)} />
            <Button variant="danger" label="Entendi, salvar" loading={saving} onPress={() => save(true)} />
          </View>
        </View>
      </Modal>
      <Modal visible={!!impact} onClose={() => setImpact(null)} icon={TriangleAlert} title="Alterar o prazo de retenção?">
        {impact && (
          <View style={{ gap: 14 }}>
            <Text style={styles.text}>
              Com {impact.months} {impact.months === 1 ? 'mês' : 'meses'}, a data de expiração de {impact.changed} evento(s) muda agora, e o prazo
              exibido ao público também.
            </Text>
            {impact.held > 0 && (
              <Text style={styles.text}>
                {impact.held} evento(s) expirariam em menos de {impact.days} dias. Para que os fotógrafos recebam o aviso e possam
                baixar o acervo, eles expiram em {impact.days} dias a partir de hoje.
              </Text>
            )}
            <Text style={styles.text}>Na expiração, as fotos e os dados de reconhecimento facial são eliminados de forma irreversível.</Text>
            <View style={styles.actions}>
              <Button variant="secondary" label="Cancelar" onPress={() => setImpact(null)} />
              <Button label="Confirmar" loading={saving}
                      onPress={() => (changed.some((p) => p.key === 'similarity_threshold') ? setWarnThreshold(true) : save(false))} />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ------------------------------------------------------------------ engine (builder: backend/app/face/factory.py)

/**
 * The facial recognition model in use and the swap to another one. The catalogue comes from the
 * backend's builder; a model that does not load is refused by the server before anything changes.
 */
function EngineCard({ data, onSwitched, onOpenReindex }: {
  data: Parameters; onSwitched: (r: Parameters, message: string) => void; onOpenReindex: () => void;
}) {
  const model = data.model;
  const [choice, setChoice] = useState<string | null>(model.key);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // InsightFace is only the yardstick of the quality test (licence): never offered as the engine in use.
  const usable = data.engines.filter((e) => !e.reference_only);
  const target = usable.find((e) => e.key === choice);
  const only = usable.length < 2;

  async function swap() {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      const r = await switchEngine(target.key);
      onSwitched(r, `Modelo trocado para ${target.label}. ${r.job ? `${r.job.total} foto(s) na fila de reindexação — acompanhe na aba Reindexação.` : 'Não há fotos publicadas para reindexar.'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível trocar o modelo.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <Card padding={24} style={{ zIndex: 5 }}>
      <SectionTitle title="Modelo de reconhecimento" />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Cpu size={22} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.label}>{model.label}</Text>
          <Text style={styles.value}>
            {model.version ?? 'não carregado'}{model.vector_dim ? ` · vetor de ${model.vector_dim} dimensões` : ''}
          </Text>
          {!!model.license && <Text style={styles.help}>Licença: {model.license}</Text>}
          {model.calibrated_threshold !== null && (
            <Text style={styles.help}>Limiar calibrado: {decimal(model.calibrated_threshold)}. {model.calibration}</Text>
          )}
        </View>
      </View>
      {model.error && (
        <Notice tone="danger" icon={TriangleAlert} title="O modelo não carregou — a busca dos visitantes está pausada."
                description={`${model.error} O sistema nunca troca de modelo sozinho: escolha outro abaixo ou corrija a instalação.`} />
      )}
      {model.outdated_images > 0 && (
        <Notice tone="warning" icon={RefreshCw}
                title={`${model.outdated_images} foto(s) publicada(s) ainda estão com vetores de outro modelo e não aparecem na busca.`}
                description="Elas voltam a aparecer depois de reindexadas com o modelo em uso." actionLabel="Abrir reindexação" onAction={onOpenReindex} />
      )}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <View style={[styles.form, { alignItems: 'flex-end', zIndex: 3 }]}>
        <Field label="Trocar para" style={{ flex: 1, minWidth: 260 }}>
          <Select placeholder="Modelo" options={usable.map((e) => ({ value: e.key, label: `${e.label} · ${e.vector_dim} dimensões` }))}
                  value={choice} onChange={setChoice} accessibilityLabel="Modelo de reconhecimento" />
        </Field>
        <Button icon={Repeat} label="Trocar modelo" disabled={!target || target.key === model.key} onPress={() => setConfirm(true)} />
      </View>
      <Text style={styles.help}>
        {only ? 'Só há um modelo instalado no sistema. Para oferecer outro, um desenvolvedor acrescenta o adaptador e uma linha no catálogo do builder (backend/app/face/factory.py); ele aparece aqui.'
          : 'A troca reindexa todo o acervo publicado com o novo modelo. Antes de trocar, compare os modelos na aba Teste de precisão.'}
      </Text>

      <Modal visible={confirm} onClose={() => setConfirm(false)} icon={Repeat} tone="danger" title="Trocar o modelo de reconhecimento?">
        {target && (
          <View style={{ gap: 12 }}>
            <Text style={styles.text}>De <Text style={{ fontFamily: fonts.bold }}>{model.label}</Text> para <Text style={{ fontFamily: fonts.bold }}>{target.label}</Text>. O que acontece:</Text>
            <Text style={styles.text}>{'• O novo modelo é carregado e conferido antes; se não carregar, nada muda.\n'}
              {'• Todas as fotos publicadas entram na fila de reindexação. Até cada uma ser reindexada, ela NÃO aparece na busca — vetores de modelos diferentes não se comparam.\n'}
              {'• Os vetores faciais do modelo anterior são apagados assim que os novos existem.\n'}
              {`• O limiar de similaridade volta ao valor calibrado do novo modelo (${decimal(target.similarity_threshold)}).\n`}
              {'• A troca fica registrada com o seu nome.'}</Text>
            <View style={styles.actions}>
              <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(false)} />
              <Button variant="danger" label="Entendi, trocar modelo" loading={busy} onPress={swap} />
            </View>
          </View>
        )}
      </Modal>
    </Card>
  );
}

// ------------------------------------------------------------------ re-indexing (RF028)

const SCOPES: { value: ReindexScope; label: string }[] = [
  { value: 'event', label: 'Um evento' },
  { value: 'model_version', label: 'Uma versão de modelo' },
  { value: 'all', label: 'Todo o acervo publicado' },
];

function ReindexTab() {
  const [data, setData] = useState<ReindexOverview | null>(null);
  const [scope, setScope] = useState<ReindexScope>('event');
  const [eventId, setEventId] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => { getReindex().then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  // Updates by itself while something is running.
  const running = data?.jobs.some((j) => !j.finished_at);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [running, load]);

  if (!data) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : null;
  const ready = scope === 'all' || (scope === 'event' && eventId) || (scope === 'model_version' && version);

  async function start() {
    setBusy(true); setError(null); setDone(null);
    try {
      const job = await requestReindex({ scope, event_id: scope === 'event' ? eventId : null, from_version: scope === 'model_version' ? version : null });
      setDone(`${job.total} imagem(ns) na fila de reindexação.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Card padding={24} style={{ zIndex: 10 }}>
        <SectionTitle title="Nova reindexação" />
        <Text style={styles.text}>
          Gera de novo os vetores faciais das fotos publicadas com o modelo em uso ({data.model.label}) — por exemplo, depois de
          trocar a tecnologia de reconhecimento. Roda numa fila própria, que só avança quando não há publicação esperando. Os
          vetores antigos só são apagados depois que os novos existem: as fotos continuam encontráveis durante todo o processo.
        </Text>
        <View style={[styles.form, { zIndex: 3 }]}>
          <Field label="Escopo" style={{ width: 260 }}>
            <Select placeholder="Escopo" options={SCOPES} value={scope} onChange={(v: ReindexScope | null) => v && setScope(v)} accessibilityLabel="Escopo" />
          </Field>
          {scope === 'event' && (
            <Field label="Evento" style={{ flex: 1, minWidth: 260 }}>
              <Select placeholder="Selecione o evento" options={data.events.map((e) => ({ value: e.id, label: e.name }))} value={eventId}
                      onChange={setEventId} accessibilityLabel="Evento" />
            </Field>
          )}
          {scope === 'model_version' && (
            <Field label="Versão a substituir" style={{ flex: 1, minWidth: 260 }}>
              <Select placeholder="Selecione a versão" options={data.versions.map((v) => ({ value: v, label: v }))} value={version}
                      onChange={setVersion} accessibilityLabel="Versão a substituir" />
            </Field>
          )}
        </View>
        <Text style={styles.help}>Só fotos publicadas entram. Fotos em conferência ou descartadas continuam sem vetor (RNF13).</Text>
        <View style={styles.actions}>
          <Button icon={RefreshCw} label="Reindexar" disabled={!ready} onPress={() => setConfirm(true)} />
        </View>
      </Card>

      <Card padding={24}>
        <SectionTitle title="Reindexações" />
        {data.jobs.length === 0 ? <Text style={styles.help}>Nenhuma reindexação feita.</Text> : data.jobs.map((j) => (
          <View key={j.id} style={styles.job}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Text style={styles.label}>
                {j.scope === 'event' ? `Evento: ${j.event_name ?? 'removido'}` : j.scope === 'model_version' ? `Versão ${j.from_version}` : 'Todo o acervo'}
                {' → '}{j.to_version}
              </Text>
              <Text style={styles.help}>{j.requested_by} · {when(j.created_at)}</Text>
            </View>
            <ProgressBar percent={j.percent} />
            <Text style={styles.help}>
              {j.finished_at ? 'Concluída' : 'Em andamento'} · {j.done} de {j.total} reindexadas
              {j.failed ? ` · ${j.failed} com falha (mantêm os vetores anteriores)` : ''}{j.skipped ? ` · ${j.skipped} ignoradas (excluídas no meio)` : ''}
            </Text>
          </View>
        ))}
      </Card>

      <Modal visible={confirm} onClose={() => setConfirm(false)} icon={RefreshCw} title="Iniciar reindexação?">
        <View style={{ gap: 14 }}>
          <Text style={styles.text}>
            {scope === 'all' ? 'Todas as fotos publicadas do acervo' : scope === 'event' ? 'As fotos publicadas do evento escolhido' : `As fotos indexadas com a versão ${version}`}{' '}
            terão os vetores gerados de novo. A operação fica registrada com o seu nome.
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(false)} />
            <Button label="Iniciar" loading={busy} onPress={start} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bold, fontSize: 14, color: panel.text },
  value: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: panel.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  field: { flexBasis: 400, flexGrow: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderColor: panel.borderSoft, flexWrap: 'wrap' },
  form: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  job: { gap: 8, paddingVertical: 14, borderTopWidth: 1, borderColor: panel.borderSoft },
});
