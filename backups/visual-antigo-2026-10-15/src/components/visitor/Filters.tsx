import type { LucideIcon } from 'lucide-react-native';
import { AlarmClockCheck, CalendarDays, Check, ChevronDown, FlagOff, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { listPublicThemes, type PublicFilters, type Theme } from '@/api/public';
import { MONTH_NAMES } from '@/components/panel/dates';
import { Select } from '@/components/panel/Select';
import { poppins, visitor } from '@/theme/tokens';

import { Backdrop, VButton } from './ui';

type Props = { value: PublicFilters; onChange: (f: PublicFilters) => void };
type Open = 'theme' | 'day' | 'period' | null;

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y - 3, y - 2, y - 1, y, y + 1].map((v) => ({ value: v, label: String(v) }));
})();
const MONTHS = MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m }));

/** "dd/mm/aaaa" → ISO date, or null when incomplete/invalid. */
function brToIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/**
 * Search field + "Tema", "Data" and "Período" chips of the Figma home (RF013): accent- and
 * typo-tolerant name search (done by the server), several themes at once (note 4), an exact
 * day or a range of months — all by the EVENT date (note 5) and combinable.
 */
export function VisitorFilters({ value, onChange }: Props) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [q, setQ] = useState(value.q ?? '');
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => { listPublicThemes().then(setThemes).catch(() => undefined); }, []);
  // Searches while typing, after a short pause (one request per word, not per key).
  useEffect(() => {
    const t = setTimeout(() => { if ((value.q ?? '') !== q) onChange({ ...value, q, page: 1 }); }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: Open) => setOpen((o) => (o === k ? null : k));
  const themeCount = value.theme_ids?.length ?? 0;
  const periodLabel = value.period_start && value.period_end
    ? `${MONTH_NAMES[Number(value.period_start.slice(5, 7)) - 1].slice(0, 3)}–${MONTH_NAMES[Number(value.period_end.slice(5, 7)) - 1].slice(0, 3)} ${value.period_end.slice(0, 4)}`
    : null;

  return (
    <View style={{ gap: 16, zIndex: 20 }}>
      <View style={[styles.search, q && styles.searchActive]}>
        <Search size={22} color={visitor.placeholder} strokeWidth={1.6} absoluteStrokeWidth />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar evento" placeholderTextColor={visitor.placeholder}
                   accessibilityLabel="Buscar evento pelo nome" style={styles.searchInput} />
      </View>
      <View style={styles.chips}>
        <Chip icon={FlagOff} label={themeCount ? `Tema (${themeCount})` : 'Tema'} active={!!themeCount} open={open === 'theme'}
              onPress={() => toggle('theme')} onClose={() => setOpen(null)}>
          {themes.length === 0 && <Text style={styles.empty}>Nenhum tema cadastrado.</Text>}
          {themes.map((t) => {
            const on = value.theme_ids?.includes(t.id) ?? false;
            return (
              <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                         onPress={() => onChange({ ...value, page: 1, theme_ids: on ? value.theme_ids!.filter((x) => x !== t.id) : [...(value.theme_ids ?? []), t.id] })}
                         style={({ hovered }: any) => [styles.option, hovered && { backgroundColor: visitor.page }]}>
                <View style={[styles.box, on && styles.boxOn]}>{on && <Check size={12} color="#FFFFFF" strokeWidth={3} />}</View>
                <Text style={styles.optionText}>{t.name}</Text>
              </Pressable>
            );
          })}
        </Chip>
        <Chip icon={CalendarDays} label={value.day ? value.day.split('-').reverse().join('/') : 'Data'} active={!!value.day}
              open={open === 'day'} onPress={() => toggle('day')} onClose={() => setOpen(null)}>
          <DayPicker initial={value.day ?? null}
                     onApply={(day) => { onChange({ ...value, day, page: 1 }); setOpen(null); }} />
        </Chip>
        <Chip icon={AlarmClockCheck} label={periodLabel ?? 'Período'} active={!!periodLabel} open={open === 'period'}
              onPress={() => toggle('period')} onClose={() => setOpen(null)} wide>
          <PeriodPicker value={value} onApply={(start, end) => { onChange({ ...value, period_start: start, period_end: end, page: 1 }); setOpen(null); }} />
        </Chip>
      </View>
    </View>
  );
}

type ChipProps = { icon: LucideIcon; label: string; active: boolean; open: boolean; onPress: () => void; onClose: () => void; wide?: boolean; children: React.ReactNode };

function Chip({ icon: Icon, label, active, open, onPress, onClose, wide, children }: ChipProps) {
  return (
    <View style={{ zIndex: open ? 40 : 1 }}>
      {open && <Backdrop onPress={onClose} />}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress}
                 style={[styles.chip, active && { backgroundColor: 'rgba(0, 125, 197, 0.10)' }]}>
        <Icon size={16} color={visitor.primary} strokeWidth={1.6} absoluteStrokeWidth />
        <Text style={styles.chipText}>{label}</Text>
        <ChevronDown size={20} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth />
      </Pressable>
      {open && <View style={[styles.popover, wide && { width: 300 }]}>{children}</View>}
    </View>
  );
}

