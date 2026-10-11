import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import type { IconName } from '@/components/icons/svgs';
import { colors, fonts, radius } from '@/theme/tokens';

type Tone = 'error' | 'info' | 'success';

const TONES: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'triangle-alert' },
  info: { bg: colors.primarySoft, fg: colors.primaryText, icon: 'info' },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'circle-check' },
};

/** "Feedback" box from the Figma auth templates. */
export function Feedback({ tone, message }: { tone: Tone; message: string }) {
  const t = TONES[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: t.bg }]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite">
      <Icon name={t.icon} size={17} />
      <Text style={[styles.text, { color: t.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: radius.sm, width: '100%' },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
});
