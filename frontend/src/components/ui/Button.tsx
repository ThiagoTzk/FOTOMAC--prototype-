import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

type Props = { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };

/** "Botão primário" from the Figma auth templates. */
export function PrimaryButton({ label, onPress, loading = false, disabled = false }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        pressed && !inactive && styles.hover,
        inactive && styles.inactive,
      ]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '100%',
  },
  hover: { backgroundColor: colors.primaryText },
  inactive: { opacity: 0.7 },
  label: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
});
