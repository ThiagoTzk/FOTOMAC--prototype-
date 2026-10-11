import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { colors, fonts } from '@/theme/tokens';

/** "Link" from the Figma auth templates, optionally with the back arrow. */
export function AuthLink({ href, label, back = false }: { href: Href; label: string; back?: boolean }) {
  return (
    // replace: auth screens swap places instead of piling up behind each other.
    <Link href={href} replace accessibilityRole="link">
      <View style={styles.row}>
        {back && <Icon name="arrow-left" size={14} />}
        <Text style={styles.text}>{label}</Text>
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
});
