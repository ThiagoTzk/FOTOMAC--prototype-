import { router } from 'expo-router';
import { ChevronRight, Lock, Search, TriangleAlert, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { listAccounts, type AccountRow, type AccountStatus, type Role } from '@/api/accounts';
import { AccountStatusPill } from '@/components/admin/AccountPills';
import { PageHeader } from '@/components/panel/PageHeader';
import { Select } from '@/components/panel/Select';
import { Button, Card, Input, Notice } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const STATUS_OPTIONS: { value: AccountStatus; label: string }[] = [
  { value: 'pending', label: 'Acesso Pendente' },
  { value: 'active', label: 'Ativa' },
  { value: 'inactive', label: 'Inativa' },
  { value: 'suspended', label: 'Suspensa' },
  { value: 'expired', label: 'Expirada' },
];
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'photographer', label: 'Fotógrafo' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'contractor', label: 'Fotógrafo contratado' },
];

/**
 * "Relação de Contas" (RF001 note 7): every account and its situation, pending ones first and
 * highlighted, with the way to re-send the password link. There is no self-registration: new
 * accounts are created only here (note 8).
 */
export default function AccountsScreen() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof listAccounts>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const load = useCallback(() => {
    listAccounts({ q, role, status }).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, [q, role, status]);

  useEffect(() => {
    const t = setTimeout(load, 250); // search as you type, after a short pause
    return () => clearTimeout(t);
  }, [load]);

  const expired = data?.items.filter((a) => a.activation_link === 'expired').length ?? 0;
  return (
    <View style={{ gap: 24 }}>
      <PageHeader title="Contas" subtitle="Contas de operação do FOTOMAC. Não existe autocadastro: toda conta nasce aqui."
                  actions={<Button icon={UserPlus} label="Nova conta" onPress={() => router.navigate('/contas/nova')} />} />
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {data && (
        <View style={styles.summary}>
          {STATUS_OPTIONS.map((s) => (
            <Pressable key={s.value} accessibilityRole="button" accessibilityState={{ selected: status === s.value }}
                       onPress={() => setStatus(status === s.value ? null : s.value)}
                       style={[styles.counter, status === s.value && { borderColor: panel.primary }]}>
              <Text style={styles.counterValue}>{data.counts[s.value]}</Text>
              <Text style={styles.counterLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {expired > 0 && (
        <Notice tone="warning" icon={TriangleAlert} title={`${expired} ${expired === 1 ? 'conta aguarda' : 'contas aguardam'} a definição de senha com o link vencido`}
                description="Abra a conta e use “Reenviar link”. O link vale 24 horas e é de uso único." />
      )}
      <View style={styles.filters}>
        <View style={{ flexGrow: 1, flexBasis: 260 }}>
          <Input icon={Search} placeholder="Buscar por nome ou e-mail" value={q} onChangeText={setQ} accessibilityLabel="Buscar conta" />
        </View>
        <View style={styles.select}><Select placeholder="Perfil" options={ROLE_OPTIONS} value={role} onChange={setRole} /></View>
        <View style={styles.select}><Select placeholder="Situação" options={STATUS_OPTIONS} value={status} onChange={setStatus} /></View>
      </View>
      {data && (data.items.length === 0
        ? <Card><Text style={styles.cell}>Nenhuma conta encontrada.</Text></Card>
        : <AccountsTable items={data.items} compact={width < 900} />)}
    </View>
  );
}

function Hints({ a }: { a: AccountRow }) {
  return (
    <>
      {a.activation_link === 'expired' && <Text style={styles.warn}>Link de definição de senha vencido</Text>}
      {a.activation_link === 'valid' && <Text style={styles.hint}>Aguardando o titular definir a senha</Text>}
      {a.locked && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Lock size={12} color={panel.danger} strokeWidth={1.8} absoluteStrokeWidth />
          <Text style={[styles.warn, { color: panel.danger }]}>Bloqueada por tentativas</Text>
        </View>
      )}
    </>
  );
}

function AccountsTable({ items, compact }: { items: AccountRow[]; compact: boolean }) {
  const open = (id: string) => router.navigate(`/contas/${id}`);
  if (compact) {
    return (
      <View style={{ gap: 10 }}>
        {items.map((a) => (
          <Pressable key={a.id} accessibilityRole="link" accessibilityLabel={`Abrir conta de ${a.full_name}`} onPress={() => open(a.id)}
                     style={[styles.cardRow, a.status === 'pending' && styles.pendingRow]}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={styles.name}>{a.full_name}</Text>
              <Text style={styles.cell}>{a.email} · {a.role_label}</Text>
              <AccountStatusPill status={a.status} label={a.status_label} />
              <Hints a={a} />
            </View>
            <ChevronRight size={18} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.table} accessibilityRole="list">
      <View style={styles.head}>
        <Text style={[styles.th, { flex: 1 }]}>NOME</Text>
        <Text style={[styles.th, { width: 150 }]}>PERFIL</Text>
        <Text style={[styles.th, { width: 250 }]}>SITUAÇÃO</Text>
        <Text style={[styles.th, { width: 120 }]}>CRIADA EM</Text>
        <View style={{ width: 24 }} />
      </View>
      {items.map((a) => (
        <Pressable key={a.id} accessibilityRole="link" accessibilityLabel={`Abrir conta de ${a.full_name}`} onPress={() => open(a.id)}
                   style={({ hovered }: any) => [styles.row, a.status === 'pending' && styles.pendingRow, hovered && { backgroundColor: panel.page }]}>
          <View style={{ flex: 1, gap: 3, paddingRight: 12 }}>
            <Text style={styles.name} numberOfLines={1}>{a.full_name}</Text>
            <Text style={styles.cell} numberOfLines={1}>{a.email}</Text>
          </View>
          <Text style={[styles.cell, { width: 150 }]}>{a.role_label}</Text>
          <View style={{ width: 250, gap: 4 }}>
            <AccountStatusPill status={a.status} label={a.status_label} />
            <Hints a={a} />
          </View>
          <Text style={[styles.cell, { width: 120 }]}>{a.created_at.slice(0, 10).split('-').reverse().join('/')}</Text>
          <ChevronRight size={18} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
        </Pressable>
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
  filters: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', zIndex: 20 },
  select: { width: 190 },
  table: { borderWidth: 1, borderColor: panel.border, borderRadius: panel.cardRadius, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  head: { height: 42, backgroundColor: panel.page, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  th: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
         borderTopWidth: 1, borderColor: panel.borderSoft },
  pendingRow: { backgroundColor: '#FFFBEF' },
  name: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  cell: { fontFamily: fonts.regular, fontSize: 13, color: panel.muted },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  warn: { fontFamily: fonts.semiBold, fontSize: 12, color: panel.warning },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: panel.border,
             borderRadius: panel.radius, backgroundColor: '#FFFFFF' },
});
