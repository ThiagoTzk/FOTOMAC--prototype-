import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, IdCard, ShieldCheck, TriangleAlert, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { listThemes, type Theme } from '@/api/events';
import { consultPeople, personEvents, type Person, type PersonEvent } from '@/api/institutional';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/panel/PageHeader';
import { Select } from '@/components/panel/Select';
import { Button, Card, Field, Notice, Pill, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const PERIODS = [
  { value: 'month', label: 'Último mês' },
  { value: 'quarter', label: 'Últimos 3 meses' },
  { value: 'semester', label: 'Últimos 6 meses' },
  { value: 'year', label: 'Último ano' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

function periodStart(p: Period | null): string | null {
  if (!p) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - { month: 1, quarter: 3, semester: 6, year: 12 }[p]);
  return d.toISOString().slice(0, 10);
}

/**
 * Figma "16 — Pessoas institucionais" and "17 — Resultado da consulta institucional" (RF021).
 * Only people already registered and authorized can be chosen (note 2): there is no photo upload to
 * find someone. Every consultation is recorded on the server before anything is shown (note 8).
 */
export default function InstitutionalConsultation() {
  const { account } = useAuth();
  const params = useLocalSearchParams<{ pessoa?: string }>();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [personId, setPersonId] = useState<string | null>(params.pessoa ?? null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [themeId, setThemeId] = useState<number | null>(null);
  const [result, setResult] = useState<{ person: Person; events: PersonEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    consultPeople().then(setPeople).catch((e) => setError(e.message));
    listThemes().then(setThemes).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!personId) return;
    personEvents(personId, { date_from: periodStart(period), theme_id: themeId })
      .then((r) => { setResult(r); setError(null); }).catch((e) => setError(e.message));
  }, [personId, period, themeId]);

  const choose = (id: string | null) => {
    setPersonId(id);
    router.setParams({ pessoa: id ?? undefined });   // back from the photos lands on the same person
  };

  return (
    <View style={{ gap: 20 }}>
      <PageHeader title="Pessoas institucionais"
                  subtitle="Localize imagens de representantes institucionais previamente cadastrados e autorizados."
                  actions={account?.role === 'admin'
                    ? <Button variant="secondary" icon={Users} label="Cadastro de pessoas" onPress={() => router.navigate('/pessoas-institucionais/cadastro')} />
                    : undefined} />
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Card padding={24} style={{ gap: 18, zIndex: 10 }}>
        <SectionTitle title="Consulta institucional" />
        <View style={styles.filters}>
          <Field label="Buscar pessoa institucional" help="Selecione somente uma pessoa existente na base institucional."
                 style={{ flexGrow: 2, flexBasis: 320 }}>
            <Select placeholder={people && people.length === 0 ? 'Nenhuma pessoa autorizada ainda' : 'Buscar por nome ou função'}
                    options={(people ?? []).map((p) => ({ value: p.id, label: `${p.full_name} — ${p.position}` }))}
                    value={personId} onChange={choose} accessibilityLabel="Pessoa institucional" />
          </Field>
          <Field label="Data (opcional)" style={{ flexGrow: 1, flexBasis: 200 }}>
            <Select placeholder="Todo o período" options={[...PERIODS]} value={period} onChange={setPeriod} accessibilityLabel="Período" />
          </Field>
          <Field label="Tema (opcional)" style={{ flexGrow: 1, flexBasis: 200 }}>
            <Select placeholder="Todos os temas" options={themes.map((t) => ({ value: t.id, label: t.name }))} value={themeId}
                    onChange={setThemeId} accessibilityLabel="Tema" />
          </Field>
        </View>
      </Card>

      {!personId && (
        <Card padding={32} style={styles.empty}>
          <View style={styles.emptyIcon}><IdCard size={26} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth /></View>
          <Text style={styles.emptyTitle}>Selecione uma pessoa institucional</Text>
          <Text style={[styles.text, { textAlign: 'center' }]}>Os eventos em que a pessoa foi identificada aparecerão aqui. Não é possível cadastrar pessoas nesta área.</Text>
        </Card>
      )}
      {personId && result?.person.id !== personId && !error && <Card><ActivityIndicator color={panel.primary} /></Card>}
      {result && personId && result.person.id === personId && (
        <>
          <Card padding={20} style={styles.personCard}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.personName}>{result.person.full_name}</Text>
              <Text style={styles.text}>{result.person.position}{result.person.unit ? ` · ${result.person.unit}` : ''}</Text>
            </View>
            <Pill label="Pessoa autorizada" bg={panel.successSoft} fg={panel.success} />
          </Card>
          <Card padding={20} style={{ gap: 12 }}>
            <SectionTitle title="Eventos em que esta pessoa foi identificada" />
            {result.events.length === 0
              ? <Text style={styles.text}>Nenhum evento publicado com esta pessoa{period || themeId ? ' nos filtros escolhidos' : ' até agora'}.</Text>
              : <EventsList personId={personId} events={result.events} compact={width < 900} />}
          </Card>
        </>
      )}
      <Notice tone="info" icon={ShieldCheck} title="Consulta restrita"
              description="Buscas institucionais são restritas a finalidades autorizadas e ficam registradas para auditoria." />
    </View>
  );
}

