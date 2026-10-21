import { router } from 'expo-router';
import { ChevronRight, Search, TriangleAlert, UserPlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { formatDate } from '@/api/images';
import { listPeople, type InstitutionalStatus, type PersonRow } from '@/api/institutional';
import { STATUS_PILL } from '@/components/admin/institutional';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Input, Notice, Pill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/**
 * Registration of institutional people (RF020), the ADMINISTRATOR's only: whoever is registered
 * receives the term by e-mail and signs it on the screen. The API refuses any other profile.
 */
export default function InstitutionalRegistry() {
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  useEffect(() => { listPeople().then(setPeople).catch((e) => setError(e.message)); }, []);

  const shown = (people ?? []).filter((p) =>
    `${p.full_name} ${p.position} ${p.unit ?? ''} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const count = (s: InstitutionalStatus) => (people ?? []).filter((p) => p.status === s).length;
  const open = (id: string) => router.navigate(`/pessoas-institucionais/cadastro/${id}`);
  return (
    <View style={{ gap: 20 }}>
      <PageHeader crumbs={[{ label: 'Pessoas institucionais', href: '/pessoas-institucionais' }, { label: 'Cadastro' }]}
                  title="Cadastro de pessoas institucionais"
                  subtitle="Só pessoas em função de representação institucional (coordenação, direção, reitoria). Nunca alunos ou participantes de eventos."
                  actions={<Button icon={UserPlus} label="Cadastrar pessoa" onPress={() => router.navigate('/pessoas-institucionais/cadastro/nova')} />} />
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {people && (
        <View style={styles.summary}>
          {([['awaiting', 'Aguardando autorização'], ['active', 'Autorizadas'], ['revoked', 'Revogadas']] as const).map(([s, label]) => (
            <View key={s} style={styles.counter}>
              <Text style={styles.counterValue}>{count(s)}</Text>
              <Text style={styles.counterLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}
      <Input icon={Search} placeholder="Buscar por nome, cargo ou e-mail" value={q} onChangeText={setQ} accessibilityLabel="Buscar pessoa" />
      {people && (shown.length === 0
        ? <Card><Text style={styles.cell}>{people.length ? 'Ninguém encontrado.' : 'Nenhuma pessoa cadastrada ainda.'}</Text></Card>
        : (
          <View style={styles.table}>
            {width >= 900 && (
              <View style={styles.head}>
                <Text style={[styles.th, { flex: 1 }]}>PESSOA</Text>
                <Text style={[styles.th, { width: 200 }]}>SITUAÇÃO</Text>
                <Text style={[styles.th, { width: 180 }]}>FOTOS LOCALIZADAS</Text>
                <Text style={[styles.th, { width: 110 }]}>CADASTRO</Text>
                <View style={{ width: 24 }} />
              </View>
            )}
            {shown.map((p) => (
              <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`Abrir cadastro de ${p.full_name}`} onPress={() => open(p.id)}
                         style={({ hovered }: any) => [styles.row, hovered && { backgroundColor: panel.page }]}>
                <View style={{ flex: 1, gap: 3, paddingRight: 12, minWidth: 200 }}>
                  <Text style={styles.name} numberOfLines={1}>{p.full_name}</Text>
                  <Text style={styles.cell} numberOfLines={1}>{p.position}{p.unit ? ` · ${p.unit}` : ''}</Text>
                </View>
                <View style={{ width: 200, gap: 4 }}>
                  <Pill label={p.status_label} bg={STATUS_PILL[p.status].bg} fg={STATUS_PILL[p.status].fg} />
                  {p.status === 'awaiting' && p.link_expires_at && new Date(p.link_expires_at) < new Date() && (
                    <Text style={styles.warn}>Link vencido: reenvie</Text>)}
                </View>
                <Text style={[styles.cell, { width: 180 }]}>
                  {p.status === 'active' ? `${p.marks.confirmed + p.marks.pending} (${p.marks.pending} a confirmar)` : '—'}
                </Text>
                <Text style={[styles.cell, { width: 110 }]}>{formatDate(p.created_at)}</Text>
                <ChevronRight size={18} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
              </Pressable>
            ))}
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  counter: { minWidth: 150, flexGrow: 1, flexBasis: 150, padding: 16, borderRadius: panel.cardRadius, borderWidth: 1,
             borderColor: panel.border, backgroundColor: '#FFFFFF', gap: 4, boxShadow: panel.cardShadow },
  counterValue: { fontFamily: fonts.semiBold, fontSize: 24, color: panel.text },
  counterLabel: { fontFamily: fonts.regular, fontSize: 13, color: panel.muted },
  table: { borderWidth: 1, borderColor: panel.border, borderRadius: panel.cardRadius, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  head: { height: 42, backgroundColor: panel.page, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  th: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  row: { minHeight: 64, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
         gap: 8, borderTopWidth: 1, borderColor: panel.borderSoft },
  name: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  cell: { fontFamily: fonts.regular, fontSize: 13, color: panel.muted },
  warn: { fontFamily: fonts.semiBold, fontSize: 12, color: panel.warning },
});
