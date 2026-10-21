import { router, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { CircleAlert, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp,
  type ViewStyle,
} from 'react-native';

import { poppins, visitor } from '@/theme/tokens';

/**
 * Centred content column: the Figma screens are 402 px wide with 32 px side margins. On a
 * computer it widens (visitor.columnWide); `narrow` keeps reading pages at a comfortable line length.
 */
export function Column({ children, style, narrow }: { children: ReactNode; style?: StyleProp<ViewStyle>; narrow?: boolean }) {
  const { width } = useWindowDimensions();
  const maxWidth = !narrow && width >= visitor.wideFrom ? visitor.columnWide : visitor.column;
  return <View style={[styles.column, { maxWidth }, style]}>{children}</View>;
}

/** True on a computer-sized window (the visitor area switches from phone layout to web layout). */
export function useWide() {
  return useWindowDimensions().width >= visitor.wideFrom;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outlineDanger' | 'ghost';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** "Button/Default" of the visitor screens: 44 px, radius 12. */
export function VButton({ label, onPress, variant = 'primary', icon: Icon, loading, disabled, accessibilityLabel }: ButtonProps) {
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'outlineDanger' ? visitor.danger : visitor.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
               accessibilityState={{ disabled: !!disabled || !!loading }} disabled={disabled || loading} onPress={onPress}
               style={({ hovered }: any) => [styles.button, styles[variant], hovered && { opacity: 0.88 },
                                             (disabled || loading) && { opacity: 0.5 }]}>
      {loading ? <ActivityIndicator size="small" color={fg} />
        : Icon && <Icon size={20} color={fg} strokeWidth={1.8} absoluteStrokeWidth />}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Invisible layer under an open menu/popover: a click anywhere outside closes it (otherwise
 * an open menu would sit over the page and swallow the next click).
 */
export function Backdrop({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityLabel="Fechar menu" onPress={onPress} style={styles.backdrop} />;
}

/** Text link in the primary colour (navigates inside the app). */
export function VLink({ label, href, style }: { label: string; href: Href; style?: object }) {
  return (
    <Text accessibilityRole="link" onPress={() => router.push(href)} style={[styles.link, style]}>{label}</Text>
  );
}

/** Themes of an event: pills alternating the two accents (Figma "Frame 12" / "Frame 13"). */
export function ThemePills({ names, size = 'sm' }: { names: string[]; size?: 'sm' | 'md' }) {
  if (!names.length) return null;
  return (
    <View style={styles.pills}>
      {names.map((n, i) => {
        const c = visitor.pills[i % visitor.pills.length];
        return (
          <View key={n} style={[styles.pill, { backgroundColor: c.bg }]}>
            <Text style={[styles.pillText, { color: c.fg, fontSize: size === 'md' ? 12 : 10 }]}>{n}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Small notice with an icon (RF016 note 5, RF022 note 1, errors). */
export function Note({ children, tone = 'info', icon: Icon = CircleAlert }: { children: ReactNode; tone?: 'info' | 'danger'; icon?: LucideIcon }) {
  const color = tone === 'danger' ? visitor.danger : visitor.muted;
  return (
    <View style={[styles.note, tone === 'danger' && { backgroundColor: 'rgba(213, 28, 68, 0.06)' }]}
          accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={16} color={color} strokeWidth={1.6} absoluteStrokeWidth />
      <Text style={[styles.noteText, { color }]}>{children}</Text>
    </View>
  );
}

/**
 * RF022 note 1: shown permanently on the event page and with the results. Says the photos are
 * only for the people in them and how to ask for a removal — from the photo itself, in the
 * search result (the removal page by file was dropped on 16/10/2026: the search pins the exact image).
 */
export function ResponsibleUse() {
  return (
    <Note>
      As fotos destinam-se exclusivamente às pessoas nelas retratadas. Compartilhar ou usar a imagem de outra pessoa
      sem autorização é vedado pela legislação. Quer retirar uma foto em que você aparece? Abra a foto no resultado da
      busca e toque em “Solicitar remoção”.
    </Note>
  );
}

type SheetProps = { visible: boolean; title: string; onClose: () => void; children: ReactNode; width?: number };

/** Overlay + white card of the visitor modals ("Rectangle 44" #4B4B4B/53% + "Rectangle 45"). */
export function Sheet({ visible, title, onClose, children, width = 338 }: SheetProps) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxWidth: width }]} role="dialog" aria-modal aria-label={title}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={8}>
              <X size={24} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

export const vtext = StyleSheet.create({
  h1: { fontFamily: poppins.semiBold, fontSize: 28, lineHeight: 34, color: visitor.title },
  h2: { fontFamily: poppins.semiBold, fontSize: 20, color: visitor.title },
  h3: { fontFamily: poppins.semiBold, fontSize: 16, color: visitor.heading },
  h4: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.text },
  body: { fontFamily: poppins.regular, fontSize: 14, lineHeight: 21, color: visitor.text },
  small: { fontFamily: poppins.regular, fontSize: 12, lineHeight: 18, color: visitor.muted },
  label: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.text },
});

const styles = StyleSheet.create({
  backdrop: { position: 'fixed' as 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'auto' } as object,
  column: { width: '100%', alignSelf: 'center', paddingHorizontal: 32 },
  button: { minHeight: 44, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: { backgroundColor: visitor.primary },
  outlineDanger: { borderWidth: 1, borderColor: visitor.danger },
  ghost: {},
  buttonText: { fontFamily: poppins.semiBold, fontSize: 15 },
  link: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.primary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill: { borderRadius: 30, paddingVertical: 2, paddingHorizontal: 8 },
  pillText: { fontFamily: poppins.regular },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: 'rgba(5, 27, 59, 0.04)', borderRadius: 8,
          padding: 10 },
  noteText: { flex: 1, fontFamily: poppins.regular, fontSize: 12, lineHeight: 17 },
  inlineLink: { fontFamily: poppins.semiBold, color: visitor.primary, textDecorationLine: 'underline' },
  overlay: { flex: 1, backgroundColor: visitor.overlay, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxHeight: '92%', backgroundColor: visitor.surface, borderRadius: 12, padding: 16, gap: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { flex: 1, fontFamily: poppins.semiBold, fontSize: 16, color: visitor.heading },
});

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** Visitor style of the event date (Figma: "Sábado - 21.12.2026"). Month or month-range events
 *  keep the precision they were registered with (RF013 note 3). */
export function eventDate(e: { date_precision: string; date_start: string; date_label: string }) {
  if (e.date_precision !== 'day') return e.date_label;
  const [y, m, d] = e.date_start.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} - ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}
