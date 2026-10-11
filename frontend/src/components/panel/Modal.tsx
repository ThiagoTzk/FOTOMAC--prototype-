import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, panel } from '@/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  icon: LucideIcon;
  tone?: 'primary' | 'danger';
  title: string;
  width?: number;
  children: ReactNode;
};

/** "Modal de publicação" / "Modal de exclusão": dark overlay + white card, read from the .fig. */
export function Modal({ visible, onClose, icon: Icon, tone = 'primary', title, width = 520, children }: Props) {
  const bg = tone === 'danger' ? panel.dangerSoft : panel.primarySoft;
  const fg = tone === 'danger' ? panel.danger : panel.primary;
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Fechar">
        <Pressable style={[styles.card, { maxWidth: width }]} onPress={() => undefined} accessibilityRole="none"
                   aria-modal role="dialog" aria-label={title}>
          <ScrollView contentContainerStyle={{ gap: 20 }}>
            <View style={[styles.icon, { backgroundColor: bg }]}>
              <Icon size={23} color={fg} strokeWidth={1.6} absoluteStrokeWidth />
            </View>
            <Text style={styles.title}>{title}</Text>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(9, 38, 56, 0.60)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: panel.cardRadius, padding: 28,
          boxShadow: '0px 18px 48px rgba(0, 27, 43, 0.18)' },
  icon: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.regular, fontSize: 24, color: panel.text },
});
