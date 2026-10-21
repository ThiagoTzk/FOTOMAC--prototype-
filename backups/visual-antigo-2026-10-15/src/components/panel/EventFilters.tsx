import { Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listThemes, type EventFilters as Filters, type Theme } from '@/api/events';
import { Select } from '@/components/panel/Select';
import { Input, type EventStatus } from '@/components/panel/ui';

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: 'editing', label: 'Em edição' },
  { value: 'processing', label: 'Em processamento' },
  { value: 'published', label: 'Publicado' },
  { value: 'expired', label: 'Expirado' },
];

const PERIODS = [
  { value: 'month', label: 'Último mês' },
  { value: 'quarter', label: 'Últimos 3 meses' },
  { value: 'semester', label: 'Últimos 6 meses' },
  { value: 'year', label: 'Último ano' },
] as const;

type Period = (typeof PERIODS)[number]['value'];

function periodStart(p: Period): string {
  const months = { month: 1, quarter: 3, semester: 6, year: 12 }[p];
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** "Filtros": search + Tema + Status + Período (+ scope, adaptation for RF025). */
export function EventFilters({ value, onChange, showScope = true }: { value: Filters; onChange: (f: Filters) => void; showScope?: boolean }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [q, setQ] = useState(value.q ?? '');

  useEffect(() => { listThemes().then(setThemes).catch(() => undefined); }, []);
  // Search as you type, but only after a short pause (avoids one request per key).
  useEffect(() => {
    const t = setTimeout(() => { if ((value.q ?? '') !== q) onChange({ ...value, q, page: 1 }); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.row}>
      <View style={{ flexGrow: 1, flexBasis: 280 }}>
        <Input icon={Search} placeholder="Buscar evento" value={q} onChangeText={setQ} accessibilityLabel="Buscar evento" />
      </View>
      {showScope && (
        <View style={styles.select}>
          <Select placeholder="Todos os eventos" accessibilityLabel="Responsabilidade"
                  options={[{ value: 'mine', label: 'Meus eventos' }, { value: 'collaborations', label: 'Colaborações' }]}
                  value={value.scope && value.scope !== 'all' ? value.scope : null}
                  onChange={(v) => onChange({ ...value, scope: v ?? 'all', page: 1 })} />
        </View>
      )}
      <View style={styles.select}>
        <Select placeholder="Tema" options={themes.map((t) => ({ value: t.id, label: t.name }))}
                value={value.theme_id ?? null} onChange={(v) => onChange({ ...value, theme_id: v, page: 1 })} />
      </View>
      <View style={styles.select}>
        <Select placeholder="Status" options={STATUS_OPTIONS} value={value.status ?? null}
                onChange={(v) => onChange({ ...value, status: v, page: 1 })} />
      </View>
      <View style={styles.select}>
        <Select placeholder="Período" options={[...PERIODS]} value={period}
                onChange={(v: Period | null) => { setPeriod(v); onChange({ ...value, period_start: v ? periodStart(v) : null, page: 1 }); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', zIndex: 20 },
  select: { width: 190, flexGrow: 0 },
});