function DayPicker({ initial, onApply }: { initial: string | null; onApply: (iso: string | null) => void }) {
  const [text, setText] = useState(initial ? initial.split('-').reverse().join('/') : '');
  const iso = brToIso(text);
  // Typing only digits is enough: the slashes are added as the person types.
  const mask = (t: string) => {
    const d = t.replace(/\D/g, '').slice(0, 8);
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.popTitle}>Dia do evento</Text>
      <TextInput value={text} onChangeText={(t) => setText(mask(t))} placeholder="dd/mm/aaaa" inputMode="numeric"
                 placeholderTextColor={visitor.placeholder} accessibilityLabel="Dia do evento (dd/mm/aaaa)" style={styles.field} />
      {text.length === 10 && !iso && <Text style={styles.error}>Data inválida.</Text>}
      <View style={styles.popActions}>
        <VButton label="Limpar" variant="ghost" onPress={() => onApply(null)} />
        <VButton label="Aplicar" onPress={() => onApply(iso)} disabled={!iso} />
      </View>
    </View>
  );
}

function PeriodPicker({ value, onApply }: { value: PublicFilters; onApply: (start: string | null, end: string | null) => void }) {
  const y = new Date().getFullYear();
  const [fromM, setFromM] = useState<number | null>(value.period_start ? Number(value.period_start.slice(5, 7)) : null);
  const [fromY, setFromY] = useState<number | null>(value.period_start ? Number(value.period_start.slice(0, 4)) : y);
  const [toM, setToM] = useState<number | null>(value.period_end ? Number(value.period_end.slice(5, 7)) : null);
  const [toY, setToY] = useState<number | null>(value.period_end ? Number(value.period_end.slice(0, 4)) : y);
  const ready = fromM && fromY && toM && toY;
  const inverted = ready && fromY! * 12 + fromM! > toY! * 12 + toM!;
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.popTitle}>De</Text>
      <View style={[styles.pair, { zIndex: 3 }]}>
        <View style={{ flex: 3 }}><Select placeholder="Mês" options={MONTHS} value={fromM} onChange={setFromM} /></View>
        <View style={{ flex: 2 }}><Select placeholder="Ano" options={YEARS} value={fromY} onChange={setFromY} /></View>
      </View>
      <Text style={styles.popTitle}>Até</Text>
      <View style={[styles.pair, { zIndex: 2 }]}>
        <View style={{ flex: 3 }}><Select placeholder="Mês" options={MONTHS} value={toM} onChange={setToM} /></View>
        <View style={{ flex: 2 }}><Select placeholder="Ano" options={YEARS} value={toY} onChange={setToY} /></View>
      </View>
      {inverted && <Text style={styles.error}>O mês final deve ser igual ou posterior ao inicial.</Text>}
      <View style={styles.popActions}>
        <VButton label="Limpar" variant="ghost" onPress={() => onApply(null, null)} />
        <VButton label="Aplicar" disabled={!ready || !!inverted}
                 onPress={() => onApply(`${fromY}-${pad(fromM!)}-01`, `${toY}-${pad(toM!)}-${pad(lastDay(toY!, toM!))}`)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12,
            backgroundColor: visitor.inputBg, borderWidth: 1, borderColor: 'rgba(0, 125, 197, 0.04)' },
  searchActive: { borderWidth: 2, borderColor: 'rgba(0, 105, 173, 0.60)' },
  searchInput: { flex: 1, height: '100%', fontFamily: poppins.regular, fontSize: 15, color: visitor.title, outlineStyle: 'none' } as object,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  chip: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 12,
          borderWidth: 0.86, borderColor: visitor.primary },
  chipText: { fontFamily: poppins.regular, fontSize: 12, color: visitor.primary, marginRight: 4 },
  popover: { position: 'absolute', top: 44, left: 0, width: 240, backgroundColor: visitor.surface, borderRadius: 12,
             padding: 12, gap: 4, boxShadow: visitor.menuShadow },
  popTitle: { fontFamily: poppins.semiBold, fontSize: 12, color: visitor.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8 },
  optionText: { fontFamily: poppins.regular, fontSize: 13, color: visitor.text },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: visitor.placeholder, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: visitor.primary, borderColor: visitor.primary },
  empty: { fontFamily: poppins.regular, fontSize: 12, color: visitor.muted, padding: 8 },
  field: { height: 42, borderWidth: 1, borderColor: 'rgba(120, 120, 128, 0.20)', borderRadius: 8, paddingHorizontal: 12,
           fontFamily: poppins.regular, fontSize: 14, color: visitor.title },
  error: { fontFamily: poppins.regular, fontSize: 12, color: visitor.danger },
  pair: { flexDirection: 'row', gap: 8 },
  popActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
});
