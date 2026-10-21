import type { LucideIcon } from 'lucide-react-native';
import { AlarmClockCheck, CalendarDays, Check, ChevronDown, FlagOff, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { listPublicThemes, type PublicFilters, type Theme } from '@/api/public';
import { ThemeIcon } from '@/components/icons/themeIcons';
import { MONTH_NAMES } from '@/components/panel/dates';
import { Select } from '@/components/panel/Select';
import { poppins, visitor } from '@/theme/tokens';

import { Backdrop, VButton } from './ui';

type Props = {
  value: PublicFilters;
  onChange: (f: PublicFilters) => void;
  /** "hero": big white search bar + light chips, over the blue band of the web home. */
  variant?: 'default' | 'hero';
  /** Pressing "Buscar" / Enter in the hero (the page scrolls to the events). */
  onSubmit?: () => void;
};
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
export function VisitorFilters({ value, onChange, variant = 'default', onSubmit }: Props) {
  const hero = variant === 'hero';
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

  // "Buscar" applies at once (no need to wait for the typing pause) and lets the page react.
  const submit = () => { if ((value.q ?? '') !== q) onChange({ ...value, q, page: 1 }); onSubmit?.(); };

  return (
    <View style={{ gap: hero ? 16 : 16, zIndex: 20 }}>
      <View style={[styles.search, q && styles.searchActive, hero && styles.heroSearch]}>
        <Search size={hero ? 24 : 22} color={visitor.placeholder} strokeWidth={1.6} absoluteStrokeWidth />
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={submit} returnKeyType="search"
                   placeholder={hero ? 'Digite o nome do evento — ex.: colação, semana de tecnologia…' : 'Buscar evento'}
                   placeholderTextColor={visitor.placeholder}
                   accessibilityLabel="Buscar evento pelo nome" style={[styles.searchInput, hero && { fontSize: 17 }]} />
        {hero && (
          <Pressable accessibilityRole="button" onPress={submit}
                     style={({ hovered }: any) => [styles.heroButton, hovered && { opacity: 0.9 }]}>
            <Search size={18} color="#072D44" strokeWidth={2} absoluteStrokeWidth />
            <Text style={styles.heroButtonText}>Buscar</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.chips, hero && { gap: 10 }]}>
        <Chip icon={FlagOff} label={themeCount ? `Tema (${themeCount})` : 'Tema'} active={!!themeCount} open={open === 'theme'}
              onPress={() => toggle('theme')} onClose={() => setOpen(null)} hero={hero}>
          {themes.length === 0 && <Text style={styles.empty}>Nenhum tema cadastrado.</Text>}
          {themes.map((t) => {
            const on = value.theme_ids?.includes(t.id) ?? false;
            return (
              <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                         onPress={() => onChange({ ...value, page: 1, theme_ids: on ? value.theme_ids!.filter((x) => x !== t.id) : [...(value.theme_ids ?? []), t.id] })}
                         style={({ hovered }: any) => [styles.option, hovered && { backgroundColor: visitor.page }]}>
                <View style={[styles.box, on && styles.boxOn]}>{on && <Check size={12} color="#FFFFFF" strokeWidth={3} />}</View>
                <ThemeIcon name={t.icon} size={16} color={visitor.primary} strokeWidth={1.7} absoluteStrokeWidth />
                <Text style={styles.optionText}>{t.name}</Text>
              </Pressable>
            );
          })}
        </Chip>
        <Chip icon={CalendarDays} label={value.day ? value.day.split('-').reverse().join('/') : 'Data'} active={!!value.day}
              open={open === 'day'} onPress={() => toggle('day')} onClose={() => setOpen(null)} hero={hero}>
          <DayPicker initial={value.day ?? null}
                     onApply={(day) => { onChange({ ...value, day, page: 1 }); setOpen(null); }} />
        </Chip>
        <Chip icon={AlarmClockCheck} label={periodLabel ?? 'Período'} active={!!periodLabel} open={open === 'period'}
              onPress={() => toggle('period')} onClose={() => setOpen(null)} wide hero={hero}>
          <PeriodPicker value={value} onApply={(start, end) => { onChange({ ...value, period_start: start, period_end: end, page: 1 }); setOpen(null); }} />
        </Chip>
      </View>
    </View>
  );
}

type ChipProps = {
  icon: LucideIcon; label: string; active: boolean; open: boolean; onPress: () => void; onClose: () => void; wide?: boolean;
  hero?: boolean; children: React.ReactNode;
};

function Chip({ icon: Icon, label, active, open, onPress, onClose, wide, hero, children }: ChipProps) {
  const fg = hero ? '#FFFFFF' : visitor.primary;
  return (
    <View style={{ zIndex: open ? 40 : 1 }}>
      {open && <Backdrop onPress={onClose} />}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress}
                 style={[styles.chip, active && { backgroundColor: 'rgba(0, 125, 197, 0.10)' }, hero && styles.heroChip,
                         hero && active && { backgroundColor: 'rgba(255, 255, 255, 0.22)' }]}>
        <Icon size={16} color={fg} strokeWidth={1.6} absoluteStrokeWidth />
        <Text style={[styles.chipText, hero && styles.heroChipText]}>{label}</Text>
        <ChevronDown size={20} color={fg} strokeWidth={1.8} absoluteStrokeWidth />
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
  heroSearch: { height: 68, maxWidth: 760, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 0, paddingLeft: 22, paddingRight: 8,
                gap: 12, boxShadow: '0px 18px 40px rgba(0, 0, 0, 0.25)' },
  heroButton: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 26, borderRadius: 13,
                backgroundColor: '#FFC506' },
  heroButtonText: { fontFamily: poppins.semiBold, fontSize: 16, color: '#072D44' },
  heroChip: { height: 40, paddingHorizontal: 14, gap: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)',
              backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  heroChipText: { fontFamily: poppins.medium, fontSize: 14, color: '#FFFFFF' },
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