function EventsList({ personId, events, compact }: { personId: string; events: PersonEvent[]; compact: boolean }) {
  const open = (eventId: string) => router.navigate(`/pessoas-institucionais/${personId}/${eventId}`);
  const count = (e: PersonEvent) => `${e.marked} de ${e.total} ${e.total === 1 ? 'imagem' : 'imagens'}`;
  if (compact) {
    return (
      <View style={{ gap: 10 }}>
        {events.map((e) => (
          <Pressable key={e.id} accessibilityRole="link" onPress={() => open(e.id)} style={styles.cardRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name}>{e.name}</Text>
              <Text style={styles.cell}>{e.date_label} · {e.location}</Text>
              <Text style={styles.cell}>{count(e)}</Text>
            </View>
            <ChevronRight size={18} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={styles.head}>
        <Text style={[styles.th, { flex: 1 }]}>EVENTO</Text>
        <Text style={[styles.th, { width: 140 }]}>DATA</Text>
        <Text style={[styles.th, { width: 200 }]}>LOCAL</Text>
        <Text style={[styles.th, { width: 150 }]}>OCORRÊNCIAS</Text>
        <Text style={[styles.th, { width: 110 }]}>AÇÃO</Text>
      </View>
      {events.map((e) => (
        <View key={e.id} style={styles.row}>
          <Text style={[styles.name, { flex: 1, paddingRight: 12 }]} numberOfLines={2}>{e.name}</Text>
          <Text style={[styles.cell, { width: 140 }]}>{e.date_label}</Text>
          <Text style={[styles.cell, { width: 200 }]} numberOfLines={1}>{e.location}</Text>
          <Text style={[styles.cell, { width: 150 }]}>{count(e)}</Text>
          <View style={{ width: 110 }}>
            <Pressable accessibilityRole="link" accessibilityLabel={`Ver imagens de ${e.name}`} onPress={() => open(e.id)}>
              <Text style={styles.link}>Ver imagens</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  empty: { alignItems: 'center', gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 999, backgroundColor: panel.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.semiBold, fontSize: 16, color: panel.text },
  personCard: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  personName: { fontFamily: fonts.semiBold, fontSize: 18, color: panel.text },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.muted },
  table: { borderWidth: 1, borderColor: panel.border, borderRadius: panel.radius, overflow: 'hidden' },
  head: { height: 42, backgroundColor: panel.page, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  th: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
         borderTopWidth: 1, borderColor: panel.borderSoft },
  name: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  cell: { fontFamily: fonts.regular, fontSize: 13, color: panel.muted },
  link: { fontFamily: fonts.semiBold, fontSize: 13, color: panel.primary },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: panel.border,
             borderRadius: panel.radius, backgroundColor: '#FFFFFF' },
});
