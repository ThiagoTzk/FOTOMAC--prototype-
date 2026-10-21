/**
 * Building blocks of the operation area, read from the Figma file (.fig, node names in
 * quotes): "Botão", "Cartão", "Status", "Aviso", "Campo"/"Entrada", "Abas".
 */
import type { LucideIcon } from 'lucide-react-native';
import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';

import { fonts, panel } from '@/theme/tokens';

// ------------------------------------------------------------------ Botão

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon: Icon, loading, disabled }: ButtonProps) {
  const inactive = disabled || loading;
  const color = variant === 'secondary' ? panel.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        variant === 'primary' && ui.buttonPrimary,
        variant === 'secondary' && ui.buttonSecondary,
        variant === 'danger' && ui.buttonDanger,
        pressed && !inactive && { opacity: 0.85 },
        inactive && { opacity: 0.6 },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {Icon && <Icon size={16} color={color} strokeWidth={1.6} absoluteStrokeWidth />}
          <Text style={[ui.buttonLabel, { color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Cartão

export function Card({ children, style, padding = 20 }: { children: ReactNode; style?: StyleProp<ViewStyle>; padding?: number }) {
  return <View style={[ui.card, { padding }, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={ui.sectionTitle}>
      <Text style={ui.sectionTitleText} accessibilityRole="header">{title}</Text>
      {action}
    </View>
  );
}

// ------------------------------------------------------------------ Status

export type EventStatus = 'editing' | 'processing' | 'published' | 'expired';

const STATUS: Record<EventStatus, { label: string; bg: string; fg: string }> = {
  editing: { label: 'Em edição', bg: panel.warningSoft, fg: panel.warning },
  processing: { label: 'Em processamento', bg: panel.primarySoft, fg: panel.primaryText },
  published: { label: 'Publicado', bg: panel.successSoft, fg: panel.success },
  expired: { label: 'Expirado', bg: panel.page, fg: panel.muted },
};

export const statusLabel = (s: EventStatus) => STATUS[s].label;

export function StatusPill({ status }: { status: EventStatus }) {
  return <Pill label={STATUS[status].label} bg={STATUS[status].bg} fg={STATUS[status].fg} />;
}

export function Pill({ label, bg = panel.primarySoft, fg = panel.primaryText }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={[ui.pill, { backgroundColor: bg }]}>
      <Text style={[ui.pillText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ Aviso

type Tone = 'info' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: panel.primarySoft, fg: panel.primaryText },
  success: { bg: panel.successSoft, fg: panel.success },
  warning: { bg: panel.warningSoft, fg: panel.warning },
  danger: { bg: panel.dangerSoft, fg: panel.danger },
};

type NoticeProps = {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Notice({ tone, icon: Icon, title, description, actionLabel, onAction, style }: NoticeProps) {
  const t = TONES[tone];
  return (
    <View style={[ui.notice, { backgroundColor: t.bg }, style]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={18} color={t.fg} strokeWidth={1.6} absoluteStrokeWidth />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[ui.noticeTitle, { color: t.fg }]}>{title}</Text>
        {!!description && <Text style={ui.noticeText}>{description}</Text>}
      </View>
      {actionLabel && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={[ui.noticeAction, { color: t.fg }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ Campo

type FieldProps = { label?: string; help?: string; error?: string; children: ReactNode; style?: StyleProp<ViewStyle> };

export function Field({ label, help, error, children, style }: FieldProps) {
  return (
    <View style={[{ gap: 7 }, style]}>
      {!!label && <Text style={ui.label}>{label}</Text>}
      {children}
      {!!error && <Text style={ui.error} accessibilityLiveRegion="polite">{error}</Text>}
      {!error && !!help && <Text style={ui.help}>{help}</Text>}
    </View>
  );
}

type InputProps = TextInputProps & { icon?: LucideIcon; invalid?: boolean; multiline?: boolean; readOnly?: boolean };

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { icon: Icon, invalid, multiline, readOnly, style, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[ui.input, multiline && ui.inputMultiline, focused && { borderColor: panel.primary },
                  invalid && { borderColor: panel.danger, borderWidth: 2 }, readOnly && { backgroundColor: panel.page }]}>
      {Icon && <Icon size={16} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />}
      <TextInput
        ref={ref}
        placeholderTextColor={panel.placeholder}
        editable={!readOnly}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={!!invalid}
        style={[ui.inputText, multiline && { height: '100%', textAlignVertical: 'top' }, style] as StyleProp<object>}
        {...props}
      />
    </View>
  );
});

// ------------------------------------------------------------------ Abas

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={ui.tabs} accessibilityRole="tablist">
      {tabs.map((t) => (
        <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: t.key === value }}
                   onPress={() => onChange(t.key)} style={[ui.tab, t.key === value && ui.tabActive]}>
          <Text style={[ui.tabText, t.key === value && { color: panel.primary }]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const ui = StyleSheet.create({
  button: { height: 40, borderRadius: panel.radius, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
            justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'transparent' },
  buttonPrimary: { backgroundColor: panel.primary },
  buttonSecondary: { backgroundColor: '#FFFFFF', borderColor: panel.border },
  buttonDanger: { backgroundColor: panel.danger },
  buttonLabel: { fontFamily: fonts.bold, fontSize: 14 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: panel.border, borderRadius: panel.cardRadius,
          boxShadow: panel.cardShadow, gap: 16 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionTitleText: { fontFamily: fonts.regular, fontSize: 20, color: panel.text },
  pill: { height: 26, borderRadius: 999, paddingHorizontal: 10, justifyContent: 'center', alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.bold, fontSize: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: panel.radius },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 14 },
  noticeText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.text },
  noticeAction: { fontFamily: fonts.regular, fontSize: 12 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: panel.text },
  help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.muted },
  error: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.danger },
  input: { height: 42, borderWidth: 1, borderColor: panel.border, borderRadius: panel.radius, backgroundColor: '#FFFFFF',
           paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  inputMultiline: { height: 88, paddingVertical: 12, alignItems: 'flex-start' },
  inputText: { flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 14, color: panel.text, outlineStyle: 'none' } as object,
  tabs: { flexDirection: 'row', gap: 28, borderBottomWidth: 1, borderColor: panel.border },
  tab: { paddingBottom: 10, marginBottom: -1, borderBottomWidth: 2, borderColor: 'transparent' },
  tabActive: { borderColor: panel.primary },
  tabText: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted },
});
