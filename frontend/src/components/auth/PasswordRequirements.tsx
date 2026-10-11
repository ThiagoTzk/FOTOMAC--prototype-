import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { PASSWORD_RULES, type PasswordRuleKey } from '@/auth/password-rules';
import { colors, fonts, radius } from '@/theme/tokens';

/**
 * "Requisitos da senha" box. Neutral (grey dots) normally; turns red with an ✕ on each
 * unmet rule after a failed submit — the "validação" variant of the Figma screens.
 */
export function PasswordRequirements({ failed }: { failed: PasswordRuleKey[] | null }) {
  const invalid = failed !== null && failed.length > 0;
  return (
    <View style={[styles.box, invalid && styles.boxInvalid]} accessibilityLabel="Requisitos da senha">
      <Text style={[styles.title, invalid && styles.danger]}>Sua senha deve conter:</Text>
      {PASSWORD_RULES.map((rule) => {
        const unmet = invalid && failed.includes(rule.key);
        return (
          <View key={rule.key} style={styles.row}>
            {unmet ? <Icon name="x" size={13} /> : <View style={styles.dotSlot}><Icon name="dot" size={5} /></View>}
            <Text style={[styles.rule, unmet && styles.danger]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.background, borderRadius: radius.sm, padding: 12, gap: 8, width: '100%' },
  boxInvalid: { backgroundColor: colors.dangerSoft },
  title: { fontFamily: fonts.bold, fontSize: 11, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dotSlot: { width: 5, alignItems: 'center' },
  rule: { flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  danger: { color: colors.danger },
});
